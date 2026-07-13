import { qdnRequest } from './qdnRequest';
import type { ChatMessage, QdnAction } from './types';

export const DIRECT_MESSAGE_NOTIFICATION_ID = 'chat.direct';
export const CHAT_NOTIFICATIONS_STORAGE_KEY = 'qortium-chat-notifications-v1';
export const CHAT_APP_LINK = 'qdn://APP/Chat/Chat';

type NotificationPreference = {
  enabled: boolean;
  version: 1;
};

type QdnRequestFunction = typeof qdnRequest;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function canManageChatNotifications(actions: QdnAction[]) {
  const supported = new Set(actions.map((action) => action.toUpperCase()));

  return [
    'NOTIFICATION_HAS_PERMISSION',
    'NOTIFICATION_ADD',
    'NOTIFICATION_REMOVE',
  ].every((action) => supported.has(action));
}

export function canShowChatNotifications(actions: QdnAction[]) {
  return actions.some((action) => action.toUpperCase() === 'SHOW_NOTIFICATION');
}

export function readChatNotificationsEnabled(storage: Pick<Storage, 'getItem'> = window.localStorage) {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CHAT_NOTIFICATIONS_STORAGE_KEY) ?? 'null');
    return isRecord(parsed) && parsed.version === 1 && parsed.enabled === true;
  } catch {
    return false;
  }
}

export function writeChatNotificationsEnabled(
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  const preference: NotificationPreference = { enabled, version: 1 };
  try {
    storage.setItem(CHAT_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // The active session can still honor the choice when storage is unavailable.
  }
}

function directMessageSubscription(accountAddress: string, title: string) {
  return {
    event: 'CHAT_MESSAGE',
    filters: { recipient: accountAddress },
    link: CHAT_APP_LINK,
    notificationId: DIRECT_MESSAGE_NOTIFICATION_ID,
    title,
  };
}

export async function enableDirectMessageNotifications(
  accountAddress: string,
  title: string,
  request: QdnRequestFunction = qdnRequest,
) {
  await request({
    action: 'NOTIFICATION_ADD',
    subscriptions: [directMessageSubscription(accountAddress, title)],
  });
}

export async function disableDirectMessageNotifications(request: QdnRequestFunction = qdnRequest) {
  await request({
    action: 'NOTIFICATION_REMOVE',
    notificationIds: [DIRECT_MESSAGE_NOTIFICATION_ID],
  });
}

// Re-register an enabled preference for the current account without ever
// prompting. If Home's durable grant was revoked, turn the local preference off
// so reopening Chat does not repeatedly ask for permission.
export async function reconcileDirectMessageNotifications(
  accountAddress: string,
  title: string,
  request: QdnRequestFunction = qdnRequest,
) {
  const permission = await request<unknown>({ action: 'NOTIFICATION_HAS_PERMISSION' });
  const granted = isRecord(permission) && permission.granted === true;

  if (!granted) {
    return false;
  }

  await enableDirectMessageNotifications(accountAddress, title, request);
  return true;
}

function buildMentionPattern(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${escapedName}(?![\\w-])`, 'i');
}

export type ChatAttentionKind = 'mention' | 'reply';

export function getChatAttentionKind({
  body,
  message,
  messages,
  repliedTo,
  selfAddress,
  selfName,
}: {
  body: string;
  message: ChatMessage;
  messages: ChatMessage[];
  repliedTo: string | null | undefined;
  selfAddress: string;
  selfName: string | null;
}): ChatAttentionKind | null {
  if (message.sender === selfAddress) {
    return null;
  }

  if (repliedTo) {
    const target = messages.find((candidate) => candidate.signature === repliedTo);
    if (target?.sender === selfAddress) {
      return 'reply';
    }
  }

  if (selfName && buildMentionPattern(selfName).test(body)) {
    return 'mention';
  }

  return null;
}

export async function showChatAttentionNotification(
  title: string,
  request: QdnRequestFunction = qdnRequest,
) {
  return request({ action: 'SHOW_NOTIFICATION', title });
}
