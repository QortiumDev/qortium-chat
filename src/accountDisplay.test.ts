import { describe, expect, it } from 'vitest';
import { getAvatarView, getDirectCounterpartName, getVisibleAvatarSrc, selectAvatarProfilesForNetwork } from './accountDisplay';

describe('network-scoped avatar profiles', () => {
  it('does not let the same address collide across chains', () => {
    const profiles = new Map([
      ['qortium:Qabc', { address: 'Qabc', avatarSrc: 'blob:qortium', name: 'alice-qortium', network: 'qortium' as const, requestKey: 'one' }],
      ['qortal:Qabc', { address: 'Qabc', avatarSrc: 'blob:qortal', name: 'alice-qortal', network: 'qortal' as const, requestKey: 'two' }],
    ]);

    expect(selectAvatarProfilesForNetwork(profiles, 'qortium').get('Qabc')?.avatarSrc).toBe('blob:qortium');
    expect(selectAvatarProfilesForNetwork(profiles, 'qortal').get('Qabc')?.avatarSrc).toBe('blob:qortal');
  });
});

describe('getDirectCounterpartName', () => {
  it('prefers the registered name of the counterpart address', () => {
    expect(getDirectCounterpartName({ address: 'Qthem', name: 'them', sender: 'Qme', senderName: 'me' })).toBe('them');
  });

  it('does not map the local sender name onto an unregistered counterpart', () => {
    // Counterpart is unregistered (no `name`) and the LOCAL account sent the
    // latest message: senderName is the local user's name and must not leak.
    expect(
      getDirectCounterpartName({ address: 'Qthem', recipient: 'Qme', recipientName: null, sender: 'Qme', senderName: 'me' }),
    ).toBeNull();
  });

  it('uses senderName only when the counterpart sent the latest message', () => {
    expect(
      getDirectCounterpartName({ address: 'Qthem', recipient: 'Qme', recipientName: 'me', sender: 'Qthem', senderName: 'them' }),
    ).toBe('them');
  });

  it('uses recipientName only when the counterpart received the latest message', () => {
    expect(
      getDirectCounterpartName({ address: 'Qthem', recipient: 'Qthem', recipientName: 'them', sender: 'Qme', senderName: 'me' }),
    ).toBe('them');
  });

  it('returns null when neither message side matches the counterpart address', () => {
    expect(getDirectCounterpartName({ address: 'Qthem' })).toBeNull();
  });
});

describe('getAvatarView', () => {
  it('keeps an address-keyed Blob avatar when a historical sender name differs', () => {
    expect(getAvatarView({ address: 'Qabc', avatarSrc: 'blob:avatar', name: 'current-name', network: 'qortium' }, 'old-name')).toEqual({
      avatarSrc: 'blob:avatar',
      name: 'old-name',
    });
  });

  it('does not accept a raw or data URL as an avatar image source', () => {
    expect(getAvatarView({ address: 'Qabc', avatarSrc: 'https://node/avatar.png', name: 'alice', network: 'qortium' }, 'alice').avatarSrc).toBeNull();
    expect(getAvatarView({ address: 'Qabc', avatarSrc: 'data:image/png;base64,abc', name: 'alice', network: 'qortium' }, 'alice').avatarSrc).toBeNull();
  });

  it('falls back after an image error and permits a later replacement URL', () => {
    expect(getVisibleAvatarSrc('blob:first', null)).toBe('blob:first');
    expect(getVisibleAvatarSrc('blob:first', 'blob:first')).toBeNull();
    expect(getVisibleAvatarSrc('blob:replacement', 'blob:first')).toBe('blob:replacement');
  });
});
