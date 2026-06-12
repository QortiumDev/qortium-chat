import type { TranslateFunction } from './i18n';
import type { GroupData } from './types';

export const GENERAL_CHAT_GROUP_ID = 0;

const GENERAL_CHAT_GROUP: GroupData = {
  groupId: GENERAL_CHAT_GROUP_ID,
  groupName: 'General Chat',
  isOpen: true,
};

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function isGeneralChatGroup(group: Pick<GroupData, 'groupId'> | null | undefined) {
  return group?.groupId === GENERAL_CHAT_GROUP_ID;
}

export function getGroupTitle(group: GroupData, t: TranslateFunction) {
  if (isGeneralChatGroup(group)) {
    return t('title.generalChat');
  }

  return group.groupName || t('title.groupTitle', { groupId: group.groupId });
}

function shouldIncludeGeneralChat(search: string, t: TranslateFunction) {
  const normalizedSearch = normalizeSearch(search);

  if (!normalizedSearch) {
    return true;
  }

  const searchTargets = [
    'general',
    'general chat',
    'global',
    t('title.generalChat'),
    t('label.group.global'),
    t('group.meta.general'),
  ].map(normalizeSearch);

  return searchTargets.some((target) => target.includes(normalizedSearch));
}

export function withGeneralChatGroup(groups: GroupData[], search: string, t: TranslateFunction) {
  const regularGroups = groups.filter((group) => !isGeneralChatGroup(group));

  if (!shouldIncludeGeneralChat(search, t)) {
    return regularGroups;
  }

  const existingGeneralChat = groups.find(isGeneralChatGroup);
  const generalChat = existingGeneralChat
    ? {
        ...existingGeneralChat,
        groupId: GENERAL_CHAT_GROUP_ID,
        groupName: existingGeneralChat.groupName || GENERAL_CHAT_GROUP.groupName,
        isOpen: true,
      }
    : GENERAL_CHAT_GROUP;

  return [generalChat, ...regularGroups];
}

export function sortGroups(groups: GroupData[], t: TranslateFunction) {
  return [...groups].sort((first, second) => {
    if (isGeneralChatGroup(first) && !isGeneralChatGroup(second)) {
      return -1;
    }

    if (!isGeneralChatGroup(first) && isGeneralChatGroup(second)) {
      return 1;
    }

    const firstName = getGroupTitle(first, t).toLocaleLowerCase();
    const secondName = getGroupTitle(second, t).toLocaleLowerCase();

    return firstName.localeCompare(secondName);
  });
}
