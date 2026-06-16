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
  // The runtime serves avatars as opaque blob: URLs; node has no
  // URL.createObjectURL, so provide one that echoes the blob's type back.
  const createObjectURLMock = vi.fn((blob: Blob) => `blob:mock/${blob.type}`);

  beforeEach(() => {
    qdnRequestMock.mockReset();
    createObjectURLMock.mockClear();
    (URL as unknown as { createObjectURL: typeof createObjectURLMock }).createObjectURL =
      createObjectURLMock;
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

    await expect(fetchAvatarImage('alice')).resolves.toBe('blob:mock/image/png');
    const blob = createObjectURLMock.mock.calls[0]?.[0];
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(8);
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

  it('downgrades non-raster image types so script-bearing avatars cannot reach an img src', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ mimeType: 'image/svg+xml', size: 128 })
      .mockResolvedValueOnce('PHN2Zy8+');

    await expect(fetchAvatarImage('alice')).resolves.toBe('blob:mock/image/png');
    expect(createObjectURLMock.mock.calls[0]?.[0]?.type).toBe('image/png');
  });

  it('rejects payloads that fall outside the base64 alphabet', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ mimeType: 'image/png', size: 128 })
      .mockResolvedValueOnce('not base64!');

    await expect(fetchAvatarImage('alice')).rejects.toThrow(/malformed image data/);
  });

  it('falls back to a placeholder profile when avatar data is malformed', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ mimeType: 'image/png', size: 128 })
      .mockResolvedValueOnce('<script>alert(1)</script>');

    await expect(loadAvatarProfile({ address: 'Qabc', preferredName: 'alice' })).resolves.toEqual({
      address: 'Qabc',
      avatarSrc: null,
      name: 'alice',
    });
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
      avatarSrc: 'blob:mock/image/png',
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
      avatarSrc: 'blob:mock/image/jpeg',
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
      avatarSrc: 'blob:mock/image/gif',
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
