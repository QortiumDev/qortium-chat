import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  fetchAccountAvatar,
  getAvatarFallbackCharacter,
  loadAvatarProfile,
  normalizeRegisteredName,
  revokeAvatarObjectUrl,
} from './avatarProfiles';
import { qdnRequest } from './qdnRequest';

vi.mock('./qdnRequest', () => ({
  buildNodeWebSocketUrl: (path: string) => `ws://127.0.0.1:24891${path}`,
  hasAction: (actions: string[], ...candidates: string[]) =>
    candidates.some((candidate) => actions.some((action) => action.toUpperCase() === candidate.toUpperCase())),
  qdnRequest: vi.fn(),
}));

describe('avatar profile helpers', () => {
  const qdnRequestMock = vi.mocked(qdnRequest);
  const createObjectURLMock = vi.fn((blob: Blob) => `blob:mock/${blob.type}`);
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    qdnRequestMock.mockReset();
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    (URL as unknown as { createObjectURL: typeof createObjectURLMock }).createObjectURL = createObjectURLMock;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURLMock }).revokeObjectURL = revokeObjectURLMock;
  });

  it('normalizes registered names and fallback characters without altering them', () => {
    expect(normalizeRegisteredName('7even')).toBe('7even');
    expect(normalizeRegisteredName('')).toBeNull();
    expect(getAvatarFallbackCharacter('#hash')).toBe('#');
    expect(getAvatarFallbackCharacter(null)).toBe('?');
  });

  it('does not request an image when Home does not advertise the pointer action', async () => {
    await expect(fetchAccountAvatar('Qabc', ['FETCH_NODE_API'])).resolves.toEqual({ kind: 'unavailable' });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it.each([
    ['POINTER', { identifier: 'avatar', name: 'alice', service: 'THUMBNAIL' }],
    ['LEGACY', null],
  ] as const)('creates a safe Blob URL for a ready %s avatar', async (source, descriptor) => {
    qdnRequestMock.mockResolvedValueOnce({
      address: 'Qabc',
      body: 'iVBORw0KGgo=',
      contentLength: 8,
      contentType: 'image/png',
      descriptor,
      encoding: 'base64',
      source,
    });

    await expect(fetchAccountAvatar('Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toEqual({
      kind: 'ready', source, src: 'blob:mock/image/png',
    });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_ACCOUNT_AVATAR', address: 'Qabc', maxBytes: AVATAR_MAX_BYTES,
    });
    expect(createObjectURLMock.mock.calls[0]?.[0]?.type).toBe('image/png');
  });

  it('accepts BMP images returned by Home', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      address: 'Qabc', body: 'iVBORw0KGgo=', contentLength: 8, contentType: 'image/bmp',
      descriptor: { identifier: 'avatar', name: 'alice', service: 'THUMBNAIL' }, encoding: 'base64', source: 'POINTER',
    });

    await expect(fetchAccountAvatar('Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toMatchObject({
      kind: 'ready', src: 'blob:mock/image/bmp',
    });
  });

  it.each([
    { address: 'Qother', body: 'iVBORw0KGgo=', contentLength: 8, contentType: 'image/png', descriptor: null, encoding: 'base64', source: 'LEGACY' },
    { address: 'Qabc', body: 'not base64!', contentLength: 8, contentType: 'image/png', descriptor: null, encoding: 'base64', source: 'LEGACY' },
    { address: 'Qabc', body: 'iVBORw0KGgo=', contentLength: 9, contentType: 'image/png', descriptor: null, encoding: 'base64', source: 'LEGACY' },
    { address: 'Qabc', body: 'iVBORw0KGgo=', contentLength: 8, contentType: 'image/svg+xml', descriptor: null, encoding: 'base64', source: 'LEGACY' },
    { address: 'Qabc', body: 'iVBORw0KGgo=', contentLength: AVATAR_MAX_BYTES + 1, contentType: 'image/png', descriptor: null, encoding: 'base64', source: 'LEGACY' },
    { address: 'Qabc', body: 'iVBORw0KGgo=', contentLength: 8, contentType: 'image/png', descriptor: null, encoding: 'base64', source: 'POINTER' },
  ])('rejects malformed or unsafe avatar responses', async (response) => {
    qdnRequestMock.mockResolvedValueOnce(response);

    await expect(fetchAccountAvatar('Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toEqual({ kind: 'unavailable' });
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it('returns a bounded retry delay only for an explicit pending response', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      address: 'Qabc', descriptor: { identifier: 'avatar', name: 'alice', service: 'THUMBNAIL' },
      retryAfterSeconds: 99, source: 'POINTER', status: 'PENDING',
    });

    await expect(fetchAccountAvatar('Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toEqual({
      kind: 'pending', retryAfterSeconds: 30, source: 'POINTER',
    });
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it('keeps display-name resolution separate from an address avatar', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ name: 'alice', owner: 'Qabc' }]);

    await expect(loadAvatarProfile({ address: 'Qabc', actions: ['GET_ACCOUNT_NAMES'] })).resolves.toEqual({
      address: 'Qabc', avatarSrc: null, name: 'alice',
    });
  });

  it('revokes only Blob URLs', () => {
    revokeAvatarObjectUrl('https://node.example/avatar.png');
    revokeAvatarObjectUrl('blob:mock/image/png');

    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock/image/png');
  });
});
