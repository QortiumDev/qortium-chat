import { describe, expect, it } from 'vitest';
import {
  computeApprovalProgress,
  computeApprovalWindow,
  getEligibleApproverAddresses,
  NULL_ACCOUNT_ADDRESS,
  parseApprovalThreshold,
} from './approvalProgress';
import type { GroupApprovalVote, GroupData, GroupMember, PendingApprovalTransaction } from './types';

const tx: PendingApprovalTransaction = { signature: 'PENDING_SIG', blockHeight: 100 };

const group: GroupData = {
  groupId: 1,
  groupName: 'development',
  owner: NULL_ACCOUNT_ADDRESS,
  approvalThreshold: 'PCT40',
  minimumBlockDelay: 10,
  maximumBlockDelay: 1440,
};

function members(...addresses: string[]): GroupMember[] {
  return addresses.map((member) => ({ member }));
}

function vote(creatorAddress: string, approval: boolean, extra: Partial<GroupApprovalVote> = {}): GroupApprovalVote {
  return { creatorAddress, approval, pendingSignature: 'PENDING_SIG', timestamp: 1, signature: `${creatorAddress}-1`, ...extra };
}

describe('parseApprovalThreshold', () => {
  it('parses percentage and absolute thresholds', () => {
    expect(parseApprovalThreshold('PCT40')).toEqual({ kind: 'pct', value: 40 });
    expect(parseApprovalThreshold('pct100')).toEqual({ kind: 'pct', value: 100 });
    expect(parseApprovalThreshold('NONE')).toEqual({ kind: 'abs', value: 0 });
    expect(parseApprovalThreshold('ONE')).toEqual({ kind: 'abs', value: 1 });
  });

  it('falls back to all approvers for unknown thresholds', () => {
    expect(parseApprovalThreshold(undefined)).toEqual({ kind: 'pct', value: 100 });
    expect(parseApprovalThreshold('WEIRD')).toEqual({ kind: 'pct', value: 100 });
  });
});

describe('getEligibleApproverAddresses', () => {
  it('excludes the null account', () => {
    const eligible = getEligibleApproverAddresses(members('Qa', 'Qb', NULL_ACCOUNT_ADDRESS));

    expect(eligible.has('Qa')).toBe(true);
    expect(eligible.has(NULL_ACCOUNT_ADDRESS)).toBe(false);
    expect(eligible.size).toBe(2);
  });
});

describe('computeApprovalProgress', () => {
  const seventeen = Array.from({ length: 17 }, (_, i) => `Q${i}`);

  it('computes PCT40 of non-null members (17 members -> 7 needed)', () => {
    const progress = computeApprovalProgress(tx, group, members(...seventeen, NULL_ACCOUNT_ADDRESS), [], null);

    expect(progress.totalAuthorities).toBe(17);
    expect(progress.approvalsNeeded).toBe(7); // ceil(17 * 40 / 100)
    expect(progress.approvalsSoFar).toBe(0);
  });

  it('tallies distinct eligible approve/oppose votes for the matching pending signature', () => {
    const votes = [
      vote('Q0', true),
      vote('Q1', true),
      vote('Q2', false),
      vote('Qx', true), // not a member -> ignored
      vote('Q3', true, { pendingSignature: 'OTHER' }), // different pending tx -> ignored
    ];
    const progress = computeApprovalProgress(tx, group, members(...seventeen), votes, 'Q0');

    expect(progress.approvalsSoFar).toBe(2);
    expect(progress.opposed).toBe(1);
    expect(progress.myVote).toBe('approve');
  });

  it('applies latest-vote-wins per voter (a later oppose overrides an earlier approve)', () => {
    const votes = [
      vote('Q0', true, { timestamp: 1, signature: 'Q0-a' }),
      vote('Q0', false, { timestamp: 5, signature: 'Q0-b' }),
    ];
    const progress = computeApprovalProgress(tx, group, members(...seventeen), votes, 'Q0');

    expect(progress.approvalsSoFar).toBe(0);
    expect(progress.opposed).toBe(1);
    expect(progress.myVote).toBe('oppose');
  });

  it('breaks equal timestamps by signature ordering', () => {
    const votes = [
      vote('Q0', true, { timestamp: 5, signature: 'Q0-a' }),
      vote('Q0', false, { timestamp: 5, signature: 'Q0-b' }), // 'Q0-b' > 'Q0-a' -> wins
    ];
    const progress = computeApprovalProgress(tx, group, members(...seventeen), votes, null);

    expect(progress.opposed).toBe(1);
    expect(progress.approvalsSoFar).toBe(0);
  });
});

describe('computeApprovalWindow', () => {
  it('derives min/max boundary heights with the +1 strict-gate offset', () => {
    const window = computeApprovalWindow(tx, group, 105);

    expect(window.minEndsAtHeight).toBe(111); // 100 + 10 + 1
    expect(window.maxEndsAtHeight).toBe(1541); // 100 + 1440 + 1
    expect(window.minState).toBe('pending'); // 105 < 111
    expect(window.maxState).toBe('pending');
  });

  it('marks the min window open once the tip reaches it', () => {
    expect(computeApprovalWindow(tx, group, 111).minState).toBe('open');
    expect(computeApprovalWindow(tx, group, 200).minState).toBe('open');
  });

  it('marks expired once the tip reaches the max boundary', () => {
    expect(computeApprovalWindow(tx, group, 1541).maxState).toBe('expired');
  });

  it('returns null boundaries when delays or block height are missing', () => {
    const window = computeApprovalWindow({ signature: 'S' }, group, 100);

    expect(window.minEndsAtHeight).toBeNull();
    expect(window.maxEndsAtHeight).toBeNull();
    expect(window.minState).toBe('pending');
  });
});
