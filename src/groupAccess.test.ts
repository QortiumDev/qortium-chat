import { describe, expect, it } from 'vitest';
import { GENERAL_CHAT_GROUP_ID } from './generalChat';
import {
  isOpenGroup,
  isPublicNodeSendUnsupported,
  shouldDecryptGroupMessages,
  type GroupReadAccessState,
} from './groupAccess';
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

describe('isOpenGroup', () => {
  it('treats General Chat as open regardless of isOpen', () => {
    expect(isOpenGroup(group(GENERAL_CHAT_GROUP_ID, { isOpen: false }))).toBe(true);
  });

  it('is open when isOpen is true or unspecified', () => {
    expect(isOpenGroup(group(3, { isOpen: true }))).toBe(true);
    expect(isOpenGroup(group(3, { isOpen: undefined }))).toBe(true);
  });

  it('is closed only when the Core reports isOpen: false', () => {
    expect(isOpenGroup(group(4, { isOpen: false }))).toBe(false);
  });
});

describe('isPublicNodeSendUnsupported', () => {
  const openGroup = group(5, { isOpen: true });
  const closedGroup = group(6, { isOpen: false });
  const generalChat = group(GENERAL_CHAT_GROUP_ID, { isOpen: false });

  it('enables open-group sends on a public node', () => {
    expect(isPublicNodeSendUnsupported(true, { group: openGroup, kind: 'group' })).toBe(false);
    expect(isPublicNodeSendUnsupported(true, { group: generalChat, kind: 'group' })).toBe(false);
  });

  it('blocks closed-group and direct sends on a public node', () => {
    expect(isPublicNodeSendUnsupported(true, { group: closedGroup, kind: 'group' })).toBe(true);
    expect(isPublicNodeSendUnsupported(true, { kind: 'direct' })).toBe(true);
  });

  it('blocks nothing on a trusted local/custom node', () => {
    expect(isPublicNodeSendUnsupported(false, { group: openGroup, kind: 'group' })).toBe(false);
    expect(isPublicNodeSendUnsupported(false, { group: closedGroup, kind: 'group' })).toBe(false);
    expect(isPublicNodeSendUnsupported(false, { kind: 'direct' })).toBe(false);
  });
});
