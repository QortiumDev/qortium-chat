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
const IMAGE_QDN_SERVICES = new Set<QdnImageService>(['IMAGE', 'THUMBNAIL', 'QCHAT_IMAGE']);
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

type QdnImageService = 'IMAGE' | 'QCHAT_IMAGE' | 'THUMBNAIL';
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

function getQdnResources<T>(text: string, parseResource: (qdnUrl: string) => T | null): T[] {
  return getMessageTextParts(text)
    .filter((part): part is Extract<MessageTextPart, { kind: 'app-link' }> => part.kind === 'app-link')
    .map((part) => parseResource(part.address))
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

export function renderMessageTextWithAppLinks(text: string): ReactNode {
  return getMessageTextParts(text).map((part, index) => {
    if (part.kind === 'text') {
      return part.text;
    }

    return (
      <a
        className="message__app-link"
        href={part.address}
        key={`${part.address}-${index}`}
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
  });
}
