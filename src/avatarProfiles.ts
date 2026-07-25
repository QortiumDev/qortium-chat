import { getAccountNames, resolveIdentities } from './coreApi';
import { hasAction, qdnRequest } from './qdnRequest';
import type { NameSummary, QdnAction } from './types';

export const AVATAR_MAX_BYTES = 500 * 1024;

const SAFE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/webp']);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type AvatarProfile = {
  address: string;
  avatarSrc: string | null;
  name: string | null;
};

type AvatarSource = 'POINTER' | 'LEGACY';
type AvatarDescriptor = { identifier: string; name: string; service: string };

export type AccountAvatarFetch =
  | { kind: 'pending'; retryAfterSeconds: number; source: AvatarSource }
  | { kind: 'ready'; source: AvatarSource; src: string }
  | { kind: 'unavailable' };

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

function getFirstRegisteredName(names: NameSummary[]) {
  for (const summary of names) {
    const name = normalizeRegisteredName(summary.name);

    if (name) {
      return name;
    }
  }

  return null;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseDescriptor(value: unknown): AvatarDescriptor | null {
  if (value === null || typeof value === 'undefined' || !isRecord(value)) {
    return null;
  }

  const service = text(value.service);
  const name = text(value.name);

  return service && name && typeof value.identifier === 'string' ? { identifier: value.identifier, name, service } : null;
}

function decodeBase64(value: string) {
  if (!value || !BASE64_PATTERN.test(value)) {
    return null;
  }

  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function parseAccountAvatar(value: unknown, expectedAddress: string): AccountAvatarFetch {
  if (!isRecord(value) || value.address !== expectedAddress || (value.source !== 'POINTER' && value.source !== 'LEGACY')) {
    return { kind: 'unavailable' };
  }

  const source = value.source;
  const descriptor = parseDescriptor(value.descriptor);

  if (source === 'POINTER' && !descriptor) {
    return { kind: 'unavailable' };
  }

  if (value.status === 'PENDING') {
    const requestedDelay = typeof value.retryAfterSeconds === 'number' && Number.isFinite(value.retryAfterSeconds)
      ? value.retryAfterSeconds
      : 5;

    return { kind: 'pending', retryAfterSeconds: Math.min(Math.max(Math.floor(requestedDelay), 1), 30), source };
  }

  if (value.encoding !== 'base64' || typeof value.body !== 'string' || typeof value.contentType !== 'string') {
    return { kind: 'unavailable' };
  }

  const contentType = value.contentType.toLowerCase().split(';', 1)[0];
  const contentLength = value.contentLength;
  const bytes = decodeBase64(value.body);

  if (
    !SAFE_IMAGE_MIME_TYPES.has(contentType) ||
    typeof contentLength !== 'number' ||
    !Number.isSafeInteger(contentLength) ||
    contentLength < 1 ||
    contentLength > AVATAR_MAX_BYTES ||
    !bytes ||
    bytes.byteLength !== contentLength
  ) {
    return { kind: 'unavailable' };
  }

  return {
    kind: 'ready',
    source,
    src: URL.createObjectURL(new Blob([bytes.buffer], { type: contentType })),
  };
}

/**
 * Read one current account avatar through the pointer-aware Home bridge. Home
 * owns legacy compatibility; callers never reconstruct named-thumbnail URLs.
 */
export async function fetchAccountAvatar(address: string, actions?: QdnAction[]): Promise<AccountAvatarFetch> {
  if (!hasAction(actions ?? [], 'FETCH_ACCOUNT_AVATAR')) {
    return { kind: 'unavailable' };
  }

  try {
    return parseAccountAvatar(
      await qdnRequest<unknown>({ action: 'FETCH_ACCOUNT_AVATAR', address, maxBytes: AVATAR_MAX_BYTES }),
      address,
    );
  } catch {
    return { kind: 'unavailable' };
  }
}

export function revokeAvatarObjectUrl(src: string | null | undefined) {
  if (typeof src === 'string' && src.startsWith('blob:')) {
    URL.revokeObjectURL(src);
  }
}

async function resolveRegisteredName(address: string, preferredName: string | null | undefined, actions?: QdnAction[]) {
  const normalizedPreferredName = normalizeRegisteredName(preferredName);

  if (normalizedPreferredName) {
    return normalizedPreferredName;
  }

  return getFirstRegisteredName(await getAccountNames(address, actions));
}

// Names are an independent display concern. An account can have a pointer
// avatar even when it has no current registered name, so this intentionally
// does not decide whether an image should be fetched.
export async function loadAvatarProfile({
  actions,
  address,
  preferredName,
}: {
  actions?: QdnAction[];
  address: string;
  preferredName?: string | null;
}): Promise<AvatarProfile> {
  try {
    return {
      address,
      avatarSrc: null,
      name: await resolveRegisteredName(address, preferredName, actions),
    };
  } catch {
    return { address, avatarSrc: null, name: normalizeRegisteredName(preferredName) };
  }
}

export type ResolvedIdentityProfile = { name: string | null };

// Batch name resolution remains useful, but avatarSrc is a legacy compatibility
// hint and deliberately never participates in pointer-avatar decisions.
export async function resolveAvatarIdentities({
  actions,
  addresses,
  knownNamesByAddress,
}: {
  actions?: QdnAction[];
  addresses: string[];
  knownNamesByAddress?: ReadonlyMap<string, string>;
}): Promise<Map<string, ResolvedIdentityProfile>> {
  const identities = await resolveIdentities(addresses, actions);
  const byAddress = new Map(identities.map((identity) => [identity.address, identity]));
  const result = new Map<string, ResolvedIdentityProfile>();

  for (const address of addresses) {
    const identity = byAddress.get(address);
    const name =
      normalizeRegisteredName(knownNamesByAddress?.get(address)) ?? normalizeRegisteredName(identity?.name) ?? null;

    result.set(address, { name });
  }

  return result;
}
