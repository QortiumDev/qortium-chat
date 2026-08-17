export type PrivateGroupRecoveryContext = {
  accountAddress: string;
  accountRefreshGeneration: number;
  chatKey: string;
  groupId: number;
};

export type CurrentPrivateGroupRecoveryState = {
  accountAddress: string | null;
  accountRefreshGeneration: number;
  accountRefreshPending: boolean;
  selectedChatKey: string;
  selectedGroupId: number | null;
  joinedGroupIds: ReadonlySet<number>;
};

/** Private-group recovery can cross several approval prompts. Every bridge
 * side effect must still belong to the account and group that initiated it. */
export function isPrivateGroupRecoveryContextCurrent(
  context: PrivateGroupRecoveryContext,
  current: CurrentPrivateGroupRecoveryState,
): boolean {
  return (
    !current.accountRefreshPending &&
    current.accountRefreshGeneration === context.accountRefreshGeneration &&
    current.accountAddress === context.accountAddress &&
    current.selectedChatKey === context.chatKey &&
    current.selectedGroupId === context.groupId &&
    current.joinedGroupIds.has(context.groupId)
  );
}
