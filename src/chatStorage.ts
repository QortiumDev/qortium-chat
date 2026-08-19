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

function writeJson(key: string, value: unknown): boolean {
  const storage = getStorage();

  if (!storage) {
    return false;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Ignore quota / access errors — persistence is best-effort.
    return false;
  }
}

export function lastChatStorageKey(accountAddress: string) {
  return `${PREFIX}:v2:last:qortium:${accountAddress}`;
}

export function qortalLastChatStorageKey(accountAddress: string) {
  return `${PREFIX}:v2:last:qortal:${accountAddress}`;
}

export function persistedDirectsStorageKey(accountAddress: string) {
  return `${PREFIX}:directs:${accountAddress}`;
}

export function readWatermarksStorageKey(accountAddress: string) {
  return `${PREFIX}:v2:read:qortium:${accountAddress}`;
}

export function qortalReadWatermarksStorageKey(accountAddress: string) {
  return `${PREFIX}:v2:read:qortal:${accountAddress}`;
}

export function qortalLegacyOwnerStorageKey(qortiumAccountAddress: string) {
  return `${PREFIX}:v2:legacy-qortal-owner:${qortiumAccountAddress}`;
}

export function qortalUiMigrationStorageKey(qortalAccountAddress: string) {
  return `${PREFIX}:v2:legacy-qortal-ui:${qortalAccountAddress}`;
}

export function lastChatNetworkStorageKey() {
  return `${PREFIX}:v2:last-network`;
}

function legacyLastChatStorageKey(accountAddress: string) {
  return `${PREFIX}:lastChat:${accountAddress}`;
}

function legacyReadWatermarksStorageKey(accountAddress: string) {
  return `${PREFIX}:read:${accountAddress}`;
}

function legacyScrollBookmarksStorageKey(accountAddress: string) {
  return `${PREFIX}:scroll:${accountAddress}`;
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
  let value = readJson<{ directs?: unknown; groups?: unknown }>(readWatermarksStorageKey(accountAddress));

  if (!value) {
    const legacy = readJson<{ directs?: unknown; groups?: unknown; qortalGroups?: unknown }>(
      legacyReadWatermarksStorageKey(accountAddress),
    );

    if (legacy) {
      value = { directs: legacy.directs, groups: legacy.groups };
      writeJson(readWatermarksStorageKey(accountAddress), value);
    }
  }

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

export function readQortalReadWatermarks(
  qortalAccountAddress: string,
  legacyQortiumAccountAddress?: string | null,
): Map<number, number> {
  const value = readJson<{ groups?: unknown }>(qortalReadWatermarksStorageKey(qortalAccountAddress));

  if (value) {
    return toGroupTimestampMap(value.groups);
  }

  if (!legacyQortiumAccountAddress || !claimLegacyQortalStorage(qortalAccountAddress, legacyQortiumAccountAddress)) {
    return new Map();
  }

  const legacy = readJson<{ qortalGroups?: unknown }>(
    legacyReadWatermarksStorageKey(legacyQortiumAccountAddress),
  );
  const groups = toGroupTimestampMap(legacy?.qortalGroups);

  writeQortalReadWatermarks(qortalAccountAddress, groups);
  return groups;
}

export function writeQortalReadWatermarks(
  qortalAccountAddress: string,
  groups: ReadonlyMap<number, number>,
): void {
  writeJson(qortalReadWatermarksStorageKey(qortalAccountAddress), {
    groups: Object.fromEntries(groups),
  });
}

// Qortal direct-chat read watermarks. A separate key (not folded into the
// group watermarks above) because Qortal DM never existed before this was
// added — there is no legacy single-key record to split apart, so this
// skips the legacy-migration coordination readQortalReadWatermarks/
// initializeQortalUiStorage do for groups.
export function qortalDirectReadWatermarksStorageKey(qortalAccountAddress: string) {
  return `${PREFIX}:v2:read:qortal-direct:${qortalAccountAddress}`;
}

export function readQortalDirectReadWatermarks(qortalAccountAddress: string): Map<string, number> {
  const value = readJson<Record<string, unknown>>(qortalDirectReadWatermarksStorageKey(qortalAccountAddress));

  return toTimestampMap(value, (key) => (key.length > 0 ? key : null));
}

export function writeQortalDirectReadWatermarks(
  qortalAccountAddress: string,
  watermarks: ReadonlyMap<string, number>,
): void {
  writeJson(qortalDirectReadWatermarksStorageKey(qortalAccountAddress), Object.fromEntries(watermarks));
}

function toGroupTimestampMap(value: unknown) {
  return toTimestampMap(value, (key) => {
    const groupId = Number(key);

    return Number.isInteger(groupId) ? groupId : null;
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

function claimLegacyQortalStorage(qortalAccountAddress: string, qortiumAccountAddress: string) {
  const ownerKey = qortalLegacyOwnerStorageKey(qortiumAccountAddress);
  const owner = readJson<{ qortalAccountAddress?: unknown; version?: unknown }>(ownerKey);

  if (owner) {
    return owner.version === 1 && owner.qortalAccountAddress === qortalAccountAddress;
  }

  const legacyLastChat = readJson<unknown>(legacyLastChatStorageKey(qortiumAccountAddress));
  const legacyWatermarks = readJson<{ qortalGroups?: unknown }>(legacyReadWatermarksStorageKey(qortiumAccountAddress));
  const legacyScroll = readJson<Record<string, unknown>>(legacyScrollBookmarksStorageKey(qortiumAccountAddress));
  const hasLegacySelection = isStoredSelectedChat(legacyLastChat) && legacyLastChat.network === 'qortal';
  const hasLegacyWatermarks =
    !!legacyWatermarks?.qortalGroups &&
    typeof legacyWatermarks.qortalGroups === 'object' &&
    Object.keys(legacyWatermarks.qortalGroups as Record<string, unknown>).length > 0;
  const hasLegacyScroll =
    !!legacyScroll && Object.keys(legacyScroll).some((chatKey) => chatKey.startsWith('qortal:'));

  if (!hasLegacySelection && !hasLegacyWatermarks && !hasLegacyScroll) {
    return false;
  }

  // Claim before copying: if quota is exhausted between writes, losing a
  // best-effort migration is safer than exposing one legacy Qortal identity's
  // state to a different Qortal identity later.
  if (!writeJson(ownerKey, { qortalAccountAddress, version: 1 })) {
    return false;
  }

  const confirmedOwner = readJson<{ qortalAccountAddress?: unknown; version?: unknown }>(ownerKey);

  return confirmedOwner?.version === 1 && confirmedOwner.qortalAccountAddress === qortalAccountAddress;
}

export function readLastChat(accountAddress: string): StoredSelectedChat | null {
  let value = readJson<unknown>(lastChatStorageKey(accountAddress));

  if (!value) {
    const legacy = readJson<unknown>(legacyLastChatStorageKey(accountAddress));

    if (isStoredSelectedChat(legacy) && (legacy.network === undefined || legacy.network === 'qortium')) {
      value = { ...legacy, network: 'qortium' };
      writeJson(lastChatStorageKey(accountAddress), value);
    }
  }

  return isStoredSelectedChat(value) && (value.network === undefined || value.network === 'qortium')
    ? { ...value, network: 'qortium' }
    : null;
}

export function readQortalLastChat(
  qortalAccountAddress: string,
  legacyQortiumAccountAddress?: string | null,
): StoredSelectedChat | null {
  const value = readJson<unknown>(qortalLastChatStorageKey(qortalAccountAddress));

  if (isStoredSelectedChat(value) && value.network === 'qortal') {
    return value;
  }

  if (!legacyQortiumAccountAddress || !claimLegacyQortalStorage(qortalAccountAddress, legacyQortiumAccountAddress)) {
    return null;
  }

  const legacy = readJson<unknown>(legacyLastChatStorageKey(legacyQortiumAccountAddress));

  if (!isStoredSelectedChat(legacy) || legacy.network !== 'qortal') {
    return null;
  }

  writeQortalLastChat(qortalAccountAddress, legacy);
  return legacy;
}

export function readLastChatNetwork(legacyQortiumAccountAddress?: string | null): ChatNetwork | null {
  const value = readJson<unknown>(lastChatNetworkStorageKey());

  if (value === 'qortal' || value === 'qortium') {
    return value;
  }

  if (!legacyQortiumAccountAddress) {
    return null;
  }

  const legacy = readJson<unknown>(legacyLastChatStorageKey(legacyQortiumAccountAddress));

  if (!isStoredSelectedChat(legacy)) {
    return null;
  }

  const network = legacy.network ?? 'qortium';

  writeLastChatNetwork(network);
  return network;
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
  if (chat.network === 'qortium') {
    writeJson(lastChatStorageKey(accountAddress), chat);
  }
}

export function writeQortalLastChat(accountAddress: string, chat: StoredSelectedChat): void {
  if (chat.network === 'qortal') {
    writeJson(qortalLastChatStorageKey(accountAddress), chat);
  }
}

export function writeLastChatNetwork(network: ChatNetwork): void {
  writeJson(lastChatNetworkStorageKey(), network);
}

function isPersistedDirect(entry: unknown): entry is PersistedDirect {
  return !!entry && typeof entry === 'object' && typeof (entry as PersistedDirect).address === 'string';
}

export function readPersistedDirects(accountAddress: string): PersistedDirect[] {
  const value = readJson<unknown>(persistedDirectsStorageKey(accountAddress));

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isPersistedDirect);
}

export function writePersistedDirects(accountAddress: string, directs: PersistedDirect[]): void {
  writeJson(persistedDirectsStorageKey(accountAddress), directs);
}

// Network-scoped persisted-directs keys, replacing the single pre-network-split
// `directs:` key above. Qortium's existing list predates Qortal DM and is
// read once as the Qortium list (one-way migration on first read: copied into
// the v2 qortium key below; the pre-v2 key is left in place, still readable,
// never written again after that). Qortal has no legacy data to migrate — it
// never had a direct-chat feature before this key existed.
export function qortiumPersistedDirectsStorageKey(accountAddress: string) {
  return `${PREFIX}:v2:directs:qortium:${accountAddress}`;
}

export function qortalPersistedDirectsStorageKey(accountAddress: string) {
  return `${PREFIX}:v2:directs:qortal:${accountAddress}`;
}

function persistedDirectsStorageKeyForNetwork(network: ChatNetwork, accountAddress: string) {
  return network === 'qortal'
    ? qortalPersistedDirectsStorageKey(accountAddress)
    : qortiumPersistedDirectsStorageKey(accountAddress);
}

export function readPersistedDirectsForNetwork(network: ChatNetwork, accountAddress: string): PersistedDirect[] {
  const value = readJson<unknown>(persistedDirectsStorageKeyForNetwork(network, accountAddress));

  if (Array.isArray(value)) {
    return value.filter(isPersistedDirect);
  }

  if (network !== 'qortium') {
    return [];
  }

  const legacy = readPersistedDirects(accountAddress);

  if (legacy.length > 0) {
    writeJson(qortiumPersistedDirectsStorageKey(accountAddress), legacy);
  }

  return legacy;
}

export function writePersistedDirectsForNetwork(
  network: ChatNetwork,
  accountAddress: string,
  directs: PersistedDirect[],
): void {
  writeJson(persistedDirectsStorageKeyForNetwork(network, accountAddress), directs);
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
  return `${PREFIX}:v2:scroll:qortium:${accountAddress}`;
}

export function qortalScrollBookmarksStorageKey(accountAddress: string) {
  return `${PREFIX}:v2:scroll:qortal:${accountAddress}`;
}

function parseScrollBookmarks(
  value: Record<string, unknown> | null,
  includeChatKey: (chatKey: string) => boolean,
) {
  const map = new Map<string, StoredScrollBookmark>();

  if (!value || typeof value !== 'object') {
    return map;
  }

  for (const [chatKey, raw] of Object.entries(value)) {
    if (!includeChatKey(chatKey) || !raw || typeof raw !== 'object') {
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

export function readScrollBookmarks(accountAddress: string): Map<string, StoredScrollBookmark> {
  const value = readJson<Record<string, unknown>>(scrollBookmarksStorageKey(accountAddress));

  if (value) {
    return parseScrollBookmarks(value, (chatKey) => !chatKey.startsWith('qortal:'));
  }

  const legacy = readJson<Record<string, unknown>>(legacyScrollBookmarksStorageKey(accountAddress));
  const bookmarks = parseScrollBookmarks(legacy, (chatKey) => !chatKey.startsWith('qortal:'));

  if (legacy) {
    writeScrollBookmarks(accountAddress, bookmarks);
  }

  return bookmarks;
}

export function readQortalScrollBookmarks(
  qortalAccountAddress: string,
  legacyQortiumAccountAddress?: string | null,
): Map<string, StoredScrollBookmark> {
  const value = readJson<Record<string, unknown>>(qortalScrollBookmarksStorageKey(qortalAccountAddress));

  if (value) {
    return parseScrollBookmarks(value, (chatKey) => chatKey.startsWith('qortal:'));
  }

  if (!legacyQortiumAccountAddress || !claimLegacyQortalStorage(qortalAccountAddress, legacyQortiumAccountAddress)) {
    return new Map();
  }

  const legacy = readJson<Record<string, unknown>>(legacyScrollBookmarksStorageKey(legacyQortiumAccountAddress));
  const bookmarks = parseScrollBookmarks(legacy, (chatKey) => chatKey.startsWith('qortal:'));

  writeQortalScrollBookmarks(qortalAccountAddress, bookmarks);
  return bookmarks;
}

export function writeScrollBookmarks(accountAddress: string, bookmarks: ReadonlyMap<string, StoredScrollBookmark>): void {
  writeJson(
    scrollBookmarksStorageKey(accountAddress),
    Object.fromEntries([...bookmarks].filter(([chatKey]) => !chatKey.startsWith('qortal:'))),
  );
}

export function writeQortalScrollBookmarks(
  accountAddress: string,
  bookmarks: ReadonlyMap<string, StoredScrollBookmark>,
): void {
  writeJson(
    qortalScrollBookmarksStorageKey(accountAddress),
    Object.fromEntries([...bookmarks].filter(([chatKey]) => chatKey.startsWith('qortal:'))),
  );
}

type QortalUiMigrationStatus = {
  legacyQortiumAccountAddress?: string;
  state: 'complete' | 'pending';
  version: 1;
};

export type QortalUiStorageInitialization = {
  legacyMigrationPending: boolean;
  scrollBookmarks: Map<string, StoredScrollBookmark>;
  watermarks: Map<number, number>;
};

export type QortalUiStorageInitializationOptions = {
  currentScrollBookmarks?: ReadonlyMap<string, StoredScrollBookmark>;
  currentWatermarks?: ReadonlyMap<number, number>;
  legacyLookupComplete: boolean;
  legacyQortiumAccountAddress?: string | null;
};

function readQortalUiMigrationStatus(qortalAccountAddress: string): QortalUiMigrationStatus | null {
  const value = readJson<Partial<QortalUiMigrationStatus>>(qortalUiMigrationStorageKey(qortalAccountAddress));

  return value?.version === 1 && (value.state === 'pending' || value.state === 'complete')
    ? {
        ...(typeof value.legacyQortiumAccountAddress === 'string'
          ? { legacyQortiumAccountAddress: value.legacyQortiumAccountAddress }
          : {}),
        state: value.state,
        version: 1,
      }
    : null;
}

function mergeQortalWatermarks(
  ...sources: Array<ReadonlyMap<number, number> | undefined>
): Map<number, number> {
  const merged = new Map<number, number>();

  for (const source of sources) {
    for (const [groupId, timestamp] of source ?? []) {
      if ((merged.get(groupId) ?? -1) < timestamp) {
        merged.set(groupId, timestamp);
      }
    }
  }

  return merged;
}

function mergeQortalScrollBookmarks(
  ...sources: Array<ReadonlyMap<string, StoredScrollBookmark> | undefined>
): Map<string, StoredScrollBookmark> {
  const merged = new Map<string, StoredScrollBookmark>();

  for (const source of sources) {
    for (const [chatKey, bookmark] of source ?? []) {
      if (chatKey.startsWith('qortal:')) {
        merged.set(chatKey, bookmark);
      }
    }
  }

  return merged;
}

/** Coordinates the one-time legacy split while Qortal and Qortium accounts are
 * fetched in parallel. A pending marker is written before the app may persist
 * new Qortal UI state. Once a Qortium identity becomes available, legacy
 * values are merged beneath any newer in-session values and the marker becomes complete.
 * Existing unmarked v2 records are authoritative and are never migrated over. */
export function initializeQortalUiStorage(
  qortalAccountAddress: string,
  options: QortalUiStorageInitializationOptions,
): QortalUiStorageInitialization {
  const watermarkValue = readJson<{ groups?: unknown }>(qortalReadWatermarksStorageKey(qortalAccountAddress));
  const scrollValue = readJson<Record<string, unknown>>(qortalScrollBookmarksStorageKey(qortalAccountAddress));
  const storedWatermarks = toGroupTimestampMap(watermarkValue?.groups);
  const storedScrollBookmarks = parseScrollBookmarks(
    scrollValue,
    (chatKey) => chatKey.startsWith('qortal:'),
  );
  const status = readQortalUiMigrationStatus(qortalAccountAddress);

  if (status?.state === 'complete') {
    return {
      legacyMigrationPending: false,
      scrollBookmarks: storedScrollBookmarks,
      watermarks: storedWatermarks,
    };
  }

  // Records created before this coordinator existed are real user state. Do
  // not infer that an empty object was produced by the race and overwrite it.
  if (!status && (watermarkValue !== null || scrollValue !== null)) {
    writeJson(qortalUiMigrationStorageKey(qortalAccountAddress), { state: 'complete', version: 1 });
    return {
      legacyMigrationPending: false,
      scrollBookmarks: storedScrollBookmarks,
      watermarks: storedWatermarks,
    };
  }

  if (!options.legacyLookupComplete || !options.legacyQortiumAccountAddress) {
    if (!status) {
      writeJson(qortalUiMigrationStorageKey(qortalAccountAddress), { state: 'pending', version: 1 });
    }
    return {
      legacyMigrationPending: true,
      scrollBookmarks: storedScrollBookmarks,
      watermarks: storedWatermarks,
    };
  }

  let legacyWatermarks = new Map<number, number>();
  let legacyScrollBookmarks = new Map<string, StoredScrollBookmark>();
  const legacyQortiumAccountAddress =
    status?.legacyQortiumAccountAddress ?? options.legacyQortiumAccountAddress;

  // Bind the pending migration to the first usable Qortium identity before
  // reading any legacy state. If persistence fails here, do not risk merging
  // from a different Qortium identity on a later retry.
  if (!status?.legacyQortiumAccountAddress) {
    const bound = writeJson(qortalUiMigrationStorageKey(qortalAccountAddress), {
      legacyQortiumAccountAddress,
      state: 'pending',
      version: 1,
    });
    const confirmed = readQortalUiMigrationStatus(qortalAccountAddress);

    if (!bound || confirmed?.legacyQortiumAccountAddress !== legacyQortiumAccountAddress) {
      return {
        legacyMigrationPending: true,
        scrollBookmarks: storedScrollBookmarks,
        watermarks: storedWatermarks,
      };
    }
  }

  if (claimLegacyQortalStorage(qortalAccountAddress, legacyQortiumAccountAddress)) {
    const legacyRead = readJson<{ qortalGroups?: unknown }>(
      legacyReadWatermarksStorageKey(legacyQortiumAccountAddress),
    );
    const legacyScroll = readJson<Record<string, unknown>>(
      legacyScrollBookmarksStorageKey(legacyQortiumAccountAddress),
    );

    legacyWatermarks = toGroupTimestampMap(legacyRead?.qortalGroups);
    legacyScrollBookmarks = parseScrollBookmarks(
      legacyScroll,
      (chatKey) => chatKey.startsWith('qortal:'),
    );
  }

  const watermarks = mergeQortalWatermarks(
    legacyWatermarks,
    storedWatermarks,
    options.currentWatermarks,
  );
  const scrollBookmarks = mergeQortalScrollBookmarks(
    legacyScrollBookmarks,
    storedScrollBookmarks,
    options.currentScrollBookmarks,
  );
  const wroteWatermarks = writeJson(qortalReadWatermarksStorageKey(qortalAccountAddress), {
    groups: Object.fromEntries(watermarks),
  });
  const wroteScroll = writeJson(
    qortalScrollBookmarksStorageKey(qortalAccountAddress),
    Object.fromEntries(scrollBookmarks),
  );

  if (wroteWatermarks && wroteScroll) {
    writeJson(qortalUiMigrationStorageKey(qortalAccountAddress), {
      legacyQortiumAccountAddress,
      state: 'complete',
      version: 1,
    });
  }

  return {
    legacyMigrationPending: !(wroteWatermarks && wroteScroll),
    scrollBookmarks,
    watermarks,
  };
}
