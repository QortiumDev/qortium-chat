import { describe, expect, it } from 'vitest';
import {
  buildMessageThreads,
  canReviseMessageThread,
  getLatestActivityMessageTimestamp,
  hasLoadedMessageThreadRoot,
  isThreadContinuation,
  THREAD_CONTINUATION_WINDOW_MS,
  type MessageThread,
} from './messageThreads';
import { buildDeletedMessageText, buildReactionMessageText } from './chatText';
import type { ChatMessage } from './types';

function message(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'sender' | 'timestamp'>): ChatMessage {
  return {
    txGroupId: 7,
    ...overrides,
  };
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);

  return btoa(String.fromCharCode(...bytes));
}

function reaction(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'chatReference' | 'sender' | 'timestamp'>) {
  return message({
    data: base64(buildReactionMessageText('👍', true)),
    encoding: 'BASE64',
    isEncrypted: false,
    isText: true,
    signature: `reaction-${overrides.sender}-${overrides.timestamp}`,
    ...overrides,
  });
}

describe('buildMessageThreads', () => {
  it('keeps plain messages as single-revision threads in order', () => {
    const first = message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 });
    const second = message({ sender: 'Qb', signature: 'sig-b', timestamp: 20 });

    expect(buildMessageThreads([first, second])).toEqual([
      { latest: first, original: first, revisions: [] },
      { latest: second, original: second, revisions: [] },
    ]);
  });

  it('folds revisions into their original and surfaces the latest', () => {
    const original = message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 });
    const firstEdit = message({ chatReference: 'sig-a', sender: 'Qa', signature: 'sig-edit-1', timestamp: 30 });
    const secondEdit = message({ chatReference: 'sig-a', sender: 'Qa', signature: 'sig-edit-2', timestamp: 40 });
    const other = message({ sender: 'Qb', signature: 'sig-b', timestamp: 20 });

    expect(buildMessageThreads([original, other, secondEdit, firstEdit])).toEqual([
      { latest: secondEdit, original, revisions: [firstEdit, secondEdit] },
      { latest: other, original: other, revisions: [] },
    ]);
  });

  it('keeps referenced messages from a different sender visible', () => {
    const original = message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 });
    const reply = message({ chatReference: 'sig-a', sender: 'Qb', signature: 'sig-reply', timestamp: 20 });

    expect(buildMessageThreads([original, reply])).toEqual([
      { latest: original, original, revisions: [] },
      { latest: reply, original: reply, revisions: [] },
    ]);
  });

  it('keeps referenced messages whose original is outside the loaded window visible', () => {
    const orphan = message({ chatReference: 'sig-older', sender: 'Qa', signature: 'sig-orphan', timestamp: 20 });
    const other = message({ sender: 'Qb', signature: 'sig-b', timestamp: 30 });

    expect(buildMessageThreads([orphan, other])).toEqual([
      { latest: orphan, original: orphan, revisions: [] },
      { latest: other, original: other, revisions: [] },
    ]);
  });

  it('coalesces same-sender revisions whose original is outside the loaded window', () => {
    const firstEdit = message({ chatReference: 'sig-older', sender: 'Qa', signature: 'sig-edit-1', timestamp: 20 });
    const secondEdit = message({ chatReference: 'sig-older', sender: 'Qa', signature: 'sig-edit-2', timestamp: 30 });
    const other = message({ sender: 'Qb', signature: 'sig-b', timestamp: 40 });

    expect(buildMessageThreads([firstEdit, secondEdit, other])).toEqual([
      { latest: secondEdit, original: firstEdit, revisions: [secondEdit] },
      { latest: other, original: other, revisions: [] },
    ]);
  });

  it('keeps orphaned revision chains from different senders separate', () => {
    const firstSenderEdit = message({
      chatReference: 'sig-older',
      sender: 'Qa',
      signature: 'sig-edit-a',
      timestamp: 20,
    });
    const secondSenderEdit = message({
      chatReference: 'sig-older',
      sender: 'Qb',
      signature: 'sig-edit-b',
      timestamp: 30,
    });

    expect(buildMessageThreads([firstSenderEdit, secondSenderEdit])).toEqual([
      { latest: firstSenderEdit, original: firstSenderEdit, revisions: [] },
      { latest: secondSenderEdit, original: secondSenderEdit, revisions: [] },
    ]);
  });

  it('never attaches revisions to unsigned (pending) originals', () => {
    const unsigned = message({ sender: 'Qa', timestamp: 10 });
    const edit = message({ chatReference: 'sig-x', sender: 'Qa', signature: 'sig-edit', timestamp: 20 });

    expect(buildMessageThreads([unsigned, edit])).toEqual([
      { latest: unsigned, original: unsigned, revisions: [] },
      { latest: edit, original: edit, revisions: [] },
    ]);
  });

  it('keeps reactions out of message threads and edit revisions', () => {
    const original = message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 });
    const ownReaction = reaction({ chatReference: 'sig-a', sender: 'Qa', timestamp: 20 });
    const peerReaction = reaction({ chatReference: 'sig-a', sender: 'Qb', timestamp: 30 });

    expect(buildMessageThreads([original, ownReaction, peerReaction])).toEqual([
      { latest: original, original, revisions: [] },
    ]);
  });

  it('does not show orphaned reaction messages', () => {
    const orphanReaction = reaction({ chatReference: 'sig-missing', sender: 'Qa', timestamp: 20 });

    expect(buildMessageThreads([orphanReaction])).toEqual([]);
  });

  it('omits a thread whose latest accepted revision deletes the message', () => {
    const original = message({
      data: base64('Original body'),
      encoding: 'BASE64',
      isText: true,
      sender: 'Qa',
      signature: 'sig-a',
      timestamp: 10,
    });
    const deletion = message({
      chatReference: 'sig-a',
      data: base64(buildDeletedMessageText()),
      encoding: 'BASE64',
      isText: true,
      sender: 'Qa',
      signature: 'sig-delete',
      timestamp: 20,
    });

    expect(buildMessageThreads([original, deletion])).toEqual([]);
    expect(buildMessageThreads([original, deletion], { includeDeleted: true })).toEqual([
      { latest: deletion, original, revisions: [deletion] },
    ]);
  });

  it('shows a deleted thread again only after a later non-empty revision', () => {
    const original = message({
      data: base64('Original body'),
      encoding: 'BASE64',
      isText: true,
      sender: 'Qa',
      signature: 'sig-a',
      timestamp: 10,
    });
    const deletion = message({
      chatReference: 'sig-a',
      data: base64(buildDeletedMessageText()),
      encoding: 'BASE64',
      isText: true,
      sender: 'Qa',
      signature: 'sig-delete',
      timestamp: 20,
    });
    const restored = message({
      chatReference: 'sig-a',
      data: base64('Restored body'),
      encoding: 'BASE64',
      isText: true,
      sender: 'Qa',
      signature: 'sig-restored',
      timestamp: 30,
    });

    expect(buildMessageThreads([original, deletion, restored])).toEqual([
      { latest: restored, original, revisions: [deletion, restored] },
    ]);
  });
});

describe('canReviseMessageThread', () => {
  it('requires the current sender to own a loaded root message', () => {
    const original = message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 });
    const thread = { latest: original, original, revisions: [] };

    expect(canReviseMessageThread(thread, 'Qa')).toBe(true);
    expect(canReviseMessageThread(thread, 'Qb')).toBe(false);
    expect(canReviseMessageThread(thread, null)).toBe(false);
    expect(hasLoadedMessageThreadRoot(thread)).toBe(true);
  });

  it('does not treat an orphaned revision as a new editable root', () => {
    const orphan = message({ chatReference: 'sig-older', sender: 'Qa', signature: 'sig-edit', timestamp: 20 });
    const thread = { latest: orphan, original: orphan, revisions: [] };

    expect(canReviseMessageThread(thread, 'Qa')).toBe(false);
    expect(hasLoadedMessageThreadRoot(thread)).toBe(false);
  });
});

describe('getLatestActivityMessageTimestamp', () => {
  it('returns the latest message timestamp while ignoring newer reactions', () => {
    const first = message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 });
    const latestMessage = message({ sender: 'Qb', signature: 'sig-b', timestamp: 30 });
    const newerReaction = reaction({ chatReference: 'sig-a', sender: 'Qc', timestamp: 50 });

    expect(getLatestActivityMessageTimestamp([newerReaction, first, latestMessage])).toBe(30);
  });

  it('returns null when only reactions are loaded', () => {
    expect(getLatestActivityMessageTimestamp([
      reaction({ chatReference: 'sig-a', sender: 'Qa', timestamp: 20 }),
    ])).toBeNull();
  });
});

describe('isThreadContinuation', () => {
  function thread(sender: string, timestamp: number): MessageThread {
    const original = message({ sender, signature: `sig-${sender}-${timestamp}`, timestamp });

    return { latest: original, original, revisions: [] };
  }

  it('groups close successive messages from the same sender', () => {
    expect(isThreadContinuation(thread('Qa', 1_000), thread('Qa', 2_000))).toBe(true);
  });

  it('breaks the group when the sender changes', () => {
    expect(isThreadContinuation(thread('Qa', 1_000), thread('Qb', 2_000))).toBe(false);
  });

  it('breaks the group after the continuation window', () => {
    expect(isThreadContinuation(thread('Qa', 1_000), thread('Qa', 1_000 + THREAD_CONTINUATION_WINDOW_MS))).toBe(true);
    expect(
      isThreadContinuation(thread('Qa', 1_000), thread('Qa', 1_001 + THREAD_CONTINUATION_WINDOW_MS)),
    ).toBe(false);
  });

  it('is never a continuation without a previous thread', () => {
    expect(isThreadContinuation(undefined, thread('Qa', 1_000))).toBe(false);
  });
});

describe('machine message filtering', () => {
  function machine(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'sender' | 'timestamp'>) {
    return message({
      data: base64(JSON.stringify({ app: 'chess', qch1: { type: 'move', move: 'e2e4' } })),
      encoding: 'BASE64',
      isEncrypted: false,
      isText: true,
      signature: `machine-${overrides.sender}-${overrides.timestamp}`,
      ...overrides,
    });
  }

  it('excludes machine messages from threads', () => {
    const human = message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 });
    const move = machine({ sender: 'Qb', timestamp: 20 });

    const threads = buildMessageThreads([human, move]);

    expect(threads).toHaveLength(1);
    expect(threads[0].original.signature).toBe('sig-a');
  });

  it('excludes machine messages from activity timestamps', () => {
    const human = message({ sender: 'Qa', signature: 'sig-a', timestamp: 10 });
    const move = machine({ sender: 'Qb', timestamp: 50 });

    expect(getLatestActivityMessageTimestamp([human, move])).toBe(10);
    expect(getLatestActivityMessageTimestamp([move])).toBeNull();
  });
});
