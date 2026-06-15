import { isGeneralChatGroup } from './generalChat';
import type { GroupData } from './types';

export type GroupReadAccessState = {
  canReadPrivateGroupChat: boolean;
  isAccountUnlocked: boolean;
  isGroupMembershipConfirmed: boolean;
  isJoinedGroup: boolean;
};

export function canReadGroupMessages(group: GroupData, state: GroupReadAccessState) {
  if (isGeneralChatGroup(group) || group.isOpen !== false) {
    return true;
  }

  return (
    state.isAccountUnlocked &&
    state.canReadPrivateGroupChat &&
    state.isGroupMembershipConfirmed &&
    state.isJoinedGroup
  );
}
