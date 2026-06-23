// Per-account chat preferences persisted in localStorage: the last-selected chat
// (restored on open, falling back to General Chat) and the set of direct chats to
// keep in the sidebar even after their messages expire off the active-chats list.
// All access is defensive: in embeds where storage is unavailable or blocked the
// helpers degrade to no-ops / empty reads rather than throwing.
import type { ActiveDirectChat, GroupData } from './types';

export type StoredDirect = {
  address: string;
  name?: string;
};

export type StoredSelectedChat =
  | { kind: 'group'; group: GroupData }
  | { kind: 'direct'; direct: StoredDirect };

export type PersistedDirect = StoredDirect;

// Read watermarks: the newest-seen activity timestamp per group / direct that the
// user has already read, so unread state survives a reload instead of re-baselining
// everything to "read" on each open.
export type StoredReadWatermarks = {
  directs: ReadonlyMap<string, number>;
  groups: ReadonlyMap<number, number>;
};

const PREFIX = 'qortium-chat';

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    // Touch the API: some embeds expose localStorage but throw on use.
    const probe = `${PREFIX}:__probe__`;

    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);

    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const storage = getStorage();

  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / access errors — persistence is best-effort.
  }
}

export function lastChatStorageKey(accountAddress: string) {
  return `${PREFIX}:lastChat:${accountAddress}`;
}

export function persistedDirectsStorageKey(accountAddress: string) {
  return `${PREFIX}:directs:${accountAddress}`;
}

export function readWatermarksStorageKey(accountAddress: string) {
  return `${PREFIX}:read:${accountAddress}`;
}

function toTimestampMap<K extends string | number>(
  value: unknown,
  parseKey: (key: string) => K | null,
): Map<K, number> {
  const map = new Map<K, number>();

  if (!value || typeof value !== 'object') {
    return map;
  }

  for (const [rawKey, rawTimestamp] of Object.entries(value as Record<string, unknown>)) {
    const key = parseKey(rawKey);

    if (key !== null && typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp)) {
      map.set(key, rawTimestamp);
    }
  }

  return map;
}

export function readReadWatermarks(accountAddress: string): StoredReadWatermarks {
  const value = readJson<{ directs?: unknown; groups?: unknown }>(readWatermarksStorageKey(accountAddress));

  return {
    directs: toTimestampMap(value?.directs, (key) => (key.length > 0 ? key : null)),
    groups: toTimestampMap(value?.groups, (key) => {
      const groupId = Number(key);

      return Number.isInteger(groupId) ? groupId : null;
    }),
  };
}

export function writeReadWatermarks(accountAddress: string, watermarks: StoredReadWatermarks): void {
  writeJson(readWatermarksStorageKey(accountAddress), {
    directs: Object.fromEntries(watermarks.directs),
    groups: Object.fromEntries(watermarks.groups),
  });
}

function isStoredSelectedChat(value: unknown): value is StoredSelectedChat {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  if (candidate.kind === 'group') {
    const group = candidate.group as Record<string, unknown> | undefined;

    return (
      !!group &&
      typeof group.groupId === 'number' &&
      typeof group.groupName === 'string' &&
      group.groupName.length > 0
    );
  }

  if (candidate.kind === 'direct') {
    const direct = candidate.direct as Record<string, unknown> | undefined;

    return !!direct && typeof direct.address === 'string' && direct.address.length > 0;
  }

  return false;
}

export function readLastChat(accountAddress: string): StoredSelectedChat | null {
  const value = readJson<unknown>(lastChatStorageKey(accountAddress));

  return isStoredSelectedChat(value) ? value : null;
}

export function toStoredSelectedChat(
  chat: { kind: 'group'; group: GroupData } | { kind: 'direct'; direct: ActiveDirectChat },
): StoredSelectedChat {
  if (chat.kind === 'group') {
    return { kind: 'group', group: chat.group };
  }

  return {
    kind: 'direct',
    direct: chat.direct.name ? { address: chat.direct.address, name: chat.direct.name } : { address: chat.direct.address },
  };
}

export function writeLastChat(accountAddress: string, chat: StoredSelectedChat): void {
  writeJson(lastChatStorageKey(accountAddress), chat);
}

export function readPersistedDirects(accountAddress: string): PersistedDirect[] {
  const value = readJson<unknown>(persistedDirectsStorageKey(accountAddress));

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is PersistedDirect =>
      !!entry && typeof entry === 'object' && typeof (entry as PersistedDirect).address === 'string',
  );
}

export function writePersistedDirects(accountAddress: string, directs: PersistedDirect[]): void {
  writeJson(persistedDirectsStorageKey(accountAddress), directs);
}

// Add or refresh a direct in the list, preferring a newly-seen name. Returns the
// same array reference when nothing changed so callers can skip a write.
export function mergePersistedDirect(
  directs: PersistedDirect[],
  address: string,
  name?: string,
): PersistedDirect[] {
  const index = directs.findIndex((entry) => entry.address === address);
  const resolvedName = name ?? (index >= 0 ? directs[index].name : undefined);
  const entry: PersistedDirect = resolvedName ? { address, name: resolvedName } : { address };

  if (index >= 0) {
    if (directs[index].name === entry.name) {
      return directs;
    }

    const next = directs.slice();

    next[index] = entry;

    return next;
  }

  return [...directs, entry];
}
