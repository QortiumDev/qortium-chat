import { getAccountNames } from './coreApi';
import { qdnRequest } from './qdnRequest';
import type { NameSummary, QdnAction } from './types';

const AVATAR_MAX_BYTES = 500 * 1024;

export type AvatarProfile = {
  address: string;
  avatarSrc: string | null;
  name: string | null;
};

export function normalizeRegisteredName(name: string | null | undefined) {
  return typeof name === 'string' && name.length > 0 ? name : null;
}

export function getAvatarFallbackCharacter(name: string | null | undefined) {
  const registeredName = normalizeRegisteredName(name);

  return registeredName ? (Array.from(registeredName)[0] ?? '?') : '?';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getStringProperty(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];

  return typeof property === 'string' ? property : undefined;
}

function getNumberProperty(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const property = value[key];

  return typeof property === 'number' ? property : undefined;
}

function getFirstRegisteredName(names: NameSummary[]) {
  for (const summary of names) {
    const name = normalizeRegisteredName(summary.name);

    if (name) {
      return name;
    }
  }

  return null;
}

function getImageMimeType(properties: unknown, base64: string) {
  const mimeType = getStringProperty(properties, 'mimeType');

  if (mimeType?.toLowerCase().startsWith('image/')) {
    return mimeType;
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
    throw new Error('Avatar resource returned an unsupported response.');
  }

  const base64 = value.trim();

  if (!base64) {
    throw new Error('Avatar resource returned empty image data.');
  }

  return base64;
}

async function resolveRegisteredName(address: string, preferredName: string | null | undefined, actions?: QdnAction[]) {
  const normalizedPreferredName = normalizeRegisteredName(preferredName);

  if (normalizedPreferredName) {
    return normalizedPreferredName;
  }

  return getFirstRegisteredName(await getAccountNames(address, actions));
}

export async function fetchAvatarImage(name: string) {
  const request = {
    service: 'THUMBNAIL',
    name,
    identifier: 'avatar',
    path: '',
  };
  const properties = await qdnRequest<unknown>({
    action: 'GET_QDN_RESOURCE_PROPERTIES',
    ...request,
  });
  const size = getNumberProperty(properties, 'size');

  if (typeof size === 'number' && size > AVATAR_MAX_BYTES) {
    throw new Error('Avatar exceeds the thumbnail size limit.');
  }

  const base64 = getBase64Payload(
    await qdnRequest<unknown>({
      action: 'FETCH_QDN_RESOURCE',
      ...request,
      encoding: 'base64',
      rebuild: true,
      maxBytes: AVATAR_MAX_BYTES,
    }),
  );
  const mimeType = getImageMimeType(properties, base64);

  return `data:${mimeType};base64,${base64}`;
}

export async function loadAvatarProfile({
  actions,
  address,
  preferredName,
}: {
  actions?: QdnAction[];
  address: string;
  preferredName?: string | null;
}): Promise<AvatarProfile> {
  const name = await resolveRegisteredName(address, preferredName, actions);

  if (!name) {
    return {
      address,
      avatarSrc: null,
      name: null,
    };
  }

  try {
    return {
      address,
      avatarSrc: await fetchAvatarImage(name),
      name,
    };
  } catch {
    return {
      address,
      avatarSrc: null,
      name,
    };
  }
}
