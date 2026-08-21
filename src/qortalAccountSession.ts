import { getMemberGroups, getQortalUserAccount, type QortalUserIdentity } from './coreApi';
import type { BridgeHost, GroupData, QdnAction } from './types';

type QortalAccountSessionDependencies = {
  loadAccount: (actions?: QdnAction[]) => Promise<QortalUserIdentity>;
  loadMemberGroups: (address: string, actions?: QdnAction[]) => Promise<GroupData[]>;
};

export type QortalAccountSnapshot =
  | { account: QortalUserIdentity; memberGroups: GroupData[]; phase: 'ready' }
  | { account: QortalUserIdentity; error: unknown; phase: 'membership-error' };

const defaultDependencies: QortalAccountSessionDependencies = {
  loadAccount: getQortalUserAccount,
  loadMemberGroups: (address, actions) => getMemberGroups('qortal', address, actions),
};

export function canUseQortalAccountForHost(
  host: BridgeHost,
  hasQortalAccount: boolean,
  accountRefreshPending: boolean,
  canUseQortiumAccount: boolean,
) {
  return hasQortalAccount && !accountRefreshPending && (host === 'hub' || canUseQortiumAccount);
}

export function shouldRecoverQortiumAccountFromSharedHomeIdentity(
  host: BridgeHost,
  bridgeReady: boolean,
  qortalAccountAddress: string | null,
  qortiumAccountAddress: string | null,
  accountRefreshPending: boolean,
) {
  return (
    host === 'home2' &&
    bridgeReady &&
    !!qortalAccountAddress &&
    !qortiumAccountAddress &&
    !accountRefreshPending
  );
}

/** Loads identity first, then memberships for that exact Qortal address. */
export async function loadQortalAccountSnapshot(
  actions: QdnAction[],
  dependencies: QortalAccountSessionDependencies = defaultDependencies,
): Promise<QortalAccountSnapshot> {
  const account = await dependencies.loadAccount(actions);

  try {
    return {
      account,
      memberGroups: await dependencies.loadMemberGroups(account.address, actions),
      phase: 'ready',
    };
  } catch (error) {
    return { account, error, phase: 'membership-error' };
  }
}
