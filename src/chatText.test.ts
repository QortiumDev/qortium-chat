import { describe, expect, it } from 'vitest';
import { decodeChatMessage, formatTimestamp, getSenderLabel } from './chatText';

function base64(value: string) {
  return btoa(value);
}

describe('chat text helpers', () => {
  it('decodes plain BASE64 text', () => {
    expect(decodeChatMessage({ data: base64('hello'), encoding: 'BASE64', isEncrypted: false, isText: true })).toEqual({
      body: 'hello',
      kind: 'text',
    });
  });

  it('unwraps direct message JSON text', () => {
    const data = base64(JSON.stringify({ message: 'private text wrapper', version: 2 }));

    expect(decodeChatMessage({ data, encoding: 'BASE64', isEncrypted: false, isText: true })).toEqual({
      body: 'private text wrapper',
      kind: 'text',
    });
  });

  it('returns placeholders for encrypted and binary messages', () => {
    expect(decodeChatMessage({ data: base64('secret'), encoding: 'BASE64', isEncrypted: true, isText: true })).toEqual({
      body: 'Encrypted message',
      kind: 'encrypted',
    });
    expect(decodeChatMessage({ data: base64('raw'), encoding: 'BASE64', isEncrypted: false, isText: false })).toEqual({
      body: 'Binary message',
      kind: 'binary',
    });
  });

  it('formats timestamps and sender labels', () => {
    expect(formatTimestamp(undefined)).toBe('');
    expect(getSenderLabel({ sender: 'Q123456789abcdef', senderName: 'Alice' })).toBe('Alice');
    expect(getSenderLabel({ sender: 'Q123456789abcdef' })).toBe('Q1234567...abcdef');
  });
});
