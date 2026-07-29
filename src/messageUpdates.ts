import type { ChatMessage } from './types';

const CHAT_MESSAGE_FIELDS = [
  'chatReference',
  'data',
  'decryptionStatus',
  'encoding',
  'epochId',
  'isEncrypted',
  'isText',
  'keyId',
  'recipient',
  'recipientName',
  'sender',
  'senderName',
  'signature',
  'status',
  'timestamp',
  'txGroupId',
] as const satisfies readonly (keyof ChatMessage)[];

function areChatMessagesEqual(first: ChatMessage, second: ChatMessage) {
  return CHAT_MESSAGE_FIELDS.every((field) => first[field] === second[field]);
}

export function areChatMessageListsEqual(first: ChatMessage[], second: ChatMessage[]) {
  return (
    first.length === second.length &&
    first.every((message, index) => areChatMessagesEqual(message, second[index]))
  );
}

/**
 * Quiet polls should preserve the current array identity when the node returns
 * the same logical messages. That lets React skip rebuilding the feed and,
 * critically, keeps an unchanged 15-second poll from perturbing scroll layout.
 */
export function retainChatMessagesWhenEqual(current: ChatMessage[], next: ChatMessage[]) {
  return areChatMessageListsEqual(current, next) ? current : next;
}
