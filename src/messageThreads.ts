import type { ChatMessage } from './types';
import { decodeChatMessage, isHiddenChatMessage } from './chatText';

// Stable React key / dedupe key for a message: its on-chain signature when present,
// else a synthesized fallback from timestamp/sender/index for unsigned local rows.
export function getMessageKey(message: ChatMessage, index = 0) {
  return message.signature || `${message.timestamp}-${message.sender}-${index}`;
}

/**
 * A chat transaction cannot be edited, so an "edit" is a new CHAT transaction
 * whose chatReference points at the original message's signature. A thread is
 * an original message plus the revisions that replace its content.
 */
export type MessageThread = {
  /** The revision currently shown; the original when never edited. */
  latest: ChatMessage;
  /** The root message that carries the thread's identity (sender, position, reply target). */
  original: ChatMessage;
  /** Accepted revisions in timestamp order (oldest first), excluding the original. */
  revisions: ChatMessage[];
};

export type BuildMessageThreadsOptions = {
  /** Include deleted threads for non-feed consumers such as privacy-safe preview resolution. */
  includeDeleted?: boolean;
};

/**
 * Revisions are only valid when the currently selected chain identity still
 * owns the loaded root message. A referenced row can itself be an orphaned
 * revision whose root fell outside the retained window, so it must not become
 * a new editable root merely because it is the row currently being rendered.
 */
export function canReviseMessageThread(thread: MessageThread, currentSender: string | null) {
  return (
    !!currentSender &&
    hasLoadedMessageThreadRoot(thread) &&
    thread.original.sender === currentSender
  );
}

/** A revision row is not a safe stand-in for its missing root transaction. */
export function hasLoadedMessageThreadRoot(thread: MessageThread) {
  return !!thread.original.signature && !thread.original.chatReference;
}

/** An accepted empty-body revision is the deletion marker for a message thread. */
export function isDeletedMessageThread(thread: MessageThread) {
  if (thread.revisions.length === 0) {
    return false;
  }

  const latest = decodeChatMessage(thread.latest);

  return latest.kind === 'text' && !latest.body;
}

/** Successive messages from one sender closer together than this render as one visual group. */
export const THREAD_CONTINUATION_WINDOW_MS = 5 * 60 * 1000;

export function isThreadContinuation(
  previous: MessageThread | undefined,
  current: MessageThread,
  windowMs = THREAD_CONTINUATION_WINDOW_MS,
) {
  return (
    !!previous &&
    previous.original.sender === current.original.sender &&
    current.original.timestamp - previous.original.timestamp <= windowMs
  );
}

export function sortMessagesByTimestamp(messages: ChatMessage[]) {
  return [...messages].sort((first, second) => first.timestamp - second.timestamp);
}

export function getLatestActivityMessageTimestamp(messages: ChatMessage[]) {
  return messages.reduce<number | null>((latestTimestamp, message) => {
    if (isHiddenChatMessage(message)) {
      return latestTimestamp;
    }

    return latestTimestamp === null ? message.timestamp : Math.max(latestTimestamp, message.timestamp);
  }, null);
}

export function buildMessageThreads(
  messages: ChatMessage[],
  options: BuildMessageThreadsOptions = {},
): MessageThread[] {
  const originalsBySignature = new Map<string, ChatMessage>();
  const revisionsByReference = new Map<string, ChatMessage[]>();
  const orphanRevisionsByReferenceAndSender = new Map<string, Map<string, ChatMessage[]>>();

  for (const message of messages) {
    if (isHiddenChatMessage(message)) {
      continue;
    }

    if (message.signature && !message.chatReference) {
      originalsBySignature.set(message.signature, message);
    }
  }

  for (const message of messages) {
    if (!message.chatReference || isHiddenChatMessage(message)) {
      continue;
    }

    const revisions = revisionsByReference.get(message.chatReference) ?? [];

    revisions.push(message);
    revisionsByReference.set(message.chatReference, revisions);

    // When the root has aged out of the node's retained/page window, keep a
    // visible row but coalesce that sender's successive revisions. Different
    // senders remain separate: sender equality is the authorization boundary,
    // not merely a presentation hint.
    if (!originalsBySignature.has(message.chatReference)) {
      const bySender = orphanRevisionsByReferenceAndSender.get(message.chatReference) ?? new Map();
      const orphanRevisions = bySender.get(message.sender) ?? [];

      orphanRevisions.push(message);
      bySender.set(message.sender, orphanRevisions);
      orphanRevisionsByReferenceAndSender.set(message.chatReference, bySender);
    }
  }

  const threads: MessageThread[] = [];

  for (const message of messages) {
    if (isHiddenChatMessage(message)) {
      continue;
    }

    const referencedOriginal = message.chatReference
      ? originalsBySignature.get(message.chatReference)
      : undefined;

    if (referencedOriginal?.sender === message.sender) {
      continue;
    }

    if (message.chatReference && !referencedOriginal) {
      const orphanRevisions = sortMessagesByTimestamp(
        orphanRevisionsByReferenceAndSender.get(message.chatReference)?.get(message.sender) ?? [message],
      );
      const orphanAnchor = orphanRevisions[0];

      if (message !== orphanAnchor) {
        continue;
      }

      threads.push({
        latest: orphanRevisions[orphanRevisions.length - 1],
        original: orphanAnchor,
        revisions: orphanRevisions.slice(1),
      });
      continue;
    }

    const revisions = sortMessagesByTimestamp(
      (message.signature ? revisionsByReference.get(message.signature) ?? [] : []).filter(
        // Only the author can revise their own message.
        (revision) => revision.sender === message.sender,
      ),
    );

    threads.push({
      latest: revisions[revisions.length - 1] ?? message,
      original: message,
      revisions,
    });
  }

  return options.includeDeleted
    ? threads
    : threads.filter((thread) => !isDeletedMessageThread(thread));
}
