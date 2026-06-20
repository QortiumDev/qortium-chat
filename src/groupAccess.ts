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

export type SendChatTarget = { kind: 'group'; group: GroupData } | { kind: 'direct' };

// On a public/network node, Home performs a keyless broadcast that the network
// only accepts for open groups; direct (1:1) and closed/private group sends are
// rejected and need a local Core or a trusted custom node. On a trusted node
// (isUsingPublicNode === false) nothing is blocked here.
export function isPublicNodeSendUnsupported(isUsingPublicNode: boolean, target: SendChatTarget) {
  if (!isUsingPublicNode) {
    return false;
  }

  if (target.kind === 'direct') {
    return true;
  }

  return !isOpenGroup(target.group);
}
