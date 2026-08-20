import { memo, useMemo } from 'react';
import { getAvatarView, getDirectTitle, UserAvatar, type AvatarProfilesByAddress } from './accountDisplay';
import { getGroupAvatarProfileKey, type GroupAvatarProfile } from './avatarProfiles';
import { formatTimeAgo, formatTimestamp } from './chatText';
import { type GroupConversationSummary } from './conversationModel';
import { getConversationInitials } from './conversationPresentation';
import { isGeneralChatGroup } from './generalChat';
import { CloseIcon, LockIcon, UnavailableIcon } from './icons';
import { type TranslateFunction } from './i18n';
import { type PrivateChatCapabilityStatus } from './sidebarSections';
import { type ActiveDirectChat } from './types';

export const GroupList = memo(function GroupList({
  collapsed = false,
  conversations,
  groupAvatarProfiles,
  onSelect,
  privateGroupCapabilityStatus = 'pending',
  privateGroupUnavailableLabel,
  selectedConversationKey,
  t,
  now,
}: {
  collapsed?: boolean;
  conversations: GroupConversationSummary[];
  groupAvatarProfiles: ReadonlyMap<string, GroupAvatarProfile>;
  onSelect: (conversation: GroupConversationSummary) => void;
  privateGroupCapabilityStatus?: PrivateChatCapabilityStatus;
  privateGroupUnavailableLabel?: string;
  selectedConversationKey: string | null;
  t: TranslateFunction;
  now: number;
}) {
  // A collapsed section still surfaces the groups that need attention: unread
  // ones, plus the currently open group (unread sets exclude the open chat).
  const visibleConversations = collapsed
    ? conversations.filter((conversation) => conversation.unread || conversation.key === selectedConversationKey)
    : conversations;

  if (visibleConversations.length === 0) {
    return collapsed ? null : <p className="empty">{t('hint.noGroups')}</p>;
  }

  return (
    <ul className="group-list">
      {visibleConversations.map((conversation) => {
        const { activityAt, group, memberCount, membership, preview, protocol, title, unread } = conversation;
        // Closed groups' stream payloads are encrypted — never show those as a
        // decoded "preview"; their rows stay as before.
        const visiblePreview = group.isOpen === false ? null : preview;
        const groupAvatar = groupAvatarProfiles.get(getGroupAvatarProfileKey(conversation.network, group.groupId));
        const unavailableLabel = privateGroupUnavailableLabel ?? t('label.approval.unavailable');

        return (
          <li key={conversation.key}>
            <button
              className={`group-row${selectedConversationKey === conversation.key ? ' group-row--selected' : ''}${unread ? ' group-row--unread' : ''}${membership === 'preview' ? ' group-row--preview' : ''}`}
              onClick={() => onSelect(conversation)}
              type="button"
            >
              <UserAvatar
                className="group-row__avatar"
                fallback={getConversationInitials(title)}
                name={title}
                src={groupAvatar?.avatarSrc ?? null}
              />
              <span className="group-row__content">
                <span className="group-row__top">
                  <span className="group-row__heading">
                    {unread ? (
                      <span
                        aria-label={t('label.unread')}
                        className="group-row__unread"
                        role="img"
                        title={t('label.unread')}
                      />
                    ) : null}
                    <span className="group-row__name">{title}</span>
                  </span>
                  {activityAt ? (
                    <span className="group-row__time" title={formatTimestamp(activityAt, t.locale)}>
                      {formatTimeAgo(activityAt, now, t.locale)}
                    </span>
                  ) : null}
                </span>
                {visiblePreview ? <span className="group-row__preview">{visiblePreview}</span> : null}
                <span className="group-row__footer">
                  <span className="group-row__protocol">{protocol.toUpperCase()}</span>
                  {membership === 'preview' ? (
                    <span className="group-row__membership">{t('label.group.preview')}</span>
                  ) : null}
                  {!isGeneralChatGroup(group) && group.isOpen === false ? (
                    <span
                      aria-label={t('label.group.closed')}
                      className="group-row__lock"
                      role="img"
                      title={t('label.group.closed')}
                    >
                      <LockIcon />
                    </span>
                  ) : null}
                  {!isGeneralChatGroup(group) &&
                  group.isOpen === false &&
                  privateGroupCapabilityStatus === 'unavailable' ? (
                    <span
                      aria-label={unavailableLabel}
                      className="group-row__unavailable"
                      role="img"
                      title={unavailableLabel}
                    >
                      <UnavailableIcon />
                    </span>
                  ) : null}
                  {typeof memberCount === 'number' ? (
                    <span className="group-row__members">
                      {isGeneralChatGroup(group)
                        ? t('group.meta.activeCount', { count: memberCount.toLocaleString(t.locale) })
                        : t('group.meta.memberCount', { count: memberCount.toLocaleString(t.locale) })}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
    );
});

export const DirectList = memo(function DirectList({
  activityByAddress,
  canOpen,
  collapsed = false,
  directs: directEntries,
  onRemove,
  onSelect,
  previewByAddress,
  avatarProfiles,
  removableAddresses,
  selectedAddress,
  t,
  unreadAddresses,
  now,
}: {
  activityByAddress: ReadonlyMap<string, number>;
  canOpen: boolean;
  collapsed?: boolean;
  directs: ActiveDirectChat[];
  onRemove: (address: string) => void;
  onSelect: (direct: ActiveDirectChat) => void;
  previewByAddress?: ReadonlyMap<string, string>;
  avatarProfiles: AvatarProfilesByAddress;
  removableAddresses: ReadonlySet<string>;
  selectedAddress: string | null;
  t: TranslateFunction;
  unreadAddresses: ReadonlySet<string>;
  now: number;
}) {
  const directs = useMemo(() => {
    const sorted = [...directEntries].sort((first, second) => {
      const firstActivity = activityByAddress.get(first.address);
      const secondActivity = activityByAddress.get(second.address);

      if (firstActivity !== undefined && secondActivity !== undefined && firstActivity !== secondActivity) {
        return secondActivity - firstActivity;
      }

      if (firstActivity !== undefined && secondActivity === undefined) {
        return -1;
      }

      if (firstActivity === undefined && secondActivity !== undefined) {
        return 1;
      }

      return getDirectTitle(first).localeCompare(getDirectTitle(second));
    });

    // A collapsed section still surfaces the directs that need attention: unread
    // ones, plus the currently open chat (unread sets exclude the open chat).
    return collapsed
      ? sorted.filter((direct) => unreadAddresses.has(direct.address) || direct.address === selectedAddress)
      : sorted;
  }, [directEntries, activityByAddress, collapsed, unreadAddresses, selectedAddress]);

  if (directs.length === 0) {
    return collapsed ? null : <p className="empty">{t('hint.noDirectChats')}</p>;
  }

  return (
    <ul className="direct-list">
      {directs.map((direct) => {
        const lastMessageTimestamp = activityByAddress.get(direct.address);
        const isUnread = unreadAddresses.has(direct.address);
        const isRemovable = removableAddresses.has(direct.address);
        const profile = avatarProfiles.get(direct.address);
        const { avatarSrc, name } = getAvatarView(profile, direct.name);
        const title = getDirectTitle(direct);

        return (
          <li
            className={`direct-row-wrap${isRemovable ? ' direct-row-wrap--removable' : ''}`}
            key={direct.address}
          >
            <button
              className={`direct-row${selectedAddress === direct.address ? ' direct-row--selected' : ''}${isUnread ? ' direct-row--unread' : ''}`}
              disabled={!canOpen}
              onClick={() => onSelect(direct)}
              title={canOpen ? t('action.directTooltip') : t('action.directReadOnly')}
              type="button"
            >
              <UserAvatar className="direct-row__avatar" name={name} src={avatarSrc} />
              <span className="direct-row__main">
                {isUnread ? (
                  <span
                    aria-label={t('label.unread')}
                    className="direct-row__unread"
                    role="img"
                    title={t('label.unread')}
                  />
                ) : null}
                <span className="direct-row__title">{title}</span>
              </span>
              {lastMessageTimestamp && !isRemovable ? (
                <small title={formatTimestamp(lastMessageTimestamp, t.locale)}>
                  {formatTimeAgo(lastMessageTimestamp, now, t.locale)}
                </small>
              ) : null}
              {previewByAddress?.get(direct.address) ? (
                <span className="direct-row__preview">{previewByAddress.get(direct.address)}</span>
              ) : null}
            </button>
            {isRemovable ? (
              <button
                aria-label={t('action.removeDirectChat', { name: title })}
                className="direct-row__remove"
                onClick={() => onRemove(direct.address)}
                title={t('button.removeChat')}
                type="button"
              >
                <CloseIcon />
              </button>
            ) : null}
          </li>
        );
      })}
      </ul>
    );
});
