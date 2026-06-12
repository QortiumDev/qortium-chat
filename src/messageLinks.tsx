import { type ReactNode } from 'react';
import { qdnRequest } from './qdnRequest';

const IMAGE_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const QDN_URL_PATTERN = /qdn:\/\/[^\s<>"'`]+/gi;
const TRAILING_SIMPLE_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);
const CLOSING_PAIRS: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{',
};
const IMAGE_QDN_SERVICES = new Set(['IMAGE', 'THUMBNAIL', 'QCHAT_IMAGE']);

export type MessageTextPart =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'qdn-link';
      text: string;
      qdnUrl: string;
    };

export type QdnImageResource = {
  identifier?: string;
  name: string;
  path: string;
  qdnUrl: string;
  service: 'IMAGE' | 'QCHAT_IMAGE' | 'THUMBNAIL';
};

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
  let qdnUrl = value;
  let trailing = '';

  while (qdnUrl) {
    const lastCharacter = qdnUrl[qdnUrl.length - 1];
    const matchingOpening = CLOSING_PAIRS[lastCharacter];
    const shouldTrimClosing =
      matchingOpening !== undefined &&
      countCharacter(qdnUrl, lastCharacter) > countCharacter(qdnUrl, matchingOpening);

    if (!TRAILING_SIMPLE_PUNCTUATION.has(lastCharacter) && !shouldTrimClosing) {
      break;
    }

    trailing = `${lastCharacter}${trailing}`;
    qdnUrl = qdnUrl.slice(0, -1);
  }

  return { qdnUrl, trailing };
}

function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function parseQdnImageResource(qdnUrl: string): QdnImageResource | null {
  if (!/^qdn:\/\//i.test(qdnUrl)) {
    return null;
  }

  const withoutProtocol = qdnUrl.replace(/^qdn:\/\/?/i, '').trim();
  const queryIndex = withoutProtocol.indexOf('?');
  const basePart = queryIndex === -1 ? withoutProtocol : withoutProtocol.slice(0, queryIndex);
  const queryString = queryIndex === -1 ? '' : withoutProtocol.slice(queryIndex + 1);
  const parts = basePart.replace(/^\/+/, '').split('/');
  const service = decodeSegment(parts.shift() ?? '').toUpperCase();

  if (!IMAGE_QDN_SERVICES.has(service)) {
    return null;
  }

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
    service: service as QdnImageResource['service'],
  };
}

export function getMessageTextParts(text: string): MessageTextPart[] {
  const parts: MessageTextPart[] = [];
  let previousIndex = 0;

  for (const match of text.matchAll(QDN_URL_PATTERN)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;
    const { qdnUrl, trailing } = splitTrailingPunctuation(rawUrl);

    if (!qdnUrl) {
      continue;
    }

    if (matchIndex > previousIndex) {
      parts.push({ kind: 'text', text: text.slice(previousIndex, matchIndex) });
    }

    parts.push({ kind: 'qdn-link', text: qdnUrl, qdnUrl });

    if (trailing) {
      parts.push({ kind: 'text', text: trailing });
    }

    previousIndex = matchIndex + rawUrl.length;
  }

  if (previousIndex < text.length) {
    parts.push({ kind: 'text', text: text.slice(previousIndex) });
  }

  return parts.length > 0 ? parts : [{ kind: 'text', text }];
}

export function getImageQdnResources(text: string): QdnImageResource[] {
  return getMessageTextParts(text)
    .filter((part): part is Extract<MessageTextPart, { kind: 'qdn-link' }> => part.kind === 'qdn-link')
    .map((part) => parseQdnImageResource(part.qdnUrl))
    .filter((resource): resource is QdnImageResource => resource !== null);
}

export async function openQdnUrlInHomeTab(qdnUrl: string) {
  return qdnRequest<boolean>({ action: 'OPEN_NEW_TAB', qdnUrl });
}

function getResourceRequest(resource: QdnImageResource) {
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

export function renderMessageTextWithQdnLinks(text: string): ReactNode {
  return getMessageTextParts(text).map((part, index) => {
    if (part.kind === 'text') {
      return part.text;
    }

    return (
      <a
        className="message__qdn-link"
        href={part.qdnUrl}
        key={`${part.qdnUrl}-${index}`}
        onClick={(event) => {
          event.preventDefault();

          void openQdnUrlInHomeTab(part.qdnUrl).catch((error) => {
            console.warn('Unable to open QDN link.', error);
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
