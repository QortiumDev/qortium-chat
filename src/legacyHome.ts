// Home 1.x (1.7.0–1.8.0) compatibility for private sends on the Qortium bridge.
//
// Home 1.x never advertises the exact Home 2 private send actions
// (SEND_PRIVATE_GROUP_CHAT_MESSAGE, SEND_DIRECT_CHAT_MESSAGE). It routes the
// generic SEND_CHAT_MESSAGE itself: a closed `groupId` goes to Core's
// /chat/private/group/send and a `recipientAddress` to /chat/private/direct/send
// (electron/qdn.ts sendChatMessageForApp at v1.8.0) — the same QPGC v1 / QDM1
// formats Home 2 encrypts locally — and only on a local or trusted custom node.
// On a public/network node Home 1.x refuses both sends AND strips every
// private READ action from SHOW_ACTIONS (qdn-app-actions.ts
// QDN_LOCAL_WRITE_ONLY_ACTIONS).
//
// So "private reads advertised + generic send advertised + exact private send
// absent" identifies exactly one host state: Home 1.x on a trusted node, where
// the generic send is encrypted host-side. Home 2 advertises the exact send
// whenever it advertises the reads (both follow the same route availability),
// Qortal Hub and the gateway advertise no private reads, and a host that
// advertises nothing matches nothing. That signature — not a UI label — is
// what the two predicates below test, so the P3 "never broadcast a closed
// group's plaintext through the generic action" invariant still holds: the
// generic action is used for a closed group only where the host is known to
// encrypt it.
//
// Qortium bridge only. Home 1.x's Qortal path (SEND_QORTAL_GROUP_CHAT) asserts
// an open group, so Qortal closed groups and DMs never worked on Home 1.x and
// stay gated on the exact actions.
import type { QdnAction } from './types';

function has(actions: readonly QdnAction[] | undefined, action: string) {
  return actions?.some((candidate) => candidate.toUpperCase() === action) ?? false;
}

export function hasLegacyHomePrivateGroupSend(actions: readonly QdnAction[] | undefined) {
  return (
    !has(actions, 'SEND_PRIVATE_GROUP_CHAT_MESSAGE') &&
    has(actions, 'SEND_CHAT_MESSAGE') &&
    has(actions, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES')
  );
}

export function hasLegacyHomeDirectSend(actions: readonly QdnAction[] | undefined) {
  return (
    !has(actions, 'SEND_DIRECT_CHAT_MESSAGE') &&
    has(actions, 'SEND_CHAT_MESSAGE') &&
    has(actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES')
  );
}
