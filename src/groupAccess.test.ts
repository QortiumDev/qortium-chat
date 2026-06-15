import { describe, expect, it } from 'vitest';
import { shouldDecryptGroupMessages, type GroupReadAccessState } from './groupAccess';
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
  it('does not use private decryption for public or general group reads', () => {
    expect(shouldDecryptGroupMessages(group(7, { isOpen: true }), allowed)).toBe(false);
    expect(shouldDecryptGroupMessages(group(0, { isOpen: false }), allowed)).toBe(false);
  });

  it('requires confirmed membership before decrypting closed group messages', () => {
    const closed = group(8, { isOpen: false });

    expect(shouldDecryptGroupMessages(closed, allowed)).toBe(true);
    expect(shouldDecryptGroupMessages(closed, { ...allowed, isAccountUnlocked: false })).toBe(false);
    expect(shouldDecryptGroupMessages(closed, { ...allowed, canReadPrivateGroupChat: false })).toBe(false);
    expect(shouldDecryptGroupMessages(closed, { ...allowed, isGroupMembershipConfirmed: false })).toBe(false);
    expect(shouldDecryptGroupMessages(closed, { ...allowed, isJoinedGroup: false })).toBe(false);
  });
});
