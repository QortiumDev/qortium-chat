// Chat send/revision dispatch — extracted out of App.tsx so the P3 safety
// invariant (a closed group's send/edit/delete/reaction must NEVER route
// through the generic SEND_CHAT_MESSAGE/SEND_CHAT_EDIT/... action family) is
// independently testable against the real coreApi wrappers (with only the
// transport layer, qdnRequest/qortalRequest, mocked) rather than only
// reachable through the full App component.
//
// Routing is decided off `entry.target.isPrivate`, set once at target-
// construction time from the selected group's `isOpen` (see App.tsx's
// pendingSendTargetFor) — never by re-checking live group state here, which
// would be a stale-lookup hazard. The private-group wrappers below
// (sendPrivateGroupChat*) have no generic fallback of their own: they throw
// before any bridge call when their exact action is not advertised
// (coreApi.ts), so a closed group can reach the wire only through the exact
// private action, by construction.
import {
  sendChatDelete,
  sendChatEdit,
  sendChatMessage,
  sendChatReaction,
  sendDirectChatDelete,
  sendDirectChatEdit,
  sendDirectChatMessage,
  sendDirectChatReaction,
  sendPrivateGroupChatDelete,
  sendPrivateGroupChatEdit,
  sendPrivateGroupChatMessage,
  sendPrivateGroupChatReaction,
} from './coreApi';
import { hasAction } from './qdnRequest';
import type { PendingRevision, PendingSend } from './pendingSends';
import type { QdnAction } from './types';

// New messages and replies (kind: 'message') always ride the generic
// SEND_CHAT_MESSAGE / SEND_DIRECT_CHAT_MESSAGE envelope for an OPEN target —
// there is no exact-action alternative for a brand-new public message, only
// for revisions. A closed-group target instead always rides
// SEND_PRIVATE_GROUP_CHAT_MESSAGE/REACTION — see the module doc above.
export function dispatchChatSendEntry(
  entry: Pick<PendingSend, 'chatReference' | 'content' | 'contentState' | 'kind' | 'target' | 'text'>,
  networkActions: QdnAction[],
  options: { privateGroupMaxPlaintextBytes?: number } = {},
) {
  const network = entry.target.network ?? 'qortium';

  if (entry.target.kind === 'group' && entry.target.isPrivate) {
    if (
      entry.kind === 'reaction' &&
      entry.chatReference &&
      typeof entry.content === 'string' &&
      typeof entry.contentState === 'boolean'
    ) {
      return sendPrivateGroupChatReaction(
        network,
        entry.target.groupId,
        entry.chatReference,
        entry.content,
        entry.contentState,
        networkActions,
      );
    }

    return sendPrivateGroupChatMessage(
      network,
      entry.target.groupId,
      entry.text,
      networkActions,
      options.privateGroupMaxPlaintextBytes,
    );
  }

  if (entry.kind === 'reaction' && entry.chatReference && typeof entry.content === 'string' && typeof entry.contentState === 'boolean') {
    const content = entry.content;
    const contentState = entry.contentState;
    const chatReference = entry.chatReference;

    if (entry.target.kind === 'group') {
      return sendChatReaction(network, entry.target.groupId, chatReference, content, contentState, networkActions);
    }

    // Direct reactions have no generic-envelope fallback family member of
    // their own to check individually — reuse the plain SEND_DIRECT_CHAT_MESSAGE
    // envelope (today's legacy behavior) when the exact action is not
    // advertised. Called with no network/actions (today's exact 3-arg call)
    // so it always takes the legacy qdnRequest path — never sendDirectChatMessage's
    // own exact-action branch, which silently drops chatReference and would
    // turn this into a brand-new message instead of a revision.
    return hasAction(networkActions, 'SEND_DIRECT_CHAT_REACTION')
      ? sendDirectChatReaction(network, entry.target.address, chatReference, content, contentState, networkActions)
      : sendDirectChatMessage(entry.target.address, entry.text, chatReference);
  }

  // A direct entry carrying a chatReference is always a revision envelope;
  // the exact SEND_DIRECT_CHAT_MESSAGE action silently drops chatReference
  // (initial sends forbid it), so such an entry must never reach that
  // branch — keep it on the legacy 3-arg path unconditionally.
  return entry.target.kind === 'group'
    ? sendChatMessage(network, entry.target.groupId, entry.text, entry.chatReference)
    : entry.chatReference
      ? sendDirectChatMessage(entry.target.address, entry.text, entry.chatReference)
      : sendDirectChatMessage(entry.target.address, entry.text, undefined, network, networkActions);
}

// Group edits/deletes on an OPEN group route through the exact SEND_CHAT_
// EDIT/DELETE action when advertised, else the same generic SEND_CHAT_
// MESSAGE + chatReference envelope Chat has always sent. A closed-group
// target instead always rides SEND_PRIVATE_GROUP_CHAT_EDIT/DELETE — same
// safety invariant as dispatchChatSendEntry above; these two wrappers also
// have no generic fallback. Direct edits/deletes have no fallback either
// (item B's wrappers throw when unadvertised): the composer-level
// canReviseDirectChat gate is what keeps this branch from firing against an
// unadvertised direct bridge in the first place.
export function dispatchChatRevisionEntry(
  entry: Pick<PendingRevision, 'chatReference' | 'kind' | 'repliedTo' | 'target' | 'text'>,
  networkActions: QdnAction[],
  options: { privateGroupMaxPlaintextBytes?: number } = {},
) {
  const network = entry.target.network ?? 'qortium';

  if (entry.target.kind === 'group' && entry.target.isPrivate) {
    return entry.kind === 'edit'
      ? sendPrivateGroupChatEdit(
          network,
          entry.target.groupId,
          entry.text,
          entry.chatReference,
          networkActions,
          options.privateGroupMaxPlaintextBytes,
        )
      : sendPrivateGroupChatDelete(network, entry.target.groupId, entry.chatReference, networkActions, entry.repliedTo);
  }

  if (entry.target.kind === 'group') {
    return entry.kind === 'edit'
      ? sendChatEdit(network, entry.target.groupId, entry.text, entry.chatReference, networkActions)
      : sendChatDelete(network, entry.target.groupId, entry.chatReference, networkActions, entry.repliedTo);
  }

  // Both fallbacks below call sendDirectChatMessage with no network/actions
  // (today's exact 3-arg call) so they always take the legacy qdnRequest
  // path — never sendDirectChatMessage's own exact-action branch, which
  // silently drops chatReference and would turn this into a brand-new
  // message instead of a revision (see the reaction fallback's comment above).
  if (entry.kind === 'edit') {
    return hasAction(networkActions, 'SEND_DIRECT_CHAT_EDIT')
      ? sendDirectChatEdit(network, entry.target.address, entry.text, entry.chatReference, networkActions)
      : sendDirectChatMessage(entry.target.address, entry.text, entry.chatReference);
  }

  return hasAction(networkActions, 'SEND_DIRECT_CHAT_DELETE')
    ? sendDirectChatDelete(network, entry.target.address, entry.chatReference, networkActions)
    : sendDirectChatMessage(entry.target.address, entry.text, entry.chatReference);
}
