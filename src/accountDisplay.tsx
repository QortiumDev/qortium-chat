import { type AvatarLightboxImage } from './AvatarLightbox';
import { getAvatarFallbackCharacter, normalizeRegisteredName, type AvatarProfile } from './avatarProfiles';
import { getSenderLabel } from './chatText';
import { type TranslateFunction } from './i18n';
import { type ChatMessage } from './types';

export type AccountInfoTarget = Pick<ChatMessage, 'sender' | 'senderName'>;

export type CachedAvatarProfile = AvatarProfile & {
  requestKey: string;
};

// Keyed by the (untrusted) account address. A Map rather than a plain object so
// that the address — which originates from chat-message data — is never used as
// a computed object property name; that keeps the looked-up profile (and the
// avatar URL it carries) from being treated as attacker-controlled downstream.
export type AvatarProfilesByAddress = ReadonlyMap<string, CachedAvatarProfile>;

export function getShortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

// Avatar URLs are produced by fetchAvatarImage as `blob:` URLs (via
// URL.createObjectURL) or null. They are cached keyed by the untrusted
// message-sender address, which static analysis treats as tainting every field
// read back from that cache. Confirm the value is one of the schemes we actually
// emit before it reaches an `<img src>` — defense-in-depth, and it makes the
// safety explicit at the one place every avatar source funnels through.
function isSafeAvatarUrl(value: string) {
  return value.startsWith('blob:') || value.startsWith('data:image/');
}

export function getAvatarView(profile: AvatarProfile | undefined, preferredName: string | null | undefined) {
  const name = normalizeRegisteredName(preferredName) ?? profile?.name ?? null;
  const candidateSrc = profile?.name === name ? profile.avatarSrc : null;
  const avatarSrc = typeof candidateSrc === 'string' && isSafeAvatarUrl(candidateSrc) ? candidateSrc : null;

  return { avatarSrc, name };
}

export function getMessageSenderName(message: Pick<ChatMessage, 'senderName'>, profile: AvatarProfile | undefined) {
  return normalizeRegisteredName(message.senderName) ?? profile?.name ?? null;
}

export function getMessageSenderLabel(
  message: Pick<ChatMessage, 'sender' | 'senderName'>,
  profile: AvatarProfile | undefined,
) {
  return getMessageSenderName(message, profile) ?? getSenderLabel(message);
}

export function UserAvatar({
  className,
  name,
  onOpen,
  openLabel,
  src,
}: {
  className: string;
  name: string | null;
  onOpen?: (image: AvatarLightboxImage) => void;
  openLabel?: string;
  src: string | null;
}) {
  const avatarClassName = `${className} user-avatar`;

  if (src) {
    if (onOpen) {
      return (
        <button
          aria-label={openLabel}
          className={`${avatarClassName} user-avatar--button`}
          onClick={() => onOpen({ name, src })}
          title={openLabel}
          type="button"
        >
          <img alt="" className="user-avatar__image" src={src} />
        </button>
      );
    }

    return <img alt="" className={avatarClassName} src={src} />;
  }

  return (
    <span aria-hidden="true" className={`${avatarClassName} user-avatar--fallback`}>
      {getAvatarFallbackCharacter(name)}
    </span>
  );
}

export function MessageIdentity({
  message,
  onOpenAccount,
  onOpenAvatar,
  openAvatarLabel,
  profile,
  t,
}: {
  message: ChatMessage;
  onOpenAccount: (target: AccountInfoTarget) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  openAvatarLabel: string;
  profile: AvatarProfile | undefined;
  t: TranslateFunction;
}) {
  const { avatarSrc, name } = getAvatarView(profile, message.senderName);
  const label = getMessageSenderLabel(message, profile);

  return (
    <span className="message__identity" title={message.sender}>
      <UserAvatar
        className="message__avatar"
        name={name}
        onOpen={onOpenAvatar}
        openLabel={openAvatarLabel}
        src={avatarSrc}
      />
      <button
        aria-label={t('action.openAccountInfo', { account: label })}
        className="message__sender-button"
        onClick={() => onOpenAccount({ sender: message.sender, senderName: message.senderName ?? null })}
        title={message.sender}
        type="button"
      >
        <strong>{label}</strong>
      </button>
    </span>
  );
}
