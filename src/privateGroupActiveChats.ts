// Folds GET_PRIVATE_GROUP_ACTIVE_CHATS entries into the same ActiveGroupChat
// shape GET_ACTIVE_CHATS already returns, so a closed group's activity/unread
// ordering (groupActivityById) and sidebar preview snippet
// (groupPreviewByGroupId / qortalGroupPreviewByGroupId in App.tsx) come for
// free from the existing public-group pipeline — those two consumers already
// read straight off `activeChats.value.groups` / `qortalActiveChats.value.
// groups` and build their preview text directly from `data`/`encoding`
// (getMessageSnippet), with no extra per-entry branching required.
import type { ActiveGroupChat, PrivateGroupActiveChatDecryptedEntry, PrivateGroupActiveChatEntry } from './types';

// A DECRYPTED private entry already carries plaintext in `data` — represent
// it as unencrypted for isHiddenActiveChatEntry's classification (App.tsx),
// which otherwise treats an `isEncrypted: true` entry with no `decryptionStatus`
// of 'DECRYPTED' as indeterminate. Leaving `isEncrypted`/`isText` off this
// literal (ActiveGroupChat has no such fields) has the identical effect,
// since isHiddenActiveChatEntry treats both `undefined` and `false` the same
// way — this is documented explicitly so a future ActiveGroupChat field
// addition does not silently change that behavior.
export function toActiveGroupChatFromPrivateEntry(entry: PrivateGroupActiveChatDecryptedEntry): ActiveGroupChat {
  return {
    data: entry.data,
    encoding: entry.encoding,
    groupId: entry.txGroupId,
    sender: entry.sender,
    senderName: entry.senderName ?? undefined,
    signature: entry.signature ?? undefined,
    timestamp: entry.timestamp,
  };
}

// MISSING_KEY and NO_MESSAGES entries are inert here by design (P3-design.md
// item 6): a MISSING_KEY group must not get a fabricated preview, and its
// existing "closed" lock badge (chatLists.tsx, rendered off group.isOpen
// already) is the locked indicator — no separate badge is added. A
// NO_MESSAGES group simply contributes nothing. Only a DECRYPTED entry with a
// real timestamp can update activity/preview.
export function mergePrivateGroupActiveChats(
  publicGroups: readonly ActiveGroupChat[],
  privateEntries: readonly PrivateGroupActiveChatEntry[],
): ActiveGroupChat[] {
  const decryptedByGroupId = new Map<number, ActiveGroupChat>();

  for (const entry of privateEntries) {
    if (entry.status !== 'DECRYPTED' || typeof entry.timestamp !== 'number') {
      continue;
    }

    decryptedByGroupId.set(entry.txGroupId, toActiveGroupChatFromPrivateEntry(entry));
  }

  if (decryptedByGroupId.size === 0) {
    // No decrypted private activity to fold in — return the same reference so
    // callers can bail out of a re-render (same convention as
    // mergeActivityTimestamp/prunePendingSends in pendingSends.ts).
    return publicGroups as ActiveGroupChat[];
  }

  const merged = publicGroups.map((group) => {
    const replacement = decryptedByGroupId.get(group.groupId);

    if (!replacement) {
      return group;
    }

    decryptedByGroupId.delete(group.groupId);
    return replacement;
  });

  return decryptedByGroupId.size === 0 ? merged : [...merged, ...decryptedByGroupId.values()];
}
