import { describe, expect, it } from 'vitest';
import { buildReactionMessageText } from './chatText';
import {
  getActiveMessageGroupMembers,
  getGroupMemberDisplayName,
  getGroupMemberRegisteredName,
  getGroupMemberRole,
  getOrderedGroupMembers,
} from './groupMembers';
import type { ChatMessage } from './types';

const shortenAddress = (address: string) => `${address.slice(0, 3)}...${address.slice(-3)}`;

function message(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'sender' | 'timestamp'>): ChatMessage {
  return {
    encoding: 'BASE64',
    isEncrypted: false,
    isText: true,
    signature: `sig-${overrides.sender}-${overrides.timestamp}`,
    txGroupId: 0,
    ...overrides,
  };
}

function encodeText(value: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

describe('group member helpers', () => {
  it('prefers primary names before fallback names', () => {
    expect(
      getGroupMemberRegisteredName({
        member: 'Qmember',
        name: 'single-name-fallback',
        names: [{ name: 'first-owned-name' }],
        primaryName: 'primary-name',
      }),
    ).toBe('primary-name');
    expect(
      getGroupMemberRegisteredName({
        member: 'Qmember',
        names: [{ name: null }, { name: 'first-owned-name' }],
      }),
    ).toBe('first-owned-name');
    expect(
      getGroupMemberRegisteredName({
        member: 'Qmember',
        name: 'single-name-fallback',
        names: { name: ['owned-name-from-array'] },
      }),
    ).toBe('owned-name-from-array');
  });

  it('falls back to profile names and then short addresses', () => {
    expect(getGroupMemberDisplayName({ member: 'Qmember' }, 'Member', shortenAddress, 'profile-name')).toBe(
      'profile-name',
    );
    expect(getGroupMemberDisplayName({ member: 'Qmember123' }, 'Member', shortenAddress)).toBe('Qme...123');
    expect(getGroupMemberDisplayName({}, 'Member', shortenAddress)).toBe('Member');
  });

  it('orders owner, admins, then members without sectioning', () => {
    const orderedMembers = getOrderedGroupMembers(
      [
        { member: 'Qregular-a' },
        { isAdmin: true, member: 'Qadmin-a' },
        { member: 'Qowner' },
        { isAdmin: true, member: 'Qadmin-b' },
        { member: 'Qregular-b' },
      ],
      { groupId: 9, groupName: 'Test', owner: 'Qowner' },
    );

    expect(orderedMembers.map((member) => member.member)).toEqual([
      'Qowner',
      'Qadmin-a',
      'Qadmin-b',
      'Qregular-a',
      'Qregular-b',
    ]);
    expect(getGroupMemberRole(orderedMembers[0], 'Qowner')).toBe('owner');
    expect(getGroupMemberRole(orderedMembers[1], 'Qowner')).toBe('admin');
    expect(getGroupMemberRole(orderedMembers[3], 'Qowner')).toBe('member');
  });

  it('adds the owner at the top when the current member slice omits it', () => {
    const orderedMembers = getOrderedGroupMembers(
      [{ isAdmin: true, member: 'Qadmin' }, { member: 'Qregular' }],
      { groupId: 9, groupName: 'Test', owner: 'Qowner', ownerPrimaryName: 'owner-name' },
    );

    expect(orderedMembers).toMatchObject([
      { member: 'Qowner', primaryName: 'owner-name' },
      { member: 'Qadmin' },
      { member: 'Qregular' },
    ]);
  });

  it('builds synthetic members from visible active message senders', () => {
    const members = getActiveMessageGroupMembers(
      [
        message({ sender: 'Qa', senderName: 'alice', signature: 'sig-a', timestamp: 10 }),
        message({ chatReference: 'sig-a', sender: 'Qa', senderName: 'alice-updated', timestamp: 20 }),
        message({ chatReference: 'sig-a', sender: 'Qb', senderName: 'bob', signature: 'sig-b', timestamp: 30 }),
        message({
          chatReference: 'sig-a',
          data: encodeText(buildReactionMessageText('👍', true)),
          sender: 'Qc',
          signature: 'sig-reaction',
          timestamp: 40,
        }),
        message({ sender: 'QotherGroup', senderName: 'other', timestamp: 45, txGroupId: 3 }),
        message({ sender: 'Qa', senderName: null, signature: 'sig-a-2', timestamp: 50 }),
      ],
      0,
    );

    expect(members).toEqual([
      { member: 'Qa', primaryName: 'alice-updated' },
      { member: 'Qb', primaryName: 'bob' },
    ]);
  });
});
