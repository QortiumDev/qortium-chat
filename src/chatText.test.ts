import { describe, expect, it } from 'vitest';
import { buildChatMessageText, decodeChatMessage, formatTimestamp, getSenderLabel } from './chatText';

function base64(value: string) {
  return btoa(value);
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

  it('returns placeholders for encrypted and binary messages', () => {
    expect(decodeChatMessage({ data: base64('secret'), encoding: 'BASE64', isEncrypted: true, isText: true })).toEqual({
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

  it('formats timestamps and sender labels', () => {
    expect(formatTimestamp(undefined)).toBe('');
    expect(getSenderLabel({ sender: 'Q123456789abcdef', senderName: 'Alice' })).toBe('Alice');
    expect(getSenderLabel({ sender: 'Q123456789abcdef' })).toBe('Q1234567...abcdef');
  });
});
