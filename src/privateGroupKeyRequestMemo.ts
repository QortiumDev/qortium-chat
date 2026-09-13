// O3 (2026-09-13 parity review): the "request the private group key" and
// "relay pending key requests" side effects were remembered only in-memory,
// so every reload of the tab (Home reloads app tabs on node changes) fired the
// same request + relay prompts again for messages that can never decrypt for
// this account (pre-join QPGC epochs, decision D-I). This memo persists which
// requests were already sent, per network/account, with a TTL so a request is
// still repeated occasionally in case an admin publishes the key later.

export const PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY = 'qortium-chat-private-key-requests-v1';
export const PRIVATE_GROUP_KEY_REQUEST_MEMO_TTL_MS = 6 * 60 * 60 * 1000;

type MemoStore = Record<string, number>;

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readStore(storage: Storage | null, now: number): MemoStore {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: MemoStore = {};
    for (const [key, sentAt] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof sentAt === 'number' && Number.isFinite(sentAt) && now - sentAt < PRIVATE_GROUP_KEY_REQUEST_MEMO_TTL_MS) {
        store[key] = sentAt;
      }
    }
    return store;
  } catch {
    return {};
  }
}

// Unexpired memo keys. Callers merge these into their in-memory set at the
// start of a recovery pass; the in-memory set stays authoritative within a
// session so storage failures only cost the persistence, not the dedupe.
export function readPrivateGroupKeyRequestMemo(storage = getStorage(), now = Date.now()): Set<string> {
  return new Set(Object.keys(readStore(storage, now)));
}

export function rememberPrivateGroupKeyRequest(key: string, storage = getStorage(), now = Date.now()) {
  if (!storage) return;
  const store = readStore(storage, now);
  store[key] = now;
  try {
    storage.setItem(PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage may be unavailable (gateway forces memory-only, quota); the
    // in-memory set still dedupes this session.
  }
}

export function clearPrivateGroupKeyRequestMemo(storage = getStorage()) {
  try {
    storage?.removeItem(PRIVATE_GROUP_KEY_REQUEST_MEMO_STORAGE_KEY);
  } catch {
    // ignore
  }
}
