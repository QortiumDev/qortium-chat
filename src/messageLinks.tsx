import { type ReactNode, useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from './clipboard';
import { saveQdnResource as saveQdnResourceCoreApi } from './coreApi';
import { type TranslateFunction } from './i18n';
import { qdnRequest } from './qdnRequest';
import { qortalRequest } from './qortalRequest';
import { type QortalHubImageRef } from './chatText';
import { type ChatNetwork, type QdnAction } from './types';

const IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_PREVIEW_MAX_CONCURRENT = 3;
const IMAGE_PREVIEW_QUEUE_LIMIT = 24;
const MESSAGE_IMAGE_PREVIEW_MAX_BYTES = 12 * 1024 * 1024;
const MESSAGE_IMAGE_PREVIEW_MAX_COUNT = 8;
const MESSAGE_IMAGE_PREVIEW_MAX_PIXELS = 16_000_000;
const IMAGE_PREVIEW_MAX_DIMENSION = 8192;
const IMAGE_PREVIEW_MAX_PIXELS = 16_000_000;
const RESOURCE_CARD_MAX_CONCURRENT = 4;
const RESOURCE_CARD_QUEUE_LIMIT = 64;
const RESOURCE_CARD_CACHE_LIMIT = 500;
const RESOURCE_METADATA_MAX_BYTES = 128 * 1024;
const RESOURCE_PROPERTIES_MAX_BYTES = 64 * 1024;
// App links and plain web links share trailing-punctuation handling, so we scan
// for both in one pass and split them apart by scheme afterwards.
const LINK_PATTERN = /\b(?:qdn|qortal|home|core|https?):\/\/[^\s<>"'`]*/gi;
const WEB_LINK_SCHEME = /^https?:\/\//i;
const COPIED_LABEL_RESET_MS = 1500;
const TRAILING_SIMPLE_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);
const CLOSING_PAIRS: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{',
};
const IMAGE_QDN_SERVICES = new Set<QdnImageService>(['GIF_REPOSITORY', 'IMAGE', 'THUMBNAIL', 'QCHAT_IMAGE']);
const MEDIA_QDN_SERVICES = new Set<QdnMediaService>(['AUDIO', 'PODCAST', 'VIDEO', 'VOICE']);
// Mirrors Home's QDN_DOCUMENT_VIEWER_SERVICES (PDF/EPUB/markdown/etc. ride these).
const DOCUMENT_QDN_SERVICES = new Set<QdnDocumentService>(['ATTACHMENT', 'DOCUMENT', 'FILE', 'FILES']);

export type MessageTextPart =
  | {
      kind: 'text';
      text: string;
    }
  | {
      address: string;
      kind: 'app-link';
      text: string;
    }
  | {
      kind: 'web-link';
      text: string;
      url: string;
    };

type QdnImageService = 'GIF_REPOSITORY' | 'IMAGE' | 'QCHAT_IMAGE' | 'THUMBNAIL';
type QdnMediaService = 'AUDIO' | 'PODCAST' | 'VIDEO' | 'VOICE';
type QdnDocumentService = 'ATTACHMENT' | 'DOCUMENT' | 'FILE' | 'FILES';

type QdnResourceBase<Service extends string> = {
  identifier?: string;
  name: string;
  network: ChatNetwork;
  path: string;
  qdnUrl: string;
  service: Service;
};

export type QdnImageResource = QdnResourceBase<QdnImageService>;
export type QdnMediaResource = QdnResourceBase<QdnMediaService>;
export type QdnDocumentResource = QdnResourceBase<QdnDocumentService>;

type QdnResourceProperties = {
  filename?: string;
  mimeType?: string;
  size?: number;
};

type QdnResourceMetadata = {
  description?: string;
  files?: string[];
  mimeType?: string;
  title?: string;
};

export type QdnResource = QdnResourceBase<string>;

export type QdnResourceCard = {
  description?: string;
  mimeType?: string;
  network: ChatNetwork;
  subtitle: string;
  title: string;
};

export type QdnImagePreview = {
  alt: string;
  height?: number;
  mimeType: string;
  qdnUrl: string;
  src: string;
  width?: number;
};

function countCharacter(value: string, character: string) {
  let count = 0;

  for (const candidate of value) {
    if (candidate === character) {
      count += 1;
    }
  }

  return count;
}

function splitTrailingPunctuation(value: string) {
  let address = value;
  let trailing = '';

  while (address) {
    const lastCharacter = address[address.length - 1];
    const matchingOpening = CLOSING_PAIRS[lastCharacter];
    const shouldTrimClosing =
      matchingOpening !== undefined &&
      countCharacter(address, lastCharacter) > countCharacter(address, matchingOpening);

    if (!TRAILING_SIMPLE_PUNCTUATION.has(lastCharacter) && !shouldTrimClosing) {
      break;
    }

    trailing = `${lastCharacter}${trailing}`;
    address = address.slice(0, -1);
  }

  return { address, trailing };
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}

function isImageQdnService(service: string): service is QdnImageService {
  return IMAGE_QDN_SERVICES.has(service as QdnImageService);
}

function isMediaQdnService(service: string): service is QdnMediaService {
  return MEDIA_QDN_SERVICES.has(service as QdnMediaService);
}

function isDocumentQdnService(service: string): service is QdnDocumentService {
  return DOCUMENT_QDN_SERVICES.has(service as QdnDocumentService);
}

function getAddressNetwork(address: string, conversationNetwork: ChatNetwork): ChatNetwork {
  return /^qortal:\/\//i.test(address) ? 'qortal' : conversationNetwork;
}

function isDotSegment(value: string) {
  return value === '.' || value === '..';
}

function parseQdnResource(qdnUrl: string, conversationNetwork: ChatNetwork): QdnResourceBase<string> | null {
  if (!/^(?:qdn|qortal):\/\//i.test(qdnUrl) || qdnUrl.length > 2048) {
    return null;
  }

  const withoutProtocol = qdnUrl.replace(/^(?:qdn|qortal):\/\/?/i, '').trim();
  const queryIndex = withoutProtocol.indexOf('?');
  const basePart = queryIndex === -1 ? withoutProtocol : withoutProtocol.slice(0, queryIndex);
  const queryString = queryIndex === -1 ? '' : withoutProtocol.slice(queryIndex + 1);
  const parts = basePart.replace(/^\/+/, '').split('/');
  const network = getAddressNetwork(qdnUrl, conversationNetwork);
  const firstSegment = decodeSegment(parts.shift() ?? '').trim();

  // Qortal Hub's inline-embed grammar (attachments-matrix A4):
  // qortal://use-embed/TYPE?name=…&service=…&identifier=…&mimeType=…. Hub is
  // the only emitter, always with the qortal:// scheme.
  if (/^qortal:\/\//i.test(qdnUrl) && firstSegment.toUpperCase() === 'USE-EMBED') {
    return parseQortalHubEmbed(qdnUrl, parts, queryString);
  }

  let service = firstSegment.toUpperCase();
  let name = decodeSegment(parts.shift() ?? '').trim();

  // Qortal Hub treats qortal://<name> as WEBSITE/<name>. Unlike Qortium's
  // qdn://service/name/identifier/path convention, Hub treats every segment
  // after the name as app/resource path and accepts an identifier only through
  // ?identifier=. Contextual qdn:// links in a Qortal conversation follow the
  // same Qortal rule so they never resolve against the other chain by accident.
  if (network === 'qortal' && !name && service) {
    name = firstSegment;
    service = 'WEBSITE';
  }

  if (
    !/^[A-Z0-9_]{1,64}$/.test(service) ||
    !name ||
    name.length > 255 ||
    isDotSegment(name) ||
    /[/\\\u0000-\u001f]/.test(name)
  ) {
    return null;
  }

  const queryParams = new URLSearchParams(queryString);
  const queryIdentifier = queryParams.get('identifier')?.trim() || '';

  if (queryIdentifier) {
    queryParams.delete('identifier');
  }

  let identifier = network === 'qortal'
    ? queryIdentifier
    : queryIdentifier || decodeSegment(parts.shift() ?? '').trim();

  if (identifier.toLowerCase() === 'default') {
    identifier = '';
  }

  if (identifier.length > 64 || isDotSegment(identifier) || /[/\\\u0000-\u001f]/.test(identifier)) {
    return null;
  }

  const decodedPath = parts.map(decodeSegment).join('/').replace(/^\/+/, '');
  const remainingQuery = queryParams.toString();
  const pathOnly = network === 'qortal'
    ? `${decodedPath}${remainingQuery ? `?${remainingQuery}` : ''}`
    : decodedPath;

  // Qortium supports only the identity query. Qortal Hub preserves remaining
  // query parameters as part of the app route, after extracting identifier.
  const pathSegments = decodedPath ? decodedPath.split('/') : [];
  if (
    (network === 'qortium' && [...queryParams.keys()].length > 0) ||
    pathOnly.length > 1024 ||
    pathSegments.some((segment) => !segment || isDotSegment(segment)) ||
    /[\\\u0000-\u001f]/.test(pathOnly)
  ) {
    return null;
  }

  return {
    identifier: identifier || undefined,
    name,
    network,
    path: pathOnly,
    qdnUrl,
    service,
  };
}

// Hub's embed parser neither URL-encodes nor decodes query values
// (Embeds/embed-utils.ts splits on & and = and only strips HTML tags), so this
// parser reads them raw too — a value Hub would misread is never emitted by
// buildQdnResourceShareLink. POLL embeds carry no QDN coordinate and parse to
// null. The embed TYPE (IMAGE/VIDEO/ATTACHMENT) is Hub's renderer hint; the
// QDN coordinate lives entirely in the query's service/name/identifier.
function parseQortalHubEmbed(qdnUrl: string, parts: string[], queryString: string): QdnResourceBase<string> | null {
  const embedType = (parts[0] ?? '').trim().toUpperCase();

  if (!['ATTACHMENT', 'IMAGE', 'VIDEO'].includes(embedType)) {
    return null;
  }

  const params = new Map<string, string>();

  for (const pair of queryString.split('&')) {
    const separator = pair.indexOf('=');

    if (separator > 0) {
      params.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }

  const service = (params.get('service') ?? '').toUpperCase();
  const name = params.get('name') ?? '';
  let identifier = params.get('identifier') ?? '';

  if (identifier.toLowerCase() === 'default') {
    identifier = '';
  }

  if (
    !/^[A-Z0-9_]{1,64}$/.test(service) ||
    !name ||
    name.length > 255 ||
    isDotSegment(name) ||
    /[/\\\u0000-\u001f]/.test(name) ||
    identifier.length > 64 ||
    isDotSegment(identifier) ||
    /[/\\\u0000-\u001f]/.test(identifier)
  ) {
    return null;
  }

  return {
    identifier: identifier || undefined,
    name,
    network: 'qortal',
    path: '',
    qdnUrl,
    service,
  };
}

// Characters that survive Hub's no-decode query parsing AND the LINK_PATTERN
// scanner above (no whitespace, quotes, or angle brackets).
const HUB_EMBED_SAFE_VALUE = /^[A-Za-z0-9._-]+$/;

function getHubEmbedType(service: string): 'ATTACHMENT' | 'IMAGE' | 'VIDEO' {
  if (isImageQdnService(service)) {
    return 'IMAGE';
  }

  return service === 'VIDEO' ? 'VIDEO' : 'ATTACHMENT';
}

// Builds the link Chat inserts for an existing/just-published QDN resource
// (attachments-matrix A3/A4), in the form the CONVERSATION's network previews
// best:
//
// - qortium: Chat's own qdn://SERVICE/name/identifier (percent-encoded
//   segments; the parser above decodes them).
// - qortal: Hub's use-embed grammar, so real Hub clients render an inline
//   embed instead of a bare link — but only when every value is safe under
//   Hub's no-decode parsing; otherwise (a name with spaces, say) fall back to
//   the plain Qortal link form qortal://SERVICE/name?identifier=…, which every
//   client at least linkifies and Chat fully previews.
export function buildQdnResourceShareLink(
  network: ChatNetwork,
  resource: { identifier?: string; mimeType?: string; name: string; service: string },
): string {
  const service = resource.service.toUpperCase();
  const identifier = resource.identifier ?? '';

  if (network !== 'qortal') {
    const encodedName = encodeURIComponent(resource.name);

    return identifier
      ? `qdn://${service}/${encodedName}/${encodeURIComponent(identifier)}`
      : `qdn://${service}/${encodedName}`;
  }

  const values = [resource.name, ...(identifier ? [identifier] : []), ...(resource.mimeType ? [resource.mimeType] : [])];

  if (values.every((value) => HUB_EMBED_SAFE_VALUE.test(value))) {
    const query = [
      `name=${resource.name}`,
      `service=${service}`,
      ...(identifier ? [`identifier=${identifier}`] : []),
      ...(resource.mimeType ? [`mimeType=${resource.mimeType}`] : []),
    ].join('&');

    return `qortal://use-embed/${getHubEmbedType(service)}?${query}`;
  }

  return identifier
    ? `qortal://${service}/${encodeURIComponent(resource.name)}?identifier=${encodeURIComponent(identifier)}`
    : `qortal://${service}/${encodeURIComponent(resource.name)}`;
}

function parseQdnImageResource(qdnUrl: string, conversationNetwork: ChatNetwork): QdnImageResource | null {
  const resource = parseQdnResource(qdnUrl, conversationNetwork);

  if (!resource || !isImageQdnService(resource.service)) {
    return null;
  }

  return {
    ...resource,
    service: resource.service,
  };
}

function parseQdnMediaResource(qdnUrl: string, conversationNetwork: ChatNetwork): QdnMediaResource | null {
  const resource = parseQdnResource(qdnUrl, conversationNetwork);

  if (!resource || !isMediaQdnService(resource.service)) {
    return null;
  }

  return {
    ...resource,
    service: resource.service,
  };
}

function parseQdnDocumentResource(qdnUrl: string, conversationNetwork: ChatNetwork): QdnDocumentResource | null {
  const resource = parseQdnResource(qdnUrl, conversationNetwork);

  if (!resource || !isDocumentQdnService(resource.service)) {
    return null;
  }

  return {
    ...resource,
    service: resource.service,
  };
}

export function getMessageTextParts(text: string): MessageTextPart[] {
  const parts: MessageTextPart[] = [];
  let previousIndex = 0;
  const appendText = (textPart: string) => {
    if (!textPart) {
      return;
    }

    const previousPart = parts[parts.length - 1];

    if (previousPart?.kind === 'text') {
      previousPart.text += textPart;
    } else {
      parts.push({ kind: 'text', text: textPart });
    }
  };

  for (const match of text.matchAll(LINK_PATTERN)) {
    const rawAddress = match[0];
    const matchIndex = match.index ?? 0;
    const { address, trailing } = splitTrailingPunctuation(rawAddress);

    if (!address) {
      continue;
    }

    if (matchIndex > previousIndex) {
      appendText(text.slice(previousIndex, matchIndex));
    }

    if (WEB_LINK_SCHEME.test(address)) {
      parts.push({ kind: 'web-link', text: address, url: address });
    } else {
      parts.push({ address, kind: 'app-link', text: address });
    }

    if (trailing) {
      appendText(trailing);
    }

    previousIndex = matchIndex + rawAddress.length;
  }

  if (previousIndex < text.length) {
    appendText(text.slice(previousIndex));
  }

  return parts.length > 0 ? parts : [{ kind: 'text', text }];
}

const CODE_FENCE = '```';

export type MessageSegment =
  | {
      kind: 'text';
      text: string;
    }
  | {
      content: string;
      kind: 'code';
      lang: string;
    };

function parseFencedContent(raw: string): { content: string; lang: string } {
  const newlineIndex = raw.indexOf('\n');

  // A single-line block (```code```) carries no info string, so keep it all as
  // code. Otherwise the first line is the (optional) language hint and the rest
  // is the body; drop the newline that precedes the closing fence.
  if (newlineIndex === -1) {
    return { content: raw, lang: '' };
  }

  return {
    content: raw.slice(newlineIndex + 1).replace(/\n$/, ''),
    lang: raw.slice(0, newlineIndex).trim(),
  };
}

// Splits a message into plain-text runs and ```-fenced code blocks. Text runs
// adjacent to a fence shed the single newline that ends/starts the fence line so
// the rendered block sits flush against the surrounding text. An unterminated
// fence is left as plain text.
export function getMessageSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let index = 0;

  while (index < text.length) {
    const open = text.indexOf(CODE_FENCE, index);

    if (open === -1) {
      break;
    }

    const close = text.indexOf(CODE_FENCE, open + CODE_FENCE.length);

    if (close === -1) {
      break;
    }

    if (open > index) {
      segments.push({ kind: 'text', text: text.slice(index, open) });
    }

    segments.push({ kind: 'code', ...parseFencedContent(text.slice(open + CODE_FENCE.length, close)) });
    index = close + CODE_FENCE.length;
  }

  if (index < text.length) {
    segments.push({ kind: 'text', text: text.slice(index) });
  }

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];

    if (segment.kind !== 'text') {
      continue;
    }

    if (segments[i - 1]?.kind === 'code') {
      segment.text = segment.text.replace(/^\n/, '');
    }

    if (segments[i + 1]?.kind === 'code') {
      segment.text = segment.text.replace(/\n$/, '');
    }
  }

  const meaningful = segments.filter((segment) => segment.kind !== 'text' || segment.text.length > 0);

  return meaningful.length > 0 ? meaningful : [{ kind: 'text', text }];
}

// Segment + text-part parsing is the expensive scan; both the image and media
// extractors run it for every message on every render. Cache the app-link
// addresses per message body so each unique body is scanned once, with a simple
// FIFO cap so the map can't grow without bound across a long session.
const appLinkAddressCache = new Map<string, string[]>();
const APP_LINK_ADDRESS_CACHE_LIMIT = 2000;

function getAppLinkAddresses(text: string): string[] {
  const cached = appLinkAddressCache.get(text);

  if (cached) {
    return cached;
  }

  const addresses = getMessageSegments(text)
    .filter((segment): segment is Extract<MessageSegment, { kind: 'text' }> => segment.kind === 'text')
    .flatMap((segment) => getMessageTextParts(segment.text))
    .filter((part): part is Extract<MessageTextPart, { kind: 'app-link' }> => part.kind === 'app-link')
    .map((part) => part.address);

  if (appLinkAddressCache.size >= APP_LINK_ADDRESS_CACHE_LIMIT) {
    const oldest = appLinkAddressCache.keys().next().value;

    if (oldest !== undefined) {
      appLinkAddressCache.delete(oldest);
    }
  }

  appLinkAddressCache.set(text, addresses);

  return addresses;
}

function getQdnResources<T>(
  text: string,
  network: ChatNetwork,
  parseResource: (qdnUrl: string, conversationNetwork: ChatNetwork) => T | null,
): T[] {
  return getAppLinkAddresses(text)
    .map((address) => parseResource(address, network))
    .filter((resource): resource is T => resource !== null);
}

export function getMessageQdnResources(text: string, network: ChatNetwork = 'qortium'): QdnResource[] {
  return getQdnResources(text, network, parseQdnResource);
}

export function getImageQdnResources(text: string, network: ChatNetwork = 'qortium'): QdnImageResource[] {
  return getQdnResources(text, network, parseQdnImageResource);
}

export function getMediaQdnResources(text: string, network: ChatNetwork = 'qortium'): QdnMediaResource[] {
  return getQdnResources(text, network, parseQdnMediaResource);
}

export function getDocumentQdnResources(text: string, network: ChatNetwork = 'qortium'): QdnDocumentResource[] {
  return getQdnResources(text, network, parseQdnDocumentResource);
}

export function getQortalHubImageResources(images: readonly QortalHubImageRef[]): QdnImageResource[] {
  return images
    .slice(0, 12)
    .map((image): QdnImageResource | null => {
      if (
        typeof image.service !== 'string' ||
        typeof image.name !== 'string' ||
        typeof image.identifier !== 'string'
      ) {
        return null;
      }

      const service = image.service.trim().toUpperCase();
      const name = image.name.trim();
      const identifier = image.identifier.trim();

      // Hub's images[] envelope already carries explicit QDN coordinates; do
      // not turn it into a URI and run it through Qortal's path-oriented URI
      // grammar, where the identifier would instead be interpreted as a path.
      if (
        !isImageQdnService(service) ||
        !name ||
        name.length > 255 ||
        isDotSegment(name) ||
        /[/\\\u0000-\u001f]/.test(name) ||
        !identifier ||
        identifier.length > 64 ||
        isDotSegment(identifier) ||
        /[/\\\u0000-\u001f]/.test(identifier)
      ) {
        return null;
      }

      return {
        identifier,
        name,
        network: 'qortal',
        path: '',
        qdnUrl: `qortal://${service}/${encodeURIComponent(name)}?identifier=${encodeURIComponent(identifier)}`,
        service,
      };
    })
    .filter((resource): resource is QdnImageResource => resource !== null);
}

function getResourceBridge<T>(network: ChatNetwork, request: { action: string; [key: string]: unknown }) {
  return network === 'qortal' ? qortalRequest<T>(request) : qdnRequest<T>(request);
}

function getExplicitAppAddress(address: string, network: ChatNetwork) {
  if (network === 'qortal' && /^qdn:\/\//i.test(address)) {
    return address.replace(/^qdn:/i, 'qortal:');
  }

  return address;
}

export async function openAppLinkInHomeTab(address: string, conversationNetwork: ChatNetwork = 'qortium') {
  // The address comes from attacker-controlled message text. Home re-validates
  // on its side, but the trust boundary is enforced here too so a future or
  // more lenient bridge cannot be driven by a crafted chat link: only the
  // four app-link schemes, and a sane length cap (mirroring Home's own rule).
  if (address.length > 2048 || !/^(?:qdn|qortal|home|core):\/\//i.test(address)) {
    throw new Error('Blocked app link with an unsupported address.');
  }

  if (/^(?:home|core):\/\//i.test(address)) {
    return qdnRequest<boolean>({ action: 'OPEN_NEW_TAB', address });
  }

  const network = getAddressNetwork(address, conversationNetwork);
  const explicitAddress = getExplicitAppAddress(address, network);

  return getResourceBridge<boolean>(network, { action: 'OPEN_NEW_TAB', address: explicitAddress });
}

export async function openQdnMediaPlayer(resource: QdnMediaResource) {
  return getResourceBridge<boolean>(resource.network, {
    action: 'OPEN_QDN_MEDIA_PLAYER',
    ...getResourceRequest(resource),
  });
}

export async function openQdnDocumentViewer(resource: QdnDocumentResource) {
  return getResourceBridge<boolean>(resource.network, {
    action: 'OPEN_QDN_DOCUMENT_VIEWER',
    ...getResourceRequest(resource),
  });
}

// Home fetches the raw bytes and shows a save dialog (desktop) or download path
// (mobile/web), returning { canceled } once the user decides.
//
// P4b: delegates to coreApi's P4a-wrapped SAVE_QDN_RESOURCE (review/schemas-
// publish-attachments.md § 5) instead of dispatching the raw bridge request
// directly — same action and coordinate fields, routed the same way by
// network; callers already gate on `hasResourceAction(network,
// 'SAVE_QDN_RESOURCE')` before this is ever invoked, so `actions` here is
// only needed to satisfy the wrapper's own gate.
export async function saveQdnResource(
  resource: QdnImageResource | QdnMediaResource | QdnDocumentResource,
  actions?: QdnAction[],
) {
  return saveQdnResourceCoreApi(resource.network, getResourceRequest(resource), actions);
}

function getResourceRequest(resource: QdnResourceBase<string>) {
  return {
    service: resource.service,
    name: resource.name,
    identifier: resource.identifier,
    path: resource.path,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getStringProperty(value: unknown, key: keyof QdnResourceProperties) {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];

  return typeof property === 'string' ? property : undefined;
}

function getNumberProperty(value: unknown, key: keyof QdnResourceProperties) {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];

  return typeof property === 'number' ? property : undefined;
}

function normalizeProperties(value: unknown): QdnResourceProperties {
  return {
    filename: getStringProperty(value, 'filename'),
    mimeType: getStringProperty(value, 'mimeType'),
    size: getNumberProperty(value, 'size'),
  };
}

function normalizeMetadata(value: unknown): QdnResourceMetadata {
  if (!isRecord(value)) {
    return {};
  }

  const files = value.files;

  return {
    description: getBoundedMetadataString(value.description, 320),
    files: Array.isArray(files)
      ? files.filter((file): file is string => typeof file === 'string').slice(0, 100)
      : undefined,
    mimeType: getBoundedMetadataString(value.mimeType, 120),
    title: getBoundedMetadataString(value.title, 160),
  };
}

function getBoundedMetadataString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

  return normalized ? normalized.slice(0, maxLength) : undefined;
}

export async function fetchQdnResourceCard(resource: QdnResource): Promise<QdnResourceCard> {
  const cacheKey = JSON.stringify([
    resource.network,
    resource.service,
    resource.name,
    resource.identifier ?? '',
    resource.path,
  ]);
  const cached = resourceCardCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = scheduleResourceCard(() => fetchQdnResourceCardUncached(resource)).catch((error) => {
    resourceCardCache.delete(cacheKey);
    throw error;
  });

  if (resourceCardCache.size >= RESOURCE_CARD_CACHE_LIMIT) {
    const oldest = resourceCardCache.keys().next().value;

    if (oldest !== undefined) {
      resourceCardCache.delete(oldest);
    }
  }

  resourceCardCache.set(cacheKey, pending);

  return pending;
}

const resourceCardCache = new Map<string, Promise<QdnResourceCard>>();
let activeResourceCardFetches = 0;
const resourceCardQueue: Array<() => void> = [];

function scheduleResourceCard<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeResourceCardFetches += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeResourceCardFetches -= 1;
          resourceCardQueue.shift()?.();
        });
    };

    if (activeResourceCardFetches < RESOURCE_CARD_MAX_CONCURRENT) {
      run();
    } else if (resourceCardQueue.length < RESOURCE_CARD_QUEUE_LIMIT) {
      resourceCardQueue.push(run);
    } else {
      reject(new Error('Resource card queue is full.'));
    }
  });
}

async function fetchQdnResourceCardUncached(resource: QdnResource): Promise<QdnResourceCard> {
  let metadata: QdnResourceMetadata = {};

  try {
    metadata = normalizeMetadata(
      await getResourceBridge<unknown>(resource.network, {
        action: 'GET_QDN_RESOURCE_METADATA',
        ...getResourceRequest(resource),
        maxBytes: RESOURCE_METADATA_MAX_BYTES,
      }),
    );
  } catch {
    // The coordinates still make a useful compact card when metadata is not
    // available. Never retry a failure against the other chain.
  }

  return {
    description: metadata.description,
    mimeType: metadata.mimeType,
    network: resource.network,
    subtitle: `${resource.network === 'qortal' ? 'Qortal' : 'Qortium'} · ${resource.service} · ${resource.name}`,
    title: metadata.title || resource.identifier || resource.name,
  };
}

function isGifFilename(value: string) {
  return /\.gif$/i.test(value.split('?')[0] ?? '');
}

function isGifRepositoryFile(value: string) {
  const normalized = value.trim();
  const segments = normalized.split('/');

  return (
    !!normalized &&
    normalized.length <= 1024 &&
    !normalized.includes('\\') &&
    !/[\u0000-\u001f]/.test(normalized) &&
    !segments.some((segment) => !segment || segment === '.' || segment === '..') &&
    isGifFilename(normalized)
  );
}

function getSortedGifRepositoryFiles(metadata: QdnResourceMetadata) {
  return (metadata.files ?? [])
    .filter(isGifRepositoryFile)
    .slice()
    .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }))
    .slice(0, 12);
}

function buildQdnImageResourceUrl(resource: QdnImageResource) {
  if (resource.network === 'qortal') {
    const queryIndex = resource.path.indexOf('?');
    const resourcePath = queryIndex === -1 ? resource.path : resource.path.slice(0, queryIndex);
    const queryParams = new URLSearchParams(queryIndex === -1 ? '' : resource.path.slice(queryIndex + 1));

    if (resource.identifier) {
      queryParams.set('identifier', resource.identifier);
    }

    const queryString = queryParams.toString();

    return `qortal://${resource.service}/${encodeURIComponent(resource.name)}${
      resourcePath ? `/${resourcePath}` : ''
    }${queryString ? `?${queryString}` : ''}`;
  }

  return `qdn://${resource.service}/${encodeURIComponent(resource.name)}/${encodeURIComponent(
    resource.identifier ?? 'default',
  )}${resource.path ? `/${resource.path}` : ''}`;
}

function getQdnImageResourceWithPath(resource: QdnImageResource, path: string): QdnImageResource {
  const nextResource = {
    ...resource,
    path,
  };

  return {
    ...nextResource,
    qdnUrl: buildQdnImageResourceUrl(nextResource),
  };
}

async function fetchQdnResourceMetadata(resource: QdnImageResource) {
  return normalizeMetadata(
    await getResourceBridge<unknown>(resource.network, {
      action: 'GET_QDN_RESOURCE_METADATA',
      ...getResourceRequest(resource),
      maxBytes: RESOURCE_METADATA_MAX_BYTES,
    }),
  );
}

async function getGifRepositoryPreviewResources(resource: QdnImageResource, maxCount = MESSAGE_IMAGE_PREVIEW_MAX_COUNT) {
  if (resource.service !== 'GIF_REPOSITORY' || resource.path) {
    return [resource];
  }

  let metadata: QdnResourceMetadata;

  try {
    // Opening previews in several messages at once must not bypass the global
    // image-work limit through GIF repository metadata expansion.
    metadata = await scheduleImagePreview(() => fetchQdnResourceMetadata(resource));
  } catch {
    return [resource];
  }

  const files = getSortedGifRepositoryFiles(metadata);

  return files.length > 0
    ? files.slice(0, maxCount).map((file) => getQdnImageResourceWithPath(resource, file))
    : [resource];
}

function getImageMimeType(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  ) {
    return 'image/png';
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  throw new Error('Image preview returned unsupported or unsafe image bytes.');
}

function decodeBase64Bytes(base64: string) {
  try {
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function getBase64Payload(value: unknown, maxBytes: number) {
  const record = isRecord(value) ? value : null;
  const payload = typeof value === 'string' ? value : record?.body;
  const contentLength = typeof record?.contentLength === 'number' ? record.contentLength : undefined;

  if (typeof payload !== 'string') {
    throw new Error('QDN image preview returned an unsupported response.');
  }

  const base64 = payload.trim();

  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('QDN image preview returned empty image data.');
  }

  const estimatedBytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

  if (
    estimatedBytes > maxBytes ||
    (typeof contentLength === 'number' && contentLength > maxBytes)
  ) {
    throw new Error('Image preview exceeds the current preview byte limit.');
  }

  const bytes = decodeBase64Bytes(base64);

  if (!bytes || bytes.byteLength !== estimatedBytes || bytes.byteLength > maxBytes) {
    throw new Error('QDN image preview returned invalid image data.');
  }

  return { base64, bytes };
}

type ImageDimensions = { height: number; width: number };

function validateImageDimensions(dimensions: ImageDimensions | null, maxPixels = IMAGE_PREVIEW_MAX_PIXELS) {
  if (
    dimensions &&
    (
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > IMAGE_PREVIEW_MAX_DIMENSION ||
      dimensions.height > IMAGE_PREVIEW_MAX_DIMENSION ||
      dimensions.width * dimensions.height > maxPixels
    )
  ) {
    throw new Error('Image preview dimensions exceed the safe display limit.');
  }

  return dimensions;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function getEncodedImageDimensions(bytes: Uint8Array, mimeType: string): ImageDimensions | null {
  if (mimeType === 'image/png' && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (mimeType === 'image/gif' && bytes.length >= 10) {
    return {
      width: bytes[6] | (bytes[7] << 8),
      height: bytes[8] | (bytes[9] << 8),
    };
  }

  if (mimeType === 'image/webp' && bytes.length >= 16) {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));

    if (chunk === 'VP8X' && bytes.length >= 30) {
      return {
        width: readUint24LittleEndian(bytes, 24) + 1,
        height: readUint24LittleEndian(bytes, 27) + 1,
      };
    }

    if (chunk === 'VP8L' && bytes[20] === 0x2f && bytes.length >= 25) {
      return {
        width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
        height: 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)),
      };
    }

    if (
      chunk === 'VP8 ' &&
      bytes.length >= 30 &&
      bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a
    ) {
      return {
        width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
        height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      };
    }
  }

  if (mimeType === 'image/jpeg') {
    let offset = 2;

    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = bytes[offset + 1];
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

      if (isStartOfFrame && segmentLength >= 7 && offset + segmentLength + 2 <= bytes.length) {
        return {
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
        };
      }

      if (segmentLength < 2 || offset + segmentLength + 2 > bytes.length) {
        break;
      }

      offset += segmentLength + 2;
    }
  }

  return null;
}

function decodeImageDimensions(src: string, maxPixels: number): Promise<ImageDimensions | null> {
  if (typeof Image === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = globalThis.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      image.src = '';
      reject(new Error('Image preview decoding timed out.'));
    }, 5000);

    image.onload = () => {
      globalThis.clearTimeout(timeout);
      try {
        resolve(
          validateImageDimensions(
            image.naturalWidth > 0 && image.naturalHeight > 0
              ? { height: image.naturalHeight, width: image.naturalWidth }
              : null,
            maxPixels,
          ),
        );
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      globalThis.clearTimeout(timeout);
      resolve(null);
    };
    image.src = src;
  });
}

async function fetchQdnImagePreviewBounded(
  resource: QdnImageResource,
  maxBytes: number,
  maxPixels = IMAGE_PREVIEW_MAX_PIXELS,
) {
  const properties =
    resource.network === 'qortium'
      ? normalizeProperties(
          await qdnRequest<unknown>({
            action: 'GET_QDN_RESOURCE_PROPERTIES',
            ...getResourceRequest(resource),
            maxBytes: RESOURCE_PROPERTIES_MAX_BYTES,
          }),
        )
      : {};

  if (typeof properties.size === 'number' && properties.size > maxBytes) {
    throw new Error('Image preview exceeds the current preview byte limit.');
  }

  const { base64, bytes } = getBase64Payload(
    await getResourceBridge<unknown>(resource.network, {
      action: 'FETCH_QDN_RESOURCE',
      ...getResourceRequest(resource),
      encoding: 'base64',
      rebuild: true,
      maxBytes,
    }),
    maxBytes,
  );
  const mimeType = getImageMimeType(bytes);
  validateImageDimensions(getEncodedImageDimensions(bytes, mimeType), maxPixels);
  const src = `data:${mimeType};base64,${base64}`;
  const dimensions = await decodeImageDimensions(src, maxPixels);

  return {
    byteLength: bytes.byteLength,
    pixelCount: dimensions ? dimensions.width * dimensions.height : 0,
    preview: {
      alt: properties.filename || resource.qdnUrl,
      ...dimensions,
      mimeType,
      qdnUrl: resource.qdnUrl,
      src,
    },
  };
}

export async function fetchQdnImagePreview(resource: QdnImageResource): Promise<QdnImagePreview> {
  return (await fetchQdnImagePreviewBounded(resource, IMAGE_PREVIEW_MAX_BYTES)).preview;
}

export async function fetchMessageQdnImagePreviews(resources: readonly QdnImageResource[]): Promise<QdnImagePreview[]> {
  const candidates: QdnImageResource[] = [];

  for (const resource of resources) {
    if (candidates.length >= MESSAGE_IMAGE_PREVIEW_MAX_COUNT) {
      break;
    }
    const expanded = await getGifRepositoryPreviewResources(
      resource,
      MESSAGE_IMAGE_PREVIEW_MAX_COUNT - candidates.length,
    );
    candidates.push(...expanded.slice(0, MESSAGE_IMAGE_PREVIEW_MAX_COUNT - candidates.length));
  }

  const previews: QdnImagePreview[] = [];
  let remainingBytes = MESSAGE_IMAGE_PREVIEW_MAX_BYTES;
  let remainingPixels = MESSAGE_IMAGE_PREVIEW_MAX_PIXELS;
  let lastError: unknown = null;

  for (const candidate of candidates) {
    if (remainingBytes < 1 || remainingPixels < 1) {
      break;
    }

    const requestMaxBytes = Math.min(IMAGE_PREVIEW_MAX_BYTES, remainingBytes);
    // Reserve the whole permitted response before starting it. A successful
    // short response refunds the unused portion; a failed/invalid response does
    // not, because it may already have transferred its entire allowance.
    remainingBytes -= requestMaxBytes;

    try {
      const result = await scheduleImagePreview(() =>
        fetchQdnImagePreviewBounded(
          candidate,
          requestMaxBytes,
          Math.min(IMAGE_PREVIEW_MAX_PIXELS, remainingPixels),
        ),
      );
      previews.push(result.preview);
      remainingBytes += requestMaxBytes - result.byteLength;
      remainingPixels -= result.pixelCount;
    } catch (error) {
      lastError = error;
    }
  }

  if (previews.length === 0 && lastError) {
    throw lastError;
  }

  return previews;
}

export async function fetchQdnImagePreviews(resource: QdnImageResource): Promise<QdnImagePreview[]> {
  return fetchMessageQdnImagePreviews([resource]);
}

let activeImagePreviewFetches = 0;
const imagePreviewQueue: Array<() => void> = [];

function scheduleImagePreview<T>(task: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeImagePreviewFetches += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeImagePreviewFetches -= 1;
          imagePreviewQueue.shift()?.();
        });
    };

    if (activeImagePreviewFetches < IMAGE_PREVIEW_MAX_CONCURRENT) {
      run();
    } else if (imagePreviewQueue.length < IMAGE_PREVIEW_QUEUE_LIMIT) {
      imagePreviewQueue.push(run);
    } else {
      reject(new Error('Image preview queue is full.'));
    }
  });
}

// Web links are not opened (the app holds no browser-navigation bridge and we
// don't want messages to drive arbitrary navigation). A button, rather than an
// anchor with href, makes copy-only behavior hold for middle-click and context
// menus as well as the ordinary click handler.
function CopyOnlyLink({
  className,
  copiedLabel,
  copyLabel,
  text,
  url,
}: {
  className: string;
  copiedLabel: string;
  copyLabel: string;
  text: string;
  url: string;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  return (
    <button
      className={`${className}${copied ? ' message__web-link--copied' : ''}`}
      onClick={() => {
        void copyTextToClipboard(url)
          .then((didCopy) => {
            if (!didCopy) {
              return;
            }

            setCopied(true);

            if (resetTimer.current) {
              clearTimeout(resetTimer.current);
            }

            resetTimer.current = setTimeout(() => setCopied(false), COPIED_LABEL_RESET_MS);
          })
          .catch((error) => {
            console.warn('Unable to copy link.', error);
          });
      }}
      title={`${copied ? copiedLabel : copyLabel}: ${url}`}
      type="button"
    >
      {text}
      <span aria-live="polite" className="message__web-link-copied">
        {copied ? copiedLabel : copyLabel}
      </span>
    </button>
  );
}

function renderTextPart(
  part: MessageTextPart,
  key: string,
  copiedLabel: string,
  copyLabel: string,
  conversationNetwork: ChatNetwork,
  canOpenQortalAppLinks: boolean,
): ReactNode {
  if (part.kind === 'text') {
    return part.text;
  }

  if (part.kind === 'web-link') {
    return (
      <CopyOnlyLink
        className="message__web-link"
        copiedLabel={copiedLabel}
        copyLabel={copyLabel}
        key={key}
        text={part.text}
        url={part.url}
      />
    );
  }

  if (
    /^(?:qdn|qortal):\/\//i.test(part.address) &&
    getAddressNetwork(part.address, conversationNetwork) === 'qortal' &&
    !canOpenQortalAppLinks
  ) {
    return (
      <CopyOnlyLink
        className="message__app-link message__app-link--copy-only"
        copiedLabel={copiedLabel}
        copyLabel={copyLabel}
        key={key}
        text={part.text}
        url={part.address}
      />
    );
  }

  return (
    <a
      className="message__app-link"
      href={part.address}
      key={key}
      onClick={(event) => {
        event.preventDefault();

        void openAppLinkInHomeTab(part.address, conversationNetwork).catch((error) => {
          console.warn('Unable to open app link.', error);
        });
      }}
      rel="noopener noreferrer"
      target="_blank"
    >
      {part.text}
    </a>
  );
}

export function renderMessageTextWithAppLinks(
  text: string,
  translate?: TranslateFunction,
  conversationNetwork: ChatNetwork = 'qortium',
  options: { canOpenQortalAppLinks?: boolean } = {},
): ReactNode {
  const copiedLabel = translate ? translate('button.copied') : 'Copied';
  const copyLabel = translate ? translate('button.copy') : 'Copy';

  return getMessageSegments(text).map((segment, segmentIndex) => {
    if (segment.kind === 'code') {
      return (
        <pre className="message__code-block" key={`code-${segmentIndex}`}>
          <code data-lang={segment.lang || undefined}>{segment.content}</code>
        </pre>
      );
    }

    return getMessageTextParts(segment.text).map((part, partIndex) =>
      renderTextPart(
        part,
        `${segmentIndex}-${partIndex}`,
        copiedLabel,
        copyLabel,
        conversationNetwork,
        options.canOpenQortalAppLinks === true,
      ),
    );
  });
}

function MessageResourceCard({ resource, t }: { resource: QdnResource; t: TranslateFunction }) {
  const fallback: QdnResourceCard = {
    network: resource.network,
    subtitle: `${resource.network === 'qortal' ? 'Qortal' : 'Qortium'} · ${resource.service} · ${resource.name}`,
    title: resource.identifier || resource.name,
  };
  const [card, setCard] = useState(fallback);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = cardRef.current;

    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [resource.identifier, resource.name, resource.network, resource.path, resource.service]);

  useEffect(() => {
    let active = true;

    setCard(fallback);
    if (isNearViewport) {
      void fetchQdnResourceCard(resource)
        .then((nextCard) => {
          if (active) {
            setCard(nextCard);
          }
        })
        .catch(() => undefined);
    }

    return () => {
      active = false;
    };
  }, [isNearViewport, resource.identifier, resource.name, resource.network, resource.path, resource.service]);

  return (
    <article className="message__resource-card" ref={cardRef} title={resource.qdnUrl}>
      <strong>{card.title}</strong>
      <span>{t('label.resource.public')} · {card.subtitle}</span>
      {card.description ? <p>{card.description}</p> : null}
      {card.mimeType ? <small>{card.mimeType}</small> : null}
    </article>
  );
}

export function MessageResourceCards({ resources, t }: { resources: readonly QdnResource[]; t: TranslateFunction }) {
  if (resources.length === 0) {
    return null;
  }

  return (
    <div className="message__resource-cards">
      {resources.slice(0, 6).map((resource, index) => (
        <MessageResourceCard key={`${resource.network}:${resource.qdnUrl}:${index}`} resource={resource} t={t} />
      ))}
    </div>
  );
}
