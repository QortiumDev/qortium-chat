// Pure helpers for Home 2's restart-safe pending-transaction journal
// (GET_PENDING_TRANSACTIONS / FORGET_PENDING_TRANSACTION — review/schemas-
// home2-actions.md "Pending transactions"). This module never calls the
// bridge itself; App.tsx drives the fetch/forget round trips per network and
// holds the journal state, using these pure functions to decide which
// entries are in scope, which conversation they belong to, and which are now
// safe to forget.
//
// P1 scope (per the design brief) is chat-send entries only: a journal entry
// whose target is 'operation' or 'resource' is not attributed to any
// conversation and never reconciled here — App.tsx still stores it in typed
// state (nothing here requires filtering the raw fetch result), but only
// filterChatJournalEntries's output feeds the conversation-notice and
// forget-eligibility logic below.
import { getMessageNetworkIdentity } from './chatNetwork';
import { hasAction } from './qdnRequest';
import type { ChatNetwork, PendingBridgeTransactionEntry } from './types';

export type ChatJournalTarget = Extract<
  PendingBridgeTransactionEntry['target'],
  { kind: 'group' | 'direct' }
>;

export type ChatJournalEntry = PendingBridgeTransactionEntry & { target: ChatJournalTarget };

/** Narrows a raw journal fetch down to the entries this app attributes to a
 * conversation (group/direct chat sends). 'operation' and 'resource' entries
 * are out of P1 scope and dropped here. */
export function filterChatJournalEntries(
  entries: readonly PendingBridgeTransactionEntry[],
): ChatJournalEntry[] {
  return entries.filter(
    (entry): entry is ChatJournalEntry => entry.target.kind === 'group' || entry.target.kind === 'direct',
  );
}

/** Mirrors App.tsx's getSelectedChatKey convention exactly, so a journal
 * entry can be attributed to the same conversation the rest of the app
 * already keys by: only a non-default (qortal) network changes the prefix,
 * a 'group' target keys off groupId, a 'direct' target keys off the other
 * party's address. `network` is taken as an explicit argument (rather than
 * read off `entry.network`) because callers already fetch/store the journal
 * per network and should key it exactly the way that fetch was scoped. */
export function getJournalConversationKey(network: ChatNetwork, entry: ChatJournalEntry): string {
  const prefix = network === 'qortal' ? 'qortal:' : '';

  return entry.target.kind === 'group'
    ? `${prefix}group:${entry.target.groupId}`
    : `${prefix}direct:${entry.target.otherAddress}`;
}

/** An entry is safe to forget once its signature has actually been observed
 * in a fetched/live confirmed message for its own network — never merely
 * because time passed. `observedSignatures` must be built with
 * getMessageNetworkIdentity(network, message) so two chains that draw
 * signatures from unrelated namespaces can never cross-forget each other's
 * entries (a bare signature collision across qortium/qortal is unlikely but
 * real, same rationale as pendingSends.ts's prunePendingSends). */
export function getForgettableJournalSignatures(
  entries: readonly ChatJournalEntry[],
  observedSignatures: ReadonlySet<string>,
): ChatJournalEntry[] {
  return entries.filter((entry) =>
    observedSignatures.has(getMessageNetworkIdentity(entry.network, { signature: entry.signature })),
  );
}

/** Pure decision for "should this network's journal be fetched right now?" —
 * extracted out of the App.tsx effect so the gating logic (bridge ready, an
 * account is connected, the network is otherwise available, and the action is
 * advertised) is unit-testable on its own. `networkAvailable` covers Qortal's
 * extra gate (hasQortalChatBridgeActions) that Qortium does not need; omit it
 * (or pass true) for a network with no such extra gate. */
export function shouldFetchPendingJournal(input: {
  accountAddress: string | null;
  actions: readonly string[];
  bridgeReady: boolean;
  networkAvailable?: boolean;
}): boolean {
  if (!input.bridgeReady || !input.accountAddress || input.networkAvailable === false) {
    return false;
  }

  return hasAction([...input.actions], 'GET_PENDING_TRANSACTIONS');
}
