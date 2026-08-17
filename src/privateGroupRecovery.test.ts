import { describe, expect, it } from 'vitest';
import { isPrivateGroupRecoveryContextCurrent } from './privateGroupRecovery';

const context = {
  accountAddress: 'Qaccount-one',
  accountRefreshGeneration: 4,
  chatKey: 'group:7',
  groupId: 7,
};

function current(overrides: Partial<Parameters<typeof isPrivateGroupRecoveryContextCurrent>[1]> = {}) {
  return {
    accountAddress: 'Qaccount-one',
    accountRefreshGeneration: 4,
    accountRefreshPending: false,
    joinedGroupIds: new Set([7]),
    selectedChatKey: 'group:7',
    selectedGroupId: 7,
    ...overrides,
  };
}

describe('isPrivateGroupRecoveryContextCurrent', () => {
  it('accepts only the unchanged selected account and private-group context', () => {
    expect(isPrivateGroupRecoveryContextCurrent(context, current())).toBe(true);
  });

  it.each([
    { accountAddress: 'Qaccount-two' },
    { accountRefreshGeneration: 5 },
    { accountRefreshPending: true },
    { selectedChatKey: 'group:8' },
    { selectedGroupId: 8 },
    { joinedGroupIds: new Set<number>() },
  ])('rejects stale recovery state %#', (override) => {
    expect(isPrivateGroupRecoveryContextCurrent(context, current(override))).toBe(false);
  });
});
