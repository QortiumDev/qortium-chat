import { describe, expect, it } from 'vitest';
import {
  buildChatMessageText,
  buildDeletedMessageText,
  buildReactionMessageText,
  decodeChatMessage,
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

  it('detects machine payloads nested inside a direct-send wrapper', () => {
    const wrapped = base64(JSON.stringify({ message: chessEnvelope }));

    expect(decodeChatMessage({ data: wrapped, isText: true }).kind).toBe('machine');
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
  });

  it('isHiddenChatMessage covers machine messages and reactions, not text', () => {
    expect(isMachineChatMessage({ data: base64(chessEnvelope), isText: true })).toBe(true);
    expect(isHiddenChatMessage({ data: base64(chessEnvelope), isText: true })).toBe(true);
    expect(isHiddenChatMessage({ data: base64(buildReactionMessageText('👍', true)), isText: true })).toBe(true);
    expect(isHiddenChatMessage({ data: base64('hello'), isText: true })).toBe(false);
  });
});
