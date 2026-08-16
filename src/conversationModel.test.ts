import { describe, expect, it } from 'vitest';
import {
  createDirectConversationSummary,
  createGroupConversationSummary,
  qualifyPublicGroupDiscoveries,
} from './conversationModel';
import { buildReactionMessageText } from './chatText';
import type { ChatMessage, GroupData } from './types';

function group(groupId: number, groupName: string, overrides: Partial<GroupData> = {}): GroupData {
  return {
    groupId,
    groupName,
    isOpen: true,
    ...overrides,
  };
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  return btoa(String.fromCharCode(...bytes));
}

function message(timestamp: number, body = `message-${timestamp}`): ChatMessage {
  return {
    data: base64(body),
    encoding: 'BASE64',
    isText: true,
    sender: 'Qsender',
    signature: `signature-${timestamp}`,
    timestamp,
    txGroupId: 1,
  };
}

describe('conversation model', () => {
  it('domain-separates equal group ids by network and protocol', () => {
    const qortium = createGroupConversationSummary({
      access: 'interactive',
      group: group(12, 'Builders'),
      membership: 'joined',
      network: 'qortium',
      title: 'Builders',
    });
    const qortalChat = createGroupConversationSummary({
      access: 'interactive',
      group: group(12, 'Builders'),
      membership: 'joined',
      network: 'qortal',
      title: 'Builders',
    });
    const qortalRchat = createGroupConversationSummary({
      access: 'interactive',
      group: group(12, 'Builders'),
      membership: 'joined',
      network: 'qortal',
      protocol: 'rchat',
      title: 'Builders',
    });

    expect(new Set([qortium.key, qortalChat.key, qortalRchat.key]).size).toBe(3);
    expect(qortium.key).toBe('qortium:chat:group:12');
    expect(qortalChat.key).toBe('qortal:chat:group:12');
    expect(qortalRchat.key).toBe('qortal:rchat:group:12');
  });

  it('models discovery groups as source-qualified read-only previews', () => {
    const summary = createGroupConversationSummary({
      access: 'read-only',
      activityAt: 100,
      group: group(22, 'Open room'),
      membership: 'preview',
      network: 'qortal',
      preview: 'Recent message',
      title: 'Open room',
    });

    expect(summary).toMatchObject({
      access: 'read-only',
      activityAt: 100,
      key: 'qortal:chat:group:22',
      kind: 'group',
      membership: 'preview',
      network: 'qortal',
      preview: 'Recent message',
      protocol: 'chat',
    });
  });

  it('uses the same key scheme for future direct CHAT and RCHAT sources', () => {
    const direct = { address: 'Qpeer', name: 'Peer' };

    expect(createDirectConversationSummary({
      access: 'interactive',
      direct,
      network: 'qortal',
      protocol: 'chat',
      title: 'Peer',
    }).key).toBe('qortal:chat:direct:Qpeer');
    expect(createDirectConversationSummary({
      access: 'interactive',
      direct,
      network: 'qortal',
      protocol: 'rchat',
      title: 'Peer',
    }).key).toBe('qortal:rchat:direct:Qpeer');
  });
});

describe('public group discovery qualification', () => {
  it('keeps only unjoined open groups with a visible message and sorts by activity', async () => {
    const groups = [
      group(1, 'Joined'),
      group(2, 'Closed', { isOpen: false }),
      group(3, 'Empty'),
      group(4, 'Active older'),
      group(5, 'Active newest'),
      group(0, 'General'),
    ];
    const messages = new Map<number, ChatMessage[]>([
      [3, []],
      [4, [message(100)]],
      [5, [message(300), message(200)]],
    ]);

    const discoveries = await qualifyPublicGroupDiscoveries({
      groups,
      loadMessages: async (candidate) => messages.get(candidate.groupId) ?? [],
      memberGroupIds: new Set([1]),
    });

    expect(discoveries.map((item) => item.group.groupId)).toEqual([5, 4]);
    expect(discoveries.map((item) => item.activityAt)).toEqual([300, 100]);
  });

  it('ignores reaction-only groups and isolates candidate failures', async () => {
    const reaction = message(500, buildReactionMessageText('👍', true));

    const discoveries = await qualifyPublicGroupDiscoveries({
      groups: [group(3, 'Reaction only'), group(4, 'Unavailable'), group(5, 'Active')],
      loadMessages: async (candidate) => {
        if (candidate.groupId === 4) throw new Error('node refused read');
        return candidate.groupId === 3 ? [reaction] : [message(200)];
      },
      memberGroupIds: new Set(),
    });

    expect(discoveries.map((item) => item.group.groupId)).toEqual([5]);
  });

  it('deduplicates candidates and never probes beyond the configured cap', async () => {
    const probed: number[] = [];
    const discoveries = await qualifyPublicGroupDiscoveries({
      candidateLimit: 2,
      concurrency: 1,
      groups: [group(2, 'Two'), group(2, 'Duplicate'), group(3, 'Three'), group(4, 'Four')],
      loadMessages: async (candidate) => {
        probed.push(candidate.groupId);
        return [message(candidate.groupId)];
      },
      memberGroupIds: new Set(),
    });

    expect(probed).toEqual([2, 3]);
    expect(discoveries.map((item) => item.group.groupId)).toEqual([3, 2]);
  });

  it('bounds concurrent candidate reads', async () => {
    let active = 0;
    let peak = 0;

    await qualifyPublicGroupDiscoveries({
      concurrency: 2,
      groups: [group(2, 'Two'), group(3, 'Three'), group(4, 'Four'), group(5, 'Five')],
      loadMessages: async (candidate) => {
        active += 1;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active -= 1;
        return [message(candidate.groupId)];
      },
      memberGroupIds: new Set(),
    });

    expect(peak).toBe(2);
  });
});
