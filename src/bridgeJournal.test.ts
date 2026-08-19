import { describe, expect, it } from 'vitest';
import {
  clearNetworkKeyedEntries,
  filterChatJournalEntries,
  getForgettableJournalSignatures,
  getJournalConversationKey,
  shouldFetchPendingJournal,
  type ChatJournalEntry,
} from './bridgeJournal';
import { getMessageNetworkIdentity } from './chatNetwork';
import type { PendingBridgeTransactionEntry } from './types';

function groupEntry(overrides: Partial<PendingBridgeTransactionEntry> = {}): PendingBridgeTransactionEntry {
  return {
    action: 'SEND_CHAT_MESSAGE',
    createdAt: 1000,
    network: 'qortium',
    signature: 'sig-group-a',
    target: { groupId: 1, kind: 'group' },
    timestamp: 1000,
    ...overrides,
  };
}

function directEntry(overrides: Partial<PendingBridgeTransactionEntry> = {}): PendingBridgeTransactionEntry {
  return {
    action: 'SEND_DIRECT_CHAT_MESSAGE',
    createdAt: 2000,
    network: 'qortium',
    signature: 'sig-direct-a',
    target: { kind: 'direct', otherAddress: 'QDirectAddress' },
    timestamp: 2000,
    ...overrides,
  };
}

describe('filterChatJournalEntries', () => {
  it('keeps only group and direct targets', () => {
    const operation: PendingBridgeTransactionEntry = {
      action: 'JOIN_GROUP',
      createdAt: 3000,
      network: 'qortium',
      signature: 'sig-op',
      target: { kind: 'operation' },
      timestamp: 3000,
    };
    const resource: PendingBridgeTransactionEntry = {
      action: 'PUBLISH_QDN_RESOURCE',
      createdAt: 4000,
      network: 'qortium',
      signature: 'sig-resource',
      target: { identifier: null, kind: 'resource', name: 'name', service: 'IMAGE' },
      timestamp: 4000,
    };
    const group = groupEntry();
    const direct = directEntry();

    expect(filterChatJournalEntries([operation, resource, group, direct])).toEqual([group, direct]);
  });

  it('returns an empty array when nothing is chat-shaped', () => {
    const operation: PendingBridgeTransactionEntry = {
      action: 'JOIN_GROUP',
      createdAt: 1,
      network: 'qortal',
      signature: 'sig',
      target: { kind: 'operation' },
      timestamp: 1,
    };

    expect(filterChatJournalEntries([operation])).toEqual([]);
  });
});

describe('getJournalConversationKey', () => {
  it('matches the app chat-key convention for a Qortium group (no prefix)', () => {
    const entry = groupEntry({ target: { groupId: 42, kind: 'group' } }) as ChatJournalEntry;

    expect(getJournalConversationKey('qortium', entry)).toBe('group:42');
  });

  it('matches the app chat-key convention for a Qortal group (qortal: prefix)', () => {
    const entry = groupEntry({ network: 'qortal', target: { groupId: 42, kind: 'group' } }) as ChatJournalEntry;

    expect(getJournalConversationKey('qortal', entry)).toBe('qortal:group:42');
  });

  it('matches the app chat-key convention for a Qortium direct chat', () => {
    const entry = directEntry({ target: { kind: 'direct', otherAddress: 'QAddress1' } }) as ChatJournalEntry;

    expect(getJournalConversationKey('qortium', entry)).toBe('direct:QAddress1');
  });

  it('matches the app chat-key convention for a Qortal direct chat', () => {
    const entry = directEntry({
      network: 'qortal',
      target: { kind: 'direct', otherAddress: 'QAddress1' },
    }) as ChatJournalEntry;

    expect(getJournalConversationKey('qortal', entry)).toBe('qortal:direct:QAddress1');
  });
});

describe('getForgettableJournalSignatures', () => {
  it('returns entries whose (network, signature) identity was observed', () => {
    const group = groupEntry({ signature: 'sig-1' }) as ChatJournalEntry;
    const direct = directEntry({ signature: 'sig-2' }) as ChatJournalEntry;
    const observed = new Set([getMessageNetworkIdentity('qortium', { signature: 'sig-1' })]);

    expect(getForgettableJournalSignatures([group, direct], observed)).toEqual([group]);
  });

  it('does not forget an entry whose signature was not observed', () => {
    const group = groupEntry({ signature: 'sig-unseen' }) as ChatJournalEntry;
    const observed = new Set([getMessageNetworkIdentity('qortium', { signature: 'sig-1' })]);

    expect(getForgettableJournalSignatures([group], observed)).toEqual([]);
  });

  it('never cross-forgets a signature observed only on the other network', () => {
    // Two independent chains can (vanishingly unlikely, but in principle)
    // draw the same raw signature string — the composite identity must keep
    // them apart.
    const qortiumEntry = groupEntry({ network: 'qortium', signature: 'shared-sig' }) as ChatJournalEntry;
    const qortalEntry = groupEntry({ network: 'qortal', signature: 'shared-sig' }) as ChatJournalEntry;
    const observedOnlyQortal = new Set([getMessageNetworkIdentity('qortal', { signature: 'shared-sig' })]);

    expect(getForgettableJournalSignatures([qortiumEntry, qortalEntry], observedOnlyQortal)).toEqual([qortalEntry]);
  });
});

describe('shouldFetchPendingJournal', () => {
  it('fetches when the bridge is ready, an account is connected, and the action is advertised', () => {
    expect(
      shouldFetchPendingJournal({
        accountAddress: 'QAddress',
        actions: ['GET_PENDING_TRANSACTIONS'],
        bridgeReady: true,
      }),
    ).toBe(true);
  });

  it('does not fetch while the bridge is not ready', () => {
    expect(
      shouldFetchPendingJournal({
        accountAddress: 'QAddress',
        actions: ['GET_PENDING_TRANSACTIONS'],
        bridgeReady: false,
      }),
    ).toBe(false);
  });

  it('does not fetch without a connected account', () => {
    expect(
      shouldFetchPendingJournal({
        accountAddress: null,
        actions: ['GET_PENDING_TRANSACTIONS'],
        bridgeReady: true,
      }),
    ).toBe(false);
  });

  it('does not fetch when the action is not advertised', () => {
    expect(
      shouldFetchPendingJournal({
        accountAddress: 'QAddress',
        actions: ['GET_USER_ACCOUNT'],
        bridgeReady: true,
      }),
    ).toBe(false);
  });

  it('does not fetch when the network is explicitly unavailable (Qortal Home 1.7 gate)', () => {
    expect(
      shouldFetchPendingJournal({
        accountAddress: 'QAddress',
        actions: ['GET_PENDING_TRANSACTIONS'],
        bridgeReady: true,
        networkAvailable: false,
      }),
    ).toBe(false);
  });

  it('fetches when networkAvailable is explicitly true', () => {
    expect(
      shouldFetchPendingJournal({
        accountAddress: 'QAddress',
        actions: ['GET_PENDING_TRANSACTIONS'],
        bridgeReady: true,
        networkAvailable: true,
      }),
    ).toBe(true);
  });

  it('is action-name case-insensitive, matching hasAction', () => {
    expect(
      shouldFetchPendingJournal({
        accountAddress: 'QAddress',
        actions: ['get_pending_transactions'],
        bridgeReady: true,
      }),
    ).toBe(true);
  });
});

describe('clearNetworkKeyedEntries', () => {
  it('drops only qortal-prefixed keys when clearing the qortal network', () => {
    const map = new Map([
      ['group:1', 'qortium-a'],
      ['direct:QAddress', 'qortium-b'],
      ['qortal:group:1', 'qortal-a'],
      ['qortal:direct:QOtherAddress', 'qortal-b'],
    ]);

    const next = clearNetworkKeyedEntries(map, 'qortal');

    expect([...next.keys()]).toEqual(['group:1', 'direct:QAddress']);
  });

  it('drops only unprefixed (qortium) keys when clearing the qortium network', () => {
    const map = new Map([
      ['group:1', 'qortium-a'],
      ['qortal:group:1', 'qortal-a'],
    ]);

    const next = clearNetworkKeyedEntries(map, 'qortium');

    expect([...next.keys()]).toEqual(['qortal:group:1']);
  });

  it('returns the same reference when nothing for that network is present', () => {
    const map = new Map([['group:1', 'qortium-a']]);

    expect(clearNetworkKeyedEntries(map, 'qortal')).toBe(map);
  });

  it('never mutates the input map', () => {
    const map = new Map([
      ['group:1', 'qortium-a'],
      ['qortal:group:1', 'qortal-a'],
    ]);

    clearNetworkKeyedEntries(map, 'qortium');

    expect(map.size).toBe(2);
  });

  it('empties a map that is entirely one network', () => {
    const map = new Map([
      ['qortal:group:1', 'qortal-a'],
      ['qortal:direct:QAddress', 'qortal-b'],
    ]);

    const next = clearNetworkKeyedEntries(map, 'qortal');

    expect(next.size).toBe(0);
  });
});
