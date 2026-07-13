import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from './types';
import {
  CHAT_NOTIFICATIONS_STORAGE_KEY,
  DIRECT_MESSAGE_NOTIFICATION_ID,
  canManageChatNotifications,
  enableDirectMessageNotifications,
  getChatAttentionKind,
  readChatNotificationsEnabled,
  reconcileDirectMessageNotifications,
  writeChatNotificationsEnabled,
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

  it('persists and reads the explicit opt-in', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(readChatNotificationsEnabled(storage)).toBe(false);
    writeChatNotificationsEnabled(true, storage);
    expect(values.get(CHAT_NOTIFICATIONS_STORAGE_KEY)).toBe('{"enabled":true,"version":1}');
    expect(readChatNotificationsEnabled(storage)).toBe(true);
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

  it('reconciles only when Home still has a durable grant', async () => {
    const denied = vi.fn().mockResolvedValue({ granted: false });
    await expect(reconcileDirectMessageNotifications('Qme', 'DM', denied)).resolves.toBe(false);
    expect(denied).toHaveBeenCalledTimes(1);

    const granted = vi.fn()
      .mockResolvedValueOnce({ granted: true })
      .mockResolvedValueOnce({});
    await expect(reconcileDirectMessageNotifications('Qme', 'DM', granted)).resolves.toBe(true);
    expect(granted).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'NOTIFICATION_ADD' }));
  });
});

describe('live group attention detection', () => {
  const selfMessage = message({ sender: 'Qme', signature: 'self-signature' });

  it('detects a reply whose target was sent by the selected account', () => {
    expect(getChatAttentionKind({
      body: 'Reply body',
      message: message({ chatReference: 'self-signature' }),
      messages: [selfMessage],
      repliedTo: 'self-signature',
      selfAddress: 'Qme',
      selfName: 'Alice',
    })).toBe('reply');
  });

  it('detects an anchored, case-insensitive registered-name mention', () => {
    expect(getChatAttentionKind({
      body: 'Hello @aLiCe, are you there?',
      message: message(),
      messages: [],
      repliedTo: null,
      selfAddress: 'Qme',
      selfName: 'Alice',
    })).toBe('mention');
    expect(getChatAttentionKind({
      body: 'Hello @Alicezz',
      message: message(),
      messages: [],
      repliedTo: null,
      selfAddress: 'Qme',
      selfName: 'Alice',
    })).toBeNull();
  });

  it('never alerts for the selected account own message', () => {
    expect(getChatAttentionKind({
      body: '@Alice',
      message: selfMessage,
      messages: [selfMessage],
      repliedTo: 'self-signature',
      selfAddress: 'Qme',
      selfName: 'Alice',
    })).toBeNull();
  });
});
