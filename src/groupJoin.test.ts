import { describe, expect, it } from 'vitest';

import { isAlreadyGroupMemberError } from './groupJoin';

describe('isAlreadyGroupMemberError', () => {
  it('recognizes the Core validation name in bridge error forms', () => {
    expect(isAlreadyGroupMemberError(new Error('Transaction invalid: ALREADY_GROUP_MEMBER'))).toBe(true);
    expect(
      isAlreadyGroupMemberError(
        new Error('{"error":311,"message":"Transaction invalid: ALREADY_GROUP_MEMBER"}'),
      ),
    ).toBe(true);
    expect(isAlreadyGroupMemberError({ errorType: 'ALREADY_GROUP_MEMBER' })).toBe(true);
    expect(isAlreadyGroupMemberError({ cause: { validationResult: 'ALREADY_GROUP_MEMBER' } })).toBe(true);
  });

  it('recognizes readable already-member reasons without accepting unrelated failures', () => {
    expect(isAlreadyGroupMemberError('The account is already a member of the group.')).toBe(true);
    expect(isAlreadyGroupMemberError('Already a group member')).toBe(true);
    expect(isAlreadyGroupMemberError(new Error('GROUP_DOES_NOT_EXIST'))).toBe(false);
    expect(isAlreadyGroupMemberError({ error: 51, message: 'Transaction invalid' })).toBe(false);
    expect(isAlreadyGroupMemberError(null)).toBe(false);
  });
});
