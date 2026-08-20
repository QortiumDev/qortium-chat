import type { AsyncState } from './types';

type LoadPhase = AsyncState<unknown>['phase'];

export type DirectSectionDefaultCollapseInput = {
  activeChatsPhase: LoadPhase;
  bridgeReady: boolean;
  canOpenDirectChat: boolean;
  directCount: number;
};

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
