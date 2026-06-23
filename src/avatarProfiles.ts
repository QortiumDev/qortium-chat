import { getAccountNames, resolveIdentities } from './coreApi';
import { qdnRequest } from './qdnRequest';
import type { NameSummary, QdnAction } from './types';

const AVATAR_MAX_BYTES = 500 * 1024;

// Avatars are rendered straight into `<img src>`. We only ever build them from
// an allowlisted raster image type — raster-only deliberately excludes
// `image/svg+xml`, whose data URLs can carry script — and we validate the base64
// alphabet before decoding. The decoded bytes are wrapped in a Blob and served
// via `URL.createObjectURL`, so the value handed to `<img src>` is an opaque
// `blob:` URL rather than a string built from the remote payload.
const SAFE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

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
  const mimeType = getStringProperty(properties, 'mimeType')?.toLowerCase();

  if (mimeType && SAFE_IMAGE_MIME_TYPES.has(mimeType)) {
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

  if (!BASE64_PATTERN.test(base64)) {
    throw new Error('Avatar resource returned malformed image data.');
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
  const blob = new Blob([decodeBase64ToBytes(base64)], { type: mimeType });

  // Returns an opaque `blob:` URL. The cache in useAvatarProfiles holds these
  // for the session (mirroring the prior in-memory data-URL footprint), so they
  // are intentionally not revoked here — revoking a shared URL would break any
  // avatar or open lightbox still pointing at it.
  return URL.createObjectURL(blob);
}

export type ResolvedIdentityProfile = { name: string | null; hasAvatar: boolean };

// Resolve names (and whether an avatar exists) for a batch of addresses in one
// RESOLVE_IDENTITIES call. A caller-supplied preferred name still wins, matching
// resolveRegisteredName. Throws if the bridge action is unavailable so the caller
// can fall back to the per-address path. The avatar image itself is fetched
// separately via fetchAvatarImage so it goes through the hardened blob path
// rather than binding the bridge's avatar URL straight into <img src>.
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
    const hasAvatar = !!normalizeRegisteredName(identity?.avatarSrc);

    result.set(address, { hasAvatar, name });
  }

  return result;
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
