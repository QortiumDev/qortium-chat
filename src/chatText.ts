import type { ChatMessage } from './types';
import type { TranslateFunction } from './i18n';

function localizeMessage(t: TranslateFunction | undefined, key: Parameters<TranslateFunction>[0], fallback: string) {
  return t ? t(key) : fallback;
}

export type DisplayChatMessage = {
  body: string;
  kind: 'binary' | 'empty' | 'encrypted' | 'reaction' | 'text' | 'unsupported';
  reaction?: ChatReaction;
  repliedTo: string | null;
};

export type ChatReaction = {
  content: string;
  contentState: boolean;
};

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

const MAX_REACTION_CONTENT_LENGTH = 32;

export const DEFAULT_REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

function normalizeReactionContent(value: string) {
  const content = value.trim();

  return content.length > 0 && content.length <= MAX_REACTION_CONTENT_LENGTH ? content : null;
}

function getEnvelopeReaction(envelope: { content?: unknown; contentState?: unknown; type?: unknown }) {
  if (envelope.type !== 'reaction' || typeof envelope.content !== 'string') {
    return null;
  }

  const content = normalizeReactionContent(envelope.content);

  if (!content) {
    return null;
  }

  return {
    content,
    contentState: envelope.contentState === false ? false : true,
  };
}

type UnwrappedChatText = {
  body: string;
  reaction: ChatReaction | null;
  repliedTo: string | null;
};

function unwrapChatTextEnvelope(value: string): UnwrappedChatText {
  let body = value;
  let reaction: ChatReaction | null = null;
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

    const envelope = parsed as {
      content?: unknown;
      contentState?: unknown;
      message?: unknown;
      repliedTo?: unknown;
      type?: unknown;
    };

    if (typeof envelope.message !== 'string') {
      break;
    }

    reaction = getEnvelopeReaction(envelope);

    if (reaction) {
      body = envelope.message;
      break;
    }

    body = envelope.message;

    if (repliedTo === null && typeof envelope.repliedTo === 'string' && envelope.repliedTo) {
      repliedTo = envelope.repliedTo;
    }
  }

  return { body, reaction, repliedTo };
}

export function buildChatMessageText(text: string, repliedTo?: string | null) {
  return repliedTo ? JSON.stringify({ message: text, repliedTo }) : text;
}

export function buildReactionMessageText(content: string, contentState: boolean) {
  const normalizedContent = normalizeReactionContent(content);

  if (!normalizedContent) {
    throw new Error('Reaction content must be a short emoji string.');
  }

  return JSON.stringify({
    message: '',
    type: 'reaction',
    content: normalizedContent,
    contentState,
  });
}

type DecodableChatMessage = Pick<
  ChatMessage,
  'data' | 'decryptionStatus' | 'encoding' | 'isEncrypted' | 'isText' | 'status'
>;

function hasReadableEncryptedPayload(message: DecodableChatMessage) {
  return message.decryptionStatus === 'DECRYPTED' || message.status === 'DECRYPTED';
}

export function isReactionChatMessage(message: DecodableChatMessage) {
  return decodeChatMessage(message).kind === 'reaction';
}

export function decodeChatMessage(
  message: DecodableChatMessage,
  t?: TranslateFunction,
): DisplayChatMessage {
  if (message.isEncrypted && (!hasReadableEncryptedPayload(message) || !message.data)) {
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
    const { body, reaction, repliedTo } = unwrapChatTextEnvelope(decodeBase64(message.data));

    if (reaction) {
      return {
        body,
        kind: 'reaction',
        reaction,
        repliedTo: null,
      };
    }

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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Formatter construction is the expensive part of Intl and the message list
// formats ~100 timestamps per render, so cache one formatter per locale.
const relativeTimeFormats = new Map<string, Intl.RelativeTimeFormat>();

function getRelativeTimeFormat(locale?: string) {
  const key = locale ?? '';
  let format = relativeTimeFormats.get(key);

  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    relativeTimeFormats.set(key, format);
  }

  return format;
}

export function formatTimeAgo(timestamp: number | null | undefined, now: number, locale?: string) {
  if (!timestamp) {
    return '';
  }

  const format = getRelativeTimeFormat(locale);
  // Clamp future timestamps (clock skew between nodes) to "now".
  const elapsed = Math.max(0, now - timestamp);

  if (elapsed < MINUTE_MS) {
    return format.format(0, 'second');
  }

  if (elapsed < HOUR_MS) {
    return format.format(-Math.floor(elapsed / MINUTE_MS), 'minute');
  }

  // Chat messages expire after 24 hours, so hours are the largest unit needed.
  return format.format(-Math.floor(elapsed / HOUR_MS), 'hour');
}

export function getSenderLabel(message: Pick<ChatMessage, 'sender' | 'senderName'>) {
  return message.senderName || `${message.sender.slice(0, 8)}...${message.sender.slice(-6)}`;
}
