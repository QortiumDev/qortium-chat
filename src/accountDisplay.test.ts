import { describe, expect, it } from 'vitest';
import { getAvatarView, getVisibleAvatarSrc } from './accountDisplay';

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

  it('falls back after an image error and permits a later replacement URL', () => {
    expect(getVisibleAvatarSrc('blob:first', null)).toBe('blob:first');
    expect(getVisibleAvatarSrc('blob:first', 'blob:first')).toBeNull();
    expect(getVisibleAvatarSrc('blob:replacement', 'blob:first')).toBe('blob:replacement');
  });
});
