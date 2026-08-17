// Optimistic pending -> confirmed -> failed lifecycle for chat sends (Chat 2.0
// slice 1). SEND_CHAT_MESSAGE takes several seconds (local MemoryPoW + node
// broadcast) before the message is visible in any fetched/live list, so a
// plain `await sendChatMessage(...); await loadMessages(...)` leaves the sent
// message invisible for that whole window — users think it failed and resend
// (observed on Previewnet: triple-posts). This module holds the pure state
// machine App.tsx drives around that send: build a local optimistic echo,
// resolve it once the bridge returns a signature, reconcile it away once that
// signature shows up in a real fetched/live message, or mark it failed with
// enough to retry the exact same send.
//
// Two shapes, by how heavy their optimistic UI needs to be (see the slice-1
// spec: "a reaction's optimistic UI may be lighter"):
//  - PendingSend (message/reaction): a synthesized ChatMessage is merged
//    straight into the rendered list via mergeOptimisticMessages, so a new
//    message gets a real bubble and a reaction gets an instant chip flip.
//  - PendingRevision (edit/delete): edits and deletes target a message that
//    is already rendered from confirmed data (buildMessageThreads folds
//    revisions into their original's thread, and filters deleted threads out
//    entirely) — injecting a synthetic revision would either fight that
//    filtering (delete) or require duplicating thread-merge logic (edit) for
//    a still-unconfirmed transaction. Simpler and safer: leave the confirmed
//    content on screen and drive a small inline "Saving edit.../Deleting..."
//    status line from a side channel keyed by the target's real signature.
import { sortMessagesByTimestamp } from './messageThreads';
import { encodeBase64 } from './chatText';
import type { ChatMessage, ChatNetwork } from './types';

export type PendingSendStatus = 'failed' | 'sending';
export type SendDeliveryPhase = 'broadcast' | 'confirmed' | 'expired' | 'pending' | 'rejected';

export type SendDeliveryState = {
  readonly phase: SendDeliveryPhase;
  readonly updatedAt: number;
};

// `network` is optional and defaults to 'qortium' at every read site (see
// App.tsx's dispatchChatSend) — slice-1 callers that never set it keep
// behaving exactly as they did before Chat 2.0 slice 2.
export type PendingSendTarget =
  | { kind: 'direct'; address: string; network?: ChatNetwork }
  | { kind: 'group'; groupId: number; network?: ChatNetwork };

// A plain new message and a reaction both go out through SEND_CHAT_MESSAGE
// and share this shape; 'reaction' entries are excluded from the merged
// display once failed (see mergeOptimisticMessages) since a failed reaction
// should just revert the chip, not leave a stray bubble.
export type PendingSendKind = 'message' | 'reaction';

export type PendingSend = {
  readonly accountAddress: string;
  readonly chatKey: string;
  readonly chatReference?: string;
  readonly error?: string;
  readonly kind: PendingSendKind;
  readonly delivery: SendDeliveryState;
  readonly localId: string;
  readonly message: ChatMessage;
  /** The signature the bridge returned once the send resolves; null while still in flight. */
  readonly resolvedSignature: string | null;
  readonly status: PendingSendStatus;
  readonly target: PendingSendTarget;
  /** The exact envelope text sent (and to re-send on retry). */
  readonly text: string;
};

export type PendingRevisionKind = 'delete' | 'edit';

export type PendingRevision = {
  readonly accountAddress: string;
  readonly chatKey: string;
  /** The original message's real signature — the tx-level chatReference this revision targets. */
  readonly chatReference: string;
  readonly error?: string;
  readonly kind: PendingRevisionKind;
  readonly delivery: SendDeliveryState;
  readonly localId: string;
  readonly resolvedSignature: string | null;
  readonly status: PendingSendStatus;
  readonly target: PendingSendTarget;
  readonly text: string;
};

// Composite (network, signature) identity: two independent chains draw
// signatures from unrelated namespaces, so a bare-signature Set/Map risks a
// (vanishingly unlikely, but real) cross-chain collision wherever pending
// entries from more than one chat/network are compared at once — see
// prunePendingSends/prunePendingRevisions below, which run over the full
// in-memory pending list rather than one already-chat-filtered slice.
function getTargetNetwork(target: PendingSendTarget): ChatNetwork {
  return target.network ?? 'qortium';
}

export function getPendingSignatureIdentity(network: ChatNetwork, signature: string): string {
  return `${network}:${signature}`;
}

let localSendIdCounter = 0;

/** A fresh, stable id for one optimistic entry, used as its React/lookup key before (and instead of) a real signature. Never leaves the client. */
export function createLocalSendId(): string {
  localSendIdCounter += 1;

  return `pending-${localSendIdCounter}`;
}

// The optimistic echo. `signature` stays null for as long as the entry is
// tracked as pending: several UI affordances (reply/react/edit/delete) gate
// on `!!message.signature` already, and reusing that existing gate — rather
// than handing out a synthetic signature — is what keeps a still-unconfirmed
// echo from being reply/react/edit/delete target before it is real.
function buildOptimisticChatMessage(input: {
  chatReference?: string;
  localId: string;
  recipient?: string | null;
  recipientName?: string | null;
  sender: string;
  senderName?: string | null;
  status: PendingSendStatus;
  text: string;
  timestamp: number;
  txGroupId: number;
}): ChatMessage {
  return {
    chatReference: input.chatReference ?? null,
    data: encodeBase64(input.text),
    encoding: 'BASE64',
    isEncrypted: false,
    isText: true,
    recipient: input.recipient ?? null,
    recipientName: input.recipientName ?? null,
    sender: input.sender,
    senderName: input.senderName ?? null,
    sendLocalId: input.localId,
    sendState: input.status,
    signature: null,
    timestamp: input.timestamp,
    txGroupId: input.txGroupId,
  };
}

export function createPendingSend(input: {
  accountAddress: string;
  chatKey: string;
  chatReference?: string;
  kind: PendingSendKind;
  localId: string;
  recipient?: string | null;
  recipientName?: string | null;
  sender: string;
  senderName?: string | null;
  target: PendingSendTarget;
  text: string;
  timestamp: number;
  txGroupId: number;
}): PendingSend {
  return {
    accountAddress: input.accountAddress,
    chatKey: input.chatKey,
    chatReference: input.chatReference,
    kind: input.kind,
    delivery: { phase: 'pending', updatedAt: input.timestamp },
    localId: input.localId,
    message: buildOptimisticChatMessage({
      chatReference: input.chatReference,
      localId: input.localId,
      recipient: input.recipient,
      recipientName: input.recipientName,
      sender: input.sender,
      senderName: input.senderName,
      status: 'sending',
      text: input.text,
      timestamp: input.timestamp,
      txGroupId: input.txGroupId,
    }),
    resolvedSignature: null,
    status: 'sending',
    target: input.target,
    text: input.text,
  };
}

/** The bridge accepted the broadcast: record the real signature. Still 'sending' — reconciliation (dropping the echo) happens once that signature shows up in a fetched/live list; see mergeOptimisticMessages / prunePendingSends. */
export function resolvePendingSend(
  pending: PendingSend,
  result: { signature: string },
  timestamp: number = Date.now(),
): PendingSend {
  return {
    ...pending,
    delivery: { phase: 'broadcast', updatedAt: timestamp },
    resolvedSignature: result.signature,
  };
}

export function failPendingSend(pending: PendingSend, error: string, timestamp: number = Date.now()): PendingSend {
  return {
    ...pending,
    delivery: { phase: 'rejected', updatedAt: timestamp },
    error,
    message: { ...pending.message, sendState: 'failed' },
    status: 'failed',
  };
}

/** Re-arm a failed entry for another attempt: same text/target/chatReference, fresh timestamp so it re-sorts to "now". */
export function retryPendingSend(pending: PendingSend, timestamp: number = Date.now()): PendingSend {
  return {
    ...pending,
    delivery: { phase: 'pending', updatedAt: timestamp },
    error: undefined,
    message: { ...pending.message, sendState: 'sending', timestamp },
    resolvedSignature: null,
    status: 'sending',
  };
}

export function confirmPendingSend(pending: PendingSend, timestamp: number = Date.now()): PendingSend {
  return { ...pending, delivery: { phase: 'confirmed', updatedAt: timestamp } };
}

function targetsEqual(first: PendingSendTarget, second: PendingSendTarget) {
  if (first.kind !== second.kind || getTargetNetwork(first) !== getTargetNetwork(second)) {
    return false;
  }

  return first.kind === 'group'
    ? second.kind === 'group' && first.groupId === second.groupId
    : second.kind === 'direct' && first.address === second.address;
}

/** Prevents an identical click/retry from starting another broadcast while the
 * first attempt is still awaiting the bridge or confirmation. Rejected and
 * expired attempts are terminal and may be explicitly retried. */
export function hasActiveDuplicateSend(
  pending: readonly PendingSend[],
  candidate: Pick<PendingSend, 'accountAddress' | 'chatReference' | 'target' | 'text'>,
) {
  return pending.some(
    (entry) =>
      (entry.delivery.phase === 'pending' || entry.delivery.phase === 'broadcast') &&
      entry.accountAddress === candidate.accountAddress &&
      entry.text === candidate.text &&
      entry.chatReference === candidate.chatReference &&
      targetsEqual(entry.target, candidate.target),
  );
}

export function expirePendingSends(
  pending: PendingSend[],
  now: number,
  timeoutMs: number,
  error: string,
): PendingSend[] {
  let changed = false;
  const next = pending.map((entry) => {
    if (
      entry.delivery.phase !== 'broadcast' ||
      now - entry.delivery.updatedAt < timeoutMs
    ) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      delivery: { phase: 'expired' as const, updatedAt: now },
      error,
      message: { ...entry.message, sendState: 'failed' as const },
      status: 'failed' as const,
    };
  });

  return changed ? next : pending;
}

export function expirePendingRevisions(
  pending: PendingRevision[],
  now: number,
  timeoutMs: number,
  error: string,
): PendingRevision[] {
  let changed = false;
  const next = pending.map((entry) => {
    if (
      entry.delivery.phase !== 'broadcast' ||
      now - entry.delivery.updatedAt < timeoutMs
    ) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      delivery: { phase: 'expired' as const, updatedAt: now },
      error,
      status: 'failed' as const,
    };
  });

  return changed ? next : pending;
}

// Overlays still-pending sends onto a confirmed (fetched/live) list, for the
// currently selected chat's already-chat-filtered pending entries:
//  - a resolved signature that now appears in `confirmed` means the real
//    message has landed — drop the echo (no duplicate render);
//  - a failed 'reaction' is dropped too — its chip reverts to whatever the
//    confirmed reactions say, no dangling bubble (reactions never render as
//    bubbles regardless — see messageReactions.ts / buildMessageThreads
//    hiding 'reaction'-kind messages);
//  - everything else pending (any 'sending' entry, or a failed 'message')
//    stays, so a failed new message/reply keeps its own bubble with a visible
//    retry affordance instead of silently vanishing.
export function mergeOptimisticMessages(confirmed: ChatMessage[], pending: PendingSend[]): ChatMessage[] {
  if (pending.length === 0) {
    return confirmed;
  }

  // Safe on a bare signature: every current caller has already narrowed both
  // `confirmed` and `pending` to one chat (one network) before calling this —
  // App.tsx filters `pending` by chatKey (which is itself network-prefixed,
  // see getSelectedChatKey) and `confirmed` is that same chat's fetched
  // transcript. Cross-chat/network safety for the *unfiltered* pending list
  // lives in prunePendingSends below, which does have each entry's real
  // target network to key against.
  const confirmedSignatures = new Set<string>();

  for (const message of confirmed) {
    if (message.signature) {
      confirmedSignatures.add(message.signature);
    }
  }

  const overlay = pending.filter((entry) => {
    if (entry.resolvedSignature && confirmedSignatures.has(entry.resolvedSignature)) {
      return false;
    }

    return !(entry.kind === 'reaction' && entry.status === 'failed');
  });

  if (overlay.length === 0) {
    return confirmed;
  }

  return sortMessagesByTimestamp([...confirmed, ...overlay.map((entry) => entry.message)]);
}

/** State-side cleanup companion to mergeOptimisticMessages: drops pending entries that are now confirmed, from whichever chat (and network) they belong to. `confirmedSignatures` holds (network, signature) identities built with getPendingSignatureIdentity — this runs over the FULL in-memory pending list (every chat, every network), so a bare signature here really could collide across two independent chains; each entry is checked against its own target's network. Returns the same array when nothing changed, so callers can skip a re-render (same convention as retainChatMessagesWhenEqual). */
export function prunePendingSends(pending: PendingSend[], confirmedSignatures: ReadonlySet<string>): PendingSend[] {
  const next = pending.filter((entry) => {
    if (!entry.resolvedSignature) {
      return true;
    }

    return !confirmedSignatures.has(getPendingSignatureIdentity(getTargetNetwork(entry.target), entry.resolvedSignature));
  });

  return next.length === pending.length ? pending : next;
}

export function createPendingRevision(input: {
  accountAddress: string;
  chatKey: string;
  chatReference: string;
  kind: PendingRevisionKind;
  localId: string;
  target: PendingSendTarget;
  text: string;
  timestamp?: number;
}): PendingRevision {
  const timestamp = input.timestamp ?? Date.now();

  return {
    accountAddress: input.accountAddress,
    chatKey: input.chatKey,
    chatReference: input.chatReference,
    kind: input.kind,
    delivery: { phase: 'pending', updatedAt: timestamp },
    localId: input.localId,
    resolvedSignature: null,
    status: 'sending',
    target: input.target,
    text: input.text,
  };
}

export function resolvePendingRevision(
  pending: PendingRevision,
  result: { signature: string },
  timestamp: number = Date.now(),
): PendingRevision {
  return {
    ...pending,
    delivery: { phase: 'broadcast', updatedAt: timestamp },
    resolvedSignature: result.signature,
  };
}

export function failPendingRevision(
  pending: PendingRevision,
  error: string,
  timestamp: number = Date.now(),
): PendingRevision {
  return { ...pending, delivery: { phase: 'rejected', updatedAt: timestamp }, error, status: 'failed' };
}

export function retryPendingRevision(pending: PendingRevision, timestamp: number = Date.now()): PendingRevision {
  return {
    ...pending,
    delivery: { phase: 'pending', updatedAt: timestamp },
    error: undefined,
    resolvedSignature: null,
    status: 'sending',
  };
}

export function prunePendingRevisions(
  pending: PendingRevision[],
  confirmedSignatures: ReadonlySet<string>,
): PendingRevision[] {
  const next = pending.filter((entry) => {
    if (!entry.resolvedSignature) {
      return true;
    }

    return !confirmedSignatures.has(getPendingSignatureIdentity(getTargetNetwork(entry.target), entry.resolvedSignature));
  });

  return next.length === pending.length ? pending : next;
}

/** One pending revision per (chat, target signature) at most — a fresh edit/delete on the same target (e.g. a retried delete after an edit failed) supersedes whatever was pending for it, which callers enforce when inserting. This just indexes the current chat's revisions by target for the message list to look up while rendering. */
export function indexPendingRevisionsByTarget(
  pending: PendingRevision[],
  chatKey: string,
): ReadonlyMap<string, PendingRevision> {
  const byTarget = new Map<string, PendingRevision>();

  for (const entry of pending) {
    if (entry.chatKey === chatKey) {
      byTarget.set(entry.chatReference, entry);
    }
  }

  return byTarget;
}
