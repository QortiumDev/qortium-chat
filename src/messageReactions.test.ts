import { describe, expect, it } from 'vitest';
import { buildReactionMessageText } from './chatText';
import { buildMessageReactionIndex, getReactionPendingKey } from './messageReactions';
import type { ChatMessage } from './types';

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);

  return btoa(String.fromCharCode(...bytes));
}

function message(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'sender' | 'timestamp'>): ChatMessage {
  return {
    txGroupId: 7,
    ...overrides,
  };
}

function reaction({
  chatReference = 'sig-a',
  content = '👍',
  contentState = true,
  sender,
  timestamp,
}: {
  chatReference?: string;
  content?: string;
  contentState?: boolean;
  sender: string;
  timestamp: number;
}) {
  return message({
    chatReference,
    data: base64(buildReactionMessageText(content, contentState)),
    encoding: 'BASE64',
    isEncrypted: false,
    isText: true,
    sender,
    signature: `reaction-${sender}-${timestamp}`,
    timestamp,
  });
}

describe('message reaction helpers', () => {
  it('builds stable pending keys for target message and emoji pairs', () => {
    expect(getReactionPendingKey('sig-a', '👍')).toBe('sig-a\n👍');
  });

  it('aggregates reactions by referenced message and emoji', () => {
    const index = buildMessageReactionIndex(
      [
        message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 }),
        reaction({ sender: 'Qa', timestamp: 20 }),
        reaction({ sender: 'Qb', timestamp: 30 }),
        reaction({ content: '❤️', sender: 'Qc', timestamp: 40 }),
      ],
      'Qa',
    );

    expect(index.get('sig-a')).toEqual([
      {
        content: '👍',
        count: 2,
        earliestTimestamp: 20,
        latestTimestamp: 30,
        reactedBySelf: true,
        reactors: [
          { sender: 'Qa', timestamp: 20 },
          { sender: 'Qb', timestamp: 30 },
        ],
      },
      {
        content: '❤️',
        count: 1,
        earliestTimestamp: 40,
        latestTimestamp: 40,
        reactedBySelf: false,
        reactors: [{ sender: 'Qc', timestamp: 40 }],
      },
    ]);
  });

  it('uses the latest add or remove state for each sender and emoji', () => {
    const index = buildMessageReactionIndex(
      [
        reaction({ sender: 'Qa', timestamp: 20 }),
        reaction({ contentState: false, sender: 'Qa', timestamp: 30 }),
        reaction({ sender: 'Qa', timestamp: 40 }),
        reaction({ sender: 'Qb', timestamp: 50 }),
        reaction({ contentState: false, sender: 'Qb', timestamp: 60 }),
      ],
      'Qa',
    );

    expect(index.get('sig-a')).toEqual([
      {
        content: '👍',
        count: 1,
        earliestTimestamp: 40,
        latestTimestamp: 40,
        reactedBySelf: true,
        reactors: [{ sender: 'Qa', timestamp: 40 }],
      },
    ]);
  });

  it('orders reaction chips by oldest active reaction instead of default emoji order', () => {
    const index = buildMessageReactionIndex(
      [
        reaction({ content: '❤️', sender: 'Qa', timestamp: 20 }),
        reaction({ content: '👍', sender: 'Qb', timestamp: 30 }),
      ],
      null,
    );

    expect(index.get('sig-a')?.map((summary) => summary.content)).toEqual(['❤️', '👍']);
  });
});
