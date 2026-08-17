import { bridgeRequest } from './chatNetwork';
import { getAccountNamesForNetwork, resolveIdentities } from './coreApi';
import { hasAction, qdnRequest } from './qdnRequest';
import type { ChatNetwork, GroupData, NameSummary, QdnAction } from './types';

export const AVATAR_MAX_BYTES = 500 * 1024;
export const AVATAR_MAX_PIXELS = 1024 * 1024;
export const AVATAR_CACHE_MAX_BYTES = 8 * 1024 * 1024;
export const AVATAR_CACHE_MAX_PIXELS = 8 * 1024 * 1024;
export const AVATAR_PENDING_MAX_ATTEMPTS = 10;
export const AVATAR_PENDING_MAX_ELAPSED_MS = 5 * 60 * 1000;

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ASCII_WHITESPACE_PATTERN = /[\t\n\f\r ]/g;
const LEGACY_AVATAR_IDENTIFIERS = ['avatar', 'qortal_avatar'] as const;

export type AvatarProfile = {
  address: string;
  avatarSrc: string | null;
  name: string | null;
  network: ChatNetwork;
};

export type GroupAvatarProfile = {
  avatarSrc: string | null;
  groupId: number;
  network: ChatNetwork;
};

export function getAvatarProfileKey(network: ChatNetwork, address: string) {
  return `${network}:${address}`;
}

export function getGroupAvatarProfileKey(network: ChatNetwork, groupId: number) {
  return `${network}:${groupId}`;
}

type AvatarSource = 'POINTER' | 'LEGACY';
type AvatarDescriptor = { identifier: string; name: string; service: string };

export type AccountAvatarFetch =
  | { kind: 'pending'; retryAfterSeconds: number; source: AvatarSource }
  | { byteLength: number; kind: 'ready'; pixelCount: number; source: AvatarSource; src: string }
  | { kind: 'unavailable' };

export type AvatarPendingRetryState = {
  attempts: number;
  startedAt: number;
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
  // Android's Capacitor HTTP bridge can return RFC 2045-style wrapped base64.
  // Ignore ASCII whitespace while keeping the alphabet and padding validation
  // strict so the same avatar response works in Home on desktop and Android.
  const normalized = value.replace(BASE64_ASCII_WHITESPACE_PATTERN, '');

  if (!normalized || !BASE64_PATTERN.test(normalized)) {
    return null;
  }

  try {
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function getSafeImageContentType(bytes: Uint8Array) {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number) {
  return (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + ((bytes[offset + 3] << 24) >>> 0)) >>> 0;
}

function getJpegDimensions(bytes: Uint8Array) {
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) return null;
    if (offset + 2 > bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (length < 7) return null;
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += length;
  }

  return null;
}

function getSafeImageDimensions(bytes: Uint8Array, contentType: string) {
  if (contentType === 'image/png' && bytes.length >= 24) {
    return { height: readUint32BigEndian(bytes, 20), width: readUint32BigEndian(bytes, 16) };
  }
  if (contentType === 'image/gif' && bytes.length >= 10) {
    return { height: readUint16LittleEndian(bytes, 8), width: readUint16LittleEndian(bytes, 6) };
  }
  if (contentType === 'image/bmp' && bytes.length >= 26) {
    return { height: Math.abs(readUint32LittleEndian(bytes, 22) | 0), width: Math.abs(readUint32LittleEndian(bytes, 18) | 0) };
  }
  if (contentType === 'image/jpeg') {
    return getJpegDimensions(bytes);
  }
  if (contentType === 'image/webp' && bytes.length >= 30) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X') {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { height, width };
    }
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return {
        height: readUint16LittleEndian(bytes, 28) & 0x3fff,
        width: readUint16LittleEndian(bytes, 26) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f && bytes.length >= 25) {
      return {
        height: 1 + (((bytes[22] >> 6) | (bytes[23] << 2) | (bytes[24] << 10)) & 0x3fff),
        width: 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff),
      };
    }
  }

  return null;
}

function createAvatarObjectUrl(body: unknown) {
  if (typeof body !== 'string') {
    return null;
  }

  const bytes = decodeBase64(body);
  const contentType = bytes ? getSafeImageContentType(bytes) : null;

  const dimensions = bytes && contentType ? getSafeImageDimensions(bytes, contentType) : null;
  const pixelCount = dimensions ? dimensions.width * dimensions.height : 0;

  if (
    !bytes ||
    !contentType ||
    !dimensions ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    !Number.isSafeInteger(pixelCount) ||
    pixelCount > AVATAR_MAX_PIXELS ||
    bytes.byteLength < 1 ||
    bytes.byteLength > AVATAR_MAX_BYTES
  ) {
    return null;
  }

  return {
    byteLength: bytes.byteLength,
    pixelCount,
    src: URL.createObjectURL(new Blob([bytes.buffer], { type: contentType })),
  };
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

  const avatar = createAvatarObjectUrl(value.body);
  return avatar ? { kind: 'ready', source, ...avatar } : { kind: 'unavailable' };
}

async function fetchLegacyNamedThumbnail(
  network: ChatNetwork,
  address: string,
  name: string,
  identifiers: readonly string[],
): Promise<AccountAvatarFetch> {
  for (const identifier of identifiers) {
    try {
      const response = await bridgeRequest<unknown>(network, {
        action: 'FETCH_QDN_RESOURCE',
        encoding: 'base64',
        identifier,
        maxBytes: AVATAR_MAX_BYTES,
        name,
        rebuild: true,
        service: 'THUMBNAIL',
      });
      const body = isRecord(response) && response.encoding === 'base64' ? response.body : response;
      const avatar = createAvatarObjectUrl(body);
      const parsed: AccountAvatarFetch = avatar ? { kind: 'ready', source: 'LEGACY', ...avatar } : { kind: 'unavailable' };

      if (parsed.kind === 'ready') {
        return parsed;
      }
    } catch {
      // Try the next established legacy identifier.
    }
  }

  return { kind: 'unavailable' };
}

/**
 * Read one current account avatar through the pointer-aware Home bridge. Home
 * owns legacy compatibility when its dedicated action exists. Older Home
 * builds can still return the established named-thumbnail bytes through the
 * generic QDN read actions; the app never constructs a raw node URL.
 */
export async function fetchAccountAvatar(
  network: ChatNetwork,
  address: string,
  actions?: QdnAction[],
  preferredName?: string | null,
): Promise<AccountAvatarFetch> {
  const actionList = actions ?? [];

  if (network === 'qortal') {
    const name = normalizeRegisteredName(preferredName);
    const canFetchLegacy =
      !!name &&
      hasAction(actionList, 'FETCH_QDN_RESOURCE');

    return canFetchLegacy
      ? fetchLegacyNamedThumbnail(network, address, name, ['qortal_avatar'])
      : { kind: 'unavailable' };
  }

  if (!hasAction(actionList, 'FETCH_ACCOUNT_AVATAR')) {
    const name = normalizeRegisteredName(preferredName);
    const canFetchLegacy = !!name && hasAction(actionList, 'FETCH_QDN_RESOURCE');

    return canFetchLegacy
      ? fetchLegacyNamedThumbnail(network, address, name, LEGACY_AVATAR_IDENTIFIERS)
      : { kind: 'unavailable' };
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

function parseGroupAvatar(value: unknown, expectedGroupId: number): AccountAvatarFetch {
  if (!isRecord(value) || value.groupId !== expectedGroupId || (value.source !== 'POINTER' && value.source !== 'LEGACY')) {
    return { kind: 'unavailable' };
  }

  const source = value.source;
  if (source === 'POINTER' && !parseDescriptor(value.descriptor)) {
    return { kind: 'unavailable' };
  }
  if (value.status === 'PENDING') {
    const delay = typeof value.retryAfterSeconds === 'number' && Number.isFinite(value.retryAfterSeconds)
      ? value.retryAfterSeconds
      : 5;
    return { kind: 'pending', retryAfterSeconds: Math.min(Math.max(Math.floor(delay), 1), 30), source };
  }

  const avatar = value.encoding === 'base64' ? createAvatarObjectUrl(value.body) : null;
  return avatar ? { kind: 'ready', source, ...avatar } : { kind: 'unavailable' };
}

export async function fetchGroupAvatar(
  network: ChatNetwork,
  group: Pick<GroupData, 'groupId' | 'owner' | 'ownerPrimaryName'>,
  actions?: QdnAction[],
): Promise<AccountAvatarFetch> {
  const actionList = actions ?? [];

  if (network === 'qortium') {
    if (!hasAction(actionList, 'FETCH_GROUP_AVATAR')) {
      return { kind: 'unavailable' };
    }

    try {
      return parseGroupAvatar(
        await qdnRequest<unknown>({ action: 'FETCH_GROUP_AVATAR', groupId: group.groupId, maxBytes: AVATAR_MAX_BYTES }),
        group.groupId,
      );
    } catch {
      return { kind: 'unavailable' };
    }
  }

  if (!hasAction(actionList, 'FETCH_QDN_RESOURCE')) {
    return { kind: 'unavailable' };
  }

  let ownerName = normalizeRegisteredName(group.ownerPrimaryName);
  if (!ownerName && group.owner) {
    try {
      ownerName = getFirstRegisteredName(await getAccountNamesForNetwork('qortal', group.owner, actionList));
    } catch {
      ownerName = null;
    }
  }
  if (!ownerName) {
    return { kind: 'unavailable' };
  }

  try {
    const response = await bridgeRequest<unknown>('qortal', {
      action: 'FETCH_QDN_RESOURCE',
      encoding: 'base64',
      identifier: `qortal_group_avatar_${group.groupId}`,
      maxBytes: AVATAR_MAX_BYTES,
      name: ownerName,
      rebuild: true,
      service: 'THUMBNAIL',
    });
    const body = isRecord(response) && response.encoding === 'base64' ? response.body : response;
    const avatar = createAvatarObjectUrl(body);
    return avatar ? { kind: 'ready', source: 'LEGACY', ...avatar } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

export function getNextAvatarPendingRetry(
  current: AvatarPendingRetryState | undefined,
  retryAfterSeconds: number,
  now = Date.now(),
): { delayMs: number; state: AvatarPendingRetryState } | null {
  const startedAt = current?.startedAt ?? now;
  const attempts = (current?.attempts ?? 0) + 1;
  const delayMs = retryAfterSeconds * 1000;

  if (
    attempts >= AVATAR_PENDING_MAX_ATTEMPTS ||
    now - startedAt + delayMs > AVATAR_PENDING_MAX_ELAPSED_MS
  ) {
    return null;
  }

  return {
    delayMs,
    state: { attempts, startedAt },
  };
}

export function revokeAvatarObjectUrl(src: string | null | undefined) {
  if (typeof src === 'string' && src.startsWith('blob:')) {
    URL.revokeObjectURL(src);
  }
}

async function resolveRegisteredName(
  network: ChatNetwork,
  address: string,
  preferredName: string | null | undefined,
  actions?: QdnAction[],
) {
  const normalizedPreferredName = normalizeRegisteredName(preferredName);

  if (normalizedPreferredName) {
    return normalizedPreferredName;
  }

  return getFirstRegisteredName(await getAccountNamesForNetwork(network, address, actions));
}

// Names are an independent display concern. An account can have a pointer
// avatar even when it has no current registered name, so this intentionally
// does not decide whether an image should be fetched.
export async function loadAvatarProfile({
  actions,
  address,
  network,
  preferredName,
}: {
  actions?: QdnAction[];
  address: string;
  network: ChatNetwork;
  preferredName?: string | null;
}): Promise<AvatarProfile> {
  try {
    return {
      address,
      avatarSrc: null,
      name: await resolveRegisteredName(network, address, preferredName, actions),
      network,
    };
  } catch {
    return { address, avatarSrc: null, name: normalizeRegisteredName(preferredName), network };
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
