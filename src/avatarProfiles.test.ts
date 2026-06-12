import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAvatarImage,
  getAvatarFallbackCharacter,
  loadAvatarProfile,
  normalizeRegisteredName,
} from './avatarProfiles';
import { qdnRequest } from './qdnRequest';

vi.mock('./qdnRequest', () => ({
  buildNodeWebSocketUrl: (path: string) => `ws://127.0.0.1:24891${path}`,
  qdnRequest: vi.fn(),
}));

describe('avatar profile helpers', () => {
  const qdnRequestMock = vi.mocked(qdnRequest);

  beforeEach(() => {
    qdnRequestMock.mockReset();
  });

  it('normalizes registered names without changing their first character', () => {
    expect(normalizeRegisteredName('alice')).toBe('alice');
    expect(normalizeRegisteredName('7even')).toBe('7even');
    expect(normalizeRegisteredName('#hash')).toBe('#hash');
    expect(normalizeRegisteredName('')).toBeNull();
    expect(normalizeRegisteredName(null)).toBeNull();
  });

  it('returns fallback characters without uppercasing or filtering symbols', () => {
    expect(getAvatarFallbackCharacter('alice')).toBe('a');
    expect(getAvatarFallbackCharacter('7even')).toBe('7');
    expect(getAvatarFallbackCharacter('#hash')).toBe('#');
    expect(getAvatarFallbackCharacter(null)).toBe('?');
  });

  it('fetches avatar images from THUMBNAIL with identifier avatar', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ filename: 'avatar.png', mimeType: 'image/png', size: 128 })
      .mockResolvedValueOnce('iVBORw0KGgo=');

    await expect(fetchAvatarImage('alice')).resolves.toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GET_QDN_RESOURCE_PROPERTIES',
      service: 'THUMBNAIL',
      name: 'alice',
      identifier: 'avatar',
      path: '',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'FETCH_QDN_RESOURCE',
      service: 'THUMBNAIL',
      name: 'alice',
      identifier: 'avatar',
      path: '',
      encoding: 'base64',
      rebuild: true,
      maxBytes: 500 * 1024,
    });
    expect(JSON.stringify(qdnRequestMock.mock.calls)).not.toContain('qortium_avatar');
  });

  it('uses a preferred message or account name before looking up address names', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ mimeType: 'image/png', size: 128 })
      .mockResolvedValueOnce('iVBORw0KGgo=');

    await expect(
      loadAvatarProfile({
        address: 'Qabc',
        preferredName: 'alice',
        actions: ['GET_ACCOUNT_NAMES'],
      }),
    ).resolves.toEqual({
      address: 'Qabc',
      avatarSrc: 'data:image/png;base64,iVBORw0KGgo=',
      name: 'alice',
    });
    expect(qdnRequestMock).not.toHaveBeenCalledWith({
      action: 'GET_ACCOUNT_NAMES',
      address: 'Qabc',
    });
  });

  it('falls back to the first returned account name', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([{ name: null, owner: 'Qabc' }, { name: 'bob', owner: 'Qabc' }])
      .mockResolvedValueOnce({ mimeType: 'image/jpeg', size: 128 })
      .mockResolvedValueOnce('/9j/4AAQSkZJRg==');

    await expect(
      loadAvatarProfile({
        address: 'Qabc',
        actions: ['GET_ACCOUNT_NAMES'],
      }),
    ).resolves.toEqual({
      address: 'Qabc',
      avatarSrc: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      name: 'bob',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GET_ACCOUNT_NAMES',
      address: 'Qabc',
    });
  });

  it('uses node read fallback when the account names bridge action is unavailable', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({
        body: '[]',
        contentType: 'application/json',
        data: [{ name: 'carol', owner: 'Qabc' }],
        ok: true,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({ mimeType: 'image/gif', size: 128 })
      .mockResolvedValueOnce('R0lGODlhAQABAAAAACw=');

    await expect(loadAvatarProfile({ address: 'Qabc', actions: [] })).resolves.toEqual({
      address: 'Qabc',
      avatarSrc: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
      name: 'carol',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/names/address/Qabc',
    });
  });

  it('returns placeholder profile state when no registered name is known', async () => {
    qdnRequestMock.mockResolvedValueOnce([]);

    await expect(loadAvatarProfile({ address: 'Qabc', actions: ['GET_ACCOUNT_NAMES'] })).resolves.toEqual({
      address: 'Qabc',
      avatarSrc: null,
      name: null,
    });
    expect(qdnRequestMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the registered name when avatar loading fails', async () => {
    qdnRequestMock.mockRejectedValueOnce(new Error('Not found'));

    await expect(loadAvatarProfile({ address: 'Qabc', preferredName: 'alice' })).resolves.toEqual({
      address: 'Qabc',
      avatarSrc: null,
      name: 'alice',
    });
  });
});
