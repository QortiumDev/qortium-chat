import { describe, expect, it } from 'vitest';
import {
  buildMessageThreads,
  isThreadContinuation,
  THREAD_CONTINUATION_WINDOW_MS,
  type MessageThread,
} from './messageThreads';
import type { ChatMessage } from './types';

function message(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'sender' | 'timestamp'>): ChatMessage {
  return {
    txGroupId: 7,
    ...overrides,
  };
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

  it('never attaches revisions to unsigned (pending) originals', () => {
    const unsigned = message({ sender: 'Qa', timestamp: 10 });
    const edit = message({ chatReference: 'sig-x', sender: 'Qa', signature: 'sig-edit', timestamp: 20 });

    expect(buildMessageThreads([unsigned, edit])).toEqual([
      { latest: unsigned, original: unsigned, revisions: [] },
      { latest: edit, original: edit, revisions: [] },
    ]);
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
