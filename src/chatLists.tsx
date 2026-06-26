import { memo, useMemo } from 'react';
import { getDirectTitle } from './accountDisplay';
import { formatTimeAgo, formatTimestamp } from './chatText';
import { getGroupTitle, isGeneralChatGroup } from './generalChat';
import { CloseIcon, LockIcon } from './icons';
import { type TranslateFunction } from './i18n';
import { type ActiveDirectChat, type GroupData } from './types';

export const GroupList = memo(function GroupList({
  activityByGroupId,
  collapsed = false,
  groups,
  memberCountsByGroupId,
  onSelect,
  selectedGroupId,
  t,
  unreadGroupIds,
  now,
}: {
  activityByGroupId: ReadonlyMap<number, number>;
  collapsed?: boolean;
  groups: GroupData[];
  memberCountsByGroupId?: ReadonlyMap<number, number>;
  onSelect: (group: GroupData) => void;
  selectedGroupId: number | null;
  t: TranslateFunction;
  unreadGroupIds: ReadonlySet<number>;
  now: number;
}) {
  // A collapsed section still surfaces the groups that need attention: unread
  // ones, plus the currently open group (unread sets exclude the open chat).
  const visibleGroups = collapsed
    ? groups.filter((group) => unreadGroupIds.has(group.groupId) || group.groupId === selectedGroupId)
    : groups;

  if (visibleGroups.length === 0) {
    return collapsed ? null : <p className="empty">{t('hint.noGroups')}</p>;
  }

  return (
    <ul className="group-list">
      {visibleGroups.map((group) => {
        const lastMessageTimestamp = activityByGroupId.get(group.groupId);
        const isUnread = unreadGroupIds.has(group.groupId);
        const memberCount =
          memberCountsByGroupId?.get(group.groupId) ?? (isGeneralChatGroup(group) ? undefined : group.memberCount);

        return (
          <li key={group.groupId}>
          <button
            className={`group-row${selectedGroupId === group.groupId ? ' group-row--selected' : ''}${isUnread ? ' group-row--unread' : ''}`}
            onClick={() => onSelect(group)}
            type="button"
          >
            <span className="group-row__top">
              <span className="group-row__heading">
                {isUnread ? (
                  <span
                    aria-label={t('label.unread')}
                    className="group-row__unread"
                    role="img"
                    title={t('label.unread')}
                  />
                ) : null}
                <span className="group-row__name">{getGroupTitle(group, t)}</span>
              </span>
              {lastMessageTimestamp ? (
                <span className="group-row__time" title={formatTimestamp(lastMessageTimestamp)}>
                  {formatTimeAgo(lastMessageTimestamp, now)}
                </span>
              ) : null}
            </span>
            <span className="group-row__footer">
              <span className="group-row__id">{`id:${group.groupId}`}</span>
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
              {typeof memberCount === 'number' ? (
                <span className="group-row__members">
                  {isGeneralChatGroup(group)
                    ? t('group.meta.activeCount', { count: memberCount.toLocaleString() })
                    : t('group.meta.memberCount', { count: memberCount.toLocaleString() })}
                </span>
              ) : null}
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
                <small title={formatTimestamp(lastMessageTimestamp)}>
                  {formatTimeAgo(lastMessageTimestamp, now)}
                </small>
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
