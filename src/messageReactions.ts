import { decodeChatMessage } from './chatText';
import { sortMessagesByTimestamp } from './messageThreads';
import type { ChatMessage } from './types';

export type MessageReactionSummary = {
  content: string;
  count: number;
  earliestTimestamp: number;
  latestTimestamp: number;
  reactedBySelf: boolean;
  reactors: MessageReactionParticipant[];
};

export type MessageReactionParticipant = {
  sender: string;
  timestamp: number;
};

export function getReactionPendingKey(messageSignature: string, reaction: string) {
  return `${messageSignature}\n${reaction}`;
}

export function buildMessageReactionIndex(messages: ChatMessage[], selfAddress: string | null) {
  const reactionIndex = new Map<string, MessageReactionSummary[]>();
  const reactionsByReference = new Map<string, Map<string, Map<string, MessageReactionParticipant>>>();

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
      const senderReactions = Array.from(senderMap.values()).sort((first, second) => {
        return first.timestamp - second.timestamp || first.sender.localeCompare(second.sender);
      });

      if (senderReactions.length === 0) {
        continue;
      }

      reactions.push({
        content,
        count: senderReactions.length,
        earliestTimestamp: Math.min(...senderReactions.map((reaction) => reaction.timestamp)),
        latestTimestamp: Math.max(...senderReactions.map((reaction) => reaction.timestamp)),
        reactedBySelf: selfAddress !== null && senderMap.has(selfAddress),
        reactors: senderReactions,
      });
    }

    reactions.sort((first, second) => {
      return (
        first.earliestTimestamp - second.earliestTimestamp ||
        first.content.localeCompare(second.content)
      );
    });

    reactionIndex.set(messageSignature, reactions);
  }

  return reactionIndex;
}
