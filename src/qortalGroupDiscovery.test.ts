import { describe, expect, it } from 'vitest';
import { buildReactionMessageText } from './chatText';
import {
  discoverQortalGatewayGroups,
  filterQortalGroupCatalogue,
  retainSelectedQortalGatewayGroup,
} from './qortalGroupDiscovery';
import type { ChatMessage, GroupData } from './types';

function group(groupId: number, groupName: string, isOpen = true): GroupData {
  return { groupId, groupName, isOpen };
}

function message(groupId: number, timestamp: number, data = `message-${timestamp}`): ChatMessage {
  const bytes = new TextEncoder().encode(data);

  return {
    data: btoa(String.fromCharCode(...bytes)),
    encoding: 'BASE64',
    isText: true,
    sender: 'Qsender',
    signature: `signature-${groupId}-${timestamp}`,
    timestamp,
    txGroupId: groupId,
  };
}

describe('Qortal catalogue search', () => {
  it('finds public and private groups beyond the first 100 without requiring activity', () => {
    const catalogue = Array.from({ length: 120 }, (_, index) =>
      group(index + 1, index === 109 ? 'Quiet Chess Club' : `Group ${index + 1}`, index !== 114),
    );
    catalogue[114] = group(115, 'Chess Committee', false);

    expect(filterQortalGroupCatalogue(catalogue, 'chess')).toEqual([
      group(115, 'Chess Committee', false),
      group(110, 'Quiet Chess Club'),
    ]);
  });

  it('matches numeric group ids and ranks exact and prefix names first', () => {
    const catalogue = [
      group(12, 'Fans of Chess'),
      group(23, 'Chess Club'),
      group(34, 'Chess'),
    ];

    expect(filterQortalGroupCatalogue(catalogue, 'chess').map(({ groupId }) => groupId)).toEqual([34, 23, 12]);
    expect(filterQortalGroupCatalogue(catalogue, '23').map(({ groupId }) => groupId)).toEqual([23]);
  });
});

describe('Qortal gateway active groups', () => {
  it('isolates failed metadata and message candidates and filters closed or hidden-only groups', async () => {
    const reaction = message(4, 400, buildReactionMessageText('👍', true));
    const discoveries = await discoverQortalGatewayGroups({
      concurrency: 2,
      loadGroup: async (groupId) => {
        if (groupId === 2) throw new Error('missing metadata');
        return group(groupId, `Group ${groupId}`, groupId !== 3);
      },
      loadMessages: async (candidate) => {
        if (candidate.groupId === 5) throw new Error('read failed');
        if (candidate.groupId === 4) return [reaction];
        return [message(candidate.groupId, candidate.groupId * 100)];
      },
      stats: [1, 2, 3, 4, 5, 6].map((groupId) => ({ groupId })),
    });

    expect(discoveries.map(({ group: candidate }) => candidate.groupId)).toEqual([6, 1]);
  });

  it('removes expired groups on refresh while retaining the selected public group', () => {
    const first = [group(1, 'One'), group(2, 'Two')];
    const refreshed = [group(2, 'Two')];

    expect(retainSelectedQortalGatewayGroup(refreshed, first[0]).map(({ groupId }) => groupId)).toEqual([2, 1]);
    expect(retainSelectedQortalGatewayGroup(refreshed, group(1, 'Private one', false))).toEqual(refreshed);
  });
});
