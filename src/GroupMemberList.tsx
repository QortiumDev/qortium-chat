import type { BlockControls } from './blockList';
import {
  getAvatarView,
  getShortAddress,
  UserAvatar,
  type AccountInfoTarget,
  type AvatarProfilesByAddress,
} from './accountDisplay';
import { type AvatarLightboxImage } from './AvatarLightbox';
import {
  getGroupMemberAddress,
  getGroupMemberDisplayName,
  getGroupMemberRegisteredName,
  getGroupMemberRole,
  getOrderedGroupMembers,
} from './groupMembers';
import { AdminIcon, OwnerIcon } from './icons';
import { type TranslateFunction } from './i18n';
import { type GroupData, type GroupMember } from './types';

// 2.0.20 (G3): which moderation actions the viewer may take on a member.
// Owner-only operations (admin add/remove) and the rule that nobody
// moderates the owner or themselves are decided here from the roles; the
// host still prompts and Core still validates.
export type MemberModerationKind = 'addAdmin' | 'ban' | 'kick' | 'removeAdmin';

const MODERATION_BUTTON_KEYS = {
  addAdmin: 'button.moderate.addAdmin',
  ban: 'button.moderate.ban',
  kick: 'button.moderate.kick',
  removeAdmin: 'button.moderate.removeAdmin',
} as const;

const MODERATION_TITLE_KEYS = {
  addAdmin: 'action.moderate.addAdmin',
  ban: 'action.moderate.ban',
  kick: 'action.moderate.kick',
  removeAdmin: 'action.moderate.removeAdmin',
} as const;

export type MemberModeration = {
  /** Kinds the host advertises (empty = no controls). */
  available: ReadonlySet<MemberModerationKind>;
  /** The member an action is in flight for. */
  pendingAddress: string | null;
  onModerate: (kind: MemberModerationKind, address: string, label: string) => void;
  viewerAddress: string | null;
  viewerRole: 'admin' | 'member' | 'owner';
};

export function getMemberModerationKinds(
  moderation: MemberModeration,
  memberAddress: string,
  memberRole: 'admin' | 'member' | 'owner',
): MemberModerationKind[] {
  if (moderation.viewerRole === 'member' || memberRole === 'owner' || memberAddress === moderation.viewerAddress) {
    return [];
  }

  const kinds: MemberModerationKind[] = [];

  if (moderation.viewerRole === 'owner') {
    kinds.push(memberRole === 'admin' ? 'removeAdmin' : 'addAdmin');
  }

  // Admins moderate ordinary members; only the owner moderates admins.
  if (memberRole === 'member' || moderation.viewerRole === 'owner') {
    kinds.push('kick', 'ban');
  }

  return kinds.filter((kind) => moderation.available.has(kind));
}

export function GroupMemberList({
  avatarProfiles,
  blocking = null,
  group,
  members,
  moderation = null,
  onOpenAccount,
  onOpenAvatar,
  t,
  viewerAddress = null,
}: {
  avatarProfiles: AvatarProfilesByAddress;
  /** 2.0.23 (G5): Block/Unblock per member (never for the viewer); null hides it. */
  blocking?: BlockControls | null;
  group: GroupData | null;
  members: GroupMember[];
  moderation?: MemberModeration | null;
  onOpenAccount: (target: AccountInfoTarget) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  t: TranslateFunction;
  /** The viewer's own address, so the list never offers to block them. */
  viewerAddress?: string | null;
}) {
  const orderedMembers = getOrderedGroupMembers(members, group);
  const ownerAddress = group?.owner;

  if (orderedMembers.length === 0) {
    return <p className="empty">{t('hint.noMembers')}</p>;
  }

  return (
    <ul className="member-list">
      {orderedMembers.map((member) => {
        const address = getGroupMemberAddress(member);
        const registeredName = getGroupMemberRegisteredName(member);
        const profile = address ? avatarProfiles.get(address) : undefined;
        const { avatarSrc, name } = getAvatarView(profile, registeredName);
        const label = getGroupMemberDisplayName(member, t('member.label'), getShortAddress, profile?.name);
        const shortAddress = address ? getShortAddress(address) : '';
        const role = getGroupMemberRole(member, ownerAddress);
        const roleLabel =
          role === 'owner' ? t('label.group.owner') : role === 'admin' ? t('label.group.admin') : '';
        const moderationKinds = moderation && address ? getMemberModerationKinds(moderation, address, role) : [];
        const moderationPending = !!moderation && moderation.pendingAddress === address;
        const isBlocked = !!blocking && !!address && blocking.blocked.has(address);
        const canBlock = !!blocking && !!address && address !== moderation?.viewerAddress && address !== viewerAddress;
        const blockPending = !!blocking && blocking.pendingAddress === address;

        return (
          <li
            className={`member-chip member-chip--${role}${isBlocked ? ' member-chip--blocked' : ''}`}
            key={address || label}
            title={address}
          >
            <UserAvatar
              className="member-chip__avatar"
              name={name}
              onOpen={avatarSrc ? onOpenAvatar : undefined}
              openLabel={t('action.openAvatarImage')}
              src={avatarSrc}
            />
            {member.online === true ? (
              <span
                aria-label={t('label.member.online')}
                className="member-chip__online"
                role="img"
                title={t('label.member.online')}
              />
            ) : null}
            <span className="member-chip__text">
              {address ? (
                <button
                  className="member-chip__name member-chip__name-button"
                  onClick={() => onOpenAccount({ sender: address, senderName: name })}
                  title={t('action.openAccountInfo', { account: label })}
                  type="button"
                >
                  {label}
                </button>
              ) : (
                <span className="member-chip__name">{label}</span>
              )}
              {shortAddress && label !== shortAddress ? (
                <span className="member-chip__address">{shortAddress}</span>
              ) : null}
            </span>
            {role !== 'member' ? (
              <span
                aria-label={roleLabel}
                className={`member-chip__role member-chip__role--${role}`}
                role="img"
                title={roleLabel}
              >
                {role === 'owner' ? <OwnerIcon /> : <AdminIcon />}
              </span>
            ) : null}
            {isBlocked ? (
              <span className="member-chip__blocked" title={t('label.blocked')}>
                {t('label.blocked')}
              </span>
            ) : null}
            {canBlock && address ? (
              <span className="member-chip__moderation">
                <button
                  className={`button button--secondary member-chip__moderate member-chip__moderate--${isBlocked ? 'unblock' : 'block'}`}
                  disabled={blockPending}
                  onClick={() => blocking?.onToggle(address, !isBlocked)}
                  title={t(isBlocked ? 'action.unblockSender' : 'action.blockSender', { sender: label })}
                  type="button"
                >
                  {blockPending ? t('button.working') : t(isBlocked ? 'button.unblock' : 'button.block')}
                </button>
              </span>
            ) : null}
            {moderationKinds.length > 0 && address ? (
              <span className="member-chip__moderation">
                {moderationKinds.map((kind) => (
                  <button
                    className={`button button--secondary member-chip__moderate member-chip__moderate--${kind}`}
                    disabled={moderationPending}
                    key={kind}
                    onClick={() => moderation?.onModerate(kind, address, label)}
                    title={t(MODERATION_TITLE_KEYS[kind], { member: label })}
                    type="button"
                  >
                    {moderationPending ? t('button.working') : t(MODERATION_BUTTON_KEYS[kind])}
                  </button>
                ))}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
