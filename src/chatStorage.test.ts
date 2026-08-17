import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  lastChatStorageKey,
  mergePersistedDirect,
  persistedDirectsStorageKey,
  readLastChat,
  readPersistedDirects,
  readReadWatermarks,
  readWatermarksStorageKey,
  setChatStorageMode,
  toStoredSelectedChat,
  writeLastChat,
  writePersistedDirects,
  writeReadWatermarks,
  type PersistedDirect,
} from './chatStorage';
import type { GroupData } from './types';

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

  it('persists and reads back the last chat', () => {
    writeLastChat(ADDRESS, { kind: 'group', group, network: 'qortal' });
    expect(readLastChat(ADDRESS)).toEqual({ kind: 'group', group, network: 'qortal' });

    writeLastChat(ADDRESS, { kind: 'direct', direct: { address: 'Qalice', name: 'alice' }, network: 'qortium' });
    expect(readLastChat(ADDRESS)).toEqual({
      kind: 'direct',
      direct: { address: 'Qalice', name: 'alice' },
      network: 'qortium',
    });
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

  it('migrates legacy selections to Qortium and rejects unknown networks', () => {
    window.localStorage.setItem(lastChatStorageKey(ADDRESS), JSON.stringify({ kind: 'group', group }));
    expect(readLastChat(ADDRESS)).toEqual({ kind: 'group', group, network: 'qortium' });

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

  it('persists and reads back read watermarks', () => {
    writeReadWatermarks(ADDRESS, {
      directs: new Map([['Qalice', 1000]]),
      groups: new Map([[42, 2000]]),
      qortalGroups: new Map([[42, 3000]]),
    });

    const restored = readReadWatermarks(ADDRESS);

    expect([...restored.groups]).toEqual([[42, 2000]]);
    expect([...restored.directs]).toEqual([['Qalice', 1000]]);
    expect([...restored.qortalGroups]).toEqual([[42, 3000]]);
  });

  it('drops malformed watermark entries and defaults to empty maps', () => {
    expect(readReadWatermarks(ADDRESS)).toEqual({ groups: new Map(), qortalGroups: new Map(), directs: new Map() });

    window.localStorage.setItem(
      readWatermarksStorageKey(ADDRESS),
      JSON.stringify({ groups: { 42: 2000, bad: 5, 7: 'nope' }, directs: { Qalice: 1000, '': 9 } }),
    );

    const restored = readReadWatermarks(ADDRESS);

    expect([...restored.groups]).toEqual([[42, 2000]]);
    expect([...restored.directs]).toEqual([['Qalice', 1000]]);
    expect([...restored.qortalGroups]).toEqual([]);
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
    expect(readReadWatermarks(ADDRESS)).toEqual({ groups: new Map(), qortalGroups: new Map(), directs: new Map() });
    expect(() => writeLastChat(ADDRESS, { kind: 'group', group, network: 'qortium' })).not.toThrow();
    expect(() => writePersistedDirects(ADDRESS, [{ address: 'Qalice' }])).not.toThrow();
    expect(() =>
      writeReadWatermarks(ADDRESS, { directs: new Map(), groups: new Map([[1, 2]]), qortalGroups: new Map() }),
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
