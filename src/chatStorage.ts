// Per-account chat preferences persisted in localStorage: the last-selected chat
// (restored on open, falling back to General Chat) and the set of direct chats to
// keep in the sidebar even after their messages expire off the active-chats list.
// All access is defensive: in embeds where storage is unavailable or blocked the
// helpers degrade to no-ops / empty reads rather than throwing.
import type { ActiveDirectChat, ChatNetwork, GroupData } from './types';

export type StoredDirect = {
  address: string;
  name?: string;
};

export type StoredSelectedChat =
  | { kind: 'group'; group: GroupData; network: ChatNetwork }
  | { kind: 'direct'; direct: StoredDirect; network: ChatNetwork };

export type PersistedDirect = StoredDirect;

// Read watermarks: the newest-seen activity timestamp per group / direct that the
// user has already read, so unread state survives a reload instead of re-baselining
// everything to "read" on each open.
export type StoredReadWatermarks = {
  directs: ReadonlyMap<string, number>;
  groups: ReadonlyMap<number, number>;
  qortalGroups: ReadonlyMap<number, number>;
};

const PREFIX = 'qortium-chat';
export type ChatStorageMode = 'memory' | 'persistent';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  clear() {
    this.values.clear();
  }
}

const memoryStorage = new MemoryStorage();
let storageMode: ChatStorageMode = 'persistent';

// The probe verdict is cached per storage object: getStorage runs on the
// scroll-bookmark hot path, and re-probing with a setItem/removeItem per call
// triples the synchronous storage ops. Keyed on object identity so a swapped
// storage (tests, embeds) is re-probed.
let probedStorage: Storage | null = null;
let probeResult: Storage | null = null;

export function setChatStorageMode(mode: ChatStorageMode) {
  if (mode === storageMode) {
    return;
  }

  storageMode = mode;
  probedStorage = null;
  probeResult = null;

  if (mode === 'memory') {
    memoryStorage.clear();
  }
}

function getStorage(): Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> | null {
  if (storageMode === 'memory') {
    return memoryStorage;
  }

  let storage: Storage;

  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    storage = window.localStorage;
  } catch {
    return null;
  }

  if (storage === probedStorage) {
    return probeResult;
  }

  probedStorage = storage;

  try {
    // Touch the API: some embeds expose localStorage but throw on use.
    const probe = `${PREFIX}:__probe__`;

    storage.setItem(probe, '1');
    storage.removeItem(probe);

    probeResult = storage;
  } catch {
    probeResult = null;
  }

  return probeResult;
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
  const value = readJson<{ directs?: unknown; groups?: unknown; qortalGroups?: unknown }>(
    readWatermarksStorageKey(accountAddress),
  );

  return {
    directs: toTimestampMap(value?.directs, (key) => (key.length > 0 ? key : null)),
    groups: toTimestampMap(value?.groups, (key) => {
      const groupId = Number(key);

      return Number.isInteger(groupId) ? groupId : null;
    }),
    qortalGroups: toTimestampMap(value?.qortalGroups, (key) => {
      const groupId = Number(key);

      return Number.isInteger(groupId) ? groupId : null;
    }),
  };
}

export function writeReadWatermarks(accountAddress: string, watermarks: StoredReadWatermarks): void {
  writeJson(readWatermarksStorageKey(accountAddress), {
    directs: Object.fromEntries(watermarks.directs),
    groups: Object.fromEntries(watermarks.groups),
    qortalGroups: Object.fromEntries(watermarks.qortalGroups),
  });
}

function isStoredSelectedChat(value: unknown): value is StoredSelectedChat {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const network = candidate.network;

  if (network !== undefined && network !== 'qortal' && network !== 'qortium') {
    return false;
  }

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

  return isStoredSelectedChat(value) ? { ...value, network: value.network ?? 'qortium' } : null;
}

export function toStoredSelectedChat(
  chat:
    | { kind: 'group'; group: GroupData; network?: ChatNetwork }
    | { kind: 'direct'; direct: ActiveDirectChat; network?: ChatNetwork },
): StoredSelectedChat {
  if (chat.kind === 'group') {
    return { kind: 'group', group: chat.group, network: chat.network ?? 'qortium' };
  }

  return {
    kind: 'direct',
    network: chat.network ?? 'qortium',
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

// Whether the sidebar Direct / Groups sections are collapsed. App-wide (not
// per-account) so the layout the user left is restored on the next app start.
export type StoredSidebarCollapse = { direct: boolean; groups: boolean };

function sidebarCollapseStorageKey() {
  return `${PREFIX}:sidebarCollapse`;
}

export function readSidebarCollapse(): StoredSidebarCollapse | null {
  const value = readJson<{ direct?: unknown; groups?: unknown }>(sidebarCollapseStorageKey());

  if (!value) {
    return null;
  }

  return {
    direct: typeof value.direct === 'boolean' ? value.direct : true,
    groups: typeof value.groups === 'boolean' ? value.groups : true,
  };
}

export function writeSidebarCollapse(state: StoredSidebarCollapse): void {
  writeJson(sidebarCollapseStorageKey(), state);
}

// Per-chat scroll bookmark (the message the reader left off at, or "at bottom"),
// keyed by chat key within an account, so a reading position is restored on the
// next visit and across app restarts. Shape mirrors ChatScrollPosition in types.
export type StoredScrollBookmark =
  | { atBottom: true }
  | { atBottom: false; anchorKey: string; anchorOffset: number; anchorTimestamp: number };

export function scrollBookmarksStorageKey(accountAddress: string) {
  return `${PREFIX}:scroll:${accountAddress}`;
}

export function readScrollBookmarks(accountAddress: string): Map<string, StoredScrollBookmark> {
  const value = readJson<Record<string, unknown>>(scrollBookmarksStorageKey(accountAddress));
  const map = new Map<string, StoredScrollBookmark>();

  if (!value || typeof value !== 'object') {
    return map;
  }

  for (const [chatKey, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }

    const entry = raw as Record<string, unknown>;

    if (entry.atBottom === true) {
      map.set(chatKey, { atBottom: true });
    } else if (
      typeof entry.anchorKey === 'string' &&
      typeof entry.anchorOffset === 'number' &&
      typeof entry.anchorTimestamp === 'number'
    ) {
      map.set(chatKey, {
        anchorKey: entry.anchorKey,
        anchorOffset: entry.anchorOffset,
        anchorTimestamp: entry.anchorTimestamp,
        atBottom: false,
      });
    }
  }

  return map;
}

export function writeScrollBookmarks(accountAddress: string, bookmarks: ReadonlyMap<string, StoredScrollBookmark>): void {
  writeJson(scrollBookmarksStorageKey(accountAddress), Object.fromEntries(bookmarks));
}
