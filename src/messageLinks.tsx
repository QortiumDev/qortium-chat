import { type ReactNode, useEffect, useRef, useState } from 'react';
import { copyTextToClipboard } from './clipboard';
import { type TranslateFunction } from './i18n';
import { qdnRequest } from './qdnRequest';
import { qortalRequest } from './qortalRequest';
import { type QortalHubImageRef } from './chatText';
import { type ChatNetwork } from './types';

const IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_PREVIEW_MAX_CONCURRENT = 3;
const RESOURCE_CARD_CACHE_LIMIT = 500;
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

function isSafeResourcePath(path: string) {
  return (
    path.length <= 1024 &&
    !/[\\\u0000-\u001f]/.test(path) &&
    !path.split('/').some((segment) => segment === '.' || segment === '..' || !segment)
  );
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
  const service = decodeSegment(parts.shift() ?? '').toUpperCase();
  const name = decodeSegment(parts.shift() ?? '').trim();

  if (
    !/^[A-Z0-9_]{1,64}$/.test(service) ||
    !name ||
    name.length > 255 ||
    /[/\\\u0000-\u001f]/.test(name)
  ) {
    return null;
  }

  const queryParams = new URLSearchParams(queryString);
  const queryIdentifier = queryParams.get('identifier')?.trim() || '';

  if (queryIdentifier) {
    queryParams.delete('identifier');
  }

  let identifier = queryIdentifier || decodeSegment(parts.shift() ?? '').trim();

  if (identifier.toLowerCase() === 'default') {
    identifier = '';
  }

  if (identifier.length > 64 || /[/\\\u0000-\u001f]/.test(identifier)) {
    return null;
  }

  const pathOnly = parts.map(decodeSegment).join('/').replace(/^\/+/, '');

  // `identifier` is the only supported URI query. Passing arbitrary query
  // text through the bridge as a filepath makes resource identity ambiguous.
  if ([...queryParams.keys()].length > 0 || (pathOnly && !isSafeResourcePath(pathOnly))) {
    return null;
  }

  return {
    identifier: identifier || undefined,
    name,
    network: getAddressNetwork(qdnUrl, conversationNetwork),
    path: pathOnly,
    qdnUrl,
    service,
  };
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
    .map((image) =>
      parseQdnImageResource(
        `qortal://${encodeURIComponent(image.service.toUpperCase())}/${encodeURIComponent(image.name)}/${encodeURIComponent(image.identifier)}`,
        'qortal',
      ),
    )
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
  // three app-link schemes, and a sane length cap (mirroring Home's own rule).
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
export async function saveQdnResource(resource: QdnImageResource | QdnMediaResource | QdnDocumentResource) {
  return getResourceBridge<{ canceled?: boolean }>(resource.network, {
    action: 'SAVE_QDN_RESOURCE',
    ...getResourceRequest(resource),
  });
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
  const cacheKey = `${resource.network}:${resource.service}:${resource.name}:${resource.identifier ?? ''}:${resource.path}`;
  const cached = resourceCardCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const pending = fetchQdnResourceCardUncached(resource);

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

async function fetchQdnResourceCardUncached(resource: QdnResource): Promise<QdnResourceCard> {
  let metadata: QdnResourceMetadata = {};

  try {
    metadata = normalizeMetadata(
      await getResourceBridge<unknown>(resource.network, {
        action: 'GET_QDN_RESOURCE_METADATA',
        ...getResourceRequest(resource),
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
  return `${resource.network === 'qortal' ? 'qortal' : 'qdn'}://${resource.service}/${encodeURIComponent(resource.name)}/${encodeURIComponent(
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
    }),
  );
}

async function getGifRepositoryPreviewResources(resource: QdnImageResource) {
  if (resource.service !== 'GIF_REPOSITORY' || resource.path) {
    return [resource];
  }

  let metadata: QdnResourceMetadata;

  try {
    metadata = await fetchQdnResourceMetadata(resource);
  } catch {
    return [resource];
  }

  const files = getSortedGifRepositoryFiles(metadata);

  return files.length > 0 ? files.map((file) => getQdnImageResourceWithPath(resource, file)) : [resource];
}

function getImageMimeType(base64: string) {
  if (base64.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  }

  if (base64.startsWith('/9j/')) {
    return 'image/jpeg';
  }

  if (base64.startsWith('R0lGOD')) {
    return 'image/gif';
  }

  if (base64.startsWith('UklGR')) {
    return 'image/webp';
  }

  throw new Error('Image preview returned unsupported or unsafe image bytes.');
}

function getBase64Payload(value: unknown) {
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
    estimatedBytes > IMAGE_PREVIEW_MAX_BYTES ||
    (typeof contentLength === 'number' && contentLength > IMAGE_PREVIEW_MAX_BYTES)
  ) {
    throw new Error('Image preview exceeds the 5 MB limit.');
  }

  return base64;
}

function decodeImageDimensions(src: string): Promise<{ height: number; width: number } | null> {
  if (typeof Image === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      resolve(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { height: image.naturalHeight, width: image.naturalWidth }
          : null,
      );
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export async function fetchQdnImagePreview(resource: QdnImageResource): Promise<QdnImagePreview> {
  const properties =
    resource.network === 'qortium'
      ? normalizeProperties(
          await qdnRequest<unknown>({
            action: 'GET_QDN_RESOURCE_PROPERTIES',
            ...getResourceRequest(resource),
          }),
        )
      : {};

  if (typeof properties.size === 'number' && properties.size > IMAGE_PREVIEW_MAX_BYTES) {
    throw new Error('Image preview exceeds the 5 MB limit.');
  }

  const base64 = getBase64Payload(
    await getResourceBridge<unknown>(resource.network, {
      action: 'FETCH_QDN_RESOURCE',
      ...getResourceRequest(resource),
      encoding: 'base64',
      rebuild: true,
      maxBytes: IMAGE_PREVIEW_MAX_BYTES,
    }),
  );
  const mimeType = getImageMimeType(base64);
  const src = `data:${mimeType};base64,${base64}`;
  const dimensions = await decodeImageDimensions(src);

  return {
    alt: properties.filename || resource.qdnUrl,
    ...dimensions,
    mimeType,
    qdnUrl: resource.qdnUrl,
    src,
  };
}

export async function fetchQdnImagePreviews(resource: QdnImageResource): Promise<QdnImagePreview[]> {
  const previewResources = await getGifRepositoryPreviewResources(resource);

  return Promise.all(previewResources.map((previewResource) => scheduleImagePreview(() => fetchQdnImagePreview(previewResource))));
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
    } else {
      imagePreviewQueue.push(run);
    }
  });
}

// Web links are not opened (the app holds no browser-navigation bridge and we
// don't want messages to drive arbitrary navigation); clicking copies the URL
// to the clipboard instead, with a brief "copied" confirmation.
function WebLink({ url, text, copiedLabel }: { url: string; text: string; copiedLabel: string }): ReactNode {
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
    <a
      className={`message__web-link${copied ? ' message__web-link--copied' : ''}`}
      href={url}
      onClick={(event) => {
        event.preventDefault();

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
      rel="noopener noreferrer"
      title={copied ? copiedLabel : url}
    >
      {text}
      {copied ? (
        <span aria-live="polite" className="message__web-link-copied">
          {copiedLabel}
        </span>
      ) : null}
    </a>
  );
}

function renderTextPart(
  part: MessageTextPart,
  key: string,
  copiedLabel: string,
  conversationNetwork: ChatNetwork,
): ReactNode {
  if (part.kind === 'text') {
    return part.text;
  }

  if (part.kind === 'web-link') {
    return <WebLink copiedLabel={copiedLabel} key={key} text={part.text} url={part.url} />;
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
): ReactNode {
  const copiedLabel = translate ? translate('button.copied') : 'Copied';

  return getMessageSegments(text).map((segment, segmentIndex) => {
    if (segment.kind === 'code') {
      return (
        <pre className="message__code-block" key={`code-${segmentIndex}`}>
          <code data-lang={segment.lang || undefined}>{segment.content}</code>
        </pre>
      );
    }

    return getMessageTextParts(segment.text).map((part, partIndex) =>
      renderTextPart(part, `${segmentIndex}-${partIndex}`, copiedLabel, conversationNetwork),
    );
  });
}

function MessageResourceCard({ resource }: { resource: QdnResource }) {
  const fallback: QdnResourceCard = {
    network: resource.network,
    subtitle: `${resource.network === 'qortal' ? 'Qortal' : 'Qortium'} · ${resource.service} · ${resource.name}`,
    title: resource.identifier || resource.name,
  };
  const [card, setCard] = useState(fallback);

  useEffect(() => {
    let active = true;

    setCard(fallback);
    void fetchQdnResourceCard(resource).then((nextCard) => {
      if (active) {
        setCard(nextCard);
      }
    });

    return () => {
      active = false;
    };
  }, [resource.identifier, resource.name, resource.network, resource.path, resource.service]);

  return (
    <article className="message__resource-card" title={resource.qdnUrl}>
      <strong>{card.title}</strong>
      <span>{card.subtitle}</span>
      {card.description ? <p>{card.description}</p> : null}
      {card.mimeType ? <small>{card.mimeType}</small> : null}
    </article>
  );
}

export function MessageResourceCards({ resources }: { resources: readonly QdnResource[] }) {
  if (resources.length === 0) {
    return null;
  }

  return (
    <div className="message__resource-cards">
      {resources.slice(0, 6).map((resource, index) => (
        <MessageResourceCard key={`${resource.network}:${resource.qdnUrl}:${index}`} resource={resource} />
      ))}
    </div>
  );
}
