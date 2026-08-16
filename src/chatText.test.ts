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

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);

  return btoa(String.fromCharCode(...bytes));
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
