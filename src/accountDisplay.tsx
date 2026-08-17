import { useState } from 'react';
import { type AvatarLightboxImage } from './AvatarLightbox';
import { getAvatarFallbackCharacter, normalizeRegisteredName, type AvatarProfile } from './avatarProfiles';
import { getSenderLabel } from './chatText';
import { type TranslateFunction } from './i18n';
import { type ActiveDirectChat, type ChatMessage, type ChatNetwork } from './types';

export type AccountInfoTarget = Pick<ChatMessage, 'sender' | 'senderName'>;

export type CachedAvatarProfile = AvatarProfile & {
  requestKey: string;
};

// Render-facing maps are scoped to one network and keyed by the (untrusted)
// account address. The owning cache uses AvatarProfilesByIdentity and keys by
// network + address so identical addresses on Qortium and Qortal never collide.
// A Map also avoids using message data as computed object property names.
export type AvatarProfilesByAddress = ReadonlyMap<string, CachedAvatarProfile>;
export type AvatarProfilesByIdentity = ReadonlyMap<string, CachedAvatarProfile>;

export function selectAvatarProfilesForNetwork(
  profiles: AvatarProfilesByIdentity,
  network: ChatNetwork,
): AvatarProfilesByAddress {
  const prefix = `${network}:`;
  const selected = new Map<string, CachedAvatarProfile>();

  for (const [key, profile] of profiles) {
    if (key.startsWith(prefix) && profile.network === network) {
      selected.set(profile.address, profile);
    }
  }

  return selected;
}

export function getShortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function getDirectTitle(direct: ActiveDirectChat) {
  return direct.name || getShortAddress(direct.address);
}

// `senderName`/`recipientName` on an active direct chat describe the LATEST
// message in that chat, whichever direction it travelled — so when the local
// account sent the last message, `senderName` is the LOCAL user's name, not the
// counterpart's. Only return a name whose owning address is `direct.address`
// itself; anything else would poison every name lookup keyed by that address.
export function getDirectCounterpartName(direct: ActiveDirectChat) {
  if (direct.name) {
    return direct.name;
  }

  if (direct.sender === direct.address) {
    return direct.senderName ?? null;
  }

  if (direct.recipient === direct.address) {
    return direct.recipientName ?? null;
  }

  return null;
}

// Avatar URLs are produced by the pointer-aware bridge client as `blob:` URLs
// (via URL.createObjectURL) or null. They are cached keyed by the untrusted
// message-sender address, which static analysis treats as tainting every field
// read back from that cache. Confirm the value is the only scheme we emit before
// it reaches an `<img src>` — defense-in-depth at the single avatar render seam.
function isSafeAvatarUrl(value: string) {
  return value.startsWith('blob:');
}

export function getVisibleAvatarSrc(src: string | null, failedSrc: string | null) {
  return src && src !== failedSrc ? src : null;
}

export function getAvatarView(profile: AvatarProfile | undefined, preferredName: string | null | undefined) {
  const name = normalizeRegisteredName(preferredName) ?? profile?.name ?? null;
  // Pointer-aware avatar responses are validated against the account address
  // before this network-and-address-keyed profile is committed. A historical sender name
  // can differ from the account's current name, but must not hide that account's
  // current avatar or pair it with another address.
  const candidateSrc = profile?.avatarSrc ?? null;
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
  fallback,
  name,
  onOpen,
  openLabel,
  src,
}: {
  className: string;
  fallback?: string;
  name: string | null;
  onOpen?: (image: AvatarLightboxImage) => void;
  openLabel?: string;
  src: string | null;
}) {
  const avatarClassName = `${className} user-avatar`;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const visibleSrc = getVisibleAvatarSrc(src, failedSrc);

  if (visibleSrc) {
    if (onOpen) {
      return (
        <button
          aria-label={openLabel}
          className={`${avatarClassName} user-avatar--button`}
          onClick={() => onOpen({ name, src: visibleSrc })}
          title={openLabel}
          type="button"
        >
          <img
            alt=""
            className="user-avatar__image"
            onError={() => setFailedSrc(visibleSrc)}
            src={visibleSrc}
          />
        </button>
      );
    }

    return (
      <img
        alt=""
        className={avatarClassName}
        onError={() => setFailedSrc(visibleSrc)}
        src={visibleSrc}
      />
    );
  }

  return (
    <span aria-hidden="true" className={`${avatarClassName} user-avatar--fallback`}>
      {fallback ?? getAvatarFallbackCharacter(name)}
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
