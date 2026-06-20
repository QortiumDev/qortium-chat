import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchQdnImagePreview,
  fetchQdnImagePreviews,
  getImageQdnResources,
  getMediaQdnResources,
  getMessageSegments,
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

  it('returns a single text segment when there is no fenced code', () => {
    expect(getMessageSegments('just some text')).toEqual([{ kind: 'text', text: 'just some text' }]);
  });

  it('splits a fenced code block with a language hint from surrounding text', () => {
    expect(getMessageSegments('Try this:\n```ts\nconst x = 1;\n```\nDone')).toEqual([
      { kind: 'text', text: 'Try this:' },
      { content: 'const x = 1;', kind: 'code', lang: 'ts' },
      { kind: 'text', text: 'Done' },
    ]);
  });

  it('preserves blank lines and indentation inside a code block', () => {
    expect(getMessageSegments('```\nline 1\n\n  indented\n```')).toEqual([
      { content: 'line 1\n\n  indented', kind: 'code', lang: '' },
    ]);
  });

  it('treats a single-line fence as code with no language hint', () => {
    expect(getMessageSegments('inline ```code``` here')).toEqual([
      { kind: 'text', text: 'inline ' },
      { content: 'code', kind: 'code', lang: '' },
      { kind: 'text', text: ' here' },
    ]);
  });

  it('handles multiple code blocks in one message', () => {
    expect(getMessageSegments('```a```\nand\n```b```')).toEqual([
      { content: 'a', kind: 'code', lang: '' },
      { kind: 'text', text: 'and' },
      { content: 'b', kind: 'code', lang: '' },
    ]);
  });

  it('leaves an unterminated fence as plain text', () => {
    expect(getMessageSegments('start ```not closed')).toEqual([{ kind: 'text', text: 'start ```not closed' }]);
  });

  it('ignores app links inside fenced code blocks when extracting resources', () => {
    expect(getImageQdnResources('See qdn://IMAGE/Alice/photo-1\n```\nqdn://IMAGE/Bob/photo-2\n```')).toEqual([
      {
        identifier: 'photo-1',
        name: 'Alice',
        path: '',
        qdnUrl: 'qdn://IMAGE/Alice/photo-1',
        service: 'IMAGE',
      },
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

  it('extracts gif repository qdn resources from single-file, repository, and file links', () => {
    expect(
      getImageQdnResources(
        'Open qdn://GIF_REPOSITORY/7R15M3G157U5/Qortium-gif, qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo, and qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo/orbit-demo.gif.',
      ),
    ).toEqual([
      {
        identifier: 'Qortium-gif',
        name: '7R15M3G157U5',
        path: '',
        qdnUrl: 'qdn://GIF_REPOSITORY/7R15M3G157U5/Qortium-gif',
        service: 'GIF_REPOSITORY',
      },
      {
        identifier: 'home-gif-demo',
        name: 'QortiumHomeTest',
        path: '',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo',
        service: 'GIF_REPOSITORY',
      },
      {
        identifier: 'home-gif-demo',
        name: 'QortiumHomeTest',
        path: 'orbit-demo.gif',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo/orbit-demo.gif',
        service: 'GIF_REPOSITORY',
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

  it('fetches each gif file from a pathless gif repository resource', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({
        files: [
          'signal-bars-demo.gif',
          'notes.txt',
          'nested/orbit-demo.gif',
          'bad//path.gif',
          'other.GIF',
        ],
      })
      .mockResolvedValueOnce({ filename: 'nested/orbit-demo.gif', mimeType: 'image/gif', size: 128 })
      .mockResolvedValueOnce({ filename: 'other.GIF', mimeType: 'image/gif', size: 256 })
      .mockResolvedValueOnce({ filename: 'signal-bars-demo.gif', mimeType: 'image/gif', size: 512 })
      .mockResolvedValueOnce('R0lGODlhAA==')
      .mockResolvedValueOnce('R0lGODlhBB==')
      .mockResolvedValueOnce('R0lGODlhCC==');

    await expect(
      fetchQdnImagePreviews({
        identifier: 'home-gif-demo',
        name: 'QortiumHomeTest',
        path: '',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo',
        service: 'GIF_REPOSITORY',
      }),
    ).resolves.toEqual([
      {
        alt: 'nested/orbit-demo.gif',
        mimeType: 'image/gif',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo/nested/orbit-demo.gif',
        src: 'data:image/gif;base64,R0lGODlhAA==',
      },
      {
        alt: 'other.GIF',
        mimeType: 'image/gif',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo/other.GIF',
        src: 'data:image/gif;base64,R0lGODlhBB==',
      },
      {
        alt: 'signal-bars-demo.gif',
        mimeType: 'image/gif',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo/signal-bars-demo.gif',
        src: 'data:image/gif;base64,R0lGODlhCC==',
      },
    ]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GET_QDN_RESOURCE_METADATA',
      service: 'GIF_REPOSITORY',
      name: 'QortiumHomeTest',
      identifier: 'home-gif-demo',
      path: '',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'GET_QDN_RESOURCE_PROPERTIES',
      service: 'GIF_REPOSITORY',
      name: 'QortiumHomeTest',
      identifier: 'home-gif-demo',
      path: 'nested/orbit-demo.gif',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(5, {
      action: 'FETCH_QDN_RESOURCE',
      service: 'GIF_REPOSITORY',
      name: 'QortiumHomeTest',
      identifier: 'home-gif-demo',
      path: 'nested/orbit-demo.gif',
      encoding: 'base64',
      rebuild: true,
      maxBytes: 5 * 1024 * 1024,
    });
  });

  it('fetches a pathless gif repository as one preview when metadata has no gif files', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ files: ['notes.txt'] })
      .mockResolvedValueOnce({ filename: 'Qortium-gif.gif', size: 128 })
      .mockResolvedValueOnce('R0lGODlhAA==');

    await expect(
      fetchQdnImagePreviews({
        identifier: 'Qortium-gif',
        name: '7R15M3G157U5',
        path: '',
        qdnUrl: 'qdn://GIF_REPOSITORY/7R15M3G157U5/Qortium-gif',
        service: 'GIF_REPOSITORY',
      }),
    ).resolves.toEqual([
      {
        alt: 'Qortium-gif.gif',
        mimeType: 'image/gif',
        qdnUrl: 'qdn://GIF_REPOSITORY/7R15M3G157U5/Qortium-gif',
        src: 'data:image/gif;base64,R0lGODlhAA==',
      },
    ]);
  });

  it('fetches linked gif repository file resources without metadata expansion', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ filename: 'orbit-demo.gif', mimeType: 'image/gif', size: 128 })
      .mockResolvedValueOnce('R0lGODlhAA==');

    await expect(
      fetchQdnImagePreviews({
        identifier: 'home-gif-demo',
        name: 'QortiumHomeTest',
        path: 'orbit-demo.gif',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo/orbit-demo.gif',
        service: 'GIF_REPOSITORY',
      }),
    ).resolves.toEqual([
      {
        alt: 'orbit-demo.gif',
        mimeType: 'image/gif',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo/orbit-demo.gif',
        src: 'data:image/gif;base64,R0lGODlhAA==',
      },
    ]);
    expect(qdnRequestMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'GET_QDN_RESOURCE_METADATA',
      }),
    );
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
