import type { ChatMessage, GroupData, GroupMember } from './types';
import { isHiddenChatMessage } from './chatText';

export type GroupMemberRole = 'admin' | 'member' | 'owner';

type NamedValue = {
  name?: unknown;
};

type MemberWithNames = GroupMember & {
  names?: unknown;
};

const ROLE_ORDER: Record<GroupMemberRole, number> = {
  owner: 0,
  admin: 1,
  member: 2,
};

function normalizeName(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getNameFromNamedValue(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return normalizeName((value as NamedValue).name);
}

function getFirstNameFromNamesValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const name = normalizeName(entry) ?? getNameFromNamedValue(entry);

      if (name) {
        return name;
      }
    }

    return null;
  }

  if (value && typeof value === 'object') {
    const name = (value as NamedValue).name;

    if (Array.isArray(name)) {
      return getFirstNameFromNamesValue(name);
    }

    return normalizeName(name);
  }

  return null;
}

export function getGroupMemberAddress(member: GroupMember) {
  return member.address || member.member || '';
}

export function getGroupMemberRegisteredName(member: GroupMember) {
  return (
    normalizeName(member.primaryName) ??
    getFirstNameFromNamesValue((member as MemberWithNames).names) ??
    normalizeName(member.name)
  );
}

export function getGroupMemberRole(member: GroupMember, ownerAddress: string | undefined): GroupMemberRole {
  const address = getGroupMemberAddress(member);

  if (ownerAddress && address === ownerAddress) {
    return 'owner';
  }

  return member.isAdmin === true ? 'admin' : 'member';
}

export function getGroupMemberDisplayName(
  member: GroupMember,
  fallbackLabel: string,
  shortenAddress: (address: string) => string,
  profileName?: string | null,
) {
  const address = getGroupMemberAddress(member);

  return getGroupMemberRegisteredName(member) ?? profileName ?? (address ? shortenAddress(address) : fallbackLabel);
}

export function getOrderedGroupMembers(members: GroupMember[], group: GroupData | null | undefined) {
  const ownerAddress = group?.owner ?? '';
  const ownerIndex = ownerAddress
    ? members.findIndex((member) => getGroupMemberAddress(member) === ownerAddress)
    : -1;
  const indexedMembers = members.map((member, index) => {
    if (index === ownerIndex && group?.ownerPrimaryName && !getGroupMemberRegisteredName(member)) {
      return {
        index,
        member: {
          ...member,
          primaryName: group.ownerPrimaryName,
        },
      };
    }

    return { index, member };
  });

  if (ownerAddress && ownerIndex === -1) {
    indexedMembers.push({
      index: -1,
      member: {
        isAdmin: true,
        member: ownerAddress,
        primaryName: group?.ownerPrimaryName ?? null,
      },
    });
  }

  return indexedMembers
    .sort((first, second) => {
      const firstRole = getGroupMemberRole(first.member, ownerAddress);
      const secondRole = getGroupMemberRole(second.member, ownerAddress);
      const roleDifference = ROLE_ORDER[firstRole] - ROLE_ORDER[secondRole];

      return roleDifference || first.index - second.index;
    })
    .map(({ member }) => member);
}

export function getActiveMessageGroupMembers(messages: ChatMessage[], groupId?: number) {
  const membersByAddress = new Map<
    string,
    {
      firstIndex: number;
      latestTimestamp: number;
      member: GroupMember;
    }
  >();

  const activeMessages =
    typeof groupId === 'number' ? messages.filter((message) => message.txGroupId === groupId) : messages;

  for (const [index, message] of activeMessages.entries()) {
    if (isHiddenChatMessage(message)) {
      continue;
    }

    const address = message.sender;

    if (!address) {
      continue;
    }

    const latestTimestamp = message.timestamp;
    const registeredName = normalizeName(message.senderName);
    const existing = membersByAddress.get(address);

    if (!existing) {
      membersByAddress.set(address, {
        firstIndex: index,
        latestTimestamp,
        member: {
          member: address,
          primaryName: registeredName,
        },
      });
      continue;
    }

    if (latestTimestamp > existing.latestTimestamp) {
      membersByAddress.set(address, {
        firstIndex: existing.firstIndex,
        latestTimestamp,
        member: {
          ...existing.member,
          primaryName: registeredName ?? existing.member.primaryName,
        },
      });
    }
  }

  return Array.from(membersByAddress.values())
    .sort((first, second) => second.latestTimestamp - first.latestTimestamp || first.firstIndex - second.firstIndex)
    .map(({ member }) => member);
}
