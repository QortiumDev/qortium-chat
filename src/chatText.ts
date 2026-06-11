import type { ChatMessage } from './types';
import type { TranslateFunction } from './i18n';

function localizeMessage(t: TranslateFunction | undefined, key: Parameters<TranslateFunction>[0], fallback: string) {
  return t ? t(key) : fallback;
}

export type DisplayChatMessage = {
  body: string;
  kind: 'binary' | 'empty' | 'encrypted' | 'text' | 'unsupported';
  repliedTo: string | null;
};

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

type UnwrappedChatText = {
  body: string;
  repliedTo: string | null;
};

function unwrapChatTextEnvelope(value: string): UnwrappedChatText {
  let body = value;
  let repliedTo: string | null = null;

  // Direct sends wrap the text in {message}; reply envelopes add repliedTo. A
  // reply sent as a direct message can end up wrapped twice, so unwrap a few
  // levels deep.
  for (let depth = 0; depth < 3; depth += 1) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      // Plain text group chat is the normal path.
      break;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      break;
    }

    const envelope = parsed as { message?: unknown; repliedTo?: unknown };

    if (typeof envelope.message !== 'string') {
      break;
    }

    body = envelope.message;

    if (repliedTo === null && typeof envelope.repliedTo === 'string' && envelope.repliedTo) {
      repliedTo = envelope.repliedTo;
    }
  }

  return { body, repliedTo };
}

export function buildChatMessageText(text: string, repliedTo?: string | null) {
  return repliedTo ? JSON.stringify({ message: text, repliedTo }) : text;
}

export function decodeChatMessage(
  message: Pick<ChatMessage, 'data' | 'encoding' | 'isEncrypted' | 'isText'>,
  t?: TranslateFunction,
): DisplayChatMessage {
  if (message.isEncrypted) {
    return {
      body: localizeMessage(t, 'message.encrypted', 'Encrypted message'),
      kind: 'encrypted',
      repliedTo: null,
    };
  }

  if (!message.isText) {
    return {
      body: localizeMessage(t, 'message.binary', 'Binary message'),
      kind: 'binary',
      repliedTo: null,
    };
  }

  if (!message.data) {
    return {
      body: '',
      kind: 'empty',
      repliedTo: null,
    };
  }

  if (message.encoding && message.encoding !== 'BASE64') {
    return {
      body: localizeMessage(t, 'message.unsupportedEncoding', 'Unsupported message encoding'),
      kind: 'unsupported',
      repliedTo: null,
    };
  }

  try {
    const { body, repliedTo } = unwrapChatTextEnvelope(decodeBase64(message.data));

    return {
      body,
      kind: 'text',
      repliedTo,
    };
  } catch {
    return {
      body: localizeMessage(t, 'message.decodeError', 'Unable to decode message'),
      kind: 'unsupported',
      repliedTo: null,
    };
  }
}

export function formatTimestamp(timestamp: number | null | undefined) {
  if (!timestamp) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export function getSenderLabel(message: Pick<ChatMessage, 'sender' | 'senderName'>) {
  return message.senderName || `${message.sender.slice(0, 8)}...${message.sender.slice(-6)}`;
}
