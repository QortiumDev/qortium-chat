import { describe, expect, it } from 'vitest';
import { createTranslator } from './i18n';
import {
  GENERAL_CHAT_GROUP_ID,
  getGroupTitle,
  isGeneralChatGroup,
  sortGroups,
  withGeneralChatGroup,
} from './generalChat';
import type { GroupData } from './types';

const t = createTranslator('en');

function group(groupId: number, groupName: string, overrides: Partial<GroupData> = {}): GroupData {
  return {
    groupId,
    groupName,
    isOpen: true,
    ...overrides,
  };
}

describe('General Chat group helpers', () => {
  it('pins General Chat into an empty-search group list', () => {
    const groups = withGeneralChatGroup([group(5, 'Dev')], '', t);

    expect(groups.map((item) => item.groupId)).toEqual([GENERAL_CHAT_GROUP_ID, 5]);
    expect(getGroupTitle(groups[0], t)).toBe('General Chat');
  });

  it('includes General Chat only for matching searches', () => {
    expect(withGeneralChatGroup([group(5, 'Dev')], 'general', t).map((item) => item.groupId)).toEqual([
      GENERAL_CHAT_GROUP_ID,
      5,
    ]);
    expect(withGeneralChatGroup([group(5, 'Dev')], 'dev', t).map((item) => item.groupId)).toEqual([5]);
  });

  it('dedupes a returned group 0 record and keeps it public', () => {
    const groups = withGeneralChatGroup([group(0, '', { isOpen: false, memberCount: 10 }), group(7, 'Builders')], '', t);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      groupId: GENERAL_CHAT_GROUP_ID,
      groupName: 'General Chat',
      isOpen: true,
      memberCount: 10,
    });
    expect(isGeneralChatGroup(groups[0])).toBe(true);
  });

  it('sorts General Chat before normal groups', () => {
    const sorted = sortGroups([group(9, 'Alpha'), group(0, 'General Chat'), group(3, 'Beta')], t);

    expect(sorted.map((item) => item.groupId)).toEqual([GENERAL_CHAT_GROUP_ID, 9, 3]);
  });
});
