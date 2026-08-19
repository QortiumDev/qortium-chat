import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatNetwork } from './types';
import {
  CHAT_NOTIFICATION_TEXT_MAX_LENGTH,
  CHAT_NOTIFICATION_TITLE_MAX_LENGTH,
  CHAT_NOTIFICATIONS_STORAGE_KEY,
  DIRECT_MESSAGE_NOTIFICATION_ID,
  DIRECT_MESSAGE_SUBSCRIPTION_FILTER_KEYS,
  LEGACY_CHAT_NOTIFICATIONS_STORAGE_KEY,
  buildShowChatNotificationRequest,
  canManageChatNotifications,
  enableDirectMessageNotifications,
  hasNotificationPermission,
  isChatNotificationTriggerEnabled,
  isNotifiableChatActivityMessage,
  getEnabledChatAttentionKind,
  getChatSelfIdentity,
  getChatAttentionKinds,
  hasAnyChatNotificationsEnabled,
  isIncomingChatMessage,
  readChatNotificationPreferences,
  reconcileChatNotifications,
  selectDirectActivityNotification,
  selectNewChatActivityMessage,
  showChatNotification,
  writeChatNotificationPreferences,
  type ChatNotificationPreferences,
} from './notifications';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    sender: 'Qsender',
    timestamp: 1,
    txGroupId: 7,
    ...overrides,
  };
}

describe('chat notification preferences', () => {
  it('requires the complete background-notification bridge surface', () => {
    expect(canManageChatNotifications([
      'NOTIFICATION_HAS_PERMISSION',
      'NOTIFICATION_ADD',
      'NOTIFICATION_REMOVE',
    ])).toBe(true);
    expect(canManageChatNotifications(['NOTIFICATION_ADD', 'NOTIFICATION_REMOVE'])).toBe(false);
  });

  it('persists and reads fine-grained preferences', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(readChatNotificationPreferences(storage)).toEqual({
      direct: false,
      mentions: false,
      replies: false,
      version: 2,
    });
    writeChatNotificationPreferences({ direct: true, mentions: false, replies: true, version: 2 }, storage);
    expect(values.get(CHAT_NOTIFICATIONS_STORAGE_KEY)).toBe(
      '{"direct":true,"mentions":false,"replies":true,"version":2}',
    );
    expect(readChatNotificationPreferences(storage)).toEqual({
      direct: true,
      mentions: false,
      replies: true,
      version: 2,
    });
  });

  it('migrates the legacy bell choice without changing effective behavior', () => {
    const values = new Map<string, string>([
      [LEGACY_CHAT_NOTIFICATIONS_STORAGE_KEY, '{"enabled":true,"version":1}'],
    ]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };

    expect(readChatNotificationPreferences(storage)).toEqual({
      direct: true,
      mentions: true,
      replies: true,
      version: 2,
    });
    expect(hasAnyChatNotificationsEnabled(readChatNotificationPreferences(storage))).toBe(true);
  });

  it('registers one incoming-direct rule for the selected account', async () => {
    const request = vi.fn().mockResolvedValue({});
    await enableDirectMessageNotifications('Qme', 'New direct message', request);

    expect(request).toHaveBeenCalledWith({
      action: 'NOTIFICATION_ADD',
      subscriptions: [{
        event: 'CHAT_MESSAGE',
        filters: { recipient: 'Qme' },
        link: 'qdn://APP/Chat/Chat',
        notificationId: DIRECT_MESSAGE_NOTIFICATION_ID,
        title: 'New direct message',
      }],
    });
  });

  // Guard for the machine-message limitation documented above
  // directMessageSubscription: the rule is address-scoped only. Core validates
  // CHAT_MESSAGE filters against a fixed allowlist (recipient/sender/txGroupId/
  // involving) and rejects the whole registration on an unknown key, so a
  // well-meaning attempt to add a content predicate here would not hide machine
  // direct messages — it would disable every direct-message notification.
  it('keeps the direct rule address-scoped with no content predicate', async () => {
    const request = vi.fn().mockResolvedValue({});
    await enableDirectMessageNotifications('Qme', 'New direct message', request);

    const [{ subscriptions }] = request.mock.calls[0] as [{
      subscriptions: { filters: Record<string, unknown> }[];
    }];

    expect(Object.keys(subscriptions[0].filters)).toEqual([
      ...DIRECT_MESSAGE_SUBSCRIPTION_FILTER_KEYS,
    ]);
    expect(DIRECT_MESSAGE_SUBSCRIPTION_FILTER_KEYS).toEqual(['recipient']);
  });

  it('reconciles the direct rule only when selected and Home still has a durable grant', async () => {
    const denied = vi.fn().mockResolvedValue({ granted: false });
    await expect(reconcileChatNotifications(
      'Qme',
      'DM',
      { direct: true, mentions: true, replies: true, version: 2 },
      denied,
    )).resolves.toBe(false);
    expect(denied).toHaveBeenCalledTimes(1);

    const granted = vi.fn()
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({});
    await expect(reconcileChatNotifications(
      'Qme',
      'DM',
      { direct: true, mentions: false, replies: false, version: 2 },
      granted,
    )).resolves.toBe(true);
    expect(granted).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'NOTIFICATION_ADD' }));

    const liveOnly = vi.fn()
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({});
    await expect(reconcileChatNotifications(
      'Qme',
      'DM',
      { direct: false, mentions: true, replies: true, version: 2 },
      liveOnly,
    )).resolves.toBe(true);
    expect(liveOnly).toHaveBeenLastCalledWith({
      action: 'NOTIFICATION_REMOVE',
      notificationIds: [DIRECT_MESSAGE_NOTIFICATION_ID],
    });
  });
});

describe('live group attention detection', () => {
  const selfMessage = message({ sender: 'Qme', signature: 'self-signature' });

  it('detects a reply whose target was sent by the selected account', () => {
    expect(getChatAttentionKinds({
      body: 'Reply body',
      message: message({ chatReference: 'self-signature' }),
      messages: [selfMessage],
      repliedTo: 'self-signature',
      selfAddress: 'Qme',
      selfName: 'Alice',
    })).toEqual(['reply']);
  });

  it('detects an anchored, case-insensitive registered-name mention', () => {
    expect(getChatAttentionKinds({
      body: 'Hello @aLiCe, are you there?',
      message: message(),
      messages: [],
      repliedTo: null,
      selfAddress: 'Qme',
      selfName: 'Alice',
    })).toEqual(['mention']);
    expect(getChatAttentionKinds({
      body: 'Hello @Alicezz',
      message: message(),
      messages: [],
      repliedTo: null,
      selfAddress: 'Qme',
      selfName: 'Alice',
    })).toEqual([]);
  });

  it('reports both categories so either enabled preference can match', () => {
    const attention = getChatAttentionKinds({
      body: 'Replying to @Alice',
      message: message({ chatReference: 'self-signature' }),
      messages: [selfMessage],
      repliedTo: 'self-signature',
      selfAddress: 'Qme',
      selfName: 'Alice',
    });

    expect(attention).toEqual(['reply', 'mention']);
    expect(getEnabledChatAttentionKind(
      attention,
      { direct: false, mentions: true, replies: false, version: 2 },
    )).toBe('mention');
    expect(getEnabledChatAttentionKind(
      attention,
      { direct: false, mentions: false, replies: true, version: 2 },
    )).toBe('reply');
    expect(getEnabledChatAttentionKind(
      attention,
      { direct: true, mentions: false, replies: false, version: 2 },
    )).toBeNull();
  });

  it('never alerts for the selected account own message', () => {
    expect(getChatAttentionKinds({
      body: '@Alice',
      message: selfMessage,
      messages: [selfMessage],
      repliedTo: 'self-signature',
      selfAddress: 'Qme',
      selfName: 'Alice',
    })).toEqual([]);
  });
});

describe('selected-chat self identity', () => {
  const qortiumAccount = { address: 'QortiumAddress', name: 'QortiumName' };
  const qortalAccount = { address: 'QortalAddress', name: 'QortalName' };

  it('uses the Qortium identity for a Qortium chat', () => {
    expect(getChatSelfIdentity('qortium', qortiumAccount, qortalAccount)).toEqual({
      address: 'QortiumAddress',
      name: 'QortiumName',
    });
  });

  it('uses the Qortal identity for a Qortal chat', () => {
    expect(getChatSelfIdentity('qortal', qortiumAccount, qortalAccount)).toEqual({
      address: 'QortalAddress',
      name: 'QortalName',
    });
  });

  it('does not fall back across chains when the selected chain identity is unavailable', () => {
    expect(getChatSelfIdentity('qortal', qortiumAccount, null)).toEqual({
      address: null,
      name: null,
    });
  });

  it('does not classify messages while the selected chain identity is refreshing', () => {
    expect(isIncomingChatMessage('QortalOldOrOther', null)).toBe(false);
    expect(isIncomingChatMessage('QortalMe', 'QortalMe')).toBe(false);
    expect(isIncomingChatMessage('QortalOther', 'QortalMe')).toBe(true);
  });
});

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);

  return btoa(String.fromCharCode(...bytes));
}

const machineEnvelope = base64(JSON.stringify({ app: 'chess', qch1: { type: 'move', move: 'e2e4' } }));
const reactionEnvelope = base64(JSON.stringify({ content: '👍', contentState: true, message: '', type: 'reaction' }));

describe('Home 2 network-aware SHOW_NOTIFICATION (P6a)', () => {
  it('routes through the invoked network bridge and caps title/text client-side', async () => {
    const request = vi.fn().mockResolvedValue({ network: 'qortium', shown: true });
    const overlongTitle = 'T'.repeat(CHAT_NOTIFICATION_TITLE_MAX_LENGTH + 20);
    const overlongText = 'B'.repeat(CHAT_NOTIFICATION_TEXT_MAX_LENGTH + 20);

    const result = await showChatNotification(
      'qortium',
      { title: overlongTitle, text: overlongText },
      ['SHOW_NOTIFICATION'],
      request,
    );

    expect(result).toEqual({ network: 'qortium', shown: true });
    expect(request).toHaveBeenCalledTimes(1);
    const [network, sentRequest] = request.mock.calls[0] as [ChatNetwork, { text: string; title: string }];
    expect(network).toBe('qortium');
    expect(sentRequest.title).toHaveLength(CHAT_NOTIFICATION_TITLE_MAX_LENGTH);
    expect(sentRequest.text).toHaveLength(CHAT_NOTIFICATION_TEXT_MAX_LENGTH);
  });

  it('never sends a title/text under the cap', () => {
    expect(buildShowChatNotificationRequest({ title: 'short', text: 'short' })).toEqual({
      action: 'SHOW_NOTIFICATION',
      text: 'short',
      title: 'short',
    });
  });

  it('includes the chain-qualified conversation source only when supplied', () => {
    expect(buildShowChatNotificationRequest({
      source: { conversation: { groupId: 12, kind: 'group' }, kind: 'chat' },
      text: 'Alice mentioned you in Builders',
      title: 'New mention',
    })).toEqual({
      action: 'SHOW_NOTIFICATION',
      source: { conversation: { groupId: 12, kind: 'group' }, kind: 'chat' },
      text: 'Alice mentioned you in Builders',
      title: 'New mention',
    });
  });

  it('never calls the bridge when SHOW_NOTIFICATION is not advertised — quiet, not thrown', async () => {
    const request = vi.fn();

    await expect(showChatNotification('qortal', { title: 't', text: 'x' }, [], request)).resolves.toEqual({
      reason: 'unsupported',
      shown: false,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('passes a suppressed shown:false result straight through as quiet state, not an error', async () => {
    const request = vi.fn().mockResolvedValue({ network: 'qortal', reason: 'focused', shown: false });

    await expect(
      showChatNotification('qortal', { title: 't', text: 'x' }, ['SHOW_NOTIFICATION'], request),
    ).resolves.toEqual({ network: 'qortal', reason: 'focused', shown: false });
  });

  it('swallows a transient bridge failure into a quiet unsupported outcome', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(
      showChatNotification('qortium', { title: 't', text: 'x' }, ['SHOW_NOTIFICATION'], request),
    ).resolves.toEqual({ reason: 'unsupported', shown: false });
  });

  it('checks the durable app permission only when advertised, per network', async () => {
    const granted = vi.fn().mockResolvedValue({ granted: true });

    await expect(hasNotificationPermission('qortal', ['NOTIFICATION_HAS_PERMISSION'], granted)).resolves.toBe(true);
    expect(granted).toHaveBeenCalledWith('qortal', { action: 'NOTIFICATION_HAS_PERMISSION' });

    const notAdvertised = vi.fn();
    await expect(hasNotificationPermission('qortium', [], notAdvertised)).resolves.toBe(false);
    expect(notAdvertised).not.toHaveBeenCalled();

    const denied = vi.fn().mockResolvedValue({ granted: false });
    await expect(hasNotificationPermission('qortium', ['NOTIFICATION_HAS_PERMISSION'], denied)).resolves.toBe(false);

    const throws = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(hasNotificationPermission('qortium', ['NOTIFICATION_HAS_PERMISSION'], throws)).resolves.toBe(false);
  });
});

describe('foreground notification trigger decision (P6a)', () => {
  const enabledPreferences: ChatNotificationPreferences = { direct: true, mentions: true, replies: true, version: 2 };
  const directOnlyPreferences: ChatNotificationPreferences = { direct: true, mentions: false, replies: false, version: 2 };

  it('maps each trigger kind to its own bell preference', () => {
    expect(isChatNotificationTriggerEnabled('direct', directOnlyPreferences)).toBe(true);
    expect(isChatNotificationTriggerEnabled('mention', directOnlyPreferences)).toBe(false);
    expect(isChatNotificationTriggerEnabled('reply', directOnlyPreferences)).toBe(false);
    expect(isChatNotificationTriggerEnabled('mention', enabledPreferences)).toBe(true);
    expect(isChatNotificationTriggerEnabled('reply', enabledPreferences)).toBe(true);
  });

  it('classifies own messages, machine envelopes, reactions, and edits as not notifiable', () => {
    expect(isNotifiableChatActivityMessage(message({ sender: 'Qme' }), 'Qme')).toBe(false);
    expect(isNotifiableChatActivityMessage(
      message({ data: machineEnvelope, isText: true, sender: 'Qother' }),
      'Qme',
    )).toBe(false);
    expect(isNotifiableChatActivityMessage(
      message({ data: reactionEnvelope, isText: true, sender: 'Qother' }),
      'Qme',
    )).toBe(false);
    // An edit/delete revision targets an earlier message via chatReference —
    // it is not new activity from the other party's perspective.
    expect(isNotifiableChatActivityMessage(
      message({ chatReference: 'original-signature', data: base64('edited body'), isText: true, sender: 'Qother' }),
      'Qme',
    )).toBe(false);
    expect(isNotifiableChatActivityMessage(
      message({ data: base64('hi'), isText: true, sender: 'Qother' }),
      'Qme',
    )).toBe(true);
  });

  describe('selectNewChatActivityMessage', () => {
    it('never reports pre-existing history as new on the first hydration of a conversation', () => {
      const candidate = selectNewChatActivityMessage({
        isInitialHydration: true,
        messages: [message({ data: base64('hi'), isText: true, sender: 'Qother', timestamp: 100 })],
        selfAddress: 'Qme',
        sinceTimestamp: null,
      });

      expect(candidate).toBeNull();
    });

    it('only reports activity strictly newer than the previously-known baseline', () => {
      const stale = message({ data: base64('old'), isText: true, sender: 'Qother', timestamp: 100 });
      const fresh = message({ data: base64('new'), isText: true, sender: 'Qother', timestamp: 150 });

      expect(selectNewChatActivityMessage({
        isInitialHydration: false,
        messages: [stale],
        selfAddress: 'Qme',
        sinceTimestamp: 100,
      })).toBeNull();

      expect(selectNewChatActivityMessage({
        isInitialHydration: false,
        messages: [stale, fresh],
        selfAddress: 'Qme',
        sinceTimestamp: 100,
      })).toEqual(fresh);
    });

    it('never own-message or machine/reaction envelopes, even when strictly newer', () => {
      const own = message({ data: base64('mine'), isText: true, sender: 'Qme', timestamp: 200 });
      const machine = message({ data: machineEnvelope, isText: true, sender: 'Qother', timestamp: 201 });

      expect(selectNewChatActivityMessage({
        isInitialHydration: false,
        messages: [own, machine],
        selfAddress: 'Qme',
        sinceTimestamp: 100,
      })).toBeNull();
    });

    it('collapses several new messages in one sweep into a single (the newest) candidate', () => {
      const first = message({ data: base64('one'), isText: true, sender: 'Qother', signature: 'sig-1', timestamp: 110 });
      const second = message({ data: base64('two'), isText: true, sender: 'Qother', signature: 'sig-2', timestamp: 120 });
      const third = message({ data: base64('three'), isText: true, sender: 'Qother', signature: 'sig-3', timestamp: 130 });

      const candidate = selectNewChatActivityMessage({
        isInitialHydration: false,
        messages: [first, third, second],
        selfAddress: 'Qme',
        sinceTimestamp: 100,
      });

      expect(candidate).toEqual(third);
    });
  });

  describe('selectDirectActivityNotification', () => {
    const incoming = message({ data: base64('hi'), isText: true, sender: 'Qother', timestamp: 150 });

    it('gates on the direct-activity preference before the message selection', () => {
      expect(selectDirectActivityNotification({
        isInitialHydration: false,
        messages: [incoming],
        preferences: { direct: false, mentions: true, replies: true, version: 2 },
        selfAddress: 'Qme',
        sinceTimestamp: 100,
      })).toBeNull();

      expect(selectDirectActivityNotification({
        isInitialHydration: false,
        messages: [incoming],
        preferences: directOnlyPreferences,
        selfAddress: 'Qme',
        sinceTimestamp: 100,
      })).toEqual(incoming);
    });

    it('still suppresses on initial hydration even when the preference is on', () => {
      expect(selectDirectActivityNotification({
        isInitialHydration: true,
        messages: [incoming],
        preferences: directOnlyPreferences,
        selfAddress: 'Qme',
        sinceTimestamp: null,
      })).toBeNull();
    });
  });
});
