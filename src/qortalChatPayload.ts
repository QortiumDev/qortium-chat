import { buildParagraphHtmlFromPlainText } from './chatText';

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

// SEND_CHAT_EDIT on the Qortal Hub protocol: the same v3 envelope as a new
// message, but `isEdited: true` and `type: 'edit'` — see review/
// schemas-home2-actions.md "Public group chat" (Qortal exact-action edit).
export function buildQortalHubGroupChatEditPayload(
  outgoing: QortalOutgoingMessage,
  specialId: string = globalThis.crypto.randomUUID(),
) {
  return JSON.stringify({
    images: [],
    isEdited: true,
    messageText: buildTiptapDocFromPlainText(outgoing.text),
    repliedTo: outgoing.repliedTo ?? '',
    specialId,
    type: 'edit',
    version: 3,
  });
}

// SEND_CHAT_DELETE on the Qortal Hub protocol: the canonical empty-edit
// envelope — `messageText` is the literal string '<p></p>' (not a Tiptap doc
// object), `repliedTo` is always cleared, and no extra keys are accepted.
export function buildQortalHubGroupChatDeletePayload(specialId: string = globalThis.crypto.randomUUID()) {
  return JSON.stringify({
    images: [],
    isEdited: true,
    messageText: '<p></p>',
    repliedTo: '',
    specialId,
    type: 'edit',
    version: 3,
  });
}

// SEND_CHAT_REACTION on the Qortal Hub protocol: the same reaction envelope
// as Consortium/Qortium, plus a required `specialId`.
export function buildQortalHubGroupChatReactionPayload(
  content: string,
  contentState: boolean,
  specialId: string = globalThis.crypto.randomUUID(),
) {
  return JSON.stringify({
    content,
    contentState,
    message: '',
    specialId,
    type: 'reaction',
  });
}

// Direct-chat Qortal INITIAL sends: unlike the Hub v3 group envelope
// (`messageText` as a Tiptap doc), the v2 direct envelope carries `message`
// as paragraph HTML — verified against the interop fixture's
// directMessage.plaintext (`{"message":"<p>Qortal direct interop</p>",
// "version":2,"specialId":"h0b-direct","repliedTo":"","type":""}`) and
// against Hub's own background.ts `sendChatDirect`, which builds
// `{ message: messageText, version: 2, ...otherData }` from
// `editorRef.current.getHTML()`, where `otherData` supplies specialId/
// repliedTo/type in that order. Key order here matches that source (message,
// version, then specialId/repliedTo/type) rather than this file's usual
// alphabetical convention, so a diff against the fixture stays legible.
export function buildQortalDirectChatPayload(
  outgoing: QortalOutgoingMessage,
  specialId: string = globalThis.crypto.randomUUID(),
) {
  if (!outgoing.text) {
    throw new Error('Direct chat messages must not be empty.');
  }

  return JSON.stringify({
    message: buildParagraphHtmlFromPlainText(outgoing.text),
    version: 2,
    specialId,
    repliedTo: outgoing.repliedTo ?? '',
    type: '',
  });
}

// Direct-chat Qortal envelopes carry the same fields under `message` (not
// `messageText`) and `version: 2` (not 3) — see review/schemas-home2-
// actions.md "Direct chat" (Qortal exact-action shapes). `message` is
// paragraph HTML, the same convention buildQortalDirectChatPayload above
// uses for the initial send (and the canonical delete envelope already uses
// literally, via '<p></p>').
export function buildQortalDirectChatEditPayload(
  outgoing: QortalOutgoingMessage,
  specialId: string = globalThis.crypto.randomUUID(),
) {
  return JSON.stringify({
    isEdited: true,
    message: buildParagraphHtmlFromPlainText(outgoing.text),
    repliedTo: outgoing.repliedTo ?? '',
    specialId,
    type: 'edit',
    version: 2,
  });
}

// The canonical direct-chat delete envelope only accepts these six keys.
export function buildQortalDirectChatDeletePayload(specialId: string = globalThis.crypto.randomUUID()) {
  return JSON.stringify({
    isEdited: true,
    message: '<p></p>',
    repliedTo: '',
    specialId,
    type: 'edit',
    version: 2,
  });
}

export function buildQortalDirectChatReactionPayload(
  content: string,
  contentState: boolean,
  specialId: string = globalThis.crypto.randomUUID(),
) {
  return JSON.stringify({
    content,
    contentState,
    message: '',
    specialId,
    type: 'reaction',
    version: 2,
  });
}
