import { describe, expect, it } from 'vitest';
import { mergePrivateGroupActiveChats, toActiveGroupChatFromPrivateEntry } from './privateGroupActiveChats';
import type { ActiveGroupChat, PrivateGroupActiveChatEntry } from './types';

function decryptedEntry(overrides: Partial<PrivateGroupActiveChatEntry> = {}): PrivateGroupActiveChatEntry {
  return {
    data: 'cGxhaW50ZXh0',
    encoding: 'BASE64',
    sender: 'QsenderAddress',
    senderName: 'Alice',
    signature: 'private-sig-1',
    status: 'DECRYPTED',
    timestamp: 5000,
    txGroupId: 7,
    ...overrides,
  } as PrivateGroupActiveChatEntry;
}

describe('toActiveGroupChatFromPrivateEntry', () => {
  it('maps a decrypted entry into the ActiveGroupChat shape keyed by txGroupId', () => {
    expect(toActiveGroupChatFromPrivateEntry(decryptedEntry() as never)).toEqual({
      data: 'cGxhaW50ZXh0',
      encoding: 'BASE64',
      groupId: 7,
      sender: 'QsenderAddress',
      senderName: 'Alice',
      signature: 'private-sig-1',
      timestamp: 5000,
    });
  });
});

describe('mergePrivateGroupActiveChats', () => {
  it('returns the same public array reference when there is no decrypted private activity', () => {
    const publicGroups: ActiveGroupChat[] = [{ groupId: 1, timestamp: 100 }];

    expect(mergePrivateGroupActiveChats(publicGroups, [])).toBe(publicGroups);
    expect(
      mergePrivateGroupActiveChats(publicGroups, [{ groupId: 7, status: 'MISSING_KEY' }, { groupId: 8, status: 'NO_MESSAGES' }]),
    ).toBe(publicGroups);
  });

  it('appends a decrypted closed-group entry that has no existing public row', () => {
    const publicGroups: ActiveGroupChat[] = [{ groupId: 1, timestamp: 100 }];
    const merged = mergePrivateGroupActiveChats(publicGroups, [decryptedEntry()]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(publicGroups[0]);
    expect(merged[1]).toMatchObject({ groupId: 7, timestamp: 5000 });
  });

  it('replaces an existing public row for the same groupId with the decrypted entry', () => {
    const publicGroups: ActiveGroupChat[] = [{ groupId: 7, timestamp: 1 }];
    const merged = mergePrivateGroupActiveChats(publicGroups, [decryptedEntry({ timestamp: 9000 })]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ groupId: 7, timestamp: 9000 });
  });

  it('ignores MISSING_KEY and NO_MESSAGES entries entirely (no fabricated preview, no locked-badge duplication)', () => {
    const publicGroups: ActiveGroupChat[] = [];
    const merged = mergePrivateGroupActiveChats(publicGroups, [
      { groupId: 7, status: 'MISSING_KEY' },
      { groupId: 8, status: 'NO_MESSAGES' },
      decryptedEntry({ txGroupId: 9 }),
    ]);

    expect(merged).toEqual([expect.objectContaining({ groupId: 9 })]);
  });

  it('ignores a DECRYPTED entry with no numeric timestamp', () => {
    const publicGroups: ActiveGroupChat[] = [];

    expect(mergePrivateGroupActiveChats(publicGroups, [decryptedEntry({ timestamp: undefined as unknown as number })])).toBe(
      publicGroups,
    );
  });
});
