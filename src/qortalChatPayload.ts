type QortalOutgoingMessage = {
  repliedTo: string | null;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildTiptapDocFromPlainText(text: string) {
  const content: Array<{ text?: string; type: 'hardBreak' | 'text' }> = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  lines.forEach((line, index) => {
    if (index > 0) {
      content.push({ type: 'hardBreak' });
    }

    if (line) {
      content.push({ text: line, type: 'text' });
    }
  });

  return {
    content: [
      {
        ...(content.length > 0 ? { content } : {}),
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

/**
 * Chat keeps replies in its small `{ message, repliedTo }` envelope. Qortal
 * Hub uses a v3 Tiptap envelope instead, so the bridge adapter extracts only
 * the exact reply shape Chat creates. Arbitrary JSON typed by a user remains
 * ordinary visible text.
 */
export function normalizeQortalOutgoingMessage(message: string): QortalOutgoingMessage {
  try {
    const parsed = JSON.parse(message) as unknown;

    if (
      isRecord(parsed) &&
      typeof parsed.message === 'string' &&
      typeof parsed.repliedTo === 'string' &&
      parsed.repliedTo
    ) {
      return { repliedTo: parsed.repliedTo, text: parsed.message };
    }
  } catch {
    // Plain text is the normal path.
  }

  return { repliedTo: null, text: message };
}

export function buildQortalHubGroupChatPayload(
  outgoing: QortalOutgoingMessage,
  specialId: string = globalThis.crypto.randomUUID(),
) {
  return JSON.stringify({
    images: [],
    isEdited: false,
    messageText: buildTiptapDocFromPlainText(outgoing.text),
    repliedTo: outgoing.repliedTo ?? '',
    specialId,
    type: '',
    version: 3,
  });
}
