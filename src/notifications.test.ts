import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from './types';
import {
  CHAT_NOTIFICATIONS_STORAGE_KEY,
  DIRECT_MESSAGE_NOTIFICATION_ID,
  LEGACY_CHAT_NOTIFICATIONS_STORAGE_KEY,
  canManageChatNotifications,
  enableDirectMessageNotifications,
  getEnabledChatAttentionKind,
  getChatAttentionKinds,
  hasAnyChatNotificationsEnabled,
  readChatNotificationPreferences,
  reconcileChatNotifications,
  writeChatNotificationPreferences,
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
