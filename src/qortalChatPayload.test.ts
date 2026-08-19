import { describe, expect, it } from 'vitest';
import { extractPlainTextFromParagraphHtml } from './chatText';
import {
  buildQortalDirectChatEditPayload,
  buildQortalDirectChatPayload,
  buildQortalHubGroupChatPayload,
  normalizeQortalOutgoingMessage,
} from './qortalChatPayload';

// The canonical vector: interop fixture qortium/git/qortium-home-main-ro/
// scripts/fixtures/qortal-chat-interop-v1.json, directMessage.plaintext.
const FIXTURE_DIRECT_PLAINTEXT =
  '{"message":"<p>Qortal direct interop</p>","version":2,"specialId":"h0b-direct","repliedTo":"","type":""}';

describe('Qortal Hub group-chat payloads', () => {
  it('keeps ordinary text unchanged, including arbitrary JSON', () => {
    expect(normalizeQortalOutgoingMessage('hello')).toEqual({ repliedTo: null, text: 'hello' });
    expect(normalizeQortalOutgoingMessage('{"message":"typed JSON"}')).toEqual({
      repliedTo: null,
      text: '{"message":"typed JSON"}',
    });
  });

  it('extracts the exact reply envelope Chat creates', () => {
    expect(normalizeQortalOutgoingMessage('{"message":"hello back","repliedTo":"reply-sig"}')).toEqual({
      repliedTo: 'reply-sig',
      text: 'hello back',
    });
  });

  it('extracts attachments from Chat\'s own envelope, with or without a reply', () => {
    const descriptor = { resource: { identifier: 'id-1', name: 'Alice', service: 'IMAGE' } };

    expect(
      normalizeQortalOutgoingMessage(JSON.stringify({ message: 'a file', attachments: [descriptor] })),
    ).toEqual({ attachments: [descriptor], repliedTo: null, text: 'a file' });

    expect(
      normalizeQortalOutgoingMessage(
        JSON.stringify({ message: 'a file', repliedTo: 'reply-sig', attachments: [descriptor] }),
      ),
    ).toEqual({ attachments: [descriptor], repliedTo: 'reply-sig', text: 'a file' });
  });

  it('builds the Hub v3 Tiptap envelope with line breaks and reply metadata', () => {
    const payload = JSON.parse(
      buildQortalHubGroupChatPayload(
        { repliedTo: 'reply-sig', text: 'Hello\nQortal' },
        'fixed-special-id',
      ),
    ) as Record<string, unknown>;

    expect(payload).toEqual({
      images: [],
      isEdited: false,
      messageText: {
        content: [
          {
            content: [
              { text: 'Hello', type: 'text' },
              { type: 'hardBreak' },
              { text: 'Qortal', type: 'text' },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      repliedTo: 'reply-sig',
      specialId: 'fixed-special-id',
      type: '',
      version: 3,
    });
  });

  it('embeds a private attachment into the images[] array when supplied', () => {
    const descriptor = { identifier: 'id-1', name: 'Alice', service: 'IMAGE' };
    const payload = JSON.parse(
      buildQortalHubGroupChatPayload({ repliedTo: null, text: 'a photo' }, 'sid', [descriptor]),
    ) as Record<string, unknown>;

    expect(payload.images).toEqual([descriptor]);
  });
});

describe('Qortal direct-chat payloads', () => {
  it('matches the interop fixture verbatim, field-for-field', () => {
    const payload = buildQortalDirectChatPayload({ repliedTo: null, text: 'Qortal direct interop' }, 'h0b-direct');

    expect(JSON.parse(payload)).toEqual(JSON.parse(FIXTURE_DIRECT_PLAINTEXT));
  });

  it('defaults repliedTo to an empty string and generates a specialId when omitted', () => {
    const payload = JSON.parse(
      buildQortalDirectChatPayload({ repliedTo: null, text: 'hi' }),
    ) as Record<string, unknown>;

    expect(payload).toMatchObject({ message: '<p>hi</p>', repliedTo: '', type: '', version: 2 });
    expect(typeof payload.specialId).toBe('string');
    expect((payload.specialId as string).length).toBeGreaterThan(0);
  });

  it('embeds attachments as an extra key alongside the paragraph-HTML envelope', () => {
    const descriptor = { resource: { identifier: 'id-1', name: 'Alice', service: 'QCHAT_ATTACHMENT_PRIVATE' } };
    const payload = JSON.parse(
      buildQortalDirectChatPayload({ attachments: [descriptor], repliedTo: null, text: 'a file' }, 'sid'),
    ) as Record<string, unknown>;

    expect(payload).toEqual({
      message: '<p>a file</p>',
      version: 2,
      specialId: 'sid',
      repliedTo: '',
      type: '',
      attachments: [descriptor],
    });
  });

  it('carries a reply target through to repliedTo', () => {
    const payload = JSON.parse(
      buildQortalDirectChatPayload({ repliedTo: 'reply-sig', text: 'hi back' }, 'sid'),
    ) as Record<string, unknown>;

    expect(payload).toEqual({ message: '<p>hi back</p>', version: 2, specialId: 'sid', repliedTo: 'reply-sig', type: '' });
  });

  it('rejects an empty initial message before building the envelope', () => {
    expect(() => buildQortalDirectChatPayload({ repliedTo: null, text: '' })).toThrow(
      'Direct chat messages must not be empty.',
    );
  });

  it('serializes multi-line text as one <p> per line, including empty lines', () => {
    const payload = JSON.parse(
      buildQortalDirectChatPayload({ repliedTo: null, text: 'line1\n\nline2' }, 'sid'),
    ) as { message: string };

    expect(payload.message).toBe('<p>line1</p><p></p><p>line2</p>');
    expect(extractPlainTextFromParagraphHtml(payload.message)).toBe('line1\n\nline2');
  });

  it('escapes HTML-significant characters, including script tags and ampersands', () => {
    const payload = JSON.parse(
      buildQortalDirectChatPayload({ repliedTo: null, text: '<script>alert(1)</script> & "quoted" \'text\'' }, 'sid'),
    ) as { message: string };

    expect(payload.message).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot; &#39;text&#39;</p>',
    );
    // The escaped form round-trips back to the original text and never
    // executes/renders as a real script tag.
    expect(extractPlainTextFromParagraphHtml(payload.message)).toBe('<script>alert(1)</script> & "quoted" \'text\'');
  });

  it('aligns the edit payload to the same paragraph-HTML convention as the initial send', () => {
    const payload = JSON.parse(
      buildQortalDirectChatEditPayload({ repliedTo: null, text: 'fixed typo' }, 'sid'),
    ) as Record<string, unknown>;

    expect(payload).toEqual({
      isEdited: true,
      message: '<p>fixed typo</p>',
      repliedTo: '',
      specialId: 'sid',
      type: 'edit',
      version: 2,
    });
  });
});
