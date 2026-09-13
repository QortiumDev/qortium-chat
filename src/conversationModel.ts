import { isHiddenChatMessage } from './chatText';
import type { ActiveDirectChat, ChatMessage, ChatNetwork, GroupData } from './types';

export type ConversationProtocol = 'chat' | 'rchat';
export type ConversationAccess = 'interactive' | 'read-only';
export type GroupConversationMembership = 'joined' | 'preview' | 'public';

type ConversationSummaryBase = {
  access: ConversationAccess;
  activityAt: number | null;
  key: string;
  network: ChatNetwork;
  preview: string | null;
  protocol: ConversationProtocol;
  title: string;
  unread: boolean;
};

export type GroupConversationSummary = ConversationSummaryBase & {
  group: GroupData;
  kind: 'group';
  memberCount: number | null;
  membership: GroupConversationMembership;
};

export type DirectConversationSummary = ConversationSummaryBase & {
  direct: ActiveDirectChat;
  kind: 'direct';
};

export type ConversationSummary = GroupConversationSummary | DirectConversationSummary;

export type PublicGroupDiscovery = {
  /** Timestamp of the newest visible message; 0 when the group has none in the node's retention. */
  activityAt: number;
  group: GroupData;
  /** Null for a quiet group, and always null for a closed one (its history is encrypted). */
  latestMessage: ChatMessage | null;
};

export const DEFAULT_DISCOVERY_CANDIDATE_LIMIT = 12;
export const DEFAULT_DISCOVERY_CONCURRENCY = 4;

export function getConversationKey({
  id,
  kind,
  network,
  protocol,
}: {
  id: number | string;
  kind: ConversationSummary['kind'];
  network: ChatNetwork;
  protocol: ConversationProtocol;
}) {
  return `${network}:${protocol}:${kind}:${String(id)}`;
}

export function createGroupConversationSummary({
  access,
  activityAt = null,
  group,
  memberCount,
  membership,
  network,
  preview = null,
  protocol = 'chat',
  title,
  unread = false,
}: {
  access: ConversationAccess;
  activityAt?: number | null;
  group: GroupData;
  memberCount?: number | null;
  membership: GroupConversationMembership;
  network: ChatNetwork;
  preview?: string | null;
  protocol?: ConversationProtocol;
  title: string;
  unread?: boolean;
}): GroupConversationSummary {
  return {
    access,
    activityAt,
    group,
    key: getConversationKey({ id: group.groupId, kind: 'group', network, protocol }),
    kind: 'group',
    memberCount: memberCount ?? group.memberCount ?? null,
    membership,
    network,
    preview,
    protocol,
    title,
    unread,
  };
}

export function createDirectConversationSummary({
  access,
  activityAt = null,
  direct,
  network,
  preview = null,
  protocol = 'chat',
  title,
  unread = false,
}: {
  access: ConversationAccess;
  activityAt?: number | null;
  direct: ActiveDirectChat;
  network: ChatNetwork;
  preview?: string | null;
  protocol?: ConversationProtocol;
  title: string;
  unread?: boolean;
}): DirectConversationSummary {
  return {
    access,
    activityAt,
    direct,
    key: getConversationKey({ id: direct.address, kind: 'direct', network, protocol }),
    kind: 'direct',
    network,
    preview,
    protocol,
    title,
    unread,
  };
}

function normalizePositiveLimit(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function latestVisibleMessage(messages: ChatMessage[]) {
  let latest: ChatMessage | null = null;

  for (const message of messages) {
    if (isHiddenChatMessage(message)) {
      continue;
    }

    if (!latest || message.timestamp > latest.timestamp) {
      latest = message;
    }
  }

  return latest;
}

/**
 * Qualify a deliberately small catalogue window for the read-only discovery
 * surface. This never scans the whole catalogue: callers choose the candidate
 * window, and this helper applies an additional hard cap plus bounded
 * concurrency. Candidate failures are isolated so one unavailable group does
 * not erase otherwise valid previews.
 */
export async function qualifyPublicGroupDiscoveries({
  candidateLimit = DEFAULT_DISCOVERY_CANDIDATE_LIMIT,
  concurrency = DEFAULT_DISCOVERY_CONCURRENCY,
  groups,
  loadMessages,
  memberGroupIds,
}: {
  candidateLimit?: number;
  concurrency?: number;
  groups: GroupData[];
  loadMessages: (group: GroupData) => Promise<ChatMessage[]>;
  memberGroupIds: ReadonlySet<number>;
}): Promise<PublicGroupDiscovery[]> {
  const seenGroupIds = new Set<number>();
  const limit = normalizePositiveLimit(candidateLimit, DEFAULT_DISCOVERY_CANDIDATE_LIMIT);
  const candidates: GroupData[] = [];

  // Closed groups are listed too (their history is not read — it is encrypted
  // for non-members — but a user has to be able to find one to request to
  // join it), and a group with no message inside the node's chat retention is
  // still a real group: Core keeps roughly a day of chat, so filtering on
  // "has a recent message" made every quiet group undiscoverable (live V0
  // finding B5, 2026-09-13).
  for (const group of groups) {
    if (
      candidates.length >= limit ||
      !Number.isSafeInteger(group.groupId) ||
      group.groupId <= 0 ||
      memberGroupIds.has(group.groupId) ||
      seenGroupIds.has(group.groupId)
    ) {
      continue;
    }

    seenGroupIds.add(group.groupId);
    candidates.push(group);
  }

  if (candidates.length === 0) {
    return [];
  }

  const results: Array<PublicGroupDiscovery | null> = Array.from({ length: candidates.length }, () => null);
  const workerCount = Math.min(
    candidates.length,
    normalizePositiveLimit(concurrency, DEFAULT_DISCOVERY_CONCURRENCY),
  );
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      const group = candidates[index];

      if (group.isOpen !== true) {
        results[index] = { activityAt: 0, group, latestMessage: null };
        continue;
      }

      try {
        const latestMessage = latestVisibleMessage(await loadMessages(group));

        results[index] = {
          activityAt: latestMessage?.timestamp ?? 0,
          group,
          latestMessage,
        };
      } catch {
        // A public node may withhold one group's read or time out. Discovery is
        // best-effort: the group stays listed without a preview rather than
        // vanishing, and must not turn into an app-wide error.
        results[index] = { activityAt: 0, group, latestMessage: null };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  // Active groups first (newest activity), then the quiet and closed ones by
  // name so the order is stable across sweeps.
  return results
    .filter((result): result is PublicGroupDiscovery => result !== null)
    .sort(
      (first, second) =>
        second.activityAt - first.activityAt ||
        (first.group.groupName ?? '').localeCompare(second.group.groupName ?? '') ||
        first.group.groupId - second.group.groupId,
    );
}
