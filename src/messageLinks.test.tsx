import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchQdnImagePreview,
  getImageQdnResources,
  getMediaQdnResources,
  getMessageTextParts,
  openQdnMediaPlayer,
  openQdnUrlInHomeTab,
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

  it('splits message text around qdn links', () => {
    expect(getMessageTextParts('Open qdn://APP/Chat/Chat now')).toEqual([
      { kind: 'text', text: 'Open ' },
      { kind: 'qdn-link', text: 'qdn://APP/Chat/Chat', qdnUrl: 'qdn://APP/Chat/Chat' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('keeps common trailing punctuation outside the qdn link', () => {
    expect(getMessageTextParts('Look at (qdn://APP/Chat/Chat/default/index.html).')).toEqual([
      { kind: 'text', text: 'Look at (' },
      {
        kind: 'qdn-link',
        text: 'qdn://APP/Chat/Chat/default/index.html',
        qdnUrl: 'qdn://APP/Chat/Chat/default/index.html',
      },
      { kind: 'text', text: ').' },
    ]);
  });

  it('preserves balanced punctuation inside qdn paths', () => {
    expect(getMessageTextParts('Open qdn://APP/Name/default/path(foo).')).toEqual([
      { kind: 'text', text: 'Open ' },
      {
        kind: 'qdn-link',
        text: 'qdn://APP/Name/default/path(foo)',
        qdnUrl: 'qdn://APP/Name/default/path(foo)',
      },
      { kind: 'text', text: '.' },
    ]);
  });

  it('opens qdn urls through the upcoming Home tab bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce(true);

    await expect(openQdnUrlInHomeTab('qdn://APP/Chat/Chat')).resolves.toBe(true);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'OPEN_NEW_TAB',
      qdnUrl: 'qdn://APP/Chat/Chat',
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
