import { DIRECT_MESSAGE_MAX_BYTES } from './coreApi';
import { buildChatMessageText } from './chatText';
import { getUtf8ByteLength } from './privateGroupComposer';
import {
  buildQortalDirectChatPayload,
  buildQortalHubGroupChatPayload,
  normalizeQortalOutgoingMessage,
} from './qortalChatPayload';
import { MAX_MESSAGE_DATA_BYTES } from './qortalGeneralChat';
import type { ChatNetwork } from './types';

// G10 (2026-09-13): the composer showed a live byte counter only for closed
// groups; open groups, direct messages and Qortal General Chat failed at send
// time with no warning. Core caps every CHAT payload at 4000 UTF-8 bytes and
// Home caps a direct message at 3984 — both measured on the WIRE envelope, not
// on the typed text — so the estimate here builds the same envelope the send
// path builds (reply reference included; attachments are added at send time
// and are small enough to ignore for the counter, the send still enforces).

export const PUBLIC_CHAT_MAX_BYTES = 4000;
/** Below this share of the cap the counter stays out of the way. */
export const COMPOSER_BYTE_COUNTER_VISIBLE_RATIO = 0.5;

export type ComposerByteBudget = {
  bytes: number;
  max: number;
  overLimit: boolean;
  /** Whether the counter should be rendered at all for this draft. */
  visible: boolean;
};

export function estimateComposerByteBudget({
  draft,
  kind,
  network,
  repliedTo,
  isGeneralChat,
}: {
  draft: string;
  kind: 'direct' | 'group';
  network: ChatNetwork;
  repliedTo?: string | null;
  isGeneralChat?: boolean;
}): ComposerByteBudget {
  const text = draft.length > 0 ? draft : ' ';
  const base = buildChatMessageText(text, repliedTo ?? null);
  let wire: string;
  let max: number;

  if (kind === 'direct') {
    wire = network === 'qortal' ? buildQortalDirectChatPayload(normalizeQortalOutgoingMessage(base)) : base;
    max = DIRECT_MESSAGE_MAX_BYTES;
  } else if (network === 'qortal') {
    wire = buildQortalHubGroupChatPayload(normalizeQortalOutgoingMessage(base));
    max = isGeneralChat ? MAX_MESSAGE_DATA_BYTES : PUBLIC_CHAT_MAX_BYTES;
  } else {
    wire = base;
    max = PUBLIC_CHAT_MAX_BYTES;
  }

  const bytes = getUtf8ByteLength(wire);

  return {
    bytes,
    max,
    overLimit: bytes > max,
    visible: draft.length > 0 && bytes >= max * COMPOSER_BYTE_COUNTER_VISIBLE_RATIO,
  };
}
