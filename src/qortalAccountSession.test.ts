import { describe, expect, it, vi } from 'vitest';
import { loadQortalAccountSnapshot } from './qortalAccountSession';

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
