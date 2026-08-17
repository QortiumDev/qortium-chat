import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AVATAR_MAX_BYTES,
  AVATAR_PENDING_MAX_ATTEMPTS,
  fetchAccountAvatar,
  fetchGroupAvatar,
  getAvatarFallbackCharacter,
  getAvatarProfileKey,
  getGroupAvatarProfileKey,
  getNextAvatarPendingRetry,
  loadAvatarProfile,
  normalizeRegisteredName,
  revokeAvatarObjectUrl,
} from './avatarProfiles';
import { qdnRequest } from './qdnRequest';
import { qortalRequest } from './qortalRequest';

vi.mock('./qdnRequest', () => ({
  buildNodeWebSocketUrl: (path: string) => `ws://127.0.0.1:24891${path}`,
  hasAction: (actions: string[], ...candidates: string[]) =>
    candidates.some((candidate) => actions.some((action) => action.toUpperCase() === candidate.toUpperCase())),
  qdnRequest: vi.fn(),
}));

vi.mock('./qortalRequest', () => ({
  qortalRequest: vi.fn(),
}));

describe('avatar profile helpers', () => {
  const qdnRequestMock = vi.mocked(qdnRequest);
  const qortalRequestMock = vi.mocked(qortalRequest);
  const createObjectURLMock = vi.fn((blob: Blob) => `blob:mock/${blob.type}`);
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
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

  it('qualifies account and group cache keys by network', () => {
    expect(getAvatarProfileKey('qortium', 'Qabc')).toBe('qortium:Qabc');
    expect(getAvatarProfileKey('qortal', 'Qabc')).toBe('qortal:Qabc');
    expect(getGroupAvatarProfileKey('qortium', 12)).toBe('qortium:12');
    expect(getGroupAvatarProfileKey('qortal', 12)).toBe('qortal:12');
  });

  it('fetches a Qortal account avatar only from its primary-name convention', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      body: 'iVBORw0KGgo=',
      contentLength: 8,
      contentType: 'application/octet-stream',
      encoding: 'base64',
    });

    await expect(
      fetchAccountAvatar('qortal', 'Qabc', ['FETCH_QDN_RESOURCE'], 'alice'),
    ).resolves.toMatchObject({ kind: 'ready', src: 'blob:mock/image/png' });
    expect(qortalRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_QDN_RESOURCE',
      encoding: 'base64',
      identifier: 'qortal_avatar',
      maxBytes: AVATAR_MAX_BYTES,
      name: 'alice',
      rebuild: true,
      service: 'THUMBNAIL',
    });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('uses the pointer-aware Qortium group-avatar action', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      body: 'iVBORw0KGgo=',
      contentLength: 8,
      contentType: 'image/png',
      descriptor: { identifier: 'qortium-group-avatar-v1-12', name: 'alice', service: 'THUMBNAIL' },
      encoding: 'base64',
      groupId: 12,
      source: 'POINTER',
    });

    await expect(
      fetchGroupAvatar('qortium', { groupId: 12 }, ['FETCH_GROUP_AVATAR']),
    ).resolves.toMatchObject({ kind: 'ready', src: 'blob:mock/image/png' });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_GROUP_AVATAR', groupId: 12, maxBytes: AVATAR_MAX_BYTES,
    });
  });

  it('uses the Qortal owner-name group-avatar convention', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      body: 'iVBORw0KGgo=',
      contentLength: 8,
      contentType: 'image/png',
      encoding: 'base64',
    });

    await expect(
      fetchGroupAvatar(
        'qortal',
        { groupId: 12, owner: 'Qowner', ownerPrimaryName: 'alice' },
        ['FETCH_QDN_RESOURCE'],
      ),
    ).resolves.toMatchObject({ kind: 'ready', src: 'blob:mock/image/png' });
    expect(qortalRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_QDN_RESOURCE',
      encoding: 'base64',
      identifier: 'qortal_group_avatar_12',
      maxBytes: AVATAR_MAX_BYTES,
      name: 'alice',
      rebuild: true,
      service: 'THUMBNAIL',
    });
  });

  it('does not request an image when Home does not advertise the pointer action', async () => {
    await expect(fetchAccountAvatar('qortium', 'Qabc', ['FETCH_NODE_API'])).resolves.toEqual({ kind: 'unavailable' });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('falls back to the established named-thumbnail identifiers on older Home builds', async () => {
    qdnRequestMock
      .mockRejectedValueOnce(new Error('missing avatar'))
      .mockResolvedValueOnce('iVBORw0KGgo=');

    await expect(
      fetchAccountAvatar(
        'qortium',
        'Qabc',
        ['FETCH_QDN_RESOURCE'],
        'alice',
      ),
    ).resolves.toEqual({
      kind: 'ready',
      source: 'LEGACY',
      src: 'blob:mock/image/png',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'FETCH_QDN_RESOURCE',
      encoding: 'base64',
      identifier: 'qortal_avatar',
      maxBytes: AVATAR_MAX_BYTES,
      name: 'alice',
      rebuild: true,
      service: 'THUMBNAIL',
    });
  });

  it('sniffs safe legacy image bytes without trusting a declared MIME type', async () => {
    qdnRequestMock.mockResolvedValueOnce('iVBORw0KGgo=');

    await expect(
      fetchAccountAvatar(
        'qortium',
        'Qabc',
        ['FETCH_QDN_RESOURCE'],
        'alice',
      ),
    ).resolves.toEqual({
      kind: 'ready',
      source: 'LEGACY',
      src: 'blob:mock/image/png',
    });
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

    await expect(fetchAccountAvatar('qortium', 'Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toEqual({
      kind: 'ready', source, src: 'blob:mock/image/png',
    });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_ACCOUNT_AVATAR', address: 'Qabc', maxBytes: AVATAR_MAX_BYTES,
    });
    expect(createObjectURLMock.mock.calls[0]?.[0]?.type).toBe('image/png');
  });

  it('accepts Android MIME-wrapped base64 avatar bytes', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      address: 'Qabc',
      body: 'iVBO\r\nRw0K Ggo=\t',
      contentLength: 8,
      contentType: 'image/png',
      descriptor: null,
      encoding: 'base64',
      source: 'LEGACY',
    });

    await expect(fetchAccountAvatar('qortium', 'Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toMatchObject({
      kind: 'ready',
      source: 'LEGACY',
    });
    expect(createObjectURLMock.mock.calls[0]?.[0]?.size).toBe(8);
  });

  it('trusts image magic bytes over a mismatched declared MIME type', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      address: 'Qabc', body: 'iVBORw0KGgo=', contentLength: 8, contentType: 'image/bmp',
      descriptor: { identifier: 'avatar', name: 'alice', service: 'THUMBNAIL' }, encoding: 'base64', source: 'POINTER',
    });

    await expect(fetchAccountAvatar('qortium', 'Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toMatchObject({
      kind: 'ready', src: 'blob:mock/image/png',
    });
  });

  it.each([
    { address: 'Qother', body: 'iVBORw0KGgo=', contentLength: 8, contentType: 'image/png', descriptor: null, encoding: 'base64', source: 'LEGACY' },
    { address: 'Qabc', body: 'not base64!', contentLength: 8, contentType: 'image/png', descriptor: null, encoding: 'base64', source: 'LEGACY' },
    { address: 'Qabc', body: 'PHN2Zz48L3N2Zz4=', contentLength: 11, contentType: 'image/svg+xml', descriptor: null, encoding: 'base64', source: 'LEGACY' },
    { address: 'Qabc', body: 'iVBORw0KGgo=', contentLength: 8, contentType: 'image/png', descriptor: null, encoding: 'base64', source: 'POINTER' },
  ])('rejects malformed or unsafe avatar responses', async (response) => {
    qdnRequestMock.mockResolvedValueOnce(response);

    await expect(fetchAccountAvatar('qortium', 'Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toEqual({ kind: 'unavailable' });
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it('treats contentLength as advisory and validates the decoded bytes', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      address: 'Qabc',
      body: 'iVBORw0KGgo=',
      contentLength: AVATAR_MAX_BYTES + 1,
      contentType: 'image/png',
      descriptor: null,
      encoding: 'base64',
      source: 'LEGACY',
    });

    await expect(fetchAccountAvatar('qortium', 'Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toMatchObject({
      kind: 'ready',
      source: 'LEGACY',
    });
  });

  it('rejects decoded avatar bytes over the limit even when contentLength is small', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      address: 'Qabc',
      body: btoa('x'.repeat(AVATAR_MAX_BYTES + 1)),
      contentLength: 8,
      contentType: 'image/png',
      descriptor: null,
      encoding: 'base64',
      source: 'LEGACY',
    });

    await expect(fetchAccountAvatar('qortium', 'Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toEqual({
      kind: 'unavailable',
    });
  });

  it('returns a bounded retry delay only for an explicit pending response', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      address: 'Qabc', descriptor: { identifier: 'avatar', name: 'alice', service: 'THUMBNAIL' },
      retryAfterSeconds: 99, source: 'POINTER', status: 'PENDING',
    });

    await expect(fetchAccountAvatar('qortium', 'Qabc', ['FETCH_ACCOUNT_AVATAR'])).resolves.toEqual({
      kind: 'pending', retryAfterSeconds: 30, source: 'POINTER',
    });
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it('keeps display-name resolution separate from an address avatar', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ name: 'alice', owner: 'Qabc' }]);

    await expect(loadAvatarProfile({ address: 'Qabc', actions: ['GET_ACCOUNT_NAMES'], network: 'qortium' })).resolves.toEqual({
      address: 'Qabc', avatarSrc: null, name: 'alice', network: 'qortium',
    });
  });

  it('caps pending retries by attempt count and elapsed time', () => {
    let retry:
      | ReturnType<typeof getNextAvatarPendingRetry>
      | undefined;

    for (let attempt = 1; attempt < AVATAR_PENDING_MAX_ATTEMPTS; attempt += 1) {
      retry = getNextAvatarPendingRetry(retry?.state, 1, attempt * 1000);
      expect(retry).not.toBeNull();
    }

    expect(
      getNextAvatarPendingRetry(retry?.state, 1, AVATAR_PENDING_MAX_ATTEMPTS * 1000),
    ).toBeNull();
    expect(
      getNextAvatarPendingRetry(
        { attempts: 1, startedAt: 0 },
        30,
        5 * 60 * 1000 - 20_000,
      ),
    ).toBeNull();
  });

  it('revokes only Blob URLs', () => {
    revokeAvatarObjectUrl('https://node.example/avatar.png');
    revokeAvatarObjectUrl('blob:mock/image/png');

    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock/image/png');
  });
});
