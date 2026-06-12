import { DEFAULT_REACTION_OPTIONS, decodeChatMessage } from './chatText';
import { sortMessagesByTimestamp } from './messageThreads';
import type { ChatMessage } from './types';

export type MessageReactionSummary = {
  content: string;
  count: number;
  latestTimestamp: number;
  reactedBySelf: boolean;
  senders: string[];
};

type SenderReaction = {
  sender: string;
  timestamp: number;
};

const DEFAULT_REACTION_ORDER = new Map<string, number>(
  DEFAULT_REACTION_OPTIONS.map((reaction, index) => [reaction, index]),
);

export function getReactionPendingKey(messageSignature: string, reaction: string) {
  return `${messageSignature}\n${reaction}`;
}

export function buildMessageReactionIndex(messages: ChatMessage[], selfAddress: string | null) {
  const reactionIndex = new Map<string, MessageReactionSummary[]>();
  const reactionsByReference = new Map<string, Map<string, Map<string, SenderReaction>>>();

  for (const message of sortMessagesByTimestamp(messages)) {
    if (!message.chatReference) {
      continue;
    }

    const decoded = decodeChatMessage(message);

    if (decoded.kind !== 'reaction' || !decoded.reaction) {
      continue;
    }

    let reactionMap = reactionsByReference.get(message.chatReference);

    if (!reactionMap) {
      reactionMap = new Map();
      reactionsByReference.set(message.chatReference, reactionMap);
    }

    let senderMap = reactionMap.get(decoded.reaction.content);

    if (!senderMap) {
      senderMap = new Map();
      reactionMap.set(decoded.reaction.content, senderMap);
    }

    if (decoded.reaction.contentState) {
      senderMap.set(message.sender, {
        sender: message.sender,
        timestamp: message.timestamp,
      });
    } else {
      senderMap.delete(message.sender);
    }
  }

  for (const [messageSignature, reactionMap] of reactionsByReference) {
    const reactions: MessageReactionSummary[] = [];

    for (const [content, senderMap] of reactionMap) {
      const senderReactions = Array.from(senderMap.values());

      if (senderReactions.length === 0) {
        continue;
      }

      reactions.push({
        content,
        count: senderReactions.length,
        latestTimestamp: Math.max(...senderReactions.map((reaction) => reaction.timestamp)),
        reactedBySelf: selfAddress !== null && senderMap.has(selfAddress),
        senders: senderReactions.map((reaction) => reaction.sender),
      });
    }

    reactions.sort((first, second) => {
      const firstOrder = DEFAULT_REACTION_ORDER.get(first.content) ?? Number.MAX_SAFE_INTEGER;
      const secondOrder = DEFAULT_REACTION_ORDER.get(second.content) ?? Number.MAX_SAFE_INTEGER;

      return (
        firstOrder - secondOrder ||
        second.latestTimestamp - first.latestTimestamp ||
        first.content.localeCompare(second.content)
      );
    });

    reactionIndex.set(messageSignature, reactions);
  }

  return reactionIndex;
}
