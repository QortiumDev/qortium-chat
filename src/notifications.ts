import { qdnRequest } from './qdnRequest';
import type { ChatMessage, QdnAction } from './types';

export const DIRECT_MESSAGE_NOTIFICATION_ID = 'chat.direct';
export const CHAT_NOTIFICATIONS_STORAGE_KEY = 'qortium-chat-notifications-v2';
export const LEGACY_CHAT_NOTIFICATIONS_STORAGE_KEY = 'qortium-chat-notifications-v1';
export const CHAT_APP_LINK = 'qdn://APP/Chat/Chat';

export type ChatNotificationPreferences = {
  direct: boolean;
  mentions: boolean;
  replies: boolean;
  version: 2;
};

export const DISABLED_CHAT_NOTIFICATION_PREFERENCES: ChatNotificationPreferences = {
  direct: false,
  mentions: false,
  replies: false,
  version: 2,
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

function isChatNotificationPreferences(value: unknown): value is ChatNotificationPreferences {
  return (
    isRecord(value) &&
    value.version === 2 &&
    typeof value.direct === 'boolean' &&
    typeof value.mentions === 'boolean' &&
    typeof value.replies === 'boolean'
  );
}

export function hasAnyChatNotificationsEnabled(preferences: ChatNotificationPreferences) {
  return preferences.direct || preferences.mentions || preferences.replies;
}

export function readChatNotificationPreferences(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): ChatNotificationPreferences {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(CHAT_NOTIFICATIONS_STORAGE_KEY) ?? 'null');

    if (isChatNotificationPreferences(parsed)) {
      return parsed;
    }

    const legacy: unknown = JSON.parse(storage.getItem(LEGACY_CHAT_NOTIFICATIONS_STORAGE_KEY) ?? 'null');
    if (isRecord(legacy) && legacy.version === 1 && legacy.enabled === true) {
      return { direct: true, mentions: true, replies: true, version: 2 };
    }
  } catch {
    // Invalid or unavailable storage falls back to an explicit opt-out.
  }

  return { ...DISABLED_CHAT_NOTIFICATION_PREFERENCES };
}

export function writeChatNotificationPreferences(
  preferences: ChatNotificationPreferences,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  try {
    storage.setItem(CHAT_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(preferences));
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
export async function reconcileChatNotifications(
  accountAddress: string,
  title: string,
  preferences: ChatNotificationPreferences,
  request: QdnRequestFunction = qdnRequest,
) {
  const permission = await request<unknown>({ action: 'NOTIFICATION_HAS_PERMISSION' });
  const granted = isRecord(permission) && permission.granted === true;

  if (!granted) {
    return false;
  }

  if (preferences.direct) {
    await enableDirectMessageNotifications(accountAddress, title, request);
  } else {
    await disableDirectMessageNotifications(request);
  }
  return true;
}

function buildMentionPattern(name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${escapedName}(?![\\w-])`, 'i');
}

export type ChatAttentionKind = 'mention' | 'reply';

export function getEnabledChatAttentionKind(
  attention: ChatAttentionKind[],
  preferences: ChatNotificationPreferences,
) {
  return attention.find((kind) => (
    kind === 'reply' ? preferences.replies : preferences.mentions
  )) ?? null;
}

export function getChatAttentionKinds({
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
}): ChatAttentionKind[] {
  if (message.sender === selfAddress) {
    return [];
  }

  const attention: ChatAttentionKind[] = [];

  if (repliedTo) {
    const target = messages.find((candidate) => candidate.signature === repliedTo);
    if (target?.sender === selfAddress) {
      attention.push('reply');
    }
  }

  if (selfName && buildMentionPattern(selfName).test(body)) {
    attention.push('mention');
  }

  return attention;
}

export async function showChatAttentionNotification(
  title: string,
  request: QdnRequestFunction = qdnRequest,
) {
  return request({ action: 'SHOW_NOTIFICATION', title });
}
