import { getGroupMemberAddress } from './groupMembers';
import type {
  ApprovalProgress,
  GroupApprovalVote,
  GroupData,
  GroupMember,
  PendingApprovalTransaction,
} from './types';

// The null account (all-zero public key burn address). A group whose only admin
// is this account has no real admins, so the Core treats every member as an
// approver for group-approval transactions.
export const NULL_ACCOUNT_ADDRESS = 'QdSnUy6sUiEnaN87dWmE92g1uQjrvPgrWG';

// Previewnet block target (60s). ETAs are approximate; Core allows ±30s drift.
export const BLOCK_TIME_MS = 60000;

export type ApprovalThreshold = { kind: 'pct'; value: number } | { kind: 'abs'; value: number };

export function parseApprovalThreshold(threshold: string | undefined): ApprovalThreshold {
  const value = (threshold ?? '').toUpperCase();

  if (value === 'NONE') {
    return { kind: 'abs', value: 0 };
  }

  if (value === 'ONE') {
    return { kind: 'abs', value: 1 };
  }

  const pctMatch = /^PCT(\d+)$/.exec(value);

  if (pctMatch) {
    return { kind: 'pct', value: Number(pctMatch[1]) };
  }

  // Unknown threshold strings fall back to "all approvers" so we never under-report.
  return { kind: 'pct', value: 100 };
}

// Eligible approvers for a development-style (null-owner) group are its non-null
// members; this mirrors Group.canApprove's fallback to memberExists when a group
// has no usable admins.
export function getEligibleApproverAddresses(members: GroupMember[]) {
  const addresses = new Set<string>();

  for (const member of members) {
    const address = getGroupMemberAddress(member);

    if (address && address !== NULL_ACCOUNT_ADDRESS) {
      addresses.add(address);
    }
  }

  return addresses;
}

// Derive the live approval tally for one pending transaction from the confirmed
// GROUP_APPROVAL votes, applying latest-vote-wins per eligible voter (mirrors
// Transaction.getApprovalData).
export function computeApprovalProgress(
  transaction: PendingApprovalTransaction,
  group: GroupData | null,
  members: GroupMember[],
  votes: GroupApprovalVote[],
  myAddress: string | null,
): ApprovalProgress {
  const eligible = getEligibleApproverAddresses(members);
  const totalAuthorities = eligible.size;
  const threshold = parseApprovalThreshold(group?.approvalThreshold);
  const approvalsNeeded =
    threshold.kind === 'pct' ? Math.ceil((totalAuthorities * threshold.value) / 100) : threshold.value;

  const latestByVoter = new Map<string, GroupApprovalVote>();

  for (const vote of votes) {
    if (vote.pendingSignature !== transaction.signature) {
      continue;
    }

    const address = vote.creatorAddress;

    if (!address || !eligible.has(address)) {
      continue;
    }

    const previous = latestByVoter.get(address);
    const newer =
      !previous ||
      (vote.timestamp ?? 0) > (previous.timestamp ?? 0) ||
      ((vote.timestamp ?? 0) === (previous.timestamp ?? 0) && (vote.signature ?? '') > (previous.signature ?? ''));

    if (newer) {
      latestByVoter.set(address, vote);
    }
  }

  let approvalsSoFar = 0;
  let opposed = 0;

  for (const vote of latestByVoter.values()) {
    if (vote.approval) {
      approvalsSoFar += 1;
    } else {
      opposed += 1;
    }
  }

  const mine = myAddress ? latestByVoter.get(myAddress) : undefined;
  const myVote = mine ? (mine.approval ? 'approve' : 'oppose') : null;

  return { approvalsSoFar, opposed, approvalsNeeded, totalAuthorities, myVote };
}

export type ApprovalWindowState = 'pending' | 'open' | 'expired';

export type ApprovalWindow = {
  minEndsAtHeight: number | null;
  maxEndsAtHeight: number | null;
  minState: ApprovalWindowState;
  maxState: ApprovalWindowState;
};

// Voting opens after minimumBlockDelay and the transaction expires after
// maximumBlockDelay, both measured from the block that confirmed it. Core gates
// with a strict '<', so the boundary height is delay + 1.
export function computeApprovalWindow(
  transaction: PendingApprovalTransaction,
  group: GroupData | null,
  currentHeight: number | null,
): ApprovalWindow {
  const base = typeof transaction.blockHeight === 'number' ? transaction.blockHeight : null;
  const minEndsAtHeight =
    base !== null && typeof group?.minimumBlockDelay === 'number' ? base + group.minimumBlockDelay + 1 : null;
  const maxEndsAtHeight =
    base !== null && typeof group?.maximumBlockDelay === 'number' ? base + group.maximumBlockDelay + 1 : null;

  const minState: ApprovalWindowState =
    minEndsAtHeight !== null && currentHeight !== null && currentHeight >= minEndsAtHeight ? 'open' : 'pending';
  const maxState: ApprovalWindowState =
    maxEndsAtHeight !== null && currentHeight !== null && currentHeight >= maxEndsAtHeight ? 'expired' : 'pending';

  return { minEndsAtHeight, maxEndsAtHeight, minState, maxState };
}
