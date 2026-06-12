import type { ChatMessage } from './types';
import { isReactionChatMessage } from './chatText';

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

export function buildMessageThreads(messages: ChatMessage[]): MessageThread[] {
  const originalsBySignature = new Map<string, ChatMessage>();
  const revisionsByReference = new Map<string, ChatMessage[]>();

  for (const message of messages) {
    if (isReactionChatMessage(message)) {
      continue;
    }

    if (message.signature && !message.chatReference) {
      originalsBySignature.set(message.signature, message);
    }
  }

  for (const message of messages) {
    if (!message.chatReference || isReactionChatMessage(message)) {
      continue;
    }

    const revisions = revisionsByReference.get(message.chatReference) ?? [];

    revisions.push(message);
    revisionsByReference.set(message.chatReference, revisions);
  }

  const threads: MessageThread[] = [];

  for (const message of messages) {
    if (isReactionChatMessage(message)) {
      continue;
    }

    const referencedOriginal = message.chatReference
      ? originalsBySignature.get(message.chatReference)
      : undefined;

    if (referencedOriginal?.sender === message.sender) {
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

  return threads;
}
