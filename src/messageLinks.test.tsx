import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  fetchMessageQdnImagePreviews,
  fetchQdnImagePreview,
  fetchQdnImagePreviews,
  fetchQdnResourceCard,
  getDocumentQdnResources,
  getImageQdnResources,
  getMediaQdnResources,
  getMessageQdnResources,
  getMessageSegments,
  getMessageTextParts,
  getQortalHubImageResources,
  MessageResourceCards,
  openAppLinkInHomeTab,
  openQdnDocumentViewer,
  openQdnMediaPlayer,
  renderMessageTextWithAppLinks,
  saveQdnResource,
} from './messageLinks';
import { createTranslator } from './i18n';
import { qdnRequest } from './qdnRequest';
import { qortalRequest } from './qortalRequest';

vi.mock('./qdnRequest', () => ({
  qdnRequest: vi.fn(),
}));
vi.mock('./qortalRequest', () => ({
  qortalRequest: vi.fn(),
}));

describe('message link helpers', () => {
  const qdnRequestMock = vi.mocked(qdnRequest);
  const qortalRequestMock = vi.mocked(qortalRequest);

  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it('splits http and https web links as copyable parts', () => {
    expect(getMessageTextParts('See http://example.com and https://qortium.org/docs now')).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'web-link', text: 'http://example.com', url: 'http://example.com' },
      { kind: 'text', text: ' and ' },
      { kind: 'web-link', text: 'https://qortium.org/docs', url: 'https://qortium.org/docs' },
      { kind: 'text', text: ' now' },
    ]);
  });

  it('keeps trailing punctuation outside web links', () => {
    expect(getMessageTextParts('Visit (https://qortium.org/path).')).toEqual([
      { kind: 'text', text: 'Visit (' },
      { kind: 'web-link', text: 'https://qortium.org/path', url: 'https://qortium.org/path' },
      { kind: 'text', text: ').' },
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
        network: 'qortium',
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

  it('qualifies bare qdn links by conversation and keeps native qortal links on Qortal', () => {
    expect(getMessageQdnResources('qdn://IMAGE/Alice/photo', 'qortal')).toEqual([
      {
        identifier: undefined,
        name: 'Alice',
        network: 'qortal',
        path: 'photo',
        qdnUrl: 'qdn://IMAGE/Alice/photo',
        service: 'IMAGE',
      },
    ]);
    expect(getMessageQdnResources('qortal://DOCUMENT/Bob/file', 'qortium')).toEqual([
      {
        identifier: undefined,
        name: 'Bob',
        network: 'qortal',
        path: 'file',
        qdnUrl: 'qortal://DOCUMENT/Bob/file',
        service: 'DOCUMENT',
      },
    ]);
  });

  it('labels resource metadata cards as public in visible text', () => {
    const resources = getMessageQdnResources('qortal://IMAGE/Alice/photo', 'qortal');
    const markup = renderToStaticMarkup(<MessageResourceCards resources={resources} t={createTranslator('en')} />);

    expect(markup).toContain('Public resource · Qortal · IMAGE · Alice');
  });

  it('matches Hub Qortal URI path, query-identifier, and default-WEBSITE semantics', () => {
    expect(
      getMessageQdnResources(
        'qortal://APP/Q-Tube/video/Alice/item?identifier=app-id&autoplay=true qortal://QuickMythril',
        'qortium',
      ),
    ).toEqual([
      {
        identifier: 'app-id',
        name: 'Q-Tube',
        network: 'qortal',
        path: 'video/Alice/item?autoplay=true',
        qdnUrl: 'qortal://APP/Q-Tube/video/Alice/item?identifier=app-id&autoplay=true',
        service: 'APP',
      },
      {
        identifier: undefined,
        name: 'QuickMythril',
        network: 'qortal',
        path: '',
        qdnUrl: 'qortal://QuickMythril',
        service: 'WEBSITE',
      },
    ]);
  });

  it('opens contextual and native Qortal resource links only through qortalRequest', async () => {
    qortalRequestMock.mockResolvedValue(true);

    await expect(openAppLinkInHomeTab('qdn://APP/Q-Tube/default', 'qortal')).resolves.toBe(true);
    await expect(openAppLinkInHomeTab('qortal://APP/Q-Tube/default', 'qortium')).resolves.toBe(true);

    expect(qortalRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'OPEN_NEW_TAB',
      address: 'qortal://APP/Q-Tube/default',
    });
    expect(qortalRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'OPEN_NEW_TAB',
      address: 'qortal://APP/Q-Tube/default',
    });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('renders HTTP and unavailable Qortal app links as visibly copy-only buttons', () => {
    const html = renderToStaticMarkup(
      <>
        {renderMessageTextWithAppLinks(
          'https://example.com qortal://APP/Q-Tube home://settings',
          undefined,
          'qortal',
        )}
      </>,
    );

    expect(html).toContain('<button');
    expect(html).toContain('message__web-link');
    expect(html).toContain('message__app-link--copy-only');
    expect(html).toContain('>Copy</span>');
    expect(html).toContain('href="home://settings"');
    expect(html).not.toContain('href="https://example.com"');
    expect(html).not.toContain('href="qortal://APP/Q-Tube"');
  });

  it('renders Qortal app links as anchors only when that network advertises OPEN_NEW_TAB', () => {
    const html = renderToStaticMarkup(
      <>
        {renderMessageTextWithAppLinks('qortal://APP/Q-Tube', undefined, 'qortal', {
          canOpenQortalAppLinks: true,
        })}
      </>,
    );

    expect(html).toContain('href="qortal://APP/Q-Tube"');
    expect(html).not.toContain('message__app-link--copy-only');
  });

  it('rejects ambiguous resource coordinates instead of forwarding them to a bridge', () => {
    expect(getMessageQdnResources('qdn://IMAGE/Alice/id/../secret', 'qortium')).toEqual([]);
    expect(getMessageQdnResources('qdn://IMAGE/Alice/id?identifier=photo&filepath=../secret', 'qortium')).toEqual([]);
    expect(getMessageQdnResources('qortal://IMAGE/Alice%2FAdmin/photo', 'qortium')).toEqual([]);
    expect(getMessageQdnResources('qdn://IMAGE/%2e%2e/photo', 'qortium')).toEqual([]);
    expect(getMessageQdnResources('qdn://IMAGE/Alice/%2e%2e', 'qortium')).toEqual([]);
    expect(getMessageQdnResources('qortal://IMAGE/%2E%2E/photo', 'qortium')).toEqual([]);
    expect(getMessageQdnResources('qortal://IMAGE/Alice/photo?identifier=%2e%2e', 'qortium')).toEqual([]);
  });

  it('turns validated Hub image refs into explicit Qortal image resources', () => {
    expect(
      getQortalHubImageResources([
        { identifier: 'img-id', name: 'Quick Mythril', service: 'image', timestamp: 1783403484577 },
        { identifier: '../bad', name: 'Quick Mythril', service: 'IMAGE' },
      ]),
    ).toEqual([
      {
        identifier: 'img-id',
        name: 'Quick Mythril',
        network: 'qortal',
        path: '',
        qdnUrl: 'qortal://IMAGE/Quick%20Mythril?identifier=img-id',
        service: 'IMAGE',
      },
    ]);
  });

  it('extracts image qdn resources from message text', () => {
    expect(getImageQdnResources('See qdn://IMAGE/Alice/photo-1 and qdn://APP/Chat/Chat')).toEqual([
      {
        identifier: 'photo-1',
        name: 'Alice',
        network: 'qortium',
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
        network: 'qortium',
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
        network: 'qortium',
        path: '',
        qdnUrl: 'qdn://GIF_REPOSITORY/7R15M3G157U5/Qortium-gif',
        service: 'GIF_REPOSITORY',
      },
      {
        identifier: 'home-gif-demo',
        name: 'QortiumHomeTest',
        network: 'qortium',
        path: '',
        qdnUrl: 'qdn://GIF_REPOSITORY/QortiumHomeTest/home-gif-demo',
        service: 'GIF_REPOSITORY',
      },
      {
        identifier: 'home-gif-demo',
        name: 'QortiumHomeTest',
        network: 'qortium',
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
        network: 'qortium',
        path: '',
        qdnUrl: 'qdn://AUDIO/Alice/episode-1',
        service: 'AUDIO',
      },
      {
        identifier: 'trailer',
        name: 'Bob',
        network: 'qortium',
        path: 'default/clips/demo.webm',
        qdnUrl: 'qdn://VIDEO/Bob/default/clips/demo.webm?identifier=trailer',
        service: 'VIDEO',
      },
    ]);
  });

  it('extracts document qdn resources from message text', () => {
    expect(
      getDocumentQdnResources(
        'Read qdn://DOCUMENT/Alice/whitepaper.pdf, qdn://FILE/Bob/notes, and ignore qdn://IMAGE/Alice/photo.',
      ),
    ).toEqual([
      {
        identifier: 'whitepaper.pdf',
        name: 'Alice',
        network: 'qortium',
        path: '',
        qdnUrl: 'qdn://DOCUMENT/Alice/whitepaper.pdf',
        service: 'DOCUMENT',
      },
      {
        identifier: 'notes',
        name: 'Bob',
        network: 'qortium',
        path: '',
        qdnUrl: 'qdn://FILE/Bob/notes',
        service: 'FILE',
      },
    ]);
  });

  it('opens documents through the Home document viewer bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce(true);

    await expect(
      openQdnDocumentViewer({
        identifier: 'whitepaper.pdf',
        name: 'Alice',
        network: 'qortium',
        path: '',
        qdnUrl: 'qdn://DOCUMENT/Alice/whitepaper.pdf',
        service: 'DOCUMENT',
      }),
    ).resolves.toBe(true);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'OPEN_QDN_DOCUMENT_VIEWER',
      service: 'DOCUMENT',
      name: 'Alice',
      identifier: 'whitepaper.pdf',
      path: '',
    });
  });

  it('saves a resource through the Home save bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce({ canceled: false });

    await expect(
      saveQdnResource(
        {
          identifier: 'whitepaper.pdf',
          name: 'Alice',
          network: 'qortium',
          path: '',
          qdnUrl: 'qdn://DOCUMENT/Alice/whitepaper.pdf',
          service: 'DOCUMENT',
        },
        ['SAVE_QDN_RESOURCE'],
      ),
    ).resolves.toEqual({ canceled: false });
    // Routed through coreApi's P4a SAVE_QDN_RESOURCE wrapper now — it only
    // forwards a truthy `path`, so an empty one (as here) is omitted rather
    // than sent as ''.
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'SAVE_QDN_RESOURCE',
      service: 'DOCUMENT',
      name: 'Alice',
      identifier: 'whitepaper.pdf',
    });
  });

  it('opens media resources through the Home media player bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce(true);

    await expect(
      openQdnMediaPlayer({
        identifier: 'episode-1',
        name: 'Alice',
        network: 'qortium',
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

  it('routes Qortal media, document, and save actions only through qortalRequest', async () => {
    qortalRequestMock.mockResolvedValue(true);
    const media = {
      identifier: 'episode-1',
      name: 'Alice',
      network: 'qortal' as const,
      path: '',
      qdnUrl: 'qortal://AUDIO/Alice/episode-1',
      service: 'AUDIO' as const,
    };
    const document = {
      identifier: 'notes',
      name: 'Alice',
      network: 'qortal' as const,
      path: '',
      qdnUrl: 'qortal://DOCUMENT/Alice/notes',
      service: 'DOCUMENT' as const,
    };

    await openQdnMediaPlayer(media);
    await openQdnDocumentViewer(document);
    await saveQdnResource(document, ['SAVE_QDN_RESOURCE']);

    expect(qortalRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'OPEN_QDN_MEDIA_PLAYER',
      identifier: 'episode-1',
      name: 'Alice',
      path: '',
      service: 'AUDIO',
    });
    expect(qortalRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'OPEN_QDN_DOCUMENT_VIEWER',
      identifier: 'notes',
      name: 'Alice',
      path: '',
      service: 'DOCUMENT',
    });
    // Routed through coreApi's wrapper now — a falsy path is omitted.
    expect(qortalRequestMock).toHaveBeenNthCalledWith(3, {
      action: 'SAVE_QDN_RESOURCE',
      identifier: 'notes',
      name: 'Alice',
      service: 'DOCUMENT',
    });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('fetches image previews as base64 through the Home bridge', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ filename: 'photo.png', mimeType: 'image/png', size: 128 })
      .mockResolvedValueOnce('iVBORw0KGgo=');

    await expect(
      fetchQdnImagePreview({
        identifier: 'photo',
        name: 'Alice',
        network: 'qortium',
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
      maxBytes: 64 * 1024,
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

  it('fetches Qortal image previews through qortalRequest without a Qortium properties probe', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      body: 'iVBORw0KGgo=',
      contentLength: 8,
      contentType: 'image/png',
      encoding: 'base64',
    });

    await expect(
      fetchQdnImagePreview({
        identifier: 'photo',
        name: 'Alice',
        network: 'qortal',
        path: '',
        qdnUrl: 'qortal://IMAGE/Alice/photo',
        service: 'IMAGE',
      }),
    ).resolves.toMatchObject({
      mimeType: 'image/png',
      qdnUrl: 'qortal://IMAGE/Alice/photo',
      src: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(qortalRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_QDN_RESOURCE',
      service: 'IMAGE',
      name: 'Alice',
      identifier: 'photo',
      path: '',
      encoding: 'base64',
      rebuild: true,
      maxBytes: 5 * 1024 * 1024,
    });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('loads bounded metadata cards from the descriptor network and keeps safe coordinate fallback', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      description: 'A\ncompact   description',
      mimeType: 'text/html',
      title: 'Q-Tube',
    });

    await expect(
      fetchQdnResourceCard({
        identifier: 'default',
        name: 'Q-Tube',
        network: 'qortal',
        path: '',
        qdnUrl: 'qortal://APP/Q-Tube/default',
        service: 'APP',
      }),
    ).resolves.toEqual({
      description: 'A compact description',
      mimeType: 'text/html',
      network: 'qortal',
      subtitle: 'Qortal · APP · Q-Tube',
      title: 'Q-Tube',
    });
    expect(qortalRequestMock).toHaveBeenCalledWith({
      action: 'GET_QDN_RESOURCE_METADATA',
      service: 'APP',
      name: 'Q-Tube',
      identifier: 'default',
      maxBytes: 128 * 1024,
      path: '',
    });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('rejects non-raster bytes even when a bridge labels them as an image', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      body: 'PHN2Zz48c2NyaXB0Pg==',
      contentLength: 13,
      contentType: 'image/svg+xml',
      encoding: 'base64',
    });

    await expect(
      fetchQdnImagePreview({
        identifier: 'unsafe',
        name: 'Alice',
        network: 'qortal',
        path: '',
        qdnUrl: 'qortal://IMAGE/Alice/unsafe',
        service: 'IMAGE',
      }),
    ).rejects.toThrow('unsupported or unsafe image bytes');
  });

  it('requires the WEBP form type instead of accepting every RIFF payload', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      body: btoa('RIFF\u0004\u0000\u0000\u0000WAVE'),
      contentLength: 12,
      contentType: 'image/webp',
      encoding: 'base64',
    });

    await expect(
      fetchQdnImagePreview({
        identifier: 'unsafe-riff',
        name: 'Alice',
        network: 'qortal',
        path: '',
        qdnUrl: 'qortal://IMAGE/Alice?identifier=unsafe-riff',
        service: 'IMAGE',
      }),
    ).rejects.toThrow('unsupported or unsafe image bytes');
  });

  it('rejects encoded raster dimensions beyond the practical display limit before browser decode', async () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 9000);
    new DataView(png.buffer).setUint32(20, 10);
    qortalRequestMock.mockResolvedValueOnce({
      body: btoa(String.fromCharCode(...png)),
      contentLength: png.byteLength,
      contentType: 'image/png',
      encoding: 'base64',
    });

    await expect(
      fetchQdnImagePreview({
        identifier: 'huge-pixels',
        name: 'Alice',
        network: 'qortal',
        path: '',
        qdnUrl: 'qortal://IMAGE/Alice?identifier=huge-pixels',
        service: 'IMAGE',
      }),
    ).rejects.toThrow('dimensions exceed the safe display limit');
  });

  it('caps one message preview operation to eight resources', async () => {
    qortalRequestMock.mockResolvedValue({
      body: 'iVBORw0KGgo=',
      contentLength: 8,
      contentType: 'image/png',
      encoding: 'base64',
    });
    const resources = Array.from({ length: 12 }, (_, index) => ({
      identifier: `photo-${index}`,
      name: 'Alice',
      network: 'qortal' as const,
      path: '',
      qdnUrl: `qortal://IMAGE/Alice?identifier=photo-${index}`,
      service: 'IMAGE' as const,
    }));

    await expect(fetchMessageQdnImagePreviews(resources)).resolves.toHaveLength(8);
    expect(qortalRequestMock).toHaveBeenCalledTimes(8);
  });

  it('reserves failed preview allowances against the aggregate message byte budget', async () => {
    qortalRequestMock.mockRejectedValue(new Error('invalid resource'));
    const resources = Array.from({ length: 8 }, (_, index) => ({
      identifier: `bad-${index}`,
      name: 'Alice',
      network: 'qortal' as const,
      path: '',
      qdnUrl: `qortal://IMAGE/Alice?identifier=bad-${index}`,
      service: 'IMAGE' as const,
    }));

    await expect(fetchMessageQdnImagePreviews(resources)).rejects.toThrow('invalid resource');
    expect(qortalRequestMock).toHaveBeenCalledTimes(3);
    expect(qortalRequestMock.mock.calls.map(([request]) => request.maxBytes)).toEqual([
      5 * 1024 * 1024,
      5 * 1024 * 1024,
      2 * 1024 * 1024,
    ]);
  });

  it('limits automatic metadata work to four concurrent bridge requests', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    qdnRequestMock.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const requests = Array.from({ length: 6 }, (_, index) =>
      fetchQdnResourceCard({
        identifier: `card-${index}`,
        name: 'Alice',
        network: 'qortium',
        path: '',
        qdnUrl: `qdn://APP/Alice/card-${index}`,
        service: 'APP',
      }),
    );

    await vi.waitFor(() => expect(qdnRequestMock).toHaveBeenCalledTimes(4));
    resolvers[0]?.({ title: 'one' });
    resolvers[1]?.({ title: 'two' });
    await vi.waitFor(() => expect(qdnRequestMock).toHaveBeenCalledTimes(6));
    for (const resolve of resolvers) resolve({ title: 'done' });
    await expect(Promise.all(requests)).resolves.toHaveLength(6);
  });

  it('fetches each gif file from a pathless gif repository resource', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({
        files: [
          'signal-bars-demo.gif',
          'notes.txt',
          'nested/orbit-demo.gif',
          'bad//path.gif',
          '../traversal.gif',
          'other.GIF',
        ],
      })
      .mockResolvedValueOnce({ filename: 'nested/orbit-demo.gif', mimeType: 'image/gif', size: 128 })
      .mockResolvedValueOnce('R0lGODlhAA==')
      .mockResolvedValueOnce({ filename: 'other.GIF', mimeType: 'image/gif', size: 256 })
      .mockResolvedValueOnce('R0lGODlhBB==')
      .mockResolvedValueOnce({ filename: 'signal-bars-demo.gif', mimeType: 'image/gif', size: 512 })
      .mockResolvedValueOnce('R0lGODlhCC==');

    await expect(
      fetchQdnImagePreviews({
        identifier: 'home-gif-demo',
        name: 'QortiumHomeTest',
        network: 'qortium',
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
      maxBytes: 128 * 1024,
      path: '',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'GET_QDN_RESOURCE_PROPERTIES',
      service: 'GIF_REPOSITORY',
      name: 'QortiumHomeTest',
      identifier: 'home-gif-demo',
      maxBytes: 64 * 1024,
      path: 'nested/orbit-demo.gif',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(3, {
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

  it('decodes intrinsic image dimensions before returning a preview', async () => {
    class LoadedImage {
      naturalHeight = 360;
      naturalWidth = 640;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal('Image', LoadedImage);
    qdnRequestMock
      .mockResolvedValueOnce({ filename: 'photo.png', mimeType: 'image/png', size: 128 })
      .mockResolvedValueOnce('iVBORw0KGgo=');

    await expect(
      fetchQdnImagePreview({
        identifier: 'photo',
        name: 'Alice',
        network: 'qortium',
        path: '',
        qdnUrl: 'qdn://IMAGE/Alice/photo',
        service: 'IMAGE',
      }),
    ).resolves.toEqual({
      alt: 'photo.png',
      height: 360,
      mimeType: 'image/png',
      qdnUrl: 'qdn://IMAGE/Alice/photo',
      src: 'data:image/png;base64,iVBORw0KGgo=',
      width: 640,
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
        network: 'qortium',
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

  it('keeps Hub identifier-query semantics when expanding a Qortal GIF repository file', async () => {
    qortalRequestMock
      .mockResolvedValueOnce({ files: ['nested/orbit.gif'] })
      .mockResolvedValueOnce({
        body: 'R0lGODlhAA==',
        contentLength: 7,
        contentType: 'image/gif',
        encoding: 'base64',
      });

    await expect(
      fetchQdnImagePreviews({
        identifier: 'repo-id',
        name: 'Alice',
        network: 'qortal',
        path: '',
        qdnUrl: 'qortal://GIF_REPOSITORY/Alice?identifier=repo-id',
        service: 'GIF_REPOSITORY',
      }),
    ).resolves.toEqual([
      {
        alt: 'qortal://GIF_REPOSITORY/Alice/nested/orbit.gif?identifier=repo-id',
        mimeType: 'image/gif',
        qdnUrl: 'qortal://GIF_REPOSITORY/Alice/nested/orbit.gif?identifier=repo-id',
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
        network: 'qortium',
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
        network: 'qortium',
        path: '',
        qdnUrl: 'qdn://IMAGE/Alice',
        service: 'IMAGE',
      }),
    ).rejects.toThrow('Image preview exceeds the current preview byte limit.');
    expect(qdnRequestMock).toHaveBeenCalledTimes(1);
  });
});
