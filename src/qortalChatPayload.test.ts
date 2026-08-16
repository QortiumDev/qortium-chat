import { describe, expect, it } from 'vitest';
import { buildQortalHubGroupChatPayload, normalizeQortalOutgoingMessage } from './qortalChatPayload';

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
});
