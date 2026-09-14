import { useState, type RefObject } from 'react';

import { getShortAddress, type AccountInfoTarget, type AvatarProfilesByAddress } from './accountDisplay';
import type { AvatarLightboxImage } from './AvatarLightbox';
import { GroupMemberList, type MemberModeration } from './GroupMemberList';
import type { BlockControls } from './blockList';
import type { TranslateFunction } from './i18n';
import { LoadingRows } from './LoadingRows';
import type { GroupData, GroupJoinRequest, GroupMember } from './types';

export function MembersDrawer({
  accountLockedLabel,
  accountRequiredLabel,
  approvePendingJoiner,
  approveError = null,
  avatarProfiles,
  canApproveGroupJoinRequests,
  canUseSelectedAccount,
  group,
  groupTitle,
  hasAccount,
  isOverlay,
  members,
  moderation = null,
  onInvite = null,
  invitePending = false,
  blocking = null,
  viewerAddress = null,
  manageHref = null,
  onOpenManage = null,
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
  /** The last approve failure, shown next to the requests it belongs to (the pane's own error sits behind this drawer). */
  approveError?: string | null;
  avatarProfiles: AvatarProfilesByAddress;
  canApproveGroupJoinRequests: boolean;
  canUseSelectedAccount: boolean;
  group: GroupData | null;
  groupTitle: string;
  hasAccount: boolean;
  isOverlay: boolean;
  members: GroupMember[];
  /** 2.0.20 (G3): moderation controls per member; null hides them. */
  moderation?: MemberModeration | null;
  /** Invite by address, when the host advertises INVITE_TO_GROUP for a viewer who may invite. */
  onInvite?: ((address: string) => void) | null;
  invitePending?: boolean;
  /** 2.0.23 (G5): Block/Unblock per member; null hides it. */
  blocking?: BlockControls | null;
  viewerAddress?: string | null;
  /** Link to the full group manager app for create/edit/avatar (D-B: link out). */
  manageHref?: string | null;
  onOpenManage?: (() => void) | null;
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
  const [inviteAddress, setInviteAddress] = useState('');
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
            blocking={blocking}
            group={group}
            members={members}
            moderation={moderation}
            onOpenAccount={onOpenAccount}
            onOpenAvatar={onOpenAvatar}
            t={t}
            viewerAddress={viewerAddress}
          />
        )}
        {onInvite ? (
          <form
            className="members-drawer__invite"
            onSubmit={(event) => {
              event.preventDefault();
              const value = inviteAddress.trim();

              if (value) {
                onInvite(value);
                setInviteAddress('');
              }
            }}
          >
            <label>
              <span>{t('label.invite.address')}</span>
              <input
                autoComplete="off"
                disabled={invitePending}
                maxLength={64}
                onChange={(event) => setInviteAddress(event.target.value)}
                placeholder={t('placeholder.invite.address')}
                spellCheck={false}
                value={inviteAddress}
              />
            </label>
            <button className="button button--secondary" disabled={invitePending || !inviteAddress.trim()} type="submit">
              {invitePending ? t('button.working') : t('button.invite')}
            </button>
          </form>
        ) : null}
        {onOpenManage && manageHref ? (
          <p className="members-drawer__manage">
            <a
              href={manageHref}
              onClick={(event) => {
                event.preventDefault();
                onOpenManage();
              }}
              rel="noopener noreferrer"
            >
              {t('action.openGroupManager')}
            </a>
          </p>
        ) : null}
        {pendingJoinRequests.length > 0 ? (
          <div className="join-requests" aria-label={t('title.joinRequests')}>
            <div className="join-requests__header">
              <strong>{t('title.joinRequests')}</strong>
              <span>{pendingJoinRequests.length}</span>
            </div>
            {approveError ? (
              <p className="error join-requests__error" role="alert">
                {approveError}
              </p>
            ) : null}
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
