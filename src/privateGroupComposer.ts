// Pure composer-cap derivation for a closed group (P3-design.md item 2a):
// Qortal's private-group plaintext cap is fixed; Qortium/QPGC's comes from
// the per-chat GET_PRIVATE_GROUP_CHAT_STATE fetch and is undefined until (or
// unless) that state has loaded — the composer must never block on that
// fetch (P3-design.md: "never block message reads on state fetch failure"),
// so an undefined cap here means "no client-side cap shown/enforced yet",
// not zero.
import {
  isQortalPrivateGroupChatState,
  isQortiumPrivateGroupChatState,
  QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES,
} from './coreApi';
import type { ChatNetwork, PrivateGroupChatState } from './types';

export function getPrivateGroupComposerMaxPlaintextBytes(
  network: ChatNetwork,
  state: PrivateGroupChatState | null,
): number | undefined {
  if (network === 'qortal') {
    return QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES;
  }

  return state && isQortiumPrivateGroupChatState(state) ? state.maxMessagePlaintextBytes : undefined;
}

// New Home 2 builds distinguish protocol support (`available`) from whether
// this account can actually decrypt the current Qortium epoch
// (`keyAvailable`). Older Home builds omit the latter, so undefined must keep
// the legacy attempt-and-report behavior instead of disabling the composer.
export function getPrivateGroupKeyAvailability(
  network: ChatNetwork,
  state: PrivateGroupChatState | null,
): boolean | undefined {
  if (!state) return undefined;
  if (network === 'qortal') {
    return isQortalPrivateGroupChatState(state) ? state.available : undefined;
  }
  return isQortiumPrivateGroupChatState(state) ? state.keyAvailable : undefined;
}

export function isPrivateGroupKeyActionOutcomeUnknown(outcome: Record<string, unknown>): boolean {
  return outcome.outcome === 'unknown' || outcome.accepted === false;
}

// UTF-8 byte length of the drafted text, for the composer's remaining-bytes
// counter. `TextEncoder` is used the same way coreApi's
// assertPrivateGroupPlaintextByteLimit measures the wire message, so the
// counter and the actual send-time enforcement never disagree.
export function getUtf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}
