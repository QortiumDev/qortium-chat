import type { ChatMessage } from './types';
import type { TranslateFunction } from './i18n';

function localizeMessage(t: TranslateFunction | undefined, key: Parameters<TranslateFunction>[0], fallback: string) {
  return t ? t(key) : fallback;
}

export type DisplayChatMessage = {
  /** Raw candidates from either Chat's own `attachments` envelope field or a
   * Qortal Hub v3 `images[]` entry that carries the extra private-attachment
   * keys (see docs/CHAT_ATTACHMENTS.md). Unvalidated — every candidate must
   * be checked with coreApi's isPrivateAttachmentDescriptor before use; this
   * module deliberately does not import coreApi (it would be circular, since
   * coreApi.ts already imports from here) so it cannot do that validation
   * itself. */
  attachments?: unknown[];
  body: string;
  hubImages?: QortalHubImageRef[];
  kind: 'binary' | 'empty' | 'encrypted' | 'machine' | 'reaction' | 'text' | 'unsupported';
  /** For kind 'machine': the sending app's registered marker (e.g. "chess"). */
  machineApp?: string;
  reaction?: ChatReaction;
  repliedTo: string | null;
};

// Qortal Hub pins public chat images by resource coordinates inside the v3
// message envelope. Keep these separate from message text: MessageList turns
// them into network-qualified Qortal resources before any bridge operation.
export type QortalHubImageRef = {
  identifier: string;
  name: string;
  service: string;
  timestamp?: number;
};

const QORTAL_HUB_IMAGE_SERVICES = new Set(['GIF_REPOSITORY', 'IMAGE', 'QCHAT_IMAGE', 'THUMBNAIL']);

export type ChatReaction = {
  content: string;
  contentState: boolean;
};

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

// Inverse of decodeBase64 above. Used to build the local optimistic echo of a
// just-submitted message: the same UTF-8-safe BASE64 encoding a confirmed
// message carries in `data`, computed client-side before the send round trip
// returns, so decodeChatMessage renders the optimistic bubble identically to
// how the confirmed message will look once it lands.
export function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSafeLinkedAddress(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const address = value.trim();

  return address.length <= 2048 && /^(?:qdn|qortal|home|core|https?):\/\/[^\s<>"'`]+$/i.test(address)
    ? address
    : null;
}

function extractTiptapText(node: unknown): string {
  if (!isPlainObject(node)) {
    return '';
  }

  if (node.type === 'text') {
    const text = typeof node.text === 'string' ? node.text : '';
    const marks = Array.isArray(node.marks) ? node.marks : [];
    const linkedAddress = marks
      .map((mark) => (isPlainObject(mark) && mark.type === 'link' && isPlainObject(mark.attrs) ? mark.attrs.href : null))
      .map(getSafeLinkedAddress)
      .find((address): address is string => address !== null);

    return linkedAddress && !text.includes(linkedAddress) ? `${text} (${linkedAddress})` : text;
  }

  if (node.type === 'hardBreak') {
    return '\n';
  }

  const content = Array.isArray(node.content) ? node.content : [];
  const joined = content.map(extractTiptapText).join('');

  return node.type === 'paragraph' ? `${joined}\n` : joined;
}

const HTML_BLOCK_END_TAGS = new Set(['blockquote', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'p', 'pre']);
const HTML_BREAK_TAGS = new Set(['br', 'hr']);
const HTML_DISCARDED_CONTENT_TAGS = new Set(['script', 'style', 'template']);

const HTML_NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function isAsciiAlpha(character: string | undefined) {
  if (!character) {
    return false;
  }

  const code = character.charCodeAt(0);

  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAsciiDigit(character: string | undefined) {
  if (!character) {
    return false;
  }

  const code = character.charCodeAt(0);

  return code >= 48 && code <= 57;
}

function isAsciiHexDigit(character: string | undefined) {
  if (!character) {
    return false;
  }

  const code = character.charCodeAt(0);

  return isAsciiDigit(character) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);
}

function isHtmlSpace(character: string | undefined) {
  return character === ' ' || character === '\t' || character === '\n' || character === '\r' || character === '\f';
}

function decodeHtmlEntityBody(body: string) {
  if (body[0] !== '#') {
    return HTML_NAMED_ENTITIES[body.toLowerCase()] ?? null;
  }

  const isHex = body[1] === 'x' || body[1] === 'X';
  const digits = body.slice(isHex ? 2 : 1);
  const maxDigits = isHex ? 6 : 7;

  if (
    digits.length === 0 ||
    digits.length > maxDigits ||
    ![...digits].every(isHex ? isAsciiHexDigit : isAsciiDigit)
  ) {
    return null;
  }

  const codePoint = Number.parseInt(digits, isHex ? 16 : 10);

  return Number.isSafeInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= 0x10ffff &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
    ? String.fromCodePoint(codePoint)
    : '';
}

function decodeHtmlEntities(value: string) {
  const parts: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const ampersand = value.indexOf('&', cursor);

    if (ampersand < 0) {
      parts.push(value.slice(cursor));
      break;
    }

    parts.push(value.slice(cursor, ampersand));
    const semicolon = value.indexOf(';', ampersand + 1);

    // The supported numeric forms are at most eight characters between `&`
    // and `;`. A farther semicolon belongs to ordinary message text.
    if (semicolon < 0 || semicolon - ampersand > 9) {
      parts.push('&');
      cursor = ampersand + 1;
      continue;
    }

    const decoded = decodeHtmlEntityBody(value.slice(ampersand + 1, semicolon));

    if (decoded === null) {
      parts.push('&');
      cursor = ampersand + 1;
      continue;
    }

    parts.push(decoded);
    cursor = semicolon + 1;
  }

  return parts.join('');
}

type HtmlTagToken = {
  attributes: string;
  closing: boolean;
  end: number;
  name: string;
};

function findHtmlTagEnd(value: string, start: number) {
  let quote = '';

  for (let cursor = start; cursor < value.length; cursor += 1) {
    const character = value[cursor];

    if (quote) {
      if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return cursor;
    }
  }

  return -1;
}

function readHtmlTag(value: string, start: number): HtmlTagToken | null | undefined {
  let cursor = start + 1;
  let closing = false;

  if (value[cursor] === '/') {
    closing = true;
    cursor += 1;
  }

  // Declarations and processing instructions carry no display text. Comments
  // are handled separately so an unterminated comment can discard its tail.
  if (!closing && (value[cursor] === '!' || value[cursor] === '?')) {
    const end = findHtmlTagEnd(value, cursor + 1);

    return end < 0 ? undefined : { attributes: '', closing: false, end, name: '' };
  }

  if (!isAsciiAlpha(value[cursor])) {
    return null;
  }

  const nameStart = cursor;

  while (
    isAsciiAlpha(value[cursor]) ||
    isAsciiDigit(value[cursor]) ||
    value[cursor] === ':' ||
    value[cursor] === '-'
  ) {
    cursor += 1;
  }

  const nameEnd = cursor;
  const end = findHtmlTagEnd(value, cursor);

  return end < 0
    ? undefined
    : {
        attributes: value.slice(nameEnd, end),
        closing,
        end,
        name: value.slice(nameStart, nameEnd).toLowerCase(),
      };
}

function getHtmlAttribute(attributes: string, wantedName: string) {
  let cursor = 0;

  while (cursor < attributes.length) {
    while (isHtmlSpace(attributes[cursor]) || attributes[cursor] === '/') {
      cursor += 1;
    }

    const nameStart = cursor;

    while (
      cursor < attributes.length &&
      !isHtmlSpace(attributes[cursor]) &&
      attributes[cursor] !== '/' &&
      attributes[cursor] !== '=' &&
      attributes[cursor] !== '>'
    ) {
      cursor += 1;
    }

    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }

    const name = attributes.slice(nameStart, cursor).toLowerCase();

    while (isHtmlSpace(attributes[cursor])) {
      cursor += 1;
    }

    if (attributes[cursor] !== '=') {
      continue;
    }

    cursor += 1;
    while (isHtmlSpace(attributes[cursor])) {
      cursor += 1;
    }

    const quote = attributes[cursor] === '"' || attributes[cursor] === "'" ? attributes[cursor] : '';

    if (quote) {
      cursor += 1;
    }

    const valueStart = cursor;

    if (quote) {
      while (cursor < attributes.length && attributes[cursor] !== quote) {
        cursor += 1;
      }
    } else {
      while (cursor < attributes.length && !isHtmlSpace(attributes[cursor])) {
        cursor += 1;
      }
    }

    const attributeValue = attributes.slice(valueStart, cursor);

    if (quote && attributes[cursor] === quote) {
      cursor += 1;
    }

    if (name === wantedName) {
      return attributeValue;
    }
  }

  return null;
}

function htmlToPlainText(value: string) {
  const output: string[] = [];
  const discardedTagDepth = new Map<string, number>();
  let discardedDepth = 0;
  let activeAnchor: { address: string | null; label: string[] } | null = null;

  function appendText(text: string) {
    if (!text || discardedDepth > 0) {
      return;
    }

    if (activeAnchor) {
      activeAnchor.label.push(text);
    } else {
      output.push(text);
    }
  }

  function closeAnchor() {
    if (!activeAnchor) {
      return;
    }

    const label = activeAnchor.label.join('').trim();
    const address = activeAnchor.address;

    activeAnchor = null;
    output.push(address ? (label && !label.includes(address) ? `${label} (${address})` : label || address) : label);
  }

  let cursor = 0;

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);

    if (tagStart < 0) {
      appendText(decodeHtmlEntities(value.slice(cursor)));
      break;
    }

    appendText(decodeHtmlEntities(value.slice(cursor, tagStart)));

    if (value.startsWith('<!--', tagStart)) {
      const commentEnd = value.indexOf('-->', tagStart + 4);

      if (commentEnd < 0) {
        break;
      }

      cursor = commentEnd + 3;
      continue;
    }

    const tag = readHtmlTag(value, tagStart);

    if (tag === undefined) {
      // A quote-aware scan found no terminator, so the remaining tail cannot
      // contain an independent tag. Keep it as inert text and finish in O(n).
      appendText(decodeHtmlEntities(value.slice(tagStart)));
      break;
    }

    if (tag === null) {
      appendText('<');
      cursor = tagStart + 1;
      continue;
    }

    cursor = tag.end + 1;

    if (HTML_DISCARDED_CONTENT_TAGS.has(tag.name)) {
      const previousDepth = discardedTagDepth.get(tag.name) ?? 0;

      if (tag.closing) {
        if (previousDepth > 0) {
          discardedTagDepth.set(tag.name, previousDepth - 1);
          discardedDepth -= 1;
        }
      } else {
        discardedTagDepth.set(tag.name, previousDepth + 1);
        discardedDepth += 1;
      }
      continue;
    }

    if (discardedDepth > 0 || !tag.name) {
      continue;
    }

    if (!tag.closing && tag.name === 'a') {
      // Nested anchors are invalid HTML. Closing the first one here mirrors the
      // browser parser's effective structure while keeping the tokenizer flat.
      closeAnchor();
      const rawAddress = getHtmlAttribute(tag.attributes, 'href');

      activeAnchor = {
        address: rawAddress === null ? null : getSafeLinkedAddress(decodeHtmlEntities(rawAddress)),
        label: [],
      };
    } else if (tag.closing && tag.name === 'a') {
      closeAnchor();
    } else if (!tag.closing && HTML_BREAK_TAGS.has(tag.name)) {
      appendText('\n');
    } else if (tag.closing && HTML_BLOCK_END_TAGS.has(tag.name)) {
      appendText('\n');
    }
  }

  closeAnchor();
  return output.join('');
}

// Hub history contains messageText as Tiptap JSON, plain strings, and legacy
// HTML strings. Convert the latter to text without ever passing it to React as
// HTML. Script/style/template contents are discarded rather than displayed.
function extractSafeHubText(value: unknown) {
  if (typeof value !== 'string') {
    return extractTiptapText(value);
  }

  return htmlToPlainText(value);
}

function normalizeExtractedHubText(value: string) {
  return value.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeParagraphHtmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Qortal direct-message envelopes carry `message` as paragraph HTML rather
// than the Tiptap doc group messages use — verified against both the
// interop fixture (directMessage.plaintext: `{"message":"<p>Qortal direct
// interop</p>",...}`) and Qortal Hub's own background.ts `sendChatDirect`,
// which builds `{ message: messageText, version: 2, ...otherData }` from
// `editorRef.current.getHTML()` (a Tiptap/ProseMirror HTML string, one `<p>`
// per paragraph). Chat's composer is plain text, so this is the encode side
// of that convention: one `<p>` per line, with an empty line becoming an
// empty `<p></p>` — the same literal string the canonical delete envelope
// uses for "no content".
export function buildParagraphHtmlFromPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => `<p>${line ? escapeParagraphHtmlText(line) : ''}</p>`)
    .join('');
}

// Inverse of buildParagraphHtmlFromPlainText for decode. Reuses the same
// hardened HTML-to-text walk (htmlToPlainText) that Hub v3 group payloads
// already go through via extractSafeHubText, so there is exactly one HTML
// parser in this file rather than a second one grown for direct messages.
export function extractPlainTextFromParagraphHtml(html: string): string {
  return normalizeExtractedHubText(htmlToPlainText(html));
}

function getQortalHubImageRefs(value: unknown): QortalHubImageRef[] {
  let candidate = value;

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(candidate)) {
    return [];
  }

  const images: QortalHubImageRef[] = [];

  for (const image of candidate.slice(0, 12)) {
    if (!isPlainObject(image)) {
      continue;
    }

    const service = typeof image.service === 'string' ? image.service.trim().toUpperCase() : '';
    const name = typeof image.name === 'string' ? image.name.trim() : '';
    const identifier = typeof image.identifier === 'string' ? image.identifier.trim() : '';

    if (
      !QORTAL_HUB_IMAGE_SERVICES.has(service) ||
      !name ||
      name.length > 255 ||
      /[\u0000-\u001f/\\]/.test(name) ||
      !identifier ||
      identifier.length > 64 ||
      /[\u0000-\u001f/\\]/.test(identifier)
    ) {
      continue;
    }

    const timestamp =
      typeof image.timestamp === 'number' && Number.isSafeInteger(image.timestamp) && image.timestamp >= 0
        ? image.timestamp
        : undefined;

    images.push({ identifier, name, service, timestamp });
  }

  return images;
}

// Bounds an unknown envelope field down to a small array of plain-object
// candidates, with no further validation — the real validation (full
// PrivateAttachmentDescriptor shape) happens downstream via coreApi's
// isPrivateAttachmentDescriptor (see the DisplayChatMessage.attachments doc
// comment above for why that check cannot live in this module).
function getAttachmentCandidates(value: unknown, max = 12): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, max).filter((candidate) => isPlainObject(candidate));
}

// Machine-message convention shared with other QDN apps (e.g. Chess): a JSON
// object carrying a string `app` marker, no string `message`, and at least one
// other key holding an object payload is app-to-app data, not human chat, and
// must not render in the feed.
//
// The rule is deliberately narrow. Requiring an object-valued payload key keeps
// a human who types or pastes a flat JSON object of strings — `{"app":"myapp",
// "name":"test"}`, an app manifest — visible instead of silently dropping their
// message. The caller applies this at depth 0 only: a reply's text can quote an
// envelope, and `buildChatMessageText` wraps it as `{message, repliedTo}`, so
// matching after an unwrap would hide the human reply and discard `repliedTo`.
function getMachineEnvelopeApp(parsed: unknown): string | null {
  if (!isPlainObject(parsed)) {
    return null;
  }

  const app = parsed.app;

  if (typeof app !== 'string' || !app) {
    return null;
  }

  if (typeof parsed.message === 'string') {
    return null;
  }

  const hasPayload = Object.keys(parsed).some((key) => key !== 'app' && isPlainObject(parsed[key]));

  return hasPayload ? app : null;
}

type UnwrappedChatText = {
  attachments: unknown[];
  body: string;
  hubImages: QortalHubImageRef[];
  machineApp: string | null;
  reaction: ChatReaction | null;
  repliedTo: string | null;
};

function unwrapChatTextEnvelope(value: string): UnwrappedChatText {
  let attachments: unknown[] = [];
  let body = value;
  let hubImages: QortalHubImageRef[] = [];
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

    if (!isPlainObject(parsed)) {
      break;
    }

    // Depth 0 only — see getMachineEnvelopeApp.
    if (depth === 0) {
      machineApp = getMachineEnvelopeApp(parsed);

      if (machineApp) {
        break;
      }
    }

    const envelope = parsed as {
      attachments?: unknown;
      content?: unknown;
      contentState?: unknown;
      message?: unknown;
      repliedTo?: unknown;
      specialId?: unknown;
      type?: unknown;
      version?: unknown;
      messageText?: unknown;
      images?: unknown;
    };

    // Reaction envelopes self-identify via `type: 'reaction'` regardless of
    // `version` — group reactions carry no version field at all, while
    // Qortal direct reactions carry `version: 2`. Check first so a versioned
    // reaction envelope is never misrouted into the message-text branches
    // below.
    if (typeof envelope.message === 'string') {
      reaction = getEnvelopeReaction(envelope);

      if (reaction) {
        body = envelope.message;
        break;
      }
    }

    // Qortal Hub v3 messages carry a Tiptap document instead of Chat's small
    // `{ message, repliedTo }` envelope. Decode it here so the same message
    // list renders both Home 1.7/ChibiHub traffic and Home 2 traffic.
    if (envelope.version === 3) {
      body = normalizeExtractedHubText(extractSafeHubText(envelope.messageText));
      hubImages = getQortalHubImageRefs(envelope.images);
      // A private-group IMAGE attachment rides the same images[] array as an
      // ordinary Hub-pinned image, but with the full descriptor's extra keys
      // layered on (docs/CHAT_ATTACHMENTS.md) — an entry from a real Hub
      // client never has those, so isPrivateAttachmentDescriptor rejects it
      // downstream and only Chat's own private attachments survive here.
      attachments = getAttachmentCandidates(envelope.images);

      if (typeof envelope.repliedTo === 'string' && envelope.repliedTo) {
        repliedTo = envelope.repliedTo;
      }

      break;
    }

    // Qortal direct messages (initial/edit) carry `version: 2` and `message`
    // as paragraph HTML, plus the required `specialId`/`type` fields the
    // exact-action schema always sets (review/schemas-home2-actions.md
    // "Direct chat"). Gate on `specialId` too, not just `version === 2`: a
    // human-typed `{message, version}` object (or Chat's own reply wrapper,
    // which never sets `version`) has no `specialId` and must keep falling
    // through to the generic branch below unchanged. The canonical delete
    // envelope's `message: '<p></p>'` decodes to body '' here, matching the
    // existing deleted-message representation.
    if (
      envelope.version === 2 &&
      typeof envelope.message === 'string' &&
      typeof envelope.specialId === 'string' &&
      envelope.specialId.length > 0 &&
      typeof envelope.type === 'string'
    ) {
      body = extractPlainTextFromParagraphHtml(envelope.message);

      if (typeof envelope.repliedTo === 'string' && envelope.repliedTo) {
        repliedTo = envelope.repliedTo;
      }

      break;
    }

    if (typeof envelope.message !== 'string') {
      break;
    }

    body = envelope.message;

    if (repliedTo === null && typeof envelope.repliedTo === 'string' && envelope.repliedTo) {
      repliedTo = envelope.repliedTo;
    }

    // Chat's own private-attachment convention (docs/CHAT_ATTACHMENTS.md):
    // an `attachments` array alongside `message`/`repliedTo` in the same
    // small envelope. Captured once — a nested reply-in-reply from old data
    // never carries this field, so the outer envelope's value (if any) wins.
    if (attachments.length === 0) {
      attachments = getAttachmentCandidates(envelope.attachments);
    }
  }

  return { attachments, body, hubImages, machineApp, reaction, repliedTo };
}

export function buildChatMessageText(text: string, repliedTo?: string | null, attachments?: readonly unknown[] | null) {
  const hasAttachments = !!attachments && attachments.length > 0;

  if (!repliedTo && !hasAttachments) {
    return text;
  }

  return JSON.stringify({
    message: text,
    ...(repliedTo ? { repliedTo } : {}),
    ...(hasAttachments ? { attachments } : {}),
  });
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
    const { attachments, body, hubImages, machineApp, reaction, repliedTo } = unwrapChatTextEnvelope(
      decodeBase64(message.data),
    );

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
      ...(attachments.length > 0 ? { attachments } : {}),
      ...(hubImages.length > 0 ? { hubImages } : {}),
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
