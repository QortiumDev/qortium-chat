import { describe, expect, it, vi } from 'vitest';
import {
  canUseQortalAccountForHost,
  loadQortalAccountSnapshot,
  shouldRecoverQortiumAccountFromSharedHomeIdentity,
} from './qortalAccountSession';

describe('loadQortalAccountSnapshot', () => {
  it('loads memberships for the newly resolved Qortal account with the same action catalogue', async () => {
    const actions = ['GET_USER_ACCOUNT', 'LIST_GROUPS'];
    const account = { address: 'QortalNew', name: 'NewUser', publicKey: 'public-key' };
    const memberGroups = [{ groupId: 7, groupName: 'Joined' }];
    const loadAccount = vi.fn().mockResolvedValue(account);
    const loadMemberGroups = vi.fn().mockResolvedValue(memberGroups);

    await expect(loadQortalAccountSnapshot(actions, { loadAccount, loadMemberGroups })).resolves.toEqual({
      account,
      memberGroups,
      phase: 'ready',
    });
    expect(loadAccount).toHaveBeenCalledWith(actions);
    expect(loadMemberGroups).toHaveBeenCalledWith('QortalNew', actions);
  });

  it('preserves the resolved identity when only its membership lookup fails', async () => {
    const membershipError = new Error('membership unavailable');
    const account = { address: 'QortalNew', name: null, publicKey: null };

    await expect(loadQortalAccountSnapshot([], {
      loadAccount: vi.fn().mockResolvedValue(account),
      loadMemberGroups: vi.fn().mockRejectedValue(membershipError),
    })).resolves.toEqual({ account, error: membershipError, phase: 'membership-error' });
  });
});

describe('canUseQortalAccountForHost', () => {
  it('treats Hub account permission as the writable identity without a Qortium account', () => {
    expect(canUseQortalAccountForHost('hub', true, false, false)).toBe(true);
  });

  it('retains Home shared-wallet unlock gating and blocks refresh transitions', () => {
    expect(canUseQortalAccountForHost('home2', true, false, false)).toBe(false);
    expect(canUseQortalAccountForHost('home2', true, false, true)).toBe(true);
    expect(canUseQortalAccountForHost('hub', true, true, true)).toBe(false);
  });
});

describe('shouldRecoverQortiumAccountFromSharedHomeIdentity', () => {
  it('recovers the missing Qortium half of a ready Home 2 shared identity', () => {
    expect(shouldRecoverQortiumAccountFromSharedHomeIdentity(
      'home2',
      true,
      'QortalAccount',
      null,
      false,
    )).toBe(true);
  });

  it('waits for bridge and account refresh readiness', () => {
    expect(shouldRecoverQortiumAccountFromSharedHomeIdentity(
      'home2',
      false,
      'QortalAccount',
      null,
      false,
    )).toBe(false);
    expect(shouldRecoverQortiumAccountFromSharedHomeIdentity(
      'home2',
      true,
      'QortalAccount',
      null,
      true,
    )).toBe(false);
  });

  it('does not run without the shared Qortal identity or when Qortium is already loaded', () => {
    expect(shouldRecoverQortiumAccountFromSharedHomeIdentity(
      'home2',
      true,
      null,
      null,
      false,
    )).toBe(false);
    expect(shouldRecoverQortiumAccountFromSharedHomeIdentity(
      'home2',
      true,
      'QortalAccount',
      'QortiumAccount',
      false,
    )).toBe(false);
  });

  it('never synthesizes a Qortium account on Hub, gateway, or browser hosts', () => {
    for (const host of ['hub', 'gateway', 'legacy-home', 'browser-dev'] as const) {
      expect(shouldRecoverQortiumAccountFromSharedHomeIdentity(
        host,
        true,
        'QortalAccount',
        null,
        false,
      )).toBe(false);
    }
  });
});
