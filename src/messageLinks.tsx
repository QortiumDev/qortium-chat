import { type ReactNode } from 'react';
import { qdnRequest } from './qdnRequest';

const IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const APP_LINK_PATTERN = /\b(?:qdn|home|core):\/\/[^\s<>"'`]*/gi;
const TRAILING_SIMPLE_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);
const CLOSING_PAIRS: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{',
};
const IMAGE_QDN_SERVICES = new Set<QdnImageService>(['GIF_REPOSITORY', 'IMAGE', 'THUMBNAIL', 'QCHAT_IMAGE']);
const MEDIA_QDN_SERVICES = new Set<QdnMediaService>(['AUDIO', 'PODCAST', 'VIDEO', 'VOICE']);

export type MessageTextPart =
  | {
      kind: 'text';
      text: string;
    }
  | {
      address: string;
      kind: 'app-link';
      text: string;
    };

type QdnImageService = 'GIF_REPOSITORY' | 'IMAGE' | 'QCHAT_IMAGE' | 'THUMBNAIL';
type QdnMediaService = 'AUDIO' | 'PODCAST' | 'VIDEO' | 'VOICE';

type QdnResourceBase<Service extends string> = {
  identifier?: string;
  name: string;
  path: string;
  qdnUrl: string;
  service: Service;
};

export type QdnImageResource = QdnResourceBase<QdnImageService>;
export type QdnMediaResource = QdnResourceBase<QdnMediaService>;

type QdnResourceProperties = {
  filename?: string;
  mimeType?: string;
  size?: number;
};

type QdnResourceMetadata = {
  files?: string[];
};

export type QdnImagePreview = {
  alt: string;
  mimeType: string;
  qdnUrl: string;
  src: string;
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
    return segment;
  }
}

function isImageQdnService(service: string): service is QdnImageService {
  return IMAGE_QDN_SERVICES.has(service as QdnImageService);
}

function isMediaQdnService(service: string): service is QdnMediaService {
  return MEDIA_QDN_SERVICES.has(service as QdnMediaService);
}

function parseQdnResource(qdnUrl: string): QdnResourceBase<string> | null {
  if (!/^qdn:\/\//i.test(qdnUrl)) {
    return null;
  }

  const withoutProtocol = qdnUrl.replace(/^qdn:\/\/?/i, '').trim();
  const queryIndex = withoutProtocol.indexOf('?');
  const basePart = queryIndex === -1 ? withoutProtocol : withoutProtocol.slice(0, queryIndex);
  const queryString = queryIndex === -1 ? '' : withoutProtocol.slice(queryIndex + 1);
  const parts = basePart.replace(/^\/+/, '').split('/');
  const service = decodeSegment(parts.shift() ?? '').toUpperCase();

  const name = decodeSegment(parts.shift() ?? '').trim();

  if (!name) {
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

  const pathOnly = parts.map(decodeSegment).join('/').replace(/^\/+/, '');
  const remainingQueryString = queryParams.toString();
  const path = `${pathOnly}${remainingQueryString ? `?${remainingQueryString}` : ''}`;

  return {
    identifier: identifier || undefined,
    name,
    path,
    qdnUrl,
    service,
  };
}

function parseQdnImageResource(qdnUrl: string): QdnImageResource | null {
  const resource = parseQdnResource(qdnUrl);

  if (!resource || !isImageQdnService(resource.service)) {
    return null;
  }

  return {
    ...resource,
    service: resource.service,
  };
}

function parseQdnMediaResource(qdnUrl: string): QdnMediaResource | null {
  const resource = parseQdnResource(qdnUrl);

  if (!resource || !isMediaQdnService(resource.service)) {
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

  for (const match of text.matchAll(APP_LINK_PATTERN)) {
    const rawAddress = match[0];
    const matchIndex = match.index ?? 0;
    const { address, trailing } = splitTrailingPunctuation(rawAddress);

    if (!address) {
      continue;
    }

    if (matchIndex > previousIndex) {
      appendText(text.slice(previousIndex, matchIndex));
    }

    parts.push({ address, kind: 'app-link', text: address });

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

function getQdnResources<T>(text: string, parseResource: (qdnUrl: string) => T | null): T[] {
  return getAppLinkAddresses(text)
    .map((address) => parseResource(address))
    .filter((resource): resource is T => resource !== null);
}

export function getImageQdnResources(text: string): QdnImageResource[] {
  return getQdnResources(text, parseQdnImageResource);
}

export function getMediaQdnResources(text: string): QdnMediaResource[] {
  return getQdnResources(text, parseQdnMediaResource);
}

export async function openAppLinkInHomeTab(address: string) {
  return qdnRequest<boolean>({ action: 'OPEN_NEW_TAB', address });
}

export async function openQdnMediaPlayer(resource: QdnMediaResource) {
  return qdnRequest<boolean>({
    action: 'OPEN_QDN_MEDIA_PLAYER',
    ...getResourceRequest(resource),
  });
}

function getResourceRequest(resource: QdnImageResource | QdnMediaResource) {
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
    files: Array.isArray(files) ? files.filter((file): file is string => typeof file === 'string') : undefined,
  };
}

function isGifFilename(value: string) {
  return /\.gif$/i.test(value.split('?')[0] ?? '');
}

function isGifRepositoryFile(value: string) {
  const normalized = value.trim();

  return (
    !!normalized &&
    !normalized.includes('\\') &&
    !normalized.split('/').some((segment) => !segment) &&
    isGifFilename(normalized)
  );
}

function getSortedGifRepositoryFiles(metadata: QdnResourceMetadata) {
  return (metadata.files ?? [])
    .filter(isGifRepositoryFile)
    .slice()
    .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }));
}

function buildQdnImageResourceUrl(resource: QdnImageResource) {
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
    await qdnRequest<unknown>({
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

function getImageMimeType(properties: QdnResourceProperties, base64: string) {
  if (properties.mimeType?.toLowerCase().startsWith('image/')) {
    return properties.mimeType;
  }

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

  return 'image/png';
}

function getBase64Payload(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('QDN image preview returned an unsupported response.');
  }

  const base64 = value.trim();

  if (!base64) {
    throw new Error('QDN image preview returned empty image data.');
  }

  return base64;
}

export async function fetchQdnImagePreview(resource: QdnImageResource): Promise<QdnImagePreview> {
  const properties = normalizeProperties(
    await qdnRequest<unknown>({
      action: 'GET_QDN_RESOURCE_PROPERTIES',
      ...getResourceRequest(resource),
    }),
  );

  if (typeof properties.size === 'number' && properties.size > IMAGE_PREVIEW_MAX_BYTES) {
    throw new Error('Image preview exceeds the 5 MB limit.');
  }

  const base64 = getBase64Payload(
    await qdnRequest<unknown>({
      action: 'FETCH_QDN_RESOURCE',
      ...getResourceRequest(resource),
      encoding: 'base64',
      rebuild: true,
      maxBytes: IMAGE_PREVIEW_MAX_BYTES,
    }),
  );
  const mimeType = getImageMimeType(properties, base64);

  return {
    alt: properties.filename || resource.qdnUrl,
    mimeType,
    qdnUrl: resource.qdnUrl,
    src: `data:${mimeType};base64,${base64}`,
  };
}

export async function fetchQdnImagePreviews(resource: QdnImageResource): Promise<QdnImagePreview[]> {
  const previewResources = await getGifRepositoryPreviewResources(resource);

  return Promise.all(previewResources.map(fetchQdnImagePreview));
}

function renderTextPart(part: MessageTextPart, key: string): ReactNode {
  if (part.kind === 'text') {
    return part.text;
  }

  return (
    <a
      className="message__app-link"
      href={part.address}
      key={key}
      onClick={(event) => {
        event.preventDefault();

        void openAppLinkInHomeTab(part.address).catch((error) => {
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

export function renderMessageTextWithAppLinks(text: string): ReactNode {
  return getMessageSegments(text).map((segment, segmentIndex) => {
    if (segment.kind === 'code') {
      return (
        <pre className="message__code-block" key={`code-${segmentIndex}`}>
          <code data-lang={segment.lang || undefined}>{segment.content}</code>
        </pre>
      );
    }

    return getMessageTextParts(segment.text).map((part, partIndex) =>
      renderTextPart(part, `${segmentIndex}-${partIndex}`),
    );
  });
}
