import { buildMessageThreads } from './messageThreads';
import { decodeChatMessage } from './chatText';
import type { ActiveGroupChat, ChatMessage } from './types';

export type GroupPreviewRevision = {
  /** Sidebar activity remains anchored to the original message. */
  activityTimestamp: number;
  /** The current visible body for that original message. */
  latest: ChatMessage;
  /** An accepted empty-body revision represents a deleted message. */
  isDeleted: boolean;
  /** Source identity prevents a cached revision crossing a replaced entry. */
  originalData: string | null;
  originalSender: string | null;
  originalSignature: string | null;
};

/**
 * Resolve an active-chat entry to the latest visible revision already present
 * in a loaded conversation window. Matching the thread's original timestamp
 * and sender is intentional: an edit updates the preview body, but must not
 * make an older edited message become the group's newest activity.
 */
export function resolveGroupPreviewRevision(
  activeGroup: ActiveGroupChat,
  messages: ChatMessage[],
): GroupPreviewRevision | null {
  if (typeof activeGroup.timestamp !== 'number') {
    return null;
  }

  // Feed consumers omit deleted threads by default. Preview resolution includes
  // them only so the sidebar can recognize the deletion and suppress its stale
  // original body as soon as that conversation has been loaded.
  const matchingThread = buildMessageThreads(messages, { includeDeleted: true }).find((thread) => {
    if (activeGroup.signature && thread.original.signature !== activeGroup.signature) {
      return false;
    }

    if (thread.original.timestamp !== activeGroup.timestamp) {
      return false;
    }

    if (activeGroup.sender && thread.original.sender !== activeGroup.sender) {
      return false;
    }

    return !activeGroup.data || thread.original.data === activeGroup.data;
  });

  if (!matchingThread) {
    return null;
  }

  const decodedLatest = decodeChatMessage(matchingThread.latest);

  return {
    activityTimestamp: activeGroup.timestamp,
    isDeleted:
      matchingThread.revisions.length > 0 &&
      decodedLatest.kind === 'text' &&
      !decodedLatest.body,
    latest: matchingThread.latest,
    originalData: activeGroup.data ?? null,
    originalSender: activeGroup.sender ?? null,
    originalSignature: activeGroup.signature ?? null,
  };
}
