import type { ChatNetwork } from './types';

// G4-i (2026-09-13): per-conversation notification mute. Home 2's
// SHOW_NOTIFICATION grant is per app, and its `source.conversation` only names
// the group/peer — Home leaves conversation-level muting to the app
// (HOME_V2_APP_NOTIFICATIONS.md). Muted keys are stored per account address so
// two accounts on one device do not share a mute list. Legacy Home 1.x direct
// notifications come from a Core-evaluated rule and cannot be muted per
// conversation from here.

export const MUTED_CONVERSATIONS_STORAGE_KEY = 'qortium-chat-muted-conversations-v1';

export type MutedConversationTarget =
  | { kind: 'direct'; network: ChatNetwork; otherAddress: string }
  | { groupId: number; kind: 'group'; network: ChatNetwork };

export function getMutedConversationKey(target: MutedConversationTarget) {
  return target.kind === 'group'
    ? `${target.network}:group:${target.groupId}`
    : `${target.network}:direct:${target.otherAddress}`;
}

type MutedStore = Record<string, string[]>;

function readStore(storage: Storage | null): MutedStore {
  if (!storage) return {};
  try {
    const raw = storage.getItem(MUTED_CONVERSATIONS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: MutedStore = {};
    for (const [address, keys] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(keys)) {
        store[address] = keys.filter((key): key is string => typeof key === 'string');
      }
    }
    return store;
  } catch {
    return {};
  }
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readMutedConversations(accountAddress: string, storage = getStorage()): Set<string> {
  return new Set(readStore(storage)[accountAddress] ?? []);
}

export function writeMutedConversations(accountAddress: string, keys: Iterable<string>, storage = getStorage()) {
  if (!storage) return;
  const store = readStore(storage);
  const next = [...new Set(keys)].sort();
  if (next.length === 0) {
    delete store[accountAddress];
  } else {
    store[accountAddress] = next;
  }
  try {
    storage.setItem(MUTED_CONVERSATIONS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage may be unavailable (gateway forces memory-only, quota); the
    // in-memory set still applies for this session.
  }
}

export function toggleMutedConversation(current: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(current);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  return next;
}
