import type { AsyncState } from './types';

type LoadPhase = AsyncState<unknown>['phase'];

export type DirectSectionDefaultCollapseInput = {
  activeChatsPhase: LoadPhase;
  bridgeReady: boolean;
  canOpenDirectChat: boolean;
  directCount: number;
};

export type PrivateChatCapabilityStatus = 'available' | 'limited' | 'pending' | 'unavailable';

export type PrivateChatCapabilityInput = {
  bridgeReady: boolean;
  canRead: boolean;
  canSend: boolean;
};

// Account sharing, wallet lock, membership, and key availability are separate
// access states. This classifier only describes what the current host bridge
// can do, so those recoverable states never receive an "unsupported" badge.
export function getPrivateChatCapabilityStatus({
  bridgeReady,
  canRead,
  canSend,
}: PrivateChatCapabilityInput): PrivateChatCapabilityStatus {
  if (!bridgeReady) {
    return 'pending';
  }

  if (canRead && canSend) {
    return 'available';
  }

  if (!canRead && !canSend) {
    return 'unavailable';
  }

  return 'limited';
}

// null means the host/list has not settled enough to override a stored layout
// choice. Once the bridge proves DMs unavailable, or a successful list load
// proves there are none, the section should start collapsed. A populated list
// is a settled non-collapse decision, but it never forces an auto-expand.
export function getDirectSectionDefaultCollapse({
  activeChatsPhase,
  bridgeReady,
  canOpenDirectChat,
  directCount,
}: DirectSectionDefaultCollapseInput): boolean | null {
  if (!bridgeReady) {
    return null;
  }

  if (!canOpenDirectChat) {
    return true;
  }

  if (directCount > 0) {
    return false;
  }

  return activeChatsPhase === 'ready' ? true : null;
}
