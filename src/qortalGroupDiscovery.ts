import { qualifyPublicGroupDiscoveries, type PublicGroupDiscovery } from './conversationModel';
import type { ChatMessage, GroupData } from './types';

export const QORTAL_GROUP_SEARCH_LIMIT = 50;
export const QORTAL_GATEWAY_CANDIDATE_LIMIT = 50;
export const QORTAL_GATEWAY_DISCOVERY_CONCURRENCY = 4;

export type QortalGroupChatStat = {
  groupId: number;
  size?: number;
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

/**
 * Search an already-loaded Qortal group catalogue. Core has no group-name
 * search endpoint, so gateway search deliberately operates on the complete,
 * session-cached catalogue rather than the first page or current chat activity.
 */
export function filterQortalGroupCatalogue(
  groups: GroupData[],
  search: string,
  limit = QORTAL_GROUP_SEARCH_LIMIT,
) {
  const needle = normalizeSearch(search);

  if (!needle) {
    return [];
  }

  const numericGroupId = /^\d+$/.test(needle) ? Number(needle) : null;
  const seen = new Set<number>();

  return groups
    .map((group, index) => {
      if (!Number.isSafeInteger(group.groupId) || seen.has(group.groupId)) {
        return null;
      }

      const name = normalizeSearch(group.groupName ?? '');
      const exactId = numericGroupId === group.groupId;
      const exactName = name === needle;
      const prefixName = name.startsWith(needle);

      if (!exactId && !name.includes(needle)) {
        return null;
      }

      seen.add(group.groupId);

      return {
        group,
        index,
        rank: exactId || exactName ? 0 : prefixName ? 1 : 2,
      };
    })
    .filter((entry): entry is { group: GroupData; index: number; rank: number } => entry !== null)
    .sort((first, second) => first.rank - second.rank || first.index - second.index)
    .slice(0, Math.max(1, Math.floor(limit)))
    .map(({ group }) => group);
}

async function resolveGroups({
  concurrency,
  groupIds,
  loadGroup,
}: {
  concurrency: number;
  groupIds: number[];
  loadGroup: (groupId: number) => Promise<GroupData>;
}) {
  const results: Array<GroupData | null> = Array.from({ length: groupIds.length }, () => null);
  const workerCount = Math.min(groupIds.length, Math.max(1, Math.floor(concurrency)));
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < groupIds.length) {
      const index = nextIndex++;

      try {
        results[index] = await loadGroup(groupIds[index]);
      } catch {
        // Gateway discovery is best-effort. One stale group id or failed
        // metadata read must not hide every other active public group.
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results.filter((group): group is GroupData => group !== null);
}

/** Resolve the bounded groupstats seed and qualify only readable public chats. */
export async function discoverQortalGatewayGroups({
  candidateLimit = QORTAL_GATEWAY_CANDIDATE_LIMIT,
  concurrency = QORTAL_GATEWAY_DISCOVERY_CONCURRENCY,
  loadGroup,
  loadMessages,
  stats,
}: {
  candidateLimit?: number;
  concurrency?: number;
  loadGroup: (groupId: number) => Promise<GroupData>;
  loadMessages: (group: GroupData) => Promise<ChatMessage[]>;
  stats: QortalGroupChatStat[];
}): Promise<PublicGroupDiscovery[]> {
  const seen = new Set<number>();
  const groupIds: number[] = [];

  for (const stat of stats) {
    if (
      groupIds.length >= Math.max(1, Math.floor(candidateLimit)) ||
      !Number.isSafeInteger(stat?.groupId) ||
      stat.groupId <= 0 ||
      seen.has(stat.groupId)
    ) {
      continue;
    }

    seen.add(stat.groupId);
    groupIds.push(stat.groupId);
  }

  const groups = await resolveGroups({ concurrency, groupIds, loadGroup });

  return qualifyPublicGroupDiscoveries({
    candidateLimit,
    concurrency,
    groups,
    loadMessages,
    memberGroupIds: new Set(),
  });
}

/** Keep an open selected public group visible when it drops out of groupstats. */
export function retainSelectedQortalGatewayGroup(
  activeGroups: GroupData[],
  selectedGroup: GroupData | null,
) {
  if (
    !selectedGroup ||
    selectedGroup.groupId <= 0 ||
    selectedGroup.isOpen !== true ||
    activeGroups.some((group) => group.groupId === selectedGroup.groupId)
  ) {
    return activeGroups;
  }

  return [...activeGroups, selectedGroup];
}
