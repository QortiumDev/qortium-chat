import { bridgeRequest } from './chatNetwork';
import { isHiddenChatMessage } from './chatText';
import { qdnRequest } from './qdnRequest';
import type { ChatMessage, ChatNetwork, QdnAction } from './types';

export const DIRECT_MESSAGE_NOTIFICATION_ID = 'chat.direct';
export const CHAT_NOTIFICATIONS_STORAGE_KEY = 'qortium-chat-notifications-v2';
export const LEGACY_CHAT_NOTIFICATIONS_STORAGE_KEY = 'qortium-chat-notifications-v1';

type ChatAccountIdentity = {
  address: string;
  name?: string | null;
};

export function getChatSelfIdentity(
  network: ChatNetwork,
  qortiumAccount: ChatAccountIdentity | null,
  qortalAccount: ChatAccountIdentity | null,
) {
  const selectedAccount = network === 'qortal' ? qortalAccount : qortiumAccount;

  return {
    address: selectedAccount?.address ?? null,
    name: selectedAccount?.name ?? null,
  };
}

export function isIncomingChatMessage(sender: string, selfAddress: string | null) {
  return selfAddress !== null && sender !== selfAddress;
}

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

// Filter keys Core accepts for a CHAT_MESSAGE subscription. Core validates the
// whole registration against this allowlist and rejects an unknown key outright,
// so adding a key here that Core does not know would silently disable every
// direct-message notification rather than narrow it.
export const DIRECT_MESSAGE_SUBSCRIPTION_FILTER_KEYS = ['recipient'] as const;

// KNOWN LIMITATION — machine messages still notify.
//
// This rule is evaluated by Core, not by Chat. Core's CHAT_MESSAGE event carries
// only sender/recipient/txGroupId/isText/isEncrypted/signature/created: message
// content is deliberately never included, "including for plaintext chats"
// (NotificationManager.onChatMessage). The only filter keys Core accepts are
// recipient, sender, txGroupId, and involving — all address-scoped, with no
// content predicate and no exclusion form.
//
// So a machine direct message (an app-to-app envelope hidden from the feed by
// isMachineChatMessage) still raises Home's "New direct message" notification.
// Chat cannot suppress it: registration is fire-and-forget, the event never
// reaches this app, and Home displays it without asking. Same root cause as
// edits and reactions notifying.
//
// Suppressing it requires Home to resolve the signature to the transaction,
// decrypt it, and classify it before displaying — Core cannot do it at all,
// because direct chats are encrypted to the recipient's key. Do not attempt a
// fix here; there is no app-side lever.
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

// --- Home 2 network-aware notifications (P6a) --------------------------------
//
// Home 2 advertises only NOTIFICATION_HAS_PERMISSION and SHOW_NOTIFICATION on
// BOTH bridge globals (docs/HOME_V2_APP_NOTIFICATIONS.md). The invoked global
// is the authoritative chain, so every call below is routed through
// bridgeRequest(network, ...) rather than the qdn-only `qdnRequest` the legacy
// flow above uses. NOTIFICATION_ADD/REMOVE were deliberately not migrated —
// legacy hosts only — so this section never touches them.

export const CHAT_NOTIFICATION_TITLE_MAX_LENGTH = 80;
export const CHAT_NOTIFICATION_TEXT_MAX_LENGTH = 240;

type BridgeRequestFunction = typeof bridgeRequest;

export type ChatNotificationConversationSource =
  | { conversation: { groupId: number; kind: 'group' }; kind: 'chat' }
  | { conversation: { kind: 'direct'; otherAddress: string }; kind: 'chat' };

export type ShowChatNotificationInput = {
  source?: ChatNotificationConversationSource;
  text: string;
  title: string;
};

export type ShowChatNotificationReason =
  | 'disabled'
  | 'focused'
  | 'muted'
  | 'rate-limited'
  | 'revoked'
  | 'unsupported';

export type ShowChatNotificationResult = {
  network?: ChatNetwork;
  reason?: ShowChatNotificationReason;
  shown: boolean;
  source?: ChatNotificationConversationSource;
};

function truncateNotificationField(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

// Home already normalizes/strips/collapses whitespace and enforces its own
// caps server-side; this is a client-side courtesy truncation only, so a long
// title/text never gets silently rejected instead of shown.
export function buildShowChatNotificationRequest(input: ShowChatNotificationInput) {
  return {
    action: 'SHOW_NOTIFICATION',
    text: truncateNotificationField(input.text, CHAT_NOTIFICATION_TEXT_MAX_LENGTH),
    title: truncateNotificationField(input.title, CHAT_NOTIFICATION_TITLE_MAX_LENGTH),
    ...(input.source ? { source: input.source } : {}),
  };
}

// SHOW_NOTIFICATION never throws to its caller: a `shown: false` result (with
// a reason) and a transient bridge/network failure are both quiet outcomes —
// the caller is typically inside a live message-detection sweep and a
// notification is inherently best-effort, never something that should
// interrupt the chat stream.
export async function showChatNotification(
  network: ChatNetwork,
  input: ShowChatNotificationInput,
  actions: QdnAction[],
  request: BridgeRequestFunction = bridgeRequest,
): Promise<ShowChatNotificationResult> {
  if (!canShowChatNotifications(actions)) {
    return { reason: 'unsupported', shown: false };
  }

  try {
    const result = await request<unknown>(network, buildShowChatNotificationRequest(input));

    if (isRecord(result) && typeof result.shown === 'boolean') {
      return result as unknown as ShowChatNotificationResult;
    }

    return { reason: 'unsupported', shown: false };
  } catch {
    return { reason: 'unsupported', shown: false };
  }
}

// The one durable app-scoped permission is shared across both bridge
// protocols/networks (see the contract doc), so either invoked global can
// answer it; callers still pass the network they care about attributing the
// check to, matching every other bridgeRequest call in this app.
export async function hasNotificationPermission(
  network: ChatNetwork,
  actions: QdnAction[],
  request: BridgeRequestFunction = bridgeRequest,
): Promise<boolean> {
  if (!hasActionAdvertised(actions, 'NOTIFICATION_HAS_PERMISSION')) {
    return false;
  }

  try {
    const result = await request<unknown>(network, { action: 'NOTIFICATION_HAS_PERMISSION' });

    return isRecord(result) && result.granted === true;
  } catch {
    return false;
  }
}

function hasActionAdvertised(actions: QdnAction[], action: string) {
  return actions.some((candidate) => candidate.toUpperCase() === action);
}

// --- Foreground trigger-decision logic (P6a) ---------------------------------
//
// Home 2 owns no durable subscription rule, so Chat's own foreground
// detection decides whether a piece of freshly-observed activity is worth a
// SHOW_NOTIFICATION call. These are pure functions: no bridge calls, no
// storage, no React state — every input is explicit so the decision is fully
// unit-testable.

export type ChatNotificationTriggerKind = 'direct' | 'mention' | 'reply';

export function isChatNotificationTriggerEnabled(
  kind: ChatNotificationTriggerKind,
  preferences: ChatNotificationPreferences,
) {
  if (kind === 'direct') {
    return preferences.direct;
  }

  return kind === 'reply' ? preferences.replies : preferences.mentions;
}

// A message is eligible to drive a foreground notification only when it is a
// real, freshly-arrived, other-party message: not a reaction/machine envelope
// (isHiddenChatMessage — the same filter the sidebar activity/unread state
// already applies), not an edit/delete revision of an earlier message (a
// chatReference-bearing message modifies something already seen, it is not
// new activity), and not sent by the selected account itself.
export function isNotifiableChatActivityMessage(message: ChatMessage, selfAddress: string) {
  return (
    !isHiddenChatMessage(message) &&
    !message.chatReference &&
    message.sender !== selfAddress
  );
}

// Picks at most one message per call — the correctness point for both the
// initial-hydration/fresh-activity distinction and the "one notification per
// conversation per sweep" collapse:
//
// - `isInitialHydration` is true exactly when the caller has never hydrated
//   this conversation's activity before (mirrors the App.tsx skip-check
//   `!loadedDirectActivityRef.current.has(address)` used for the sidebar
//   activity sweep) — pre-existing history must never be reported as new.
// - `sinceTimestamp` is the conversation's previously-known activity
//   timestamp (App.tsx's loadedDirectActivityByAddress/loadedGroupActivityById
//   value before this fetch, or null if none is known yet); only messages
//   strictly newer are candidates, so a sweep that re-fetches the same window
//   never re-notifies for activity it already reported.
// - Collapse to a single candidate (the newest eligible message) so a sweep
//   that discovers several new messages for one conversation at once still
//   triggers at most one SHOW_NOTIFICATION call for it, mirroring how the
//   legacy background rule surfaced one "new direct message" event rather
//   than one per message.
export function selectNewChatActivityMessage({
  isInitialHydration,
  messages,
  selfAddress,
  sinceTimestamp,
}: {
  isInitialHydration: boolean;
  messages: ChatMessage[];
  selfAddress: string;
  sinceTimestamp: number | null;
}): ChatMessage | null {
  if (isInitialHydration) {
    return null;
  }

  let candidate: ChatMessage | null = null;

  for (const message of messages) {
    if (!isNotifiableChatActivityMessage(message, selfAddress)) {
      continue;
    }

    if (sinceTimestamp !== null && message.timestamp <= sinceTimestamp) {
      continue;
    }

    if (!candidate || message.timestamp > candidate.timestamp) {
      candidate = message;
    }
  }

  return candidate;
}

// Combines the message selection above with the per-choice preference gate,
// for the common case of "is there a message here worth a direct-activity
// notification at all" — given preferences + message classification +
// baseline state → notify or not.
export function selectDirectActivityNotification({
  isInitialHydration,
  messages,
  preferences,
  selfAddress,
  sinceTimestamp,
}: {
  isInitialHydration: boolean;
  messages: ChatMessage[];
  preferences: ChatNotificationPreferences;
  selfAddress: string;
  sinceTimestamp: number | null;
}): ChatMessage | null {
  if (!isChatNotificationTriggerEnabled('direct', preferences)) {
    return null;
  }

  return selectNewChatActivityMessage({ isInitialHydration, messages, selfAddress, sinceTimestamp });
}
