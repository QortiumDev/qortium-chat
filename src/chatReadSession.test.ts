import { describe, expect, it } from 'vitest';
import { chatReadRequiresAccount, isChatReadSessionStale } from './chatReadSession';

describe('chat read sessions', () => {
  it('allows public group reads without a selected account', () => {
    expect(chatReadRequiresAccount({ groupIsOpen: true, kind: 'group' })).toBe(false);
  });

  it('keeps direct and private-group reads account-sensitive', () => {
    expect(chatReadRequiresAccount({ kind: 'direct' })).toBe(true);
    expect(chatReadRequiresAccount({ groupIsOpen: false, kind: 'group' })).toBe(true);
  });

  it('keeps an anonymous public fetch current only while its chain identity remains null', () => {
    const anonymous = { accountAddress: null, chatKey: 'group:0' };

    expect(isChatReadSessionStale(anonymous, anonymous)).toBe(false);
    expect(
      isChatReadSessionStale(anonymous, { accountAddress: 'Qnew-account', chatKey: 'group:0' }),
    ).toBe(true);
    expect(
      isChatReadSessionStale(anonymous, { accountAddress: null, chatKey: 'group:7' }),
    ).toBe(true);
  });
});
