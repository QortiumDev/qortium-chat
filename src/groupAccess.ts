import { isGeneralChatGroup } from './generalChat';
import type { GroupData } from './types';

export type GroupReadAccessState = {
  canReadPrivateGroupChat: boolean;
  isAccountUnlocked: boolean;
  isGroupMembershipConfirmed: boolean;
  isJoinedGroup: boolean;
};

export function shouldDecryptGroupMessages(group: GroupData, state: GroupReadAccessState) {
  if (isGeneralChatGroup(group) || group.isOpen !== false) {
    return false;
  }

  return (
    state.isAccountUnlocked &&
    state.canReadPrivateGroupChat &&
    state.isGroupMembershipConfirmed &&
    state.isJoinedGroup
  );
}

// An open group accepts chat from any account. General Chat (group 0) is always
// open; otherwise a group is open unless the Core explicitly reports isOpen:false.
export function isOpenGroup(group: GroupData) {
  return isGeneralChatGroup(group) || group.isOpen !== false;
}
