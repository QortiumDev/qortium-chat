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

export function GroupMemberList({
  avatarProfiles,
  group,
  members,
  onOpenAccount,
  onOpenAvatar,
  t,
}: {
  avatarProfiles: AvatarProfilesByAddress;
  group: GroupData | null;
  members: GroupMember[];
  onOpenAccount: (target: AccountInfoTarget) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  t: TranslateFunction;
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

        return (
          <li
            className={`member-chip member-chip--${role}`}
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
          </li>
        );
      })}
    </ul>
  );
}
