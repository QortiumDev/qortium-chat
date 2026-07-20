import type { ChatMessage } from './types';
import type { TranslateFunction } from './i18n';

function localizeMessage(t: TranslateFunction | undefined, key: Parameters<TranslateFunction>[0], fallback: string) {
  return t ? t(key) : fallback;
}

export type DisplayChatMessage = {
  body: string;
  kind: 'binary' | 'empty' | 'encrypted' | 'machine' | 'reaction' | 'text' | 'unsupported';
  /** For kind 'machine': the sending app's registered marker (e.g. "chess"). */
  machineApp?: string;
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
  machineApp: string | null;
  reaction: ChatReaction | null;
  repliedTo: string | null;
};

function unwrapChatTextEnvelope(value: string): UnwrappedChatText {
  let body = value;
  let machineApp: string | null = null;
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
      app?: unknown;
      content?: unknown;
      contentState?: unknown;
      message?: unknown;
      repliedTo?: unknown;
      type?: unknown;
    };

    if (typeof envelope.message !== 'string') {
      // Machine-message convention shared with other QDN apps (e.g. Chess):
      // a JSON object carrying a string `app` marker and no string `message`
      // is app-to-app data, not human chat, and must not render in the feed.
      if (typeof envelope.app === 'string' && envelope.app) {
        machineApp = envelope.app;
      }

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

  return { body, machineApp, reaction, repliedTo };
}

export function buildChatMessageText(text: string, repliedTo?: string | null) {
  return repliedTo ? JSON.stringify({ message: text, repliedTo }) : text;
}

// A "delete" is an edit whose revision carries an empty body — nothing leaves
// the chain (the original stays until chat retention expires); clients render
// the empty revision as a deleted-message note. The JSON envelope keeps the
// transaction payload itself non-empty (a zero-byte CHAT payload may be
// rejected) and unwraps to body '' through the normal decode path, so older
// clients degrade to their generic empty-message placeholder.
export function buildDeletedMessageText(repliedTo?: string | null) {
  return JSON.stringify(repliedTo ? { message: '', repliedTo } : { message: '' });
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

// Exported so callers can decode payload-bearing shapes that are not full
// ChatMessages (e.g. active-chats entries for sidebar previews).
export type DecodableChatMessage = Pick<
  ChatMessage,
  'data' | 'decryptionStatus' | 'encoding' | 'isEncrypted' | 'isText' | 'status'
>;

function hasReadableEncryptedPayload(message: DecodableChatMessage) {
  return message.decryptionStatus === 'DECRYPTED' || message.status === 'DECRYPTED';
}

function hasMissingPrivateGroupKey(message: DecodableChatMessage) {
  return message.status === 'MISSING_KEY';
}

export function isReactionChatMessage(message: DecodableChatMessage) {
  return decodeChatMessage(message).kind === 'reaction';
}

export function isMachineChatMessage(message: DecodableChatMessage) {
  return decodeChatMessage(message).kind === 'machine';
}

// Reactions and machine messages are both payloads that must not appear as
// chat bubbles or drive unread/activity state; most filters want the union.
export function isHiddenChatMessage(message: DecodableChatMessage) {
  const kind = decodeChatMessage(message).kind;

  return kind === 'machine' || kind === 'reaction';
}

type DecodeCacheEntry = {
  data: DecodableChatMessage['data'];
  decryptionStatus: DecodableChatMessage['decryptionStatus'];
  encoding: DecodableChatMessage['encoding'];
  isEncrypted: DecodableChatMessage['isEncrypted'];
  isText: DecodableChatMessage['isText'];
  result: DisplayChatMessage;
  status: DecodableChatMessage['status'];
  t: TranslateFunction | undefined;
};

// Decoding (BASE64 + nested envelope JSON.parse) runs for every message on every
// render, so memoize the result per message object. The cached entry is reused
// only when every decode-relevant field is unchanged and the same translator is
// supplied (localized placeholders differ by locale), so an edited/decrypted
// message — or a language switch — recomputes rather than returning a stale body.
const decodeCache = new WeakMap<DecodableChatMessage, DecodeCacheEntry>();

export function decodeChatMessage(
  message: DecodableChatMessage,
  t?: TranslateFunction,
): DisplayChatMessage {
  const cached = decodeCache.get(message);

  if (
    cached &&
    cached.data === message.data &&
    cached.decryptionStatus === message.decryptionStatus &&
    cached.encoding === message.encoding &&
    cached.isEncrypted === message.isEncrypted &&
    cached.isText === message.isText &&
    cached.status === message.status &&
    cached.t === t
  ) {
    return cached.result;
  }

  const result = computeDecodeChatMessage(message, t);

  decodeCache.set(message, {
    data: message.data,
    decryptionStatus: message.decryptionStatus,
    encoding: message.encoding,
    isEncrypted: message.isEncrypted,
    isText: message.isText,
    result,
    status: message.status,
    t,
  });

  return result;
}

function computeDecodeChatMessage(
  message: DecodableChatMessage,
  t?: TranslateFunction,
): DisplayChatMessage {
  if (message.isEncrypted && hasMissingPrivateGroupKey(message)) {
    return {
      body: localizeMessage(t, 'message.privateGroupKeyMissing', 'Private group key missing'),
      kind: 'encrypted',
      repliedTo: null,
    };
  }

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
    const { body, machineApp, reaction, repliedTo } = unwrapChatTextEnvelope(decodeBase64(message.data));

    if (reaction) {
      return {
        body,
        kind: 'reaction',
        reaction,
        repliedTo: null,
      };
    }

    if (machineApp) {
      return {
        body: localizeMessage(t, 'message.appData', 'App data'),
        kind: 'machine',
        machineApp,
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

// Same per-locale cache rationale as the relative formats below: the message
// list builds ~100 timestamp titles per render.
const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();

export function formatTimestamp(timestamp: number | null | undefined, locale?: string) {
  if (!timestamp) {
    return '';
  }

  const key = locale ?? '';
  let format = dateTimeFormats.get(key);

  if (!format) {
    format = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    dateTimeFormats.set(key, format);
  }

  return format.format(new Date(timestamp));
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

// Single-line preview of a message body for reply previews and sidebar snippets.
export function getMessageSnippet(message: DecodableChatMessage, t: TranslateFunction, maxLength = 140) {
  const body = decodeChatMessage(message, t).body || t('message.empty');
  const flattened = body.replace(/\s+/g, ' ').trim();

  return flattened.length > maxLength ? `${flattened.slice(0, maxLength - 1)}…` : flattened;
}
