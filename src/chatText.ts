import type { ChatMessage } from './types';
import type { TranslateFunction } from './i18n';

function localizeMessage(t: TranslateFunction | undefined, key: Parameters<TranslateFunction>[0], fallback: string) {
  return t ? t(key) : fallback;
}

export type DisplayChatMessage = {
  body: string;
  kind: 'binary' | 'empty' | 'encrypted' | 'text' | 'unsupported';
};

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function unwrapDirectMessageJson(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const message = (parsed as { message?: unknown }).message;

      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    // Plain text group chat is the normal path.
  }

  return value;
}

export function decodeChatMessage(
  message: Pick<ChatMessage, 'data' | 'encoding' | 'isEncrypted' | 'isText'>,
  t?: TranslateFunction,
): DisplayChatMessage {
  if (message.isEncrypted) {
    return {
      body: localizeMessage(t, 'message.encrypted', 'Encrypted message'),
      kind: 'encrypted',
    };
  }

  if (!message.isText) {
    return {
      body: localizeMessage(t, 'message.binary', 'Binary message'),
      kind: 'binary',
    };
  }

  if (!message.data) {
    return {
      body: '',
      kind: 'empty',
    };
  }

  if (message.encoding && message.encoding !== 'BASE64') {
    return {
      body: localizeMessage(t, 'message.unsupportedEncoding', 'Unsupported message encoding'),
      kind: 'unsupported',
    };
  }

  try {
    return {
      body: unwrapDirectMessageJson(decodeBase64(message.data)),
      kind: 'text',
    };
  } catch {
    return {
      body: localizeMessage(t, 'message.decodeError', 'Unable to decode message'),
      kind: 'unsupported',
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
