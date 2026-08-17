export type ChatReadTarget =
  | { kind: 'direct' }
  | { groupIsOpen: boolean | undefined; kind: 'group' };

/** Direct and closed-group transcripts are selected-account data. Public/open
 * group transcripts are node-public and remain readable before Home shares an
 * account with the app. */
export function chatReadRequiresAccount(target: ChatReadTarget): boolean {
  return target.kind === 'direct' || target.groupIsOpen === false;
}

export type ChatReadSession = {
  accountAddress: string | null;
  chatKey: string;
};

/** Equality deliberately includes null: an anonymous public read is current
 * only while the selected chain identity remains anonymous. */
export function isChatReadSessionStale(
  captured: ChatReadSession,
  current: ChatReadSession,
): boolean {
  return captured.chatKey !== current.chatKey || captured.accountAddress !== current.accountAddress;
}
