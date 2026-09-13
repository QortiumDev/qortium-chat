import { describe, expect, it } from 'vitest';
import {
  getMutedConversationKey,
  MUTED_CONVERSATIONS_STORAGE_KEY,
  readMutedConversations,
  toggleMutedConversation,
  writeMutedConversations,
} from './mutedConversations';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); },
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe('muted conversations (G4-i)', () => {
  it('keys are network-qualified so the same group id on both chains never collides', () => {
    expect(getMutedConversationKey({ groupId: 16, kind: 'group', network: 'qortium' })).toBe('qortium:group:16');
    expect(getMutedConversationKey({ groupId: 16, kind: 'group', network: 'qortal' })).toBe('qortal:group:16');
    expect(getMutedConversationKey({ kind: 'direct', network: 'qortium', otherAddress: 'Qpeer' })).toBe('qortium:direct:Qpeer');
  });

  it('persists per account and survives malformed storage', () => {
    const storage = memoryStorage();

    writeMutedConversations('Qa', ['qortium:group:16'], storage);
    writeMutedConversations('Qb', ['qortal:direct:Qx'], storage);

    expect([...readMutedConversations('Qa', storage)]).toEqual(['qortium:group:16']);
    expect([...readMutedConversations('Qb', storage)]).toEqual(['qortal:direct:Qx']);
    expect([...readMutedConversations('Qc', storage)]).toEqual([]);

    storage.setItem(MUTED_CONVERSATIONS_STORAGE_KEY, '{"Qa": "nope", "Qb": [1, "ok"]}');
    expect([...readMutedConversations('Qa', storage)]).toEqual([]);
    expect([...readMutedConversations('Qb', storage)]).toEqual(['ok']);

    storage.setItem(MUTED_CONVERSATIONS_STORAGE_KEY, 'garbage');
    expect([...readMutedConversations('Qa', storage)]).toEqual([]);
  });

  it('toggles without mutating the previous set and drops an empty account entry', () => {
    const first = toggleMutedConversation(new Set(), 'qortium:group:1');
    const second = toggleMutedConversation(first, 'qortium:group:1');

    expect([...first]).toEqual(['qortium:group:1']);
    expect([...second]).toEqual([]);

    const storage = memoryStorage();
    writeMutedConversations('Qa', first, storage);
    writeMutedConversations('Qa', second, storage);
    expect(storage.getItem(MUTED_CONVERSATIONS_STORAGE_KEY)).toBe('{}');
  });
});
