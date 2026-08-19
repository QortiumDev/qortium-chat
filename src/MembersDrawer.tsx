import type { RefObject } from 'react';

import { getShortAddress, type AccountInfoTarget, type AvatarProfilesByAddress } from './accountDisplay';
import type { AvatarLightboxImage } from './AvatarLightbox';
import { GroupMemberList } from './GroupMemberList';
import type { TranslateFunction } from './i18n';
import { LoadingRows } from './LoadingRows';
import type { GroupData, GroupJoinRequest, GroupMember } from './types';

export function MembersDrawer({
  accountLockedLabel,
  accountRequiredLabel,
  approvePendingJoiner,
  avatarProfiles,
  canApproveGroupJoinRequests,
  canUseSelectedAccount,
  group,
  groupTitle,
  hasAccount,
  isOverlay,
  members,
  membersCloseRef,
  membersError,
  membersLabel,
  membersPhase,
  onApproveJoinRequest,
  onClose,
  onOpenAccount,
  onOpenAvatar,
  pendingJoinRequests,
  t,
}: {
  accountLockedLabel: string;
  accountRequiredLabel: string;
  approvePendingJoiner: string | null;
  avatarProfiles: AvatarProfilesByAddress;
  canApproveGroupJoinRequests: boolean;
  canUseSelectedAccount: boolean;
  group: GroupData | null;
  groupTitle: string;
  hasAccount: boolean;
  isOverlay: boolean;
  members: GroupMember[];
  membersCloseRef: RefObject<HTMLButtonElement | null>;
  membersError: string;
  membersLabel: string;
  membersPhase: 'idle' | 'loading' | 'ready' | 'error';
  onApproveJoinRequest: (request: GroupJoinRequest) => void;
  onClose: () => void;
  onOpenAccount: (target: AccountInfoTarget) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  pendingJoinRequests: GroupJoinRequest[];
  t: TranslateFunction;
}) {
  return (
    <>
      <button
        aria-hidden="true"
        className="members-drawer__scrim"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label={t('aria.groupMembers')}
        aria-modal={isOverlay || undefined}
        className="members-drawer"
        id="members-drawer"
        role={isOverlay ? 'dialog' : undefined}
      >
        <div className="members-drawer__header">
          <div>
            <h2>{membersLabel}</h2>
            <p>{groupTitle}</p>
          </div>
          <span>{members.length}</span>
          <button
            aria-label={t('button.close')}
            className="members-drawer__close"
            onClick={onClose}
            ref={membersCloseRef}
            title={t('button.close')}
            type="button"
          >
            X
          </button>
        </div>
        {membersPhase === 'error' ? <p className="error">{membersError}</p> : null}
        {membersPhase === 'loading' ? (
          <LoadingRows count={5} label={t('label.loading')} />
        ) : (
          <GroupMemberList
            avatarProfiles={avatarProfiles}
            group={group}
            members={members}
            onOpenAccount={onOpenAccount}
            onOpenAvatar={onOpenAvatar}
            t={t}
          />
        )}
        {pendingJoinRequests.length > 0 ? (
          <div className="join-requests" aria-label={t('title.joinRequests')}>
            <div className="join-requests__header">
              <strong>{t('title.joinRequests')}</strong>
              <span>{pendingJoinRequests.length}</span>
            </div>
            {pendingJoinRequests.map((request) => (
              <div className="join-request" key={`${request.groupId}:${request.joiner}`}>
                <span>{getShortAddress(request.joiner)}</span>
                <button
                  className="button button--secondary"
                  disabled={!canUseSelectedAccount || !canApproveGroupJoinRequests || approvePendingJoiner === request.joiner}
                  onClick={() => onApproveJoinRequest(request)}
                  title={
                    !hasAccount
                      ? accountRequiredLabel
                      : !canUseSelectedAccount
                      ? accountLockedLabel
                      : canApproveGroupJoinRequests
                        ? t('action.approveJoinRequest')
                        : t('action.approveUnavailable')
                  }
                  type="button"
                >
                  {approvePendingJoiner === request.joiner ? t('button.approving') : t('button.approve')}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </aside>
    </>
  );
}
