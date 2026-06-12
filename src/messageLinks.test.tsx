import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchQdnImagePreview,
  getImageQdnResources,
  getMediaQdnResources,
  getMessageTextParts,
  openAppLinkInHomeTab,
  openQdnMediaPlayer,
} from './messageLinks';
import { qdnRequest } from './qdnRequest';

vi.mock('./qdnRequest', () => ({
  qdnRequest: vi.fn(),
}));

describe('message link helpers', () => {
  const qdnRequestMock = vi.mocked(qdnRequest);

  beforeEach(() => {
    qdnRequestMock.mockReset();
  });

  it('splits message text around supported app links', () => {
    expect(getMessageTextParts('Open qdn://APP/Chat/Chat, home://settings, core://names, or core:// now')).toEqual([
      { kind: 'text', text: 'Open ' },
      { address: 'qdn://APP/Chat/Chat', kind: 'app-link', text: 'qdn://APP/Chat/Chat' },
      { kind: 'text', text: ', ' },
      { address: 'home://settings', kind: 'app-link', text: 'home://settings' },
      { kind: 'text', text: ', ' },
      { address: 'core://names', kind: 'app-link', text: 'core://names' },
      { kind: 'text', text: ', or ' },
      { address: 'core://', kind: 'app-link', text: 'core://' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('keeps common trailing punctuation outside app links', () => {
    expect(getMessageTextParts('Look at (home://settings).')).toEqual([
      { kind: 'text', text: 'Look at (' },
      {
        address: 'home://settings',
        kind: 'app-link',
        text: 'home://settings',
      },
      { kind: 'text', text: ').' },
    ]);
  });

  it('preserves balanced punctuation inside qdn paths', () => {
    expect(getMessageTextParts('Open qdn://APP/Name/default/path(foo).')).toEqual([
      { kind: 'text', text: 'Open ' },
      {
        address: 'qdn://APP/Name/default/path(foo)',
        kind: 'app-link',
        text: 'qdn://APP/Name/default/path(foo)',
      },
      { kind: 'text', text: '.' },
    ]);
  });

  it('requires app links to use scheme slashes', () => {
    expect(getMessageTextParts('Open home:settings or core:names')).toEqual([
      { kind: 'text', text: 'Open home:settings or core:names' },
    ]);
  });

  it('opens app links through the Home tab bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce(true);

    await expect(openAppLinkInHomeTab('core://admin/status')).resolves.toBe(true);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'OPEN_NEW_TAB',
      address: 'core://admin/status',
    });
  });

  it('extracts image qdn resources from message text', () => {
    expect(getImageQdnResources('See qdn://IMAGE/Alice/photo-1 and qdn://APP/Chat/Chat')).toEqual([
      {
        identifier: 'photo-1',
        name: 'Alice',
        path: '',
        qdnUrl: 'qdn://IMAGE/Alice/photo-1',
        service: 'IMAGE',
      },
    ]);
  });

  it('parses image resource paths and query identifiers', () => {
    expect(getImageQdnResources('See qdn://QCHAT_IMAGE/Alice/default/gallery/photo.png?identifier=avatar')).toEqual([
      {
        identifier: 'avatar',
        name: 'Alice',
        path: 'default/gallery/photo.png',
        qdnUrl: 'qdn://QCHAT_IMAGE/Alice/default/gallery/photo.png?identifier=avatar',
        service: 'QCHAT_IMAGE',
      },
    ]);
  });

  it('extracts playable media qdn resources from message text', () => {
    expect(
      getMediaQdnResources(
        'Play qdn://AUDIO/Alice/episode-1, watch qdn://VIDEO/Bob/default/clips/demo.webm?identifier=trailer, and open qdn://IMAGE/Alice/photo.',
      ),
    ).toEqual([
      {
        identifier: 'episode-1',
        name: 'Alice',
        path: '',
        qdnUrl: 'qdn://AUDIO/Alice/episode-1',
        service: 'AUDIO',
      },
      {
        identifier: 'trailer',
        name: 'Bob',
        path: 'default/clips/demo.webm',
        qdnUrl: 'qdn://VIDEO/Bob/default/clips/demo.webm?identifier=trailer',
        service: 'VIDEO',
      },
    ]);
  });

  it('opens media resources through the Home media player bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce(true);

    await expect(
      openQdnMediaPlayer({
        identifier: 'episode-1',
        name: 'Alice',
        path: '',
        qdnUrl: 'qdn://AUDIO/Alice/episode-1',
        service: 'AUDIO',
      }),
    ).resolves.toBe(true);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'OPEN_QDN_MEDIA_PLAYER',
      service: 'AUDIO',
      name: 'Alice',
      identifier: 'episode-1',
      path: '',
    });
  });

  it('fetches image previews as base64 through the Home bridge', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ filename: 'photo.png', mimeType: 'image/png', size: 128 })
      .mockResolvedValueOnce('iVBORw0KGgo=');

    await expect(
      fetchQdnImagePreview({
        identifier: 'photo',
        name: 'Alice',
        path: '',
        qdnUrl: 'qdn://IMAGE/Alice/photo',
        service: 'IMAGE',
      }),
    ).resolves.toEqual({
      alt: 'photo.png',
      mimeType: 'image/png',
      qdnUrl: 'qdn://IMAGE/Alice/photo',
      src: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GET_QDN_RESOURCE_PROPERTIES',
      service: 'IMAGE',
      name: 'Alice',
      identifier: 'photo',
      path: '',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'FETCH_QDN_RESOURCE',
      service: 'IMAGE',
      name: 'Alice',
      identifier: 'photo',
      path: '',
      encoding: 'base64',
      rebuild: true,
      maxBytes: 5 * 1024 * 1024,
    });
  });

  it('rejects image previews over the bridge preview limit before fetching bytes', async () => {
    qdnRequestMock.mockResolvedValueOnce({ mimeType: 'image/png', size: 5 * 1024 * 1024 + 1 });

    await expect(
      fetchQdnImagePreview({
        name: 'Alice',
        path: '',
        qdnUrl: 'qdn://IMAGE/Alice',
        service: 'IMAGE',
      }),
    ).rejects.toThrow('Image preview exceeds the 5 MB limit.');
    expect(qdnRequestMock).toHaveBeenCalledTimes(1);
  });
});
