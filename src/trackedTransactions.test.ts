import { describe, expect, it } from 'vitest';
import {
  getTrackedTransactionNetwork,
  isTrackedTransactionForConversation,
  selectConversationSystemMessages,
} from './trackedTransactions';
import type { TrackedTransaction } from './types';

function transaction(
  overrides: Partial<TrackedTransaction> & Pick<TrackedTransaction, 'groupId' | 'id'>,
): TrackedTransaction {
  return {
    action: 'join',
    groupName: `Group ${overrides.groupId}`,
    message: 'Join submitted',
    phase: 'pending',
    ...overrides,
  };
}

describe('getTrackedTransactionNetwork', () => {
  it('reads a missing network as qortium, never as unknown', () => {
    expect(getTrackedTransactionNetwork(transaction({ groupId: 5, id: 'legacy' }))).toBe('qortium');
    expect(getTrackedTransactionNetwork(transaction({ groupId: 5, id: 'q', network: 'qortium' }))).toBe('qortium');
    expect(getTrackedTransactionNetwork(transaction({ groupId: 5, id: 'x', network: 'qortal' }))).toBe('qortal');
  });
});

describe('selectConversationSystemMessages', () => {
  // Both chains can carry the same numeric group id, so this is the
  // isolation contract: same-id transactions must stay on their own chain.
  const sameIdOnBothChains = {
    'legacy-join': transaction({ groupId: 42, id: 'legacy-join' }),
    'qortal-join': transaction({ groupId: 42, id: 'qortal-join', network: 'qortal' }),
    'qortal-leave': transaction({ action: 'leave', groupId: 42, id: 'qortal-leave', network: 'qortal' }),
    'qortium-join': transaction({ groupId: 42, id: 'qortium-join', network: 'qortium' }),
  };

  it('never renders a Qortal transaction in the same-numeric-id Qortium conversation', () => {
    const selected = selectConversationSystemMessages(sameIdOnBothChains, 'qortium', 42);

    expect(selected.map((entry) => entry.id).sort()).toEqual(['legacy-join', 'qortium-join']);
  });

  it('never renders a Qortium (or legacy network-less) transaction in the same-numeric-id Qortal conversation', () => {
    const selected = selectConversationSystemMessages(sameIdOnBothChains, 'qortal', 42);

    expect(selected.map((entry) => entry.id).sort()).toEqual(['qortal-join', 'qortal-leave']);
  });

  it('matches only the open conversation group id on the same network', () => {
    expect(
      selectConversationSystemMessages(sameIdOnBothChains, 'qortal', 7).map((entry) => entry.id),
    ).toEqual([]);
  });

  it('shows nothing outside a group conversation', () => {
    expect(selectConversationSystemMessages(sameIdOnBothChains, null, 42)).toEqual([]);
    expect(selectConversationSystemMessages(sameIdOnBothChains, 'qortal', null)).toEqual([]);
  });
});

describe('isTrackedTransactionForConversation', () => {
  it('refreshes only the conversation on the transaction network, even for the same numeric group id', () => {
    const qortalJoin = transaction({ groupId: 42, id: 'qortal-join', network: 'qortal' });
    const legacyQortiumJoin = transaction({ groupId: 42, id: 'legacy-join' });

    expect(isTrackedTransactionForConversation(qortalJoin, 'qortal', 42)).toBe(true);
    expect(isTrackedTransactionForConversation(qortalJoin, 'qortium', 42)).toBe(false);
    expect(isTrackedTransactionForConversation(legacyQortiumJoin, 'qortium', 42)).toBe(true);
    expect(isTrackedTransactionForConversation(legacyQortiumJoin, 'qortal', 42)).toBe(false);
  });

  it('never matches a different group id or a non-group selection', () => {
    const qortalJoin = transaction({ groupId: 42, id: 'qortal-join', network: 'qortal' });

    expect(isTrackedTransactionForConversation(qortalJoin, 'qortal', 41)).toBe(false);
    expect(isTrackedTransactionForConversation(qortalJoin, null, 42)).toBe(false);
    expect(isTrackedTransactionForConversation(qortalJoin, 'qortal', null)).toBe(false);
  });
});
