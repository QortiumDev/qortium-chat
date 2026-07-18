import { describe, expect, it } from 'vitest';
import { buildDeletedMessageText, buildReactionMessageText } from './chatText';
import { resolveGroupPreviewRevision } from './groupPreviews';
import type { ActiveGroupChat, ChatMessage } from './types';

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);

  return btoa(String.fromCharCode(...bytes));
}

function message(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'sender' | 'timestamp'>): ChatMessage {
  return {
    encoding: 'BASE64',
    isText: true,
    txGroupId: 7,
    ...overrides,
  };
}

function activeGroup(original: ChatMessage): ActiveGroupChat {
  return {
    data: original.data,
    encoding: original.encoding,
    groupId: original.txGroupId,
    sender: original.sender,
    senderName: original.senderName ?? undefined,
    signature: original.signature,
    timestamp: original.timestamp,
  };
}

describe('resolveGroupPreviewRevision', () => {
  it('uses the latest accepted edit while preserving the original activity timestamp', () => {
    const original = message({
      data: base64('Original body'),
      sender: 'Qa',
      signature: 'sig-original',
      timestamp: 10,
    });
    const firstEdit = message({
      chatReference: 'sig-original',
      data: base64('First edit'),
      sender: 'Qa',
      signature: 'sig-edit-1',
      timestamp: 20,
    });
    const latestEdit = message({
      chatReference: 'sig-original',
      data: base64('Latest edit'),
      sender: 'Qa',
      signature: 'sig-edit-2',
      timestamp: 30,
    });

    expect(resolveGroupPreviewRevision(activeGroup(original), [latestEdit, original, firstEdit])).toEqual({
      activityTimestamp: 10,
      isDeleted: false,
      latest: latestEdit,
      originalData: original.data,
      originalSender: original.sender,
      originalSignature: original.signature,
    });
  });

  it('does not let an edit to an older message replace the actual last-message preview', () => {
    const older = message({
      data: base64('Older'),
      sender: 'Qa',
      signature: 'sig-older',
      timestamp: 10,
    });
    const newest = message({
      data: base64('Newest'),
      sender: 'Qb',
      signature: 'sig-newest',
      timestamp: 20,
    });
    const newerEditOfOlder = message({
      chatReference: 'sig-older',
      data: base64('Edited older'),
      sender: 'Qa',
      signature: 'sig-edit',
      timestamp: 30,
    });

    expect(resolveGroupPreviewRevision(activeGroup(newest), [older, newest, newerEditOfOlder])).toEqual({
      activityTimestamp: 20,
      isDeleted: false,
      latest: newest,
      originalData: newest.data,
      originalSender: newest.sender,
      originalSignature: newest.signature,
    });
  });

  it('ignores reactions and revisions from a different sender', () => {
    const original = message({
      data: base64('Original body'),
      sender: 'Qa',
      signature: 'sig-original',
      timestamp: 10,
    });
    const foreignRevision = message({
      chatReference: 'sig-original',
      data: base64('Not an edit'),
      sender: 'Qb',
      signature: 'sig-foreign',
      timestamp: 20,
    });
    const reaction = message({
      chatReference: 'sig-original',
      data: base64(buildReactionMessageText('👍', true)),
      sender: 'Qc',
      signature: 'sig-reaction',
      timestamp: 30,
    });

    expect(resolveGroupPreviewRevision(activeGroup(original), [original, foreignRevision, reaction])).toEqual({
      activityTimestamp: 10,
      isDeleted: false,
      latest: original,
      originalData: original.data,
      originalSender: original.sender,
      originalSignature: original.signature,
    });
  });

  it('marks an empty revision so consumers can suppress the deleted preview', () => {
    const original = message({
      data: base64('Original body'),
      sender: 'Qa',
      signature: 'sig-original',
      timestamp: 10,
    });
    const deletion = message({
      chatReference: 'sig-original',
      data: base64(buildDeletedMessageText()),
      sender: 'Qa',
      signature: 'sig-delete',
      timestamp: 20,
    });

    expect(resolveGroupPreviewRevision(activeGroup(original), [original, deletion])).toEqual({
      activityTimestamp: 10,
      isDeleted: true,
      latest: deletion,
      originalData: original.data,
      originalSender: original.sender,
      originalSignature: original.signature,
    });
  });

  it('keeps the active-chat payload when its original is outside the loaded window', () => {
    const original = message({
      data: base64('Original body'),
      sender: 'Qa',
      signature: 'sig-original',
      timestamp: 10,
    });
    const orphanedEdit = message({
      chatReference: 'sig-original',
      data: base64('Latest edit'),
      sender: 'Qa',
      signature: 'sig-edit',
      timestamp: 20,
    });

    expect(resolveGroupPreviewRevision(activeGroup(original), [orphanedEdit])).toBeNull();
  });
});
