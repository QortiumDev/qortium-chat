// Chat 2.0.7: the network-scoping rules for tracked join/leave/approve
// transactions (the inline system messages). The two chains draw numeric
// group ids from unrelated namespaces (see chatNetwork.ts), so every read
// keyed off a bare groupId must pair it with the transaction's network
// first — a Qortal join for group N must never render in, or refresh, the
// Qortium group-N conversation, and vice versa. App.tsx's selection memo
// and refreshAfterTrackedTransaction both route through these helpers so
// the isolation rule lives (and is tested) in exactly one place.
import type { ChatNetwork, TrackedTransaction } from './types';

/** Absent means 'qortium' — every pre-dual-chain tracked transaction
 * predates the network field (see TrackedTransaction in types.ts), and a
 * missing network must never read as "unknown". */
export function getTrackedTransactionNetwork(
  transaction: Pick<TrackedTransaction, 'network'>,
): ChatNetwork {
  return transaction.network ?? 'qortium';
}

/** The inline system messages for one open group conversation: same numeric
 * groupId AND same network. A non-group selection (direct chat, nothing
 * selected) shows none. */
export function selectConversationSystemMessages(
  trackedTransactions: Record<string, TrackedTransaction>,
  conversationNetwork: ChatNetwork | null,
  groupId: number | null,
): TrackedTransaction[] {
  if (conversationNetwork === null || groupId === null) {
    return [];
  }

  return Object.values(trackedTransactions).filter(
    (transaction) =>
      transaction.groupId === groupId &&
      getTrackedTransactionNetwork(transaction) === conversationNetwork,
  );
}

/** Whether a just-confirmed transaction belongs to the open conversation —
 * gates the member-roster refresh in refreshAfterTrackedTransaction so a
 * confirmation on one chain never refreshes the same-numeric-id group open
 * on the other. */
export function isTrackedTransactionForConversation(
  transaction: Pick<TrackedTransaction, 'groupId' | 'network'>,
  conversationNetwork: ChatNetwork | null,
  groupId: number | null,
): boolean {
  return (
    conversationNetwork !== null &&
    groupId !== null &&
    transaction.groupId === groupId &&
    getTrackedTransactionNetwork(transaction) === conversationNetwork
  );
}
