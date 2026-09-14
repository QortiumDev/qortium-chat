import type { ChatMessage, ChatNetwork, QdnAction } from './types';

// 2.0.23 (G5): the block list is Core's own `blockedAddresses` list — the
// same one the Classic UI and Qortal Hub read and write — so blocking here is
// blocking everywhere on that node. Home 2 exposes the list family as
// GET_LIST / ADD_TO_LIST / REMOVE_FROM_LIST on qdnRequest only, and only for
// an administered node (its own Core, or a custom node with the user's API
// key); Qortal Hub exposes Qortal's GET_LIST_ITEMS / ADD_LIST_ITEMS /
// DELETE_LIST_ITEM. Everything below is pure; the bridge calls live in
// coreApi.ts (readBlockedAddresses / setAddressBlocked).
export const BLOCKED_ADDRESSES_LIST = 'blockedAddresses';

export type BlockListCapability = {
  read: boolean;
  write: boolean;
};

/** UI hook: the current list plus a toggle; null = blocking unavailable here. */
export type BlockControls = {
  blocked: ReadonlySet<string>;
  onToggle: (address: string, blocked: boolean) => void;
  pendingAddress: string | null;
};

const HOME_ACTIONS = { add: 'ADD_TO_LIST', read: 'GET_LIST', remove: 'REMOVE_FROM_LIST' } as const;
const HUB_ACTIONS = { add: 'ADD_LIST_ITEMS', read: 'GET_LIST_ITEMS', remove: 'DELETE_LIST_ITEM' } as const;

function hasAction(actions: readonly string[] | null | undefined, action: string) {
  return !!actions && actions.some((candidate) => candidate.toUpperCase() === action);
}

/** Which list dialect the host speaks for this network, if any. */
export function getBlockListActions(network: ChatNetwork, actions: readonly QdnAction[] | null | undefined) {
  if (network === 'qortium') return hasAction(actions, HOME_ACTIONS.read) ? HOME_ACTIONS : null;
  return hasAction(actions, HUB_ACTIONS.read) ? HUB_ACTIONS : hasAction(actions, HOME_ACTIONS.read) ? HOME_ACTIONS : null;
}

export function getBlockListCapability(network: ChatNetwork, actions: readonly QdnAction[] | null | undefined): BlockListCapability {
  const dialect = getBlockListActions(network, actions);
  if (!dialect) return { read: false, write: false };
  return { read: true, write: hasAction(actions, dialect.add) && hasAction(actions, dialect.remove) };
}

/** Core answers `[]` for a missing list; older hosts may wrap or 404. */
export function normalizeBlockedAddresses(value: unknown): Set<string> {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : [];
  const addresses = new Set<string>();
  for (const row of rows) {
    const address = typeof row === 'string' ? row.trim() : '';
    if (address) addresses.add(address);
  }
  return addresses;
}

/**
 * A list read that fails because the node is not administered (public route,
 * custom node without an API key) means "blocking is not available here",
 * not "something broke" — the controls hide instead of erroring.
 */
export function isBlockListUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /NODE_CAPABILITY_MISSING|administered|api key|apikey|not available|not implemented|unauthori[sz]ed|HTTP 40[13]/i.test(message);
}

export function isBlockedSender(blocked: ReadonlySet<string> | null | undefined, sender: string | null | undefined) {
  return !!blocked && !!sender && blocked.has(sender);
}

/** Drops every message (originals, revisions, reactions) from a blocked sender. */
export function filterBlockedMessages<T extends Pick<ChatMessage, 'sender'>>(messages: T[], blocked: ReadonlySet<string> | null | undefined): T[] {
  if (!blocked || blocked.size === 0) return messages;
  return messages.filter((message) => !blocked.has(message.sender));
}
