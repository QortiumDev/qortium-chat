import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeQortalUiStorage,
  groupOnboardingDismissalStorageKey,
  lastChatStorageKey,
  lastChatNetworkStorageKey,
  mergePersistedDirect,
  persistedDirectsStorageKey,
  qortalPersistedDirectsStorageKey,
  qortiumPersistedDirectsStorageKey,
  readGroupOnboardingDismissed,
  readLastChat,
  readLastChatNetwork,
  readPersistedDirects,
  readPersistedDirectsForNetwork,
  readQortalDirectReadWatermarks,
  readQortalLastChat,
  readQortalReadWatermarks,
  readQortalScrollBookmarks,
  readReadWatermarks,
  readScrollBookmarks,
  readWatermarksStorageKey,
  qortalDirectReadWatermarksStorageKey,
  qortalLastChatStorageKey,
  qortalLegacyOwnerStorageKey,
  qortalReadWatermarksStorageKey,
  qortalScrollBookmarksStorageKey,
  qortalUiMigrationStorageKey,
  scrollBookmarksStorageKey,
  setChatStorageMode,
  toStoredSelectedChat,
  writeLastChat,
  writeGroupOnboardingDismissed,
  writeLastChatNetwork,
  writePersistedDirects,
  writePersistedDirectsForNetwork,
  writeQortalDirectReadWatermarks,
  writeQortalLastChat,
  writeQortalReadWatermarks,
  writeQortalScrollBookmarks,
  writeReadWatermarks,
  writeScrollBookmarks,
  type PersistedDirect,
} from './chatStorage';
import type { GroupData } from './types';
import { getLegacyQortiumMigrationHint } from './qortalUiMigration';

class MemoryStorage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

// Mimics a browser that exposes localStorage but throws on use (private mode,
// quota exhaustion, sandboxed QDN webview).
class ThrowingStorage {
  get length(): number {
    throw new Error('blocked');
  }

  clear() {
    throw new Error('blocked');
  }

  getItem(): string | null {
    throw new Error('blocked');
  }

  key(): string | null {
    throw new Error('blocked');
  }

  removeItem() {
    throw new Error('blocked');
  }

  setItem() {
    throw new DOMException('QuotaExceededError');
  }
}

const ADDRESS = 'QtestAccountAddress';
const group: GroupData = { groupId: 42, groupName: 'Builders', owner: 'Qowner', isOpen: true } as GroupData;

function installStorage() {
  (globalThis as { window?: unknown }).window = { localStorage: new MemoryStorage() };
}

function removeStorage() {
  delete (globalThis as { window?: unknown }).window;
}

describe('mergePersistedDirect', () => {
  it('appends a new direct', () => {
    const next = mergePersistedDirect([], 'Qalice', 'alice');

    expect(next).toEqual([{ address: 'Qalice', name: 'alice' }]);
  });

  it('returns the same reference when nothing changes', () => {
    const list: PersistedDirect[] = [{ address: 'Qalice', name: 'alice' }];

    expect(mergePersistedDirect(list, 'Qalice', 'alice')).toBe(list);
  });

  it('refreshes a newly-seen name and keeps an existing one when none is provided', () => {
    const list: PersistedDirect[] = [{ address: 'Qalice', name: 'alice' }];

    expect(mergePersistedDirect(list, 'Qalice', 'alice2')).toEqual([{ address: 'Qalice', name: 'alice2' }]);
    expect(mergePersistedDirect(list, 'Qalice')).toBe(list);
  });

  it('stores an address with no name', () => {
    expect(mergePersistedDirect([], 'Qbob')).toEqual([{ address: 'Qbob' }]);
  });
});

describe('toStoredSelectedChat', () => {
  it('stores a group as-is', () => {
    expect(toStoredSelectedChat({ kind: 'group', group })).toEqual({ kind: 'group', group, network: 'qortium' });
    expect(toStoredSelectedChat({ kind: 'group', group, network: 'qortal' })).toEqual({
      kind: 'group',
      group,
      network: 'qortal',
    });
  });

  it('stores a direct address and name, dropping the name when absent', () => {
    expect(toStoredSelectedChat({ kind: 'direct', direct: { address: 'Qalice', name: 'alice' } })).toEqual({
      kind: 'direct',
      direct: { address: 'Qalice', name: 'alice' },
      network: 'qortium',
    });
    expect(toStoredSelectedChat({ kind: 'direct', direct: { address: 'Qbob' } })).toEqual({
      kind: 'direct',
      direct: { address: 'Qbob' },
      network: 'qortium',
    });
  });
});

describe('storage round-trips', () => {
  beforeEach(() => {
    setChatStorageMode('persistent');
    installStorage();
  });
  afterEach(removeStorage);

  it('persists Qortium and Qortal last-chat records under independent chain identities', () => {
    writeLastChat(ADDRESS, { kind: 'direct', direct: { address: 'Qalice', name: 'alice' }, network: 'qortium' });
    writeQortalLastChat('Qortal-one', { kind: 'group', group, network: 'qortal' });
    writeLastChatNetwork('qortal');

    expect(readLastChat(ADDRESS)).toEqual({
      kind: 'direct',
      direct: { address: 'Qalice', name: 'alice' },
      network: 'qortium',
    });
    expect(readQortalLastChat('Qortal-one')).toEqual({ kind: 'group', group, network: 'qortal' });
    expect(readQortalLastChat('Qortal-two')).toBeNull();
    expect(readLastChatNetwork()).toBe('qortal');
    expect(window.localStorage.getItem(qortalLastChatStorageKey('Qortal-one'))).not.toBeNull();
    expect(window.localStorage.getItem(lastChatNetworkStorageKey())).toBe('"qortal"');
  });

  it('persists the group-onboarding dismissal per chain account', () => {
    expect(readGroupOnboardingDismissed('qortium', ADDRESS)).toBe(false);
    expect(readGroupOnboardingDismissed('qortal', ADDRESS)).toBe(false);

    writeGroupOnboardingDismissed('qortal', ADDRESS);

    expect(readGroupOnboardingDismissed('qortal', ADDRESS)).toBe(true);
    expect(readGroupOnboardingDismissed('qortium', ADDRESS)).toBe(false);
    expect(readGroupOnboardingDismissed('qortal', 'Qother')).toBe(false);
    expect(window.localStorage.getItem(groupOnboardingDismissalStorageKey('qortal', ADDRESS))).toBe('true');
  });

  it('rejects malformed last-chat values', () => {
    window.localStorage.setItem(lastChatStorageKey(ADDRESS), JSON.stringify({ kind: 'group', group: {} }));
    expect(readLastChat(ADDRESS)).toBeNull();

    // A group id with no name is treated as corrupt (real groups always have one).
    window.localStorage.setItem(lastChatStorageKey(ADDRESS), JSON.stringify({ kind: 'group', group: { groupId: 7 } }));
    expect(readLastChat(ADDRESS)).toBeNull();

    window.localStorage.setItem(lastChatStorageKey(ADDRESS), 'not json');
    expect(readLastChat(ADDRESS)).toBeNull();
  });

  it('migrates a legacy Qortium selection and rejects unknown networks', () => {
    window.localStorage.setItem(`qortium-chat:lastChat:${ADDRESS}`, JSON.stringify({ kind: 'group', group }));
    expect(readLastChat(ADDRESS)).toEqual({ kind: 'group', group, network: 'qortium' });
    expect(window.localStorage.getItem(lastChatStorageKey(ADDRESS))).not.toBeNull();

    window.localStorage.setItem(
      lastChatStorageKey(ADDRESS),
      JSON.stringify({ kind: 'group', group, network: 'other' }),
    );
    expect(readLastChat(ADDRESS)).toBeNull();
  });

  it('persists directs and filters malformed entries', () => {
    writePersistedDirects(ADDRESS, [{ address: 'Qalice', name: 'alice' }, { address: 'Qbob' }]);
    expect(readPersistedDirects(ADDRESS)).toEqual([{ address: 'Qalice', name: 'alice' }, { address: 'Qbob' }]);

    window.localStorage.setItem(
      persistedDirectsStorageKey(ADDRESS),
      JSON.stringify([{ address: 'Qok' }, { name: 'no-address' }, null, 7]),
    );
    expect(readPersistedDirects(ADDRESS)).toEqual([{ address: 'Qok' }]);
  });

  it('scopes persisted directs by network, migrating the pre-network Qortium list once', () => {
    // Legacy pre-network-split record — predates Qortal DM.
    writePersistedDirects(ADDRESS, [{ address: 'Qalice', name: 'alice' }]);

    // First read migrates it into the v2 qortium key and returns it.
    expect(readPersistedDirectsForNetwork('qortium', ADDRESS)).toEqual([{ address: 'Qalice', name: 'alice' }]);
    expect(window.localStorage.getItem(qortiumPersistedDirectsStorageKey(ADDRESS))).not.toBeNull();
    // The pre-v2 key is untouched and still readable.
    expect(readPersistedDirects(ADDRESS)).toEqual([{ address: 'Qalice', name: 'alice' }]);

    // Qortal has no legacy data to migrate — a first read is just empty.
    expect(readPersistedDirectsForNetwork('qortal', ADDRESS)).toEqual([]);

    writePersistedDirectsForNetwork('qortal', ADDRESS, [{ address: 'Qbob' }]);
    expect(readPersistedDirectsForNetwork('qortal', ADDRESS)).toEqual([{ address: 'Qbob' }]);
    // Writing the qortal list never touches the qortium one.
    expect(readPersistedDirectsForNetwork('qortium', ADDRESS)).toEqual([{ address: 'Qalice', name: 'alice' }]);
    expect(window.localStorage.getItem(qortalPersistedDirectsStorageKey(ADDRESS))).not.toBeNull();
  });

  it('filters malformed entries from a network-scoped persisted-directs record', () => {
    window.localStorage.setItem(
      qortalPersistedDirectsStorageKey(ADDRESS),
      JSON.stringify([{ address: 'Qok' }, { name: 'no-address' }, null, 7]),
    );

    expect(readPersistedDirectsForNetwork('qortal', ADDRESS)).toEqual([{ address: 'Qok' }]);
  });

  it('persists and reads back Qortal direct read watermarks independently of group watermarks', () => {
    writeQortalDirectReadWatermarks('Qortal-one', new Map([['Qalice', 1000]]));
    writeQortalReadWatermarks('Qortal-one', new Map([[42, 3000]]));

    expect([...readQortalDirectReadWatermarks('Qortal-one')]).toEqual([['Qalice', 1000]]);
    expect([...readQortalReadWatermarks('Qortal-one')]).toEqual([[42, 3000]]);
    expect([...readQortalDirectReadWatermarks('Qortal-two')]).toEqual([]);
    expect(window.localStorage.getItem(qortalDirectReadWatermarksStorageKey('Qortal-one'))).not.toBeNull();
  });

  it('persists and reads back read watermarks', () => {
    writeReadWatermarks(ADDRESS, {
      directs: new Map([['Qalice', 1000]]),
      groups: new Map([[42, 2000]]),
    });
    writeQortalReadWatermarks('Qortal-one', new Map([[42, 3000]]));

    const restored = readReadWatermarks(ADDRESS);

    expect([...restored.groups]).toEqual([[42, 2000]]);
    expect([...restored.directs]).toEqual([['Qalice', 1000]]);
    expect([...readQortalReadWatermarks('Qortal-one')]).toEqual([[42, 3000]]);
    expect([...readQortalReadWatermarks('Qortal-two')]).toEqual([]);
    expect(window.localStorage.getItem(qortalReadWatermarksStorageKey('Qortal-one'))).not.toBeNull();
  });

  it('drops malformed watermark entries and defaults to empty maps', () => {
    expect(readReadWatermarks(ADDRESS)).toEqual({ groups: new Map(), directs: new Map() });

    window.localStorage.setItem(
      readWatermarksStorageKey(ADDRESS),
      JSON.stringify({ groups: { 42: 2000, bad: 5, 7: 'nope' }, directs: { Qalice: 1000, '': 9 } }),
    );

    const restored = readReadWatermarks(ADDRESS);

    expect([...restored.groups]).toEqual([[42, 2000]]);
    expect([...restored.directs]).toEqual([['Qalice', 1000]]);
  });

  it('migrates legacy mixed-chain state once and binds its Qortal portion to one Qortal identity', () => {
    const qortalChat = { kind: 'group' as const, group, network: 'qortal' as const };

    window.localStorage.setItem(`qortium-chat:lastChat:${ADDRESS}`, JSON.stringify(qortalChat));
    window.localStorage.setItem(
      `qortium-chat:read:${ADDRESS}`,
      JSON.stringify({ directs: { Qalice: 1000 }, groups: { 7: 2000 }, qortalGroups: { 42: 3000 } }),
    );
    window.localStorage.setItem(
      `qortium-chat:scroll:${ADDRESS}`,
      JSON.stringify({
        'group:7': { atBottom: true },
        'qortal:group:42': { anchorKey: 'message-1', anchorOffset: 12, anchorTimestamp: 3000, atBottom: false },
      }),
    );

    expect(readLastChatNetwork(ADDRESS)).toBe('qortal');
    expect(readQortalLastChat('Qortal-one', ADDRESS)).toEqual(qortalChat);
    expect([...readQortalReadWatermarks('Qortal-one', ADDRESS)]).toEqual([[42, 3000]]);
    expect([...readQortalScrollBookmarks('Qortal-one', ADDRESS)]).toEqual([
      ['qortal:group:42', { anchorKey: 'message-1', anchorOffset: 12, anchorTimestamp: 3000, atBottom: false }],
    ]);

    // The legacy Qortium record is claimed once. A later Qortal identity gets
    // a clean state rather than another copy of the first identity's history.
    expect(readQortalLastChat('Qortal-two', ADDRESS)).toBeNull();
    expect(readQortalReadWatermarks('Qortal-two', ADDRESS)).toEqual(new Map());
    expect(readQortalScrollBookmarks('Qortal-two', ADDRESS)).toEqual(new Map());
    expect(JSON.parse(window.localStorage.getItem(qortalLegacyOwnerStorageKey(ADDRESS)) ?? '{}')).toEqual({
      qortalAccountAddress: 'Qortal-one',
      version: 1,
    });

    // Qortium migrates only its own portions from the same legacy records.
    expect(readReadWatermarks(ADDRESS)).toEqual({
      directs: new Map([['Qalice', 1000]]),
      groups: new Map([[7, 2000]]),
    });
    expect(window.localStorage.getItem(readWatermarksStorageKey(ADDRESS))).not.toContain('qortalGroups');
    expect(readScrollBookmarks(ADDRESS)).toEqual(new Map([['group:7', { atBottom: true }]]));
  });

  it('keeps a fixed Qortal identity stable across Qortium identity changes', () => {
    writeQortalLastChat('Qortal-one', { kind: 'group', group, network: 'qortal' });
    writeQortalReadWatermarks('Qortal-one', new Map([[42, 3000]]));
    writeQortalScrollBookmarks('Qortal-one', new Map([['qortal:group:42', { atBottom: true }]]));

    expect(readQortalLastChat('Qortal-one', 'Qortium-one')).toEqual({ kind: 'group', group, network: 'qortal' });
    expect(readQortalLastChat('Qortal-one', 'Qortium-two')).toEqual({ kind: 'group', group, network: 'qortal' });
    expect([...readQortalReadWatermarks('Qortal-one', 'Qortium-two')]).toEqual([[42, 3000]]);
    expect(readQortalScrollBookmarks('Qortal-one', 'Qortium-two')).toEqual(
      new Map([['qortal:group:42', { atBottom: true }]]),
    );
  });

  it('defers a Qortal-first initialization and merges legacy UI state when Qortium resolves', () => {
    window.localStorage.setItem(
      `qortium-chat:read:${ADDRESS}`,
      JSON.stringify({ qortalGroups: { 42: 3000, 43: 2500 } }),
    );
    window.localStorage.setItem(
      `qortium-chat:scroll:${ADDRESS}`,
      JSON.stringify({
        'qortal:group:42': { anchorKey: 'legacy-message', anchorOffset: 12, anchorTimestamp: 3000, atBottom: false },
        'qortal:group:43': { atBottom: true },
      }),
    );

    // Parallel startup race: Qortal resolves first, while the Qortium account
    // lookup is still pending. No empty v2 records may become authoritative.
    const qortalFirst = initializeQortalUiStorage('Qortal-one', {
      legacyLookupComplete: false,
    });

    expect(qortalFirst).toEqual({
      legacyMigrationPending: true,
      scrollBookmarks: new Map(),
      watermarks: new Map(),
    });
    expect(window.localStorage.getItem(qortalReadWatermarksStorageKey('Qortal-one'))).toBeNull();
    expect(window.localStorage.getItem(qortalScrollBookmarksStorageKey('Qortal-one'))).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(qortalUiMigrationStorageKey('Qortal-one')) ?? '{}')).toEqual({
      state: 'pending',
      version: 1,
    });

    // Even if interim empty records are written after the pending marker (for
    // example after a denied Qortium share releases independent persistence),
    // they remain repairable rather than becoming authoritative by accident.
    writeQortalReadWatermarks('Qortal-one', new Map());
    writeQortalScrollBookmarks('Qortal-one', new Map());

    // Qortium resolves second. Values accumulated by the current Qortal
    // session win on collisions, while missing legacy values are recovered.
    const completed = initializeQortalUiStorage('Qortal-one', {
      currentScrollBookmarks: new Map([
        ['qortal:group:42', { atBottom: true }],
        ['qortal:group:99', { atBottom: true }],
      ]),
      currentWatermarks: new Map([[42, 4000], [99, 4000]]),
      legacyLookupComplete: true,
      legacyQortiumAccountAddress: ADDRESS,
    });

    expect(completed.legacyMigrationPending).toBe(false);
    expect(completed.watermarks).toEqual(new Map([[42, 4000], [43, 2500], [99, 4000]]));
    expect(completed.scrollBookmarks).toEqual(new Map([
      ['qortal:group:42', { atBottom: true }],
      ['qortal:group:43', { atBottom: true }],
      ['qortal:group:99', { atBottom: true }],
    ]));
    expect(readQortalReadWatermarks('Qortal-one')).toEqual(completed.watermarks);
    expect(readQortalScrollBookmarks('Qortal-one')).toEqual(completed.scrollBookmarks);
    expect(JSON.parse(window.localStorage.getItem(qortalUiMigrationStorageKey('Qortal-one')) ?? '{}')).toEqual({
      legacyQortiumAccountAddress: ADDRESS,
      state: 'complete',
      version: 1,
    });
    expect(JSON.parse(window.localStorage.getItem(qortalLegacyOwnerStorageKey(ADDRESS)) ?? '{}')).toEqual({
      qortalAccountAddress: 'Qortal-one',
      version: 1,
    });
  });

  it('never migrates over an unmarked existing v2 Qortal record', () => {
    window.localStorage.setItem(
      `qortium-chat:read:${ADDRESS}`,
      JSON.stringify({ qortalGroups: { 42: 3000 } }),
    );
    writeQortalReadWatermarks('Qortal-one', new Map());

    const initialized = initializeQortalUiStorage('Qortal-one', {
      legacyLookupComplete: true,
      legacyQortiumAccountAddress: ADDRESS,
    });

    expect(initialized.legacyMigrationPending).toBe(false);
    expect(initialized.watermarks).toEqual(new Map());
    expect(window.localStorage.getItem(qortalLegacyOwnerStorageKey(ADDRESS))).toBeNull();
  });

  it('keeps a pending migration bound to its first Qortium identity', () => {
    window.localStorage.setItem(
      `qortium-chat:read:${ADDRESS}`,
      JSON.stringify({ qortalGroups: { 42: 3000 } }),
    );
    window.localStorage.setItem(
      'qortium-chat:read:Qortium-two',
      JSON.stringify({ qortalGroups: { 77: 7000 } }),
    );
    window.localStorage.setItem(
      qortalUiMigrationStorageKey('Qortal-one'),
      JSON.stringify({
        legacyQortiumAccountAddress: ADDRESS,
        state: 'pending',
        version: 1,
      }),
    );

    const completed = initializeQortalUiStorage('Qortal-one', {
      legacyLookupComplete: true,
      legacyQortiumAccountAddress: 'Qortium-two',
    });

    expect(completed.watermarks).toEqual(new Map([[42, 3000]]));
    expect(window.localStorage.getItem(qortalLegacyOwnerStorageKey('Qortium-two'))).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(qortalLegacyOwnerStorageKey(ADDRESS)) ?? '{}')).toEqual({
      qortalAccountAddress: 'Qortal-one',
      version: 1,
    });
  });

  it('does not bind Qortal B to stale Qortium A while the simultaneous switch is pending', () => {
    window.localStorage.setItem(
      'qortium-chat:read:Qortium-A',
      JSON.stringify({ qortalGroups: { 42: 3000 } }),
    );
    window.localStorage.setItem(
      'qortium-chat:read:Qortium-B',
      JSON.stringify({ qortalGroups: { 77: 7000 } }),
    );

    const qortalFirst = initializeQortalUiStorage(
      'Qortal-B',
      getLegacyQortiumMigrationHint('Qortium-A', true),
    );

    expect(qortalFirst.legacyMigrationPending).toBe(true);
    expect(window.localStorage.getItem(qortalLegacyOwnerStorageKey('Qortium-A'))).toBeNull();

    const qortiumSecond = initializeQortalUiStorage(
      'Qortal-B',
      getLegacyQortiumMigrationHint('Qortium-B', false),
    );

    expect(qortiumSecond.watermarks).toEqual(new Map([[77, 7000]]));
    expect(window.localStorage.getItem(qortalLegacyOwnerStorageKey('Qortium-A'))).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(qortalLegacyOwnerStorageKey('Qortium-B')) ?? '{}')).toEqual({
      qortalAccountAddress: 'Qortal-B',
      version: 1,
    });
  });

  it('filters cross-network bookmark keys on every versioned write', () => {
    const mixed = new Map([
      ['group:7', { atBottom: true } as const],
      ['qortal:group:42', { atBottom: true } as const],
    ]);

    writeScrollBookmarks(ADDRESS, mixed);
    writeQortalScrollBookmarks('Qortal-one', mixed);

    expect(readScrollBookmarks(ADDRESS)).toEqual(new Map([['group:7', { atBottom: true }]]));
    expect(readQortalScrollBookmarks('Qortal-one')).toEqual(
      new Map([['qortal:group:42', { atBottom: true }]]),
    );
    expect(window.localStorage.getItem(scrollBookmarksStorageKey(ADDRESS))).not.toContain('qortal:');
    expect(window.localStorage.getItem(qortalScrollBookmarksStorageKey('Qortal-one'))).not.toContain('"group:7"');
  });
});

describe('without storage', () => {
  beforeEach(() => {
    setChatStorageMode('persistent');
    removeStorage();
  });

  it('degrades to empty reads and silent writes', () => {
    expect(readLastChat(ADDRESS)).toBeNull();
    expect(readPersistedDirects(ADDRESS)).toEqual([]);
    expect(readReadWatermarks(ADDRESS)).toEqual({ groups: new Map(), directs: new Map() });
    expect(readQortalLastChat('Qortal-one', ADDRESS)).toBeNull();
    expect(readQortalReadWatermarks('Qortal-one', ADDRESS)).toEqual(new Map());
    expect(readQortalScrollBookmarks('Qortal-one', ADDRESS)).toEqual(new Map());
    expect(() => writeLastChat(ADDRESS, { kind: 'group', group, network: 'qortium' })).not.toThrow();
    expect(() => writePersistedDirects(ADDRESS, [{ address: 'Qalice' }])).not.toThrow();
    expect(() =>
      writeReadWatermarks(ADDRESS, { directs: new Map(), groups: new Map([[1, 2]]) }),
    ).not.toThrow();
  });
});

describe('with storage that throws on use', () => {
  beforeEach(() => {
    setChatStorageMode('persistent');
    (globalThis as { window?: unknown }).window = { localStorage: new ThrowingStorage() };
  });
  afterEach(removeStorage);

  it('degrades to empty reads and silent writes when storage access throws', () => {
    expect(readLastChat(ADDRESS)).toBeNull();
    expect(readPersistedDirects(ADDRESS)).toEqual([]);
    expect(() => writeLastChat(ADDRESS, { kind: 'group', group, network: 'qortium' })).not.toThrow();
    expect(() => writePersistedDirects(ADDRESS, [{ address: 'Qalice' }])).not.toThrow();
  });
});

describe('memory-only mode', () => {
  beforeEach(() => {
    installStorage();
    window.localStorage.setItem(lastChatStorageKey(ADDRESS), JSON.stringify({ kind: 'group', group }));
    setChatStorageMode('memory');
  });
  afterEach(() => {
    setChatStorageMode('persistent');
    removeStorage();
  });

  it('does not read or write the shared origin localStorage', () => {
    expect(readLastChat(ADDRESS)).toBeNull();

    writeLastChat(ADDRESS, { kind: 'direct', direct: { address: 'Qalice' }, network: 'qortium' });

    expect(readLastChat(ADDRESS)).toEqual({
      kind: 'direct',
      direct: { address: 'Qalice' },
      network: 'qortium',
    });
    expect(JSON.parse(window.localStorage.getItem(lastChatStorageKey(ADDRESS)) ?? '{}')).toEqual({
      kind: 'group',
      group,
    });
  });
});
