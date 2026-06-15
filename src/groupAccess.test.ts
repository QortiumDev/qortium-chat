import { describe, expect, it } from 'vitest';
import { canReadGroupMessages, type GroupReadAccessState } from './groupAccess';
import type { GroupData } from './types';

const allowed: GroupReadAccessState = {
  canReadPrivateGroupChat: true,
  isAccountUnlocked: true,
  isGroupMembershipConfirmed: true,
  isJoinedGroup: true,
};

function group(groupId: number, overrides: Partial<GroupData> = {}): GroupData {
  return {
    groupId,
    groupName: `Group ${groupId}`,
    isOpen: true,
    ...overrides,
  };
}

describe('group read access', () => {
  it('allows public and general group reads without private membership checks', () => {
    expect(canReadGroupMessages(group(7, { isOpen: true }), { ...allowed, isAccountUnlocked: false })).toBe(true);
    expect(canReadGroupMessages(group(0, { isOpen: false }), { ...allowed, isJoinedGroup: false })).toBe(true);
  });

  it('requires confirmed membership before reading closed group messages', () => {
    const closed = group(8, { isOpen: false });

    expect(canReadGroupMessages(closed, allowed)).toBe(true);
    expect(canReadGroupMessages(closed, { ...allowed, isAccountUnlocked: false })).toBe(false);
    expect(canReadGroupMessages(closed, { ...allowed, canReadPrivateGroupChat: false })).toBe(false);
    expect(canReadGroupMessages(closed, { ...allowed, isGroupMembershipConfirmed: false })).toBe(false);
    expect(canReadGroupMessages(closed, { ...allowed, isJoinedGroup: false })).toBe(false);
  });
});
