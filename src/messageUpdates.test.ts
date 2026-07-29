import { describe, expect, it } from 'vitest';
import { retainChatMessagesWhenEqual } from './messageUpdates';
import type { ChatMessage } from './types';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    data: 'body',
    decryptionStatus: 'DECRYPTED',
    encoding: 'BASE64',
    isEncrypted: false,
    isText: true,
    sender: 'Qsender',
    signature: 'signature-1',
    timestamp: 100,
    txGroupId: 7,
    ...overrides,
  };
}

describe('retainChatMessagesWhenEqual', () => {
  it('retains the current array for a logically identical quiet poll', () => {
    const current = [message(), message({ signature: 'signature-2', timestamp: 200 })];
    const next = current.map((entry) => ({ ...entry }));

    expect(retainChatMessagesWhenEqual(current, next)).toBe(current);
  });

  it('accepts a mutable decryption-field update to an existing message', () => {
    const current = [message({ data: null, decryptionStatus: 'PENDING', isEncrypted: true })];
    const next = [message({ data: 'decrypted', decryptionStatus: 'DECRYPTED', isEncrypted: true })];

    expect(retainChatMessagesWhenEqual(current, next)).toBe(next);
  });

  it('accepts a new edit revision', () => {
    const current = [message()];
    const next = [
      ...current,
      message({
        chatReference: 'signature-1',
        data: 'edited body',
        signature: 'signature-edit',
        timestamp: 200,
      }),
    ];

    expect(retainChatMessagesWhenEqual(current, next)).toBe(next);
  });

  it('accepts a new deletion revision', () => {
    const current = [message()];
    const next = [
      ...current,
      message({
        chatReference: 'signature-1',
        data: '',
        signature: 'signature-delete',
        timestamp: 200,
      }),
    ];

    expect(retainChatMessagesWhenEqual(current, next)).toBe(next);
  });

  it('accepts a newly received message', () => {
    const current = [message()];
    const next = [...current, message({ signature: 'signature-2', timestamp: 200 })];

    expect(retainChatMessagesWhenEqual(current, next)).toBe(next);
  });
});
