import { describe, expect, it } from 'vitest';
import { getAvatarView } from './accountDisplay';

describe('getAvatarView', () => {
  it('keeps an address-keyed Blob avatar when a historical sender name differs', () => {
    expect(getAvatarView({ address: 'Qabc', avatarSrc: 'blob:avatar', name: 'current-name' }, 'old-name')).toEqual({
      avatarSrc: 'blob:avatar',
      name: 'old-name',
    });
  });

  it('does not accept a raw or data URL as an avatar image source', () => {
    expect(getAvatarView({ address: 'Qabc', avatarSrc: 'https://node/avatar.png', name: 'alice' }, 'alice').avatarSrc).toBeNull();
    expect(getAvatarView({ address: 'Qabc', avatarSrc: 'data:image/png;base64,abc', name: 'alice' }, 'alice').avatarSrc).toBeNull();
  });
});
