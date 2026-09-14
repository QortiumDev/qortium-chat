import { describe, expect, it } from 'vitest';
import { GROUP_EVENT_WINDOW_MS, mergeGroupEvents, normalizeGroupEvents } from './groupEvents';

const NOW = 1_800_000_000_000;
const row = (type: string, timestamp: number, creatorAddress: string, extra: Record<string, unknown> = {}) => ({
  creatorAddress,
  groupId: 18,
  signature: `${type}-${timestamp}-${creatorAddress}`,
  timestamp,
  type,
  ...extra,
});

describe('normalizeGroupEvents', () => {
  it('keeps this group, this window, known types; orders oldest first', () => {
    const events = normalizeGroupEvents(
      [
        row('JOIN_GROUP', NOW - 1000, 'QA'),
        row('LEAVE_GROUP', NOW - 500, 'QB'),
        { ...row('JOIN_GROUP', NOW - 200, 'QC'), groupId: 17 },
        row('JOIN_GROUP', NOW - GROUP_EVENT_WINDOW_MS - 1, 'QD'),
        row('PAYMENT', NOW - 100, 'QE'),
        row('GROUP_KICK', NOW - 300, 'QADMIN', { member: 'QB', reason: 'spam' }),
        'junk',
        row('JOIN_GROUP', NOW - 1000, 'QA'),
      ],
      { groupId: 18, isOpen: true, network: 'qortium', now: NOW },
    );

    expect(events.map((event) => [event.kind, event.actor, event.target])).toEqual([
      ['joined', 'QA', null],
      ['left', 'QB', null],
      ['kicked', 'QADMIN', 'QB'],
    ]);
    expect(events[0]?.id).toBe('JOIN_GROUP-1799999999000-QA');
  });

  it('infers join requests and approvals for closed groups', () => {
    const events = normalizeGroupEvents(
      [
        row('JOIN_GROUP', NOW - 5000, 'QREQ'),
        row('GROUP_INVITE', NOW - 4000, 'QOWNER', { invitee: 'QREQ', timeToLive: 0 }),
        row('GROUP_INVITE', NOW - 3000, 'QOWNER', { invitee: 'QINV' }),
        row('JOIN_GROUP', NOW - 2000, 'QINV'),
        row('ADD_GROUP_ADMIN', NOW - 1000, 'QOWNER', { member: 'QINV' }),
        row('UPDATE_GROUP', NOW - 900, 'QOWNER'),
        row('GROUP_BAN', NOW - 800, 'QOWNER', { offender: 'QREQ' }),
        row('CANCEL_GROUP_BAN', NOW - 700, 'QOWNER', { member: 'QREQ' }),
        row('CANCEL_GROUP_INVITE', NOW - 600, 'QOWNER', { invitee: 'QX' }),
        row('REMOVE_GROUP_ADMIN', NOW - 500, 'QOWNER', { admin: 'QINV' }),
      ],
      { groupId: 18, isOpen: false, network: 'qortal', now: NOW },
    );

    expect(events.map((event) => `${event.kind}:${event.actor}>${event.target ?? ''}`)).toEqual([
      'joinRequested:QREQ>',
      'approved:QOWNER>QREQ',
      'invited:QOWNER>QINV',
      'joined:QINV>',
      'adminAdded:QOWNER>QINV',
      'updated:QOWNER>',
      'banned:QOWNER>QREQ',
      'unbanned:QOWNER>QREQ',
      'inviteCancelled:QOWNER>QX',
      'adminRemoved:QOWNER>QINV',
    ]);
  });

  it('merges sweeps by id', () => {
    const first = normalizeGroupEvents([row('JOIN_GROUP', NOW - 1000, 'QA')], { groupId: 18, isOpen: true, network: 'qortium', now: NOW });
    const second = normalizeGroupEvents(
      [row('JOIN_GROUP', NOW - 1000, 'QA'), row('LEAVE_GROUP', NOW - 100, 'QA')],
      { groupId: 18, isOpen: true, network: 'qortium', now: NOW },
    );
    expect(mergeGroupEvents(first, second).map((event) => event.kind)).toEqual(['joined', 'left']);
  });
});

describe('moderation action names', () => {
  it('sends whichever alias the host advertises (Hub vs Home 2 names)', async () => {
    const { getGroupModerationAction, hasGroupModerationAction } = await import('./coreApi');

    expect(getGroupModerationAction('kick', ['GROUP_KICK'])).toBe('GROUP_KICK');
    expect(getGroupModerationAction('kick', ['KICK_FROM_GROUP'])).toBe('KICK_FROM_GROUP');
    expect(getGroupModerationAction('ban', [])).toBe('BAN_FROM_GROUP');
    expect(hasGroupModerationAction('ban', ['GROUP_BAN'])).toBe(true);
    expect(hasGroupModerationAction('kick', ['GROUP_BAN'])).toBe(false);
  });
});
