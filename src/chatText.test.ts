import { describe, expect, it } from 'vitest';
import {
  buildChatMessageText,
  buildDeletedMessageText,
  buildReactionMessageText,
  decodeChatMessage,
  encodeBase64,
  formatTimeAgo,
  formatTimestamp,
  getSenderLabel,
  isHiddenChatMessage,
  isMachineChatMessage,
} from './chatText';
import {
  buildQortalDirectChatDeletePayload,
  buildQortalDirectChatEditPayload,
  buildQortalDirectChatPayload,
  buildQortalDirectChatReactionPayload,
} from './qortalChatPayload';

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);

  return btoa(String.fromCharCode(...bytes));
}

function decodeHubText(messageText: unknown) {
  return decodeChatMessage({
    data: encodeBase64(JSON.stringify({ messageText, version: 3 })),
    isText: true,
  }).body;
}

describe('encodeBase64', () => {
  it('round-trips through decodeChatMessage identically to a server-encoded message', () => {
    const text = 'a message with unicode: café 🎉';

    expect(
      decodeChatMessage({ data: encodeBase64(text), encoding: 'BASE64', isEncrypted: false, isText: true }),
    ).toEqual({
      body: text,
      kind: 'text',
      repliedTo: null,
    });
  });

  it('matches the existing base64() helper used by the rest of this suite', () => {
    expect(encodeBase64('hello')).toBe(base64('hello'));
  });
});

describe('chat text helpers', () => {
  it('decodes plain BASE64 text', () => {
    expect(decodeChatMessage({ data: base64('hello'), encoding: 'BASE64', isEncrypted: false, isText: true })).toEqual({
      body: 'hello',
      kind: 'text',
      repliedTo: null,
    });
  });

  it('unwraps direct message JSON text', () => {
    const data = base64(JSON.stringify({ message: 'private text wrapper', version: 2 }));

    expect(decodeChatMessage({ data, encoding: 'BASE64', isEncrypted: false, isText: true })).toEqual({
      body: 'private text wrapper',
      kind: 'text',
      repliedTo: null,
    });
  });

  it('extracts the reply target from a reply envelope', () => {
    const data = base64(buildChatMessageText('a reply', 'original-signature'));

    expect(decodeChatMessage({ data, encoding: 'BASE64', isEncrypted: false, isText: true })).toEqual({
      body: 'a reply',
      kind: 'text',
      repliedTo: 'original-signature',
    });
  });

  it('unwraps a reply envelope nested inside a direct message wrapper', () => {
    const data = base64(JSON.stringify({ message: buildChatMessageText('nested reply', 'sig'), version: 2 }));

    expect(decodeChatMessage({ data, encoding: 'BASE64', isEncrypted: false, isText: true })).toEqual({
      body: 'nested reply',
      kind: 'text',
      repliedTo: 'sig',
    });
  });

  it('builds plain text unless a reply target is set', () => {
    expect(buildChatMessageText('hello')).toBe('hello');
    expect(buildChatMessageText('hello', null)).toBe('hello');
    expect(JSON.parse(buildChatMessageText('hello', 'sig'))).toEqual({ message: 'hello', repliedTo: 'sig' });
  });

  it('builds and decodes reaction envelopes', () => {
    const reactionMessage = buildReactionMessageText('👍', true);
    const data = base64(reactionMessage);

    expect(JSON.parse(reactionMessage)).toEqual({
      message: '',
      type: 'reaction',
      content: '👍',
      contentState: true,
    });
    expect(decodeChatMessage({ data, encoding: 'BASE64', isEncrypted: false, isText: true })).toEqual({
      body: '',
      kind: 'reaction',
      reaction: {
        content: '👍',
        contentState: true,
      },
      repliedTo: null,
    });
  });

  it('supports reaction emoji outside the quick picker set', () => {
    const data = base64(buildReactionMessageText('🔥', true));

    expect(decodeChatMessage({ data, encoding: 'BASE64', isEncrypted: false, isText: true })).toMatchObject({
      kind: 'reaction',
      reaction: {
        content: '🔥',
        contentState: true,
      },
    });
  });

  it('unwraps reaction envelopes nested inside direct message wrappers', () => {
    const data = base64(JSON.stringify({ message: buildReactionMessageText('❤️', false), version: 2 }));

    expect(decodeChatMessage({ data, encoding: 'BASE64', isEncrypted: false, isText: true })).toEqual({
      body: '',
      kind: 'reaction',
      reaction: {
        content: '❤️',
        contentState: false,
      },
      repliedTo: null,
    });
  });

  it('returns placeholders for encrypted and binary messages', () => {
    expect(decodeChatMessage({ data: base64('secret'), encoding: 'BASE64', isEncrypted: true, isText: true })).toEqual({
      body: 'Encrypted message',
      kind: 'encrypted',
      repliedTo: null,
    });
    expect(
      decodeChatMessage({
        data: null,
        decryptionStatus: 'DECRYPTED',
        encoding: 'BASE64',
        isEncrypted: true,
        isText: true,
      }),
    ).toEqual({
      body: 'Encrypted message',
      kind: 'encrypted',
      repliedTo: null,
    });
    expect(decodeChatMessage({ data: base64('raw'), encoding: 'BASE64', isEncrypted: false, isText: false })).toEqual({
      body: 'Binary message',
      kind: 'binary',
      repliedTo: null,
    });
  });

  it('decodes private direct messages marked decrypted by Core', () => {
    expect(
      decodeChatMessage({
        data: base64(JSON.stringify({ message: 'direct decrypted text', version: 2 })),
        decryptionStatus: 'DECRYPTED',
        encoding: 'BASE64',
        isEncrypted: true,
        isText: true,
      }),
    ).toEqual({
      body: 'direct decrypted text',
      kind: 'text',
      repliedTo: null,
    });
  });

  it('decodes private group messages marked decrypted by Core', () => {
    expect(
      decodeChatMessage({
        data: base64('private group text'),
        encoding: 'BASE64',
        isEncrypted: true,
        isText: true,
        status: 'DECRYPTED',
      }),
    ).toEqual({
      body: 'private group text',
      kind: 'text',
      repliedTo: null,
    });
  });

  it('keeps unreadable private messages hidden', () => {
    expect(
      decodeChatMessage({
        data: base64('legacy encrypted direct'),
        decryptionStatus: 'UNSUPPORTED',
        encoding: 'BASE64',
        isEncrypted: true,
        isText: true,
      }),
    ).toMatchObject({
      body: 'Encrypted message',
      kind: 'encrypted',
    });
    expect(
      decodeChatMessage({
        data: null,
        encoding: 'BASE64',
        isEncrypted: true,
        isText: true,
        status: 'MISSING_KEY',
      }),
    ).toMatchObject({
      body: 'Private group key missing',
      kind: 'encrypted',
    });
  });

  it('caches decode results per message object and recomputes on change', () => {
    const message = { data: base64('cached body'), encoding: 'BASE64' as const, isEncrypted: false, isText: true };

    const first = decodeChatMessage(message);
    const second = decodeChatMessage(message);

    // Same object reference + same fields → identical cached result.
    expect(second).toBe(first);

    // Mutating a decode-relevant field invalidates the cached entry.
    message.data = base64('new body');
    const third = decodeChatMessage(message);

    expect(third).not.toBe(first);
    expect(third.body).toBe('new body');
  });

  it('formats elapsed time in minutes and hours only', () => {
    const now = 1_750_000_000_000;
    const minute = 60_000;
    const hour = 60 * minute;

    expect(formatTimeAgo(undefined, now, 'en')).toBe('');
    expect(formatTimeAgo(now - 20_000, now, 'en')).toBe('now');
    expect(formatTimeAgo(now + 5_000, now, 'en')).toBe('now');
    expect(formatTimeAgo(now - 5 * minute, now, 'en')).toBe('5 min. ago');
    expect(formatTimeAgo(now - 59 * minute - 59_000, now, 'en')).toBe('59 min. ago');
    expect(formatTimeAgo(now - hour, now, 'en')).toBe('1 hr. ago');
    expect(formatTimeAgo(now - 23 * hour - 59 * minute, now, 'en')).toBe('23 hr. ago');
  });

  it('formats timestamps and sender labels', () => {
    expect(formatTimestamp(undefined)).toBe('');
    expect(getSenderLabel({ sender: 'Q123456789abcdef', senderName: 'Alice' })).toBe('Alice');
    expect(getSenderLabel({ sender: 'Q123456789abcdef' })).toBe('Q1234567...abcdef');
  });

  it('builds delete revisions that decode to an empty body', () => {
    // Non-empty transaction payload, empty display body, reply target kept.
    expect(buildDeletedMessageText('sig1').length).toBeGreaterThan(0);

    const withReply = decodeChatMessage({ data: base64(buildDeletedMessageText('sig1')), isText: true });

    expect(withReply.body).toBe('');
    expect(withReply.repliedTo).toBe('sig1');

    const withoutReply = decodeChatMessage({ data: base64(buildDeletedMessageText()), isText: true });

    expect(withoutReply.body).toBe('');
    expect(withoutReply.repliedTo).toBeNull();
  });
});

describe('machine messages', () => {
  const chessEnvelope = JSON.stringify({ app: 'chess', qch1: { type: 'move', move: 'e2e4' } });

  it('classifies app-marked JSON without a message field as machine', () => {
    const decoded = decodeChatMessage({ data: base64(chessEnvelope), isText: true });

    expect(decoded.kind).toBe('machine');
    expect(decoded.machineApp).toBe('chess');
    expect(decoded.body).toBe('App data');
  });

  it('hides the real on-chain invite envelope', () => {
    // Verbatim payload observed in Previewnet group 14 — the shape this rule
    // exists to hide must stay hidden.
    const onChain =
      '{"app":"chess","qch1":{"protoTag":"QCH1","protoVersion":"1.0","type":"invite","gameId":"bf534031f47451c27f1b0d90b988d1c8","from":"QaLdnApWW3hps1qXM8cpsL1pVgw7RtyJmN","nonce":"7c59bcac81f7874fe4fa4b5438e1d304","ruleset":"classic","colorChoice":"Random","isPublic":true,"note":"Previewnet smoke invite"}}';
    const decoded = decodeChatMessage({ data: base64(onChain), isText: true });

    expect(decoded.kind).toBe('machine');
    expect(decoded.machineApp).toBe('chess');
  });

  // Only the outermost object is inspected. An envelope reached by unwrapping a
  // `{message}` wrapper belongs to a human who quoted it, so it stays visible.
  it('does not treat a quoted envelope inside a wrapper as machine data', () => {
    const wrapped = base64(JSON.stringify({ message: chessEnvelope }));
    const decoded = decodeChatMessage({ data: wrapped, isText: true });

    expect(decoded.kind).toBe('text');
    expect(decoded.body).toBe(chessEnvelope);
  });

  it('keeps a reply that quotes an envelope visible and preserves repliedTo', () => {
    const data = base64(buildChatMessageText(chessEnvelope, 'sig-reply'));
    const decoded = decodeChatMessage({ data, isText: true });

    expect(decoded.kind).toBe('text');
    expect(decoded.body).toBe(chessEnvelope);
    expect(decoded.repliedTo).toBe('sig-reply');
  });

  it('decodes Qortal Hub v3 Tiptap text and reply metadata', () => {
    const message = {
      data: encodeBase64(
        JSON.stringify({
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
          version: 3,
        }),
      ),
      encoding: 'BASE64' as const,
      isEncrypted: false,
      isText: true,
    };

    expect(decodeChatMessage(message)).toMatchObject({
      body: 'Hello\nQortal',
      kind: 'text',
      repliedTo: 'reply-sig',
    });
  });

  it('preserves validated Qortal Hub image descriptors', () => {
    const decoded = decodeChatMessage({
      data: encodeBase64(
        JSON.stringify({
          images: [
            { identifier: 'img-id', name: 'QuickMythril', service: 'image', timestamp: 1783403484577 },
            { identifier: '../unsafe', name: 'QuickMythril', service: 'IMAGE' },
          ],
          messageText: null,
          version: 3,
        }),
      ),
      encoding: 'BASE64',
      isEncrypted: false,
      isText: true,
    });

    expect(decoded).toEqual({
      body: '',
      hubImages: [
        { identifier: 'img-id', name: 'QuickMythril', service: 'IMAGE', timestamp: 1783403484577 },
      ],
      kind: 'text',
      repliedTo: null,
    });
  });

  it('reduces Qortal Hub plain-string and HTML messageText variants to safe text', () => {
    const plain = decodeChatMessage({
      data: encodeBase64(JSON.stringify({ messageText: 'plain Hub text', version: 3 })),
      isText: true,
    });
    const html = decodeChatMessage({
      data: encodeBase64(
        JSON.stringify({
          messageText:
            '<p>Hello &amp; welcome<br><a href="qortal://APP/Q-Tube/default">Q-Tube</a></p><script>alert(1)</script><p>Done</p>',
          version: 3,
        }),
      ),
      isText: true,
    });

    expect(plain.body).toBe('plain Hub text');
    expect(html.body).toBe('Hello & welcome\nQ-Tube (qortal://APP/Q-Tube/default)\nDone');
    expect(html.body).not.toContain('<');
    expect(html.body).not.toContain('alert');
  });

  it('discards nested and overlapping dangerous HTML contents', () => {
    expect(
      decodeHubText(
        '<div>One<!-- <script>comment payload</script> --><p>Two</p></div>' +
          '<script>hidden<script>nested</script>tail</script>' +
          '<style>.secret{display:block}</style>' +
          '<template><p>template payload</p></template><p>Done</p>',
      ),
    ).toBe('OneTwo\n\nDone');

    // Closing tags in an adversarial order must not release text while any
    // discarded-content element remains open.
    expect(
      decodeHubText('<script>one<style>two</script>three</style><p>visible</p>'),
    ).toBe('visible');
    expect(decodeHubText('<p>keep</p><script>drop<p>and this too')).toBe('keep');
    expect(decodeHubText(`${'<b>'.repeat(256)}text${'</b>'.repeat(256)}`)).toBe('text');
  });

  it('handles repeated and malformed comments without exposing their contents', () => {
    expect(decodeHubText('Before<!-- one --><!-- <b>two</b> -->After')).toBe('BeforeAfter');
    expect(decodeHubText(`${'<!-- hidden -->'.repeat(128)}visible`)).toBe('visible');
    expect(decodeHubText('Before<!-- unterminated <p>drop</p><script>drop</script>')).toBe('Before');
  });

  it('tokenizes malformed text and quoted tag delimiters without reparsing output', () => {
    expect(
      decodeHubText(
        '2 < 3 <b>bold</b> <a title="1 > 0" href="qortal://APP/Test/default"><em>Go</em></a>' +
          ' <script data-value=">">hidden</script> End',
      ),
    ).toBe('2 < 3 bold Go (qortal://APP/Test/default)  End');

    // Entity-decoded markup is message text, not a second HTML parsing pass.
    expect(decodeHubText('&lt;script&gt;visible&lt;/script&gt; &amp;lt;b&amp;gt;')).toBe(
      '<script>visible</script> &lt;b&gt;',
    );
    expect(decodeHubText('&amp;'.repeat(128))).toBe('&'.repeat(128));
  });

  it('extracts only validated links from quoted, unquoted, and entity-encoded href values', () => {
    expect(
      decodeHubText(
        '<a href="qortal&#58;//APP/Q-Tube/default?x=1&amp;y=2">Q&amp;A</a> ' +
          '<a href=qdn://DOCUMENT/Alice/notes>Notes</a> ' +
          '<a href="javascript:alert(1)">Unsafe</a> ' +
          '<a href="https://example.com/path">https://example.com/path</a>',
      ),
    ).toBe(
      'Q&A (qortal://APP/Q-Tube/default?x=1&y=2) ' +
        'Notes (qdn://DOCUMENT/Alice/notes) Unsafe https://example.com/path',
    );
  });

  it('handles repeated and overlapping anchors deterministically', () => {
    expect(
      decodeHubText(
        '<a href="qortal://APP/A/default">Outer ' +
          '<a href="qortal://APP/B/default">Inner</a> tail</a>' +
          '<a href="home://apps"></a>',
      ),
    ).toBe(
      'Outer (qortal://APP/A/default)Inner (qortal://APP/B/default) tailhome://apps',
    );
  });

  it('preserves safe Tiptap link marks as plain link text', () => {
    const decoded = decodeChatMessage({
      data: encodeBase64(
        JSON.stringify({
          messageText: {
            content: [
              {
                content: [
                  {
                    marks: [{ attrs: { href: 'qdn://DOCUMENT/Alice/notes' }, type: 'link' }],
                    text: 'Notes',
                    type: 'text',
                  },
                ],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          },
          version: 3,
        }),
      ),
      isText: true,
    });

    expect(decoded.body).toBe('Notes (qdn://DOCUMENT/Alice/notes)');
  });

  it('accepts the observed JSON-string form of Hub image arrays', () => {
    const decoded = decodeChatMessage({
      data: encodeBase64(
        JSON.stringify({
          images: JSON.stringify([{ identifier: 'img-id', name: 'Alice', service: 'IMAGE' }]),
          messageText: '',
          version: 3,
        }),
      ),
      isText: true,
    });

    expect(decoded.hubImages).toEqual([{ identifier: 'img-id', name: 'Alice', service: 'IMAGE' }]);
  });

  it('keeps a human-pasted flat JSON object with an app key visible', () => {
    const typedObject = base64(JSON.stringify({ app: 'myapp', name: 'test' }));
    const typed = decodeChatMessage({ data: typedObject, isText: true });

    expect(typed.kind).toBe('text');
    expect(typed.body).toBe('{"app":"myapp","name":"test"}');

    // Pasting an app manifest is flat strings only — no protocol payload.
    const manifest = base64(JSON.stringify({ app: 'chess', version: '1.0' }));
    const pasted = decodeChatMessage({ data: manifest, isText: true });

    expect(pasted.kind).toBe('text');
    expect(pasted.body).toBe('{"app":"chess","version":"1.0"}');
  });

  it('requires an object-valued payload key beyond the app marker', () => {
    // An array or null payload value is not a protocol envelope.
    const arrayPayload = base64(JSON.stringify({ app: 'chess', qch1: ['move'] }));

    expect(decodeChatMessage({ data: arrayPayload, isText: true }).kind).toBe('text');

    const nullPayload = base64(JSON.stringify({ app: 'chess', qch1: null }));

    expect(decodeChatMessage({ data: nullPayload, isText: true }).kind).toBe('text');

    // The object must live under a key other than `app` itself.
    const emptyApp = base64(JSON.stringify({ app: '', qch1: { type: 'move' } }));

    expect(decodeChatMessage({ data: emptyApp, isText: true }).kind).toBe('text');
  });

  it('keeps non-object JSON and deeper app markers as text', () => {
    const nested = base64(JSON.stringify({ qch1: { app: 'chess' } }));

    expect(decodeChatMessage({ data: nested, isText: true }).kind).toBe('text');

    for (const raw of ['[1,2,3]', 'null', '42', 'true', '"chess"', '{"app":"chess",', '   ']) {
      expect(decodeChatMessage({ data: base64(raw), isText: true }).kind).toBe('text');
    }

    const nullApp = base64(JSON.stringify({ app: null, qch1: { type: 'move' } }));

    expect(decodeChatMessage({ data: nullApp, isText: true }).kind).toBe('text');
  });

  it('keeps unmarked JSON and app-marked human messages as text', () => {
    const plainJson = base64(JSON.stringify({ qch1: { type: 'move' } }));

    expect(decodeChatMessage({ data: plainJson, isText: true }).kind).toBe('text');

    const nonStringApp = base64(JSON.stringify({ app: 7, qch1: {} }));

    expect(decodeChatMessage({ data: nonStringApp, isText: true }).kind).toBe('text');

    // A string `message` field always wins: this is a human message that
    // happens to carry an app marker.
    const humanWithApp = base64(JSON.stringify({ app: 'chess', message: 'good game!' }));
    const decoded = decodeChatMessage({ data: humanWithApp, isText: true });

    expect(decoded.kind).toBe('text');
    expect(decoded.body).toBe('good game!');

    // A string `message` wins even when a protocol payload rides alongside it.
    const withPayload = base64(
      JSON.stringify({ app: 'chess', message: 'gg', qch1: { type: 'move', move: 'e2e4' } }),
    );
    const decodedWithPayload = decodeChatMessage({ data: withPayload, isText: true });

    expect(decodedWithPayload.kind).toBe('text');
    expect(decodedWithPayload.body).toBe('gg');
  });

  it('isHiddenChatMessage covers machine messages and reactions, not text', () => {
    expect(isMachineChatMessage({ data: base64(chessEnvelope), isText: true })).toBe(true);
    expect(isHiddenChatMessage({ data: base64(chessEnvelope), isText: true })).toBe(true);
    expect(isHiddenChatMessage({ data: base64(buildReactionMessageText('👍', true)), isText: true })).toBe(true);
    expect(isHiddenChatMessage({ data: base64('hello'), isText: true })).toBe(false);
  });
});

describe('Qortal direct v2 envelopes (P2a)', () => {
  it('decodes an initial send the same shape a v3 group send produces', () => {
    const wire = buildQortalDirectChatPayload({ repliedTo: 'reply-sig', text: 'Hello\nQortal' }, 'h0b-direct');
    const decoded = decodeChatMessage({ data: base64(wire), isText: true });

    expect(decoded).toEqual({
      body: 'Hello\nQortal',
      kind: 'text',
      repliedTo: 'reply-sig',
    });
  });

  it('omits repliedTo when the envelope carries an empty string, matching v3 behavior', () => {
    const wire = buildQortalDirectChatPayload({ repliedTo: null, text: 'Qortal direct interop' }, 'h0b-direct');
    const decoded = decodeChatMessage({ data: base64(wire), isText: true });

    expect(decoded).toEqual({
      body: 'Qortal direct interop',
      kind: 'text',
      repliedTo: null,
    });
  });

  it('decodes an edit envelope to its extracted text, ignoring isEdited (the row supplies chatReference)', () => {
    const wire = buildQortalDirectChatEditPayload({ repliedTo: null, text: 'fixed typo' }, 'h0b-direct-edit');
    const decoded = decodeChatMessage({ data: base64(wire), isText: true });

    expect(decoded).toEqual({
      body: 'fixed typo',
      kind: 'text',
      repliedTo: null,
    });
  });

  it('decodes the canonical delete envelope to the same empty-body representation as other protocols', () => {
    const wire = buildQortalDirectChatDeletePayload('h0b-direct-delete');
    const decoded = decodeChatMessage({ data: base64(wire), isText: true });

    expect(decoded).toEqual({
      body: '',
      kind: 'text',
      repliedTo: null,
    });
  });

  it('decodes a reaction envelope the same shape a group reaction produces', () => {
    const wire = buildQortalDirectChatReactionPayload('🔥', true, 'h0b-direct-reaction');
    const decoded = decodeChatMessage({ data: base64(wire), isText: true });

    expect(decoded).toEqual({
      body: '',
      kind: 'reaction',
      reaction: { content: '🔥', contentState: true },
      repliedTo: null,
    });
  });

  it('never throws on malformed v2-shaped JSON, falling back to raw text', () => {
    const malformed = '{"message":"<p>broken","version":2,"specialId":"h0b","repliedTo":"","type":"';

    expect(decodeChatMessage({ data: base64(malformed), isText: true })).toEqual({
      body: malformed,
      kind: 'text',
      repliedTo: null,
    });
  });

  it('leaves plain-text qortium direct rows decoding unchanged (regression)', () => {
    // Chat's own {message, repliedTo} direct envelope never sets `version` or
    // `specialId`; a bare `{message, version: 2}` object with no specialId
    // (as legacy/tolerant decode tests above construct) must keep falling
    // through to the generic branch rather than being treated as a Qortal
    // envelope — the v2-direct gate additionally requires `specialId`.
    const data = base64(JSON.stringify({ message: 'private text wrapper', version: 2 }));

    expect(decodeChatMessage({ data, isText: true })).toEqual({
      body: 'private text wrapper',
      kind: 'text',
      repliedTo: null,
    });

    const opaque = base64('plain qortium direct text');

    expect(decodeChatMessage({ data: opaque, isText: true })).toEqual({
      body: 'plain qortium direct text',
      kind: 'text',
      repliedTo: null,
    });
  });
});
