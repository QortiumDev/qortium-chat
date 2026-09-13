import { describe, expect, it } from 'vitest';
import {
  PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY,
  PRIVATE_GROUP_KEY_REQUEST_MEMO_TTL_MS,
  clearPrivateGroupKeyRequestMemo,
  readPrivateGroupKeyRequestMemo,
  rememberPrivateGroupKeyRequest,
} from './privateGroupKeyRequestMemo';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('privateGroupKeyRequestMemo', () => {
  it('remembers requests across reads and drops them after the TTL', () => {
    const storage = memoryStorage();
    const now = 1_000_000;

    rememberPrivateGroupKeyRequest('qortium:req:Qa:7:e1:k1', storage, now);
    rememberPrivateGroupKeyRequest('qortium:resolve:Qa:7', storage, now + 10);

    expect(readPrivateGroupKeyRequestMemo(storage, now + 1000)).toEqual(
      new Set(['qortium:req:Qa:7:e1:k1', 'qortium:resolve:Qa:7']),
    );
    expect(readPrivateGroupKeyRequestMemo(storage, now + PRIVATE_GROUP_KEY_REQUEST_MEMO_TTL_MS)).toEqual(
      new Set(['qortium:resolve:Qa:7']),
    );
    expect(readPrivateGroupKeyRequestMemo(storage, now + PRIVATE_GROUP_KEY_REQUEST_MEMO_TTL_MS + 10)).toEqual(new Set());
  });

  it('ignores corrupt storage and tolerates a missing storage', () => {
    const storage = memoryStorage();
    storage.setItem(PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY, '[1,2]');
    expect(readPrivateGroupKeyRequestMemo(storage)).toEqual(new Set());
    storage.setItem(PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY, '{"a":"x","b":5}');
    expect(readPrivateGroupKeyRequestMemo(storage, 10)).toEqual(new Set(['b']));

    expect(readPrivateGroupKeyRequestMemo(null)).toEqual(new Set());
    expect(() => rememberPrivateGroupKeyRequest('k', null)).not.toThrow();
  });

  it('prunes expired entries when writing and clears on request', () => {
    const storage = memoryStorage();
    rememberPrivateGroupKeyRequest('old', storage, 0);
    rememberPrivateGroupKeyRequest('new', storage, PRIVATE_GROUP_KEY_REQUEST_MEMO_TTL_MS + 1);

    expect(JSON.parse(storage.getItem(PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY) ?? '{}')).toEqual({
      new: PRIVATE_GROUP_KEY_REQUEST_MEMO_TTL_MS + 1,
    });

    clearPrivateGroupKeyRequestMemo(storage);
    expect(storage.getItem(PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY)).toBeNull();
  });
});
