import {
  Fragment,
  memo,
  type ReactNode,
  type SubmitEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import EmojiPicker, { type EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import {
  buildActiveChatsWebSocketUrl,
  buildGroupMessagesWebSocketUrl,
  DEFAULT_LIST_LIMIT,
  approveGroupJoinRequest,
  getActiveChats,
  getAccountGroupJoinRequests,
  getAdminGroupJoinRequests,
  getCurrentBlockHeight,
  getDirectMessages,
  getGroupApprovalVotes,
  getGroupMembers,
  getGroupMessages,
  getMemberGroups,
  getMissingPrivateGroupKeyRequests,
  getMintingStatus,
  getNameOwnerAddress,
  getPendingGroupApprovals,
  getTransactionStatus,
  getPrivateDirectActiveChats,
  leaveGroup,
  joinGroup,
  requestPrivateGroupChatKey,
  resolvePrivateGroupChatKeyRequests,
  searchGroups,
  sendChatMessage,
  sendDirectChatMessage,
  startMinting,
  submitGroupApproval,
} from './coreApi';
import {
  BLOCK_TIME_MS,
  computeApprovalProgress,
  computeApprovalWindow,
  NULL_ACCOUNT_ADDRESS,
  type ApprovalWindowState,
} from './approvalProgress';
import {
  DEFAULT_REACTION_OPTIONS,
  buildChatMessageText,
  buildReactionMessageText,
  decodeChatMessage,
  formatTimeAgo,
  formatTimestamp,
  getSenderLabel,
} from './chatText';
import {
  buildMessageThreads,
  getLatestNonReactionMessageTimestamp,
  isThreadContinuation,
  sortMessagesByTimestamp,
  type MessageThread,
} from './messageThreads';
import {
  buildMessageReactionIndex,
  getReactionPendingKey,
  type MessageReactionSummary,
} from './messageReactions';
import { getBridgeState, hasAction, qdnRequest } from './qdnRequest';
import {
  fetchQdnImagePreviews,
  getDocumentQdnResources,
  getImageQdnResources,
  getMediaQdnResources,
  openQdnDocumentViewer,
  openQdnMediaPlayer,
  renderMessageTextWithAppLinks,
  saveQdnResource,
  type QdnDocumentResource,
  type QdnImagePreview,
  type QdnImageResource,
  type QdnMediaResource,
} from './messageLinks';
import { createTranslator, normalizeLanguage, type TranslateFunction } from './i18n';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import {
  GENERAL_CHAT_GROUP_ID,
  getGroupTitle,
  isGeneralChatGroup,
  sortGroups,
  withGeneralChatGroup,
} from './generalChat';
import { copyTextToClipboard } from './clipboard';
import {
  mergePersistedDirect,
  readLastChat,
  readPersistedDirects,
  readReadWatermarks,
  toStoredSelectedChat,
  writeLastChat,
  writePersistedDirects,
  writeReadWatermarks,
  type PersistedDirect,
} from './chatStorage';
import {
  getActiveMessageGroupMembers,
  getGroupMemberAddress,
  getGroupMemberDisplayName,
  getGroupMemberRegisteredName,
  getGroupMemberRole,
  getOrderedGroupMembers,
} from './groupMembers';
import { isPublicNodeSendUnsupported, shouldDecryptGroupMessages } from './groupAccess';
import {
  fetchAvatarImage,
  getAvatarFallbackCharacter,
  loadAvatarProfile,
  normalizeRegisteredName,
  resolveAvatarIdentities,
  type AvatarProfile,
} from './avatarProfiles';
import type {
  ActiveChats,
  ActiveDirectChat,
  BridgeState,
  ApprovalProgress,
  ChatMessage,
  GroupApprovalVote,
  GroupData,
  GroupJoinRequest,
  GroupWithJoinRequests,
  GroupMember,
  MintingStatus,
  PendingApprovalTransaction,
  QdnAction,
  QdnSelectedAccount,
} from './types';

type AsyncState<T> =
  | { error?: string; phase: 'idle' | 'loading'; value: T }
  | { error: string; phase: 'error'; value: T }
  | { phase: 'ready'; value: T };

const emptyGroups: GroupData[] = [];
const emptyMembers: GroupMember[] = [];
const emptyMessages: ChatMessage[] = [];
const emptyJoinRequests: GroupJoinRequest[] = [];
const emptyAdminJoinRequests: GroupWithJoinRequests[] = [];
const emptyPendingApprovals: PendingApprovalTransaction[] = [];
const emptyApprovalVotes: GroupApprovalVote[] = [];
const emptyActiveChats: ActiveChats = { direct: [], groups: [] };

// Groups whose transactions are gated by development-group approval (e.g. Core
// auto-updates). Previewnet uses group id 1 ("development"); override with the
// VITE_QORTIUM_DEV_GROUP_IDS env var (comma-separated) for other networks.
const DEV_GROUP_IDS = new Set(
  (import.meta.env.VITE_QORTIUM_DEV_GROUP_IDS || '1')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0),
);

type SelectedChat =
  | {
      group: GroupData;
      kind: 'group';
    }
  | {
      direct: ActiveDirectChat;
      kind: 'direct';
    };

function getSelectedChatKey(chat: SelectedChat | null) {
  if (!chat) {
    return '';
  }

  return chat.kind === 'group' ? `group:${chat.group.groupId}` : `direct:${chat.direct.address}`;
}

type TrackedTransaction = {
  action: 'approve' | 'groupApproval' | 'join' | 'leave' | 'rewardshare';
  groupId: number;
  groupName: string;
  id: string;
  joiner?: string;
  message: string;
  phase: 'confirmed' | 'failed' | 'pending';
  signature?: string;
};

type PrivateGroupKeyRecoveryRequest = {
  epochId?: string;
  groupId: number;
  keyId?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getPrivateGroupKeyRecoveryKey(accountAddress: string, request: PrivateGroupKeyRecoveryRequest) {
  return `${accountAddress}:${request.groupId}:${request.epochId ?? ''}:${request.keyId ?? ''}`;
}

function getBridgeErrorMessage(error: unknown, fallback: string, t: TranslateFunction) {
  const message = getErrorMessage(error, fallback).replace(
    /^Error invoking remote method 'qdn-app:request': Error: /,
    '',
  );

  const isBackendErrorMessage =
    message.includes('Node API paths must start with /.') ||
    message.includes('Node API path contains invalid control characters.') ||
    message.includes('Only GET and HEAD node API requests are supported.') ||
    message.includes('Node API response exceeded the ') ||
    message.includes('Node status failed with HTTP ') ||
    message.includes('Selected account is only available inside Qortium Home.') ||
    message.includes(' is not available in local browser development.') ||
    message.includes('QDN requests must include an action.') ||
    message.includes('Closed group chat reads require Qortium Home private group chat support.') ||
    message.includes('Direct private chat reads require Qortium Home direct chat support.');
  const isGenericBackendErrorMessage =
    message.includes(' failed with HTTP ') ||
    message.includes('SyntaxError:') ||
    message.includes('Unexpected token') ||
    message.includes('Unexpected end of JSON input') ||
    message.startsWith('Failed to fetch');

  if (isBackendErrorMessage || isGenericBackendErrorMessage) {
    return fallback;
  }

  if (message.includes('Account request was denied')) {
    return t('status.bridge.accountAccessDenied');
  }

  if (message.includes('QDN write request was denied')) {
    return t('status.bridge.writeDenied');
  }

  return message;
}

function getAccountMessage(error: string, isHomeBridge: boolean, t: TranslateFunction) {
  if (error.includes('No account is selected')) {
    return t('label.account.required.select');
  }

  if (error.includes('Account access was not shared')) {
    return t('action.account.notShared');
  }

  return isHomeBridge
    ? t('action.account.notShared')
    : t('action.noAccountUse');
}

function createState<T>(value: T): AsyncState<T> {
  return { phase: 'idle', value };
}

function LoadingRows({ count = 3, label }: { count?: number; label: string }) {
  return (
    <div className="skeleton-list" aria-label={label} role="status">
      {Array.from({ length: count }, (_, index) => (
        <span className="skeleton skeleton--row" key={index} />
      ))}
    </div>
  );
}

function getShortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

// Qortium/Qortal addresses are Base58, start with 'Q', and are ~34 chars. Anything
// that does not match is treated as a registered name to resolve to an owner.
function looksLikeQortalAddress(value: string) {
  return /^Q[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(value);
}

function getDirectTitle(direct: ActiveDirectChat) {
  return direct.name || getShortAddress(direct.address);
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m21 21-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function OwnerIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M4 18h16" />
      <path d="m5 8 4 4 3-6 3 6 4-4-1.5 10h-11z" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M12 3 5.5 6v5.5c0 4.25 2.7 7.25 6.5 9.5 3.8-2.25 6.5-5.25 6.5-9.5V6z" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <rect height="11" rx="2" width="14" x="5" y="10" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function BrandMark() {
  return (
    <svg
      className="topbar__brand-mark"
      viewBox="0 0 683 685"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="miter"
      strokeMiterlimit={10}
      aria-hidden="true"
      focusable="false"
    >
      <path strokeWidth={6} d="M341,29.5 69,186.7 69,503.3 341,659.5 478.5,580.5 613,657.8 613,186.7Z" />
      <path strokeWidth={37} d="M341,208.3 223.5,275.7 223.5,412.3 341,479.7 409,440.7 458.5,469.1 458.5,275.7Z" />
    </svg>
  );
}

function getMessageKey(message: ChatMessage, index = 0) {
  return message.signature || `${message.timestamp}-${message.sender}-${index}`;
}

function mergeMessages(
  currentMessages: ChatMessage[],
  nextMessages: ChatMessage[],
  maxCount = 100,
) {
  const messages = new Map<string, ChatMessage>();

  for (const [index, message] of currentMessages.entries()) {
    messages.set(getMessageKey(message, index), message);
  }

  let addedMessage = false;

  for (const [index, message] of nextMessages.entries()) {
    const key = getMessageKey(message, index);

    if (!messages.has(key)) {
      addedMessage = true;
    }

    messages.set(key, message);
  }

  // The group websocket resends its whole window on every frame; when none of
  // those messages are new, keep the same array reference so React bails out of
  // the re-render instead of rebuilding and re-sorting an identical list. The
  // existing tail is already sorted and capped, so it stays a valid result.
  if (!addedMessage) {
    return currentMessages;
  }

  const merged = sortMessagesByTimestamp([...messages.values()]);

  // The live tail is bounded; the on-demand history buffer is not (maxCount =
  // Infinity) so paging backward can accumulate the full history.
  return Number.isFinite(maxCount) ? merged.slice(-maxCount) : merged;
}

function mergeActivityTimestamp<Key>(
  current: ReadonlyMap<Key, number | null>,
  key: Key,
  messages: ChatMessage[],
) {
  const latestTimestamp = getLatestNonReactionMessageTimestamp(messages);
  const currentTimestamp = current.get(key);

  if (latestTimestamp === null) {
    if (currentTimestamp === null) {
      return current;
    }

    const next = new Map(current);

    next.set(key, null);

    return next;
  }

  if (currentTimestamp !== undefined && currentTimestamp !== null && currentTimestamp >= latestTimestamp) {
    return current;
  }

  const next = new Map(current);

  next.set(key, latestTimestamp);

  return next;
}

function parseChatMessages(value: unknown) {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;

  return Array.isArray(parsed) ? parsed.filter((message): message is ChatMessage => !!message) : [];
}

function parseActiveChats(value: unknown) {
  const parsed = typeof value === 'string' ? JSON.parse(value) as unknown : value;

  return parsed && typeof parsed === 'object' ? parsed as ActiveChats : emptyActiveChats;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSelectedAccountChangedMessage(value: unknown) {
  return isRecord(value) && (
    value.type === 'qortium:selected-account-changed' ||
    value.action === 'SELECTED_ACCOUNT_CHANGED'
  );
}

function normalizeSelectedAccount(account: QdnSelectedAccount): QdnSelectedAccount {
  return {
    ...account,
    isUnlocked: account.isUnlocked === true,
  };
}

type CachedAvatarProfile = AvatarProfile & {
  requestKey: string;
};

// Keyed by the (untrusted) account address. A Map rather than a plain object so
// that the address — which originates from chat-message data — is never used as
// a computed object property name; that keeps the looked-up profile (and the
// avatar URL it carries) from being treated as attacker-controlled downstream.
type AvatarProfilesByAddress = ReadonlyMap<string, CachedAvatarProfile>;

type AvatarLightboxImage = {
  name: string | null;
  src: string;
};

type AccountInfoTarget = Pick<ChatMessage, 'sender' | 'senderName'>;

// Avatar URLs are produced by fetchAvatarImage as `blob:` URLs (via
// URL.createObjectURL) or null. They are cached keyed by the untrusted
// message-sender address, which static analysis treats as tainting every field
// read back from that cache. Confirm the value is one of the schemes we actually
// emit before it reaches an `<img src>` — defense-in-depth, and it makes the
// safety explicit at the one place every avatar source funnels through.
function isSafeAvatarUrl(value: string) {
  return value.startsWith('blob:') || value.startsWith('data:image/');
}

function getAvatarView(profile: AvatarProfile | undefined, preferredName: string | null | undefined) {
  const name = normalizeRegisteredName(preferredName) ?? profile?.name ?? null;
  const candidateSrc = profile?.name === name ? profile.avatarSrc : null;
  const avatarSrc = typeof candidateSrc === 'string' && isSafeAvatarUrl(candidateSrc) ? candidateSrc : null;

  return { avatarSrc, name };
}

function getMessageSenderName(message: Pick<ChatMessage, 'senderName'>, profile: AvatarProfile | undefined) {
  return normalizeRegisteredName(message.senderName) ?? profile?.name ?? null;
}

function getMessageSenderLabel(message: Pick<ChatMessage, 'sender' | 'senderName'>, profile: AvatarProfile | undefined) {
  return getMessageSenderName(message, profile) ?? getSenderLabel(message);
}

function getReactionDetailsDomId(messageSignature: string, reaction: string) {
  const signaturePart = messageSignature.replace(/[^A-Za-z0-9_-]/g, '-');
  const reactionPart = Array.from(reaction)
    .map((character) => character.codePointAt(0)?.toString(16) ?? '0')
    .join('-') || 'reaction';

  return `reaction-details-${signaturePart}-${reactionPart}`;
}

function UserAvatar({
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

function MessageIdentity({
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

const DIALOG_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getDialogFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

// Shared modal behavior for the overlay dialogs: move focus inside on open, keep
// Tab cycling within the dialog, close on Escape, and restore focus to the
// previously focused element on dismissal. Mirrors the members-drawer pattern so
// the dialogs honor the aria-modal they already declare.
function useModalDialog<T extends HTMLElement = HTMLElement>(onClose: () => void) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    const initialFocusables = container ? getDialogFocusable(container) : [];

    (initialFocusables[0] ?? container)?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !container) {
        return;
      }

      const items = getDialogFocusable(container);

      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return containerRef;
}

function AccountInfoDialog({
  canMention,
  canOpenDirect,
  directUnavailableLabel,
  onClose,
  onMention,
  onOpenAvatar,
  onOpenDirect,
  profile,
  target,
  t,
}: {
  canMention: boolean;
  canOpenDirect: boolean;
  directUnavailableLabel: string;
  onClose: () => void;
  onMention: (target: AccountInfoTarget) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  onOpenDirect: (address: string, name: string | null) => void;
  profile: AvatarProfile | undefined;
  target: AccountInfoTarget;
  t: TranslateFunction;
}) {
  const [copyStatus, setCopyStatus] = useState<'copied' | 'error' | 'idle'>('idle');
  const { avatarSrc, name } = getAvatarView(profile, target.senderName);
  const label = getMessageSenderLabel(target, profile);

  const cardRef = useModalDialog<HTMLElement>(onClose);

  useEffect(() => {
    setCopyStatus('idle');
  }, [target.sender]);

  async function copyAddress() {
    if (await copyTextToClipboard(target.sender)) {
      setCopyStatus('copied');
      return;
    }

    setCopyStatus('error');
  }

  return (
    <div
      aria-label={t('aria.accountInfo')}
      aria-modal="true"
      className="account-dialog"
      onClick={onClose}
      role="dialog"
    >
      <section className="account-dialog__card" onClick={(event) => event.stopPropagation()} ref={cardRef} tabIndex={-1}>
        <header className="account-dialog__header">
          <UserAvatar
            className="account-dialog__avatar"
            name={name}
            src={avatarSrc}
          />
          <div className="account-dialog__heading">
            <span>{t('title.accountInfo')}</span>
            <h2>{label}</h2>
          </div>
          <button
            aria-label={t('button.close')}
            className="account-dialog__close"
            onClick={onClose}
            title={t('button.close')}
            type="button"
          >
            X
          </button>
        </header>

        <dl className="account-dialog__details">
          <div>
            <dt>{t('label.account.registeredName')}</dt>
            <dd>{name ?? t('label.account.noRegisteredName')}</dd>
          </div>
          <div>
            <dt>{t('label.account.address')}</dt>
            <dd className="account-dialog__address">{target.sender}</dd>
          </div>
        </dl>

        <div className="account-dialog__actions">
          <button className="button button--secondary" onClick={() => void copyAddress()} type="button">
            {copyStatus === 'copied' ? t('button.copied') : t('button.copyAddress')}
          </button>
          <button
            className="button"
            disabled={!canOpenDirect}
            onClick={() => onOpenDirect(target.sender, name)}
            title={canOpenDirect ? t('action.directTooltip') : directUnavailableLabel}
            type="button"
          >
            {t('button.openDirectChat')}
          </button>
          {canMention ? (
            <button
              className="button button--secondary"
              onClick={() => onMention(target)}
              title={t('action.mention', { account: label })}
              type="button"
            >
              {t('button.mention')}
            </button>
          ) : null}
          {avatarSrc ? (
            <button
              className="button button--secondary"
              onClick={() => onOpenAvatar({ name, src: avatarSrc })}
              type="button"
            >
              {t('button.viewAvatar')}
            </button>
          ) : null}
        </div>
        {copyStatus === 'error' ? <p className="error">{t('status.copyAddress.failed')}</p> : null}
      </section>
    </div>
  );
}

function shortenSignature(signature: string) {
  return signature.length > 24 ? `${signature.slice(0, 12)}...${signature.slice(-8)}` : signature;
}

function describeApprovalType(transaction: PendingApprovalTransaction, t: TranslateFunction) {
  // service id 1 === AUTO_UPDATE manifest (a Core auto-update).
  if (transaction.type === 'ARBITRARY' && transaction.service === 1) {
    return t('label.approval.type.autoUpdate');
  }

  return transaction.type ?? t('label.approval.type.unknown');
}

// Human-readable, approximate ETA for a target height relative to the tip.
function formatBlockEta(targetHeight: number | null, currentHeight: number | null, t: TranslateFunction) {
  if (targetHeight === null || currentHeight === null) {
    return null;
  }

  const blocksRemaining = targetHeight - currentHeight;

  if (blocksRemaining <= 0) {
    return null;
  }

  const remainingMs = blocksRemaining * BLOCK_TIME_MS;
  const minutes = Math.round(remainingMs / 60000);

  if (minutes < 60) {
    return t('label.approval.eta.minutes', { count: minutes });
  }

  if (remainingMs < 36 * 3600 * 1000) {
    return t('label.approval.eta.hours', { count: Math.round(remainingMs / (3600 * 1000)) });
  }

  return t('label.approval.eta.days', { count: Math.round(remainingMs / (24 * 3600 * 1000)) });
}

function GroupApprovalDialog({
  actionSignature,
  avatarProfiles,
  canVote,
  currentHeight,
  group,
  knownNames,
  onApprove,
  onClose,
  onOppose,
  pending,
  progressBySignature,
  progressReady,
  t,
  voteUnavailableLabel,
  votedSignatures,
}: {
  actionSignature: string | null;
  avatarProfiles: AvatarProfilesByAddress;
  canVote: boolean;
  currentHeight: number | null;
  group: GroupData | null;
  knownNames: ReadonlyMap<string, string>;
  onApprove: (signature: string) => void;
  onClose: () => void;
  onOppose: (signature: string) => void;
  pending: AsyncState<PendingApprovalTransaction[]>;
  progressBySignature: ReadonlyMap<string, ApprovalProgress>;
  progressReady: boolean;
  t: TranslateFunction;
  voteUnavailableLabel: string;
  votedSignatures: Record<string, { approval: boolean }>;
}) {
  const cardRef = useModalDialog<HTMLElement>(onClose);

  const [copiedSignature, setCopiedSignature] = useState<string | null>(null);

  async function copySignature(signature: string) {
    if (await copyTextToClipboard(signature)) {
      setCopiedSignature(signature);
    }
  }

  const transactions = pending.value;

  return (
    <div
      aria-label={t('aria.groupApproval')}
      aria-modal="true"
      className="account-dialog"
      onClick={onClose}
      role="dialog"
    >
      <section
        className="account-dialog__card account-dialog__card--approval"
        onClick={(event) => event.stopPropagation()}
        ref={cardRef}
        tabIndex={-1}
      >
        <header className="account-dialog__header">
          <div className="account-dialog__heading">
            <span>{t('label.groupApproval.section')}</span>
            <h2>{t('title.groupApproval')}</h2>
          </div>
          <button
            aria-label={t('button.close')}
            className="account-dialog__close"
            onClick={onClose}
            title={t('button.close')}
            type="button"
          >
            X
          </button>
        </header>

        <p className="muted">{t('label.groupApproval.intro')}</p>
        <p className="muted">{t('label.approval.pendingNote')}</p>

        {pending.phase === 'error' ? <p className="error">{pending.error}</p> : null}

        {pending.phase === 'loading' && transactions.length === 0 ? (
          <p className="muted">{t('label.loading')}</p>
        ) : transactions.length === 0 ? (
          <p className="muted">{t('status.approval.empty')}</p>
        ) : (
          <ul className="approval-list">
            {transactions.map((transaction) => {
              const busy = actionSignature === transaction.signature;
              const creatorAddress = transaction.creatorAddress ?? '';
              const creatorProfile = creatorAddress ? avatarProfiles.get(creatorAddress) : undefined;
              const { avatarSrc, name } = getAvatarView(creatorProfile, knownNames.get(creatorAddress) ?? null);
              const creatorLabel = name ?? (creatorAddress ? getShortAddress(creatorAddress) : '-');

              const progress = progressBySignature.get(transaction.signature);
              const approvalsValue =
                progressReady && progress
                  ? t('label.approval.approvalsValue', {
                      count: progress.approvalsSoFar,
                      needed: progress.approvalsNeeded,
                    })
                  : t('label.approval.unavailable');
              const progressRatio =
                progress && progress.approvalsNeeded > 0
                  ? Math.min(1, progress.approvalsSoFar / progress.approvalsNeeded)
                  : 0;

              const optimisticVote = votedSignatures[transaction.signature];
              const effectiveVote: 'approve' | 'oppose' | null = optimisticVote
                ? optimisticVote.approval
                  ? 'approve'
                  : 'oppose'
                : (progress?.myVote ?? null);

              const approvalWindow = computeApprovalWindow(transaction, group, currentHeight);
              const renderWindow = (height: number | null, state: ApprovalWindowState) => {
                if (height === null) {
                  return t('label.approval.unavailable');
                }

                if (state === 'expired') {
                  return t('label.approval.windowExpired', { height });
                }

                if (state === 'open') {
                  return t('label.approval.windowEligibleNow', { height });
                }

                const eta = formatBlockEta(height, currentHeight, t);

                return eta
                  ? t('label.approval.windowEta', { height, eta })
                  : t('label.approval.windowEligibleNow', { height });
              };

              return (
                <li className="approval-item" key={transaction.signature}>
                  <div className="approval-item__details">
                    <strong>{describeApprovalType(transaction, t)}</strong>
                    <div className="approval-item__creator">
                      <UserAvatar className="approval-item__avatar" name={name} src={avatarSrc} />
                      <span className="approval-item__creator-name" title={creatorAddress || undefined}>
                        {creatorLabel}
                      </span>
                    </div>
                    <dl className="approval-item__meta">
                      <div>
                        <dt>{t('label.approval.approvalsSoFar')}</dt>
                        <dd>
                          <span className="approval-item__progress">
                            {approvalsValue}
                            {progressReady && progress && progress.opposed > 0
                              ? ` (${t('label.approval.opposed')}: ${progress.opposed})`
                              : ''}
                          </span>
                          {progressReady && progress ? (
                            <span className="approval-item__progress-bar" aria-hidden="true">
                              <span style={{ width: `${Math.round(progressRatio * 100)}%` }} />
                            </span>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('label.approval.threshold')}</dt>
                        <dd>
                          {progressReady && progress
                            ? t('label.approval.thresholdValue', {
                                pct: group?.approvalThreshold ?? '-',
                                total: progress.totalAuthorities,
                              })
                            : t('label.approval.unavailable')}
                        </dd>
                      </div>
                      {effectiveVote ? (
                        <div>
                          <dt>{t('label.approval.yourVote')}</dt>
                          <dd className="approval-item__yourvote">
                            {effectiveVote === 'approve'
                              ? t('label.approval.yourVote.approve')
                              : t('label.approval.yourVote.oppose')}
                          </dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>{t('label.approval.minWindow')}</dt>
                        <dd>{renderWindow(approvalWindow.minEndsAtHeight, approvalWindow.minState)}</dd>
                      </div>
                      <div>
                        <dt>{t('label.approval.maxWindow')}</dt>
                        <dd>{renderWindow(approvalWindow.maxEndsAtHeight, approvalWindow.maxState)}</dd>
                      </div>
                      <div>
                        <dt>{t('label.approval.creator')}</dt>
                        <dd>{creatorAddress || '-'}</dd>
                      </div>
                      <div>
                        <dt>{t('label.approval.time')}</dt>
                        <dd>{transaction.timestamp ? formatTimestamp(transaction.timestamp) : '-'}</dd>
                      </div>
                      {typeof transaction.blockHeight === 'number' ? (
                        <div>
                          <dt>{t('label.approval.block')}</dt>
                          <dd>{transaction.blockHeight}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt>{t('label.approval.signature')}</dt>
                        <dd className="approval-item__signature">
                          <span title={transaction.signature}>{shortenSignature(transaction.signature)}</span>
                          <button
                            className="button button--secondary"
                            onClick={() => void copySignature(transaction.signature)}
                            type="button"
                          >
                            {copiedSignature === transaction.signature ? t('button.copied') : t('button.copy')}
                          </button>
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="approval-item__actions">
                    <button
                      className="button"
                      disabled={!canVote || busy}
                      onClick={() => onApprove(transaction.signature)}
                      title={canVote ? t('button.approve') : voteUnavailableLabel}
                      type="button"
                    >
                      {busy
                        ? t('button.approving')
                        : effectiveVote === 'approve'
                          ? t('button.voteSubmitted')
                          : t('button.approve')}
                    </button>
                    <button
                      className="button button--secondary"
                      disabled={!canVote || busy}
                      onClick={() => onOppose(transaction.signature)}
                      title={canVote ? t('button.oppose') : voteUnavailableLabel}
                      type="button"
                    >
                      {busy
                        ? t('button.opposing')
                        : effectiveVote === 'oppose'
                          ? t('button.voteSubmitted')
                          : t('button.oppose')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function AvatarLightbox({
  image,
  onClose,
  t,
}: {
  image: AvatarLightboxImage;
  onClose: () => void;
  t: TranslateFunction;
}) {
  const containerRef = useModalDialog<HTMLDivElement>(onClose);

  return (
    <div
      aria-label={t('aria.avatarLightbox')}
      aria-modal="true"
      className="avatar-lightbox"
      onClick={onClose}
      ref={containerRef}
      role="dialog"
      tabIndex={-1}
    >
      <button
        aria-label={t('button.close')}
        className="avatar-lightbox__close"
        onClick={onClose}
        title={t('button.close')}
        type="button"
      >
        X
      </button>
      <figure className="avatar-lightbox__stage" onClick={(event) => event.stopPropagation()}>
        <img alt={image.name ? t('label.avatarImageForName', { name: image.name }) : t('label.avatarImage')} src={image.src} />
        {image.name ? <figcaption>{image.name}</figcaption> : null}
      </figure>
    </div>
  );
}

function getAvatarRequestKey(address: string, preferredName: string | null | undefined, actionsKey: string) {
  return JSON.stringify([address, normalizeRegisteredName(preferredName) ?? '', actionsKey]);
}

function useAvatarProfiles(
  addresses: string[],
  knownNamesByAddress: ReadonlyMap<string, string>,
  actions: QdnAction[],
  actionsKey: string,
) {
  const [profiles, setProfiles] = useState<AvatarProfilesByAddress>(() => new Map());
  const latestRequestKeysRef = useRef(new Map<string, string>());
  const addressKey = JSON.stringify(addresses);
  const knownNamesKey = JSON.stringify(Array.from(knownNamesByAddress.entries()));

  useEffect(() => {
    let isDisposed = false;
    const requestKeyByAddress = new Map<string, string>();
    const needed: string[] = [];

    for (const address of addresses) {
      const preferredName = knownNamesByAddress.get(address) ?? null;
      const requestKey = getAvatarRequestKey(address, preferredName, actionsKey);

      latestRequestKeysRef.current.set(address, requestKey);
      requestKeyByAddress.set(address, requestKey);

      if (profiles.get(address)?.requestKey !== requestKey) {
        needed.push(address);
      }
    }

    const isCurrent = (address: string) =>
      !isDisposed && latestRequestKeysRef.current.get(address) === requestKeyByAddress.get(address);

    const commit = (profile: AvatarProfile) => {
      if (!isCurrent(profile.address)) {
        return;
      }

      setProfiles((current) => {
        const next = new Map(current);
        next.set(profile.address, { ...profile, requestKey: requestKeyByAddress.get(profile.address) as string });
        return next;
      });
    };

    const commitMany = (batch: AvatarProfile[]) => {
      if (isDisposed) {
        return;
      }

      setProfiles((current) => {
        let next: Map<string, CachedAvatarProfile> | null = null;

        for (const profile of batch) {
          if (!isCurrent(profile.address)) {
            continue;
          }

          next ??= new Map(current);
          next.set(profile.address, { ...profile, requestKey: requestKeyByAddress.get(profile.address) as string });
        }

        return next ?? current;
      });
    };

    const loadIndividually = (targets: string[]) => {
      for (const address of targets) {
        const preferredName = knownNamesByAddress.get(address) ?? null;
        void loadAvatarProfile({ actions, address, preferredName }).then(commit);
      }
    };

    if (needed.length > 0) {
      if (hasAction(actions, 'RESOLVE_IDENTITIES')) {
        // One batched name + avatar-presence resolution for the whole visible set
        // (instead of a GET_ACCOUNT_NAMES per address), then fetch only the
        // avatars that actually exist through the hardened blob path.
        void resolveAvatarIdentities({ actions, addresses: needed, knownNamesByAddress })
          .then((resolved) => {
            // Commit names first in a single update so labels are not gated on images.
            commitMany(needed.map((address) => ({ address, avatarSrc: null, name: resolved.get(address)?.name ?? null })));

            for (const address of needed) {
              const identity = resolved.get(address);
              const name = identity?.name ?? null;

              if (name && identity?.hasAvatar) {
                void fetchAvatarImage(name)
                  .then((avatarSrc) => commit({ address, avatarSrc, name }))
                  .catch(() => {
                    // Keep the name-only profile if the avatar image fails to load.
                  });
              }
            }
          })
          .catch(() => {
            // Batch resolution failed unexpectedly — fall back to per-address loads.
            loadIndividually(needed);
          });
      } else {
        loadIndividually(needed);
      }
    }

    return () => {
      isDisposed = true;
    };
  }, [actionsKey, addressKey, knownNamesKey]);

  return profiles;
}

function AccountSummary({
  account,
  error,
  isHomeBridge,
  onConnect,
  onOpenAvatar,
  profile,
  t,
}: {
  account: QdnSelectedAccount | null;
  error: string;
  isHomeBridge: boolean;
  onConnect: () => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  profile?: AvatarProfile;
  t: TranslateFunction;
}) {
  if (account) {
    const { avatarSrc, name } = getAvatarView(profile, account.name);
    const label = name || getShortAddress(account.address);

    return (
      <div className="account-summary">
        <UserAvatar
          className="account-summary__avatar"
          name={name}
          onOpen={onOpenAvatar}
          openLabel={t('action.openAvatarImage')}
          src={avatarSrc}
        />
        <div className="account-summary__text">
          <div className="account-summary__primary">
            <strong>{label}</strong>
            <span
              className={`account-summary__status account-summary__status--${account.isUnlocked ? 'unlocked' : 'locked'}`}
            >
              {account.isUnlocked ? t('status.account.unlocked') : t('status.account.locked')}
            </span>
          </div>
          <span className="account-summary__address">{account.address}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="account-connect">
      <p className="muted">{getAccountMessage(error, isHomeBridge, t)}</p>
      {isHomeBridge ? (
        <button className="button button--secondary" onClick={onConnect} type="button">
          {t('label.account.summary.useSelected')}
        </button>
      ) : null}
    </div>
  );
}

const GroupList = memo(function GroupList({
  activityByGroupId,
  groups,
  memberCountsByGroupId,
  onSelect,
  selectedGroupId,
  t,
  unreadGroupIds,
  now,
}: {
  activityByGroupId: ReadonlyMap<number, number>;
  groups: GroupData[];
  memberCountsByGroupId?: ReadonlyMap<number, number>;
  onSelect: (group: GroupData) => void;
  selectedGroupId: number | null;
  t: TranslateFunction;
  unreadGroupIds: ReadonlySet<number>;
  now: number;
}) {
  if (groups.length === 0) {
    return <p className="empty">{t('hint.noGroups')}</p>;
  }

  return (
    <ul className="group-list">
      {groups.map((group) => {
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
                  {t('group.meta.memberCount', { count: memberCount.toLocaleString() })}
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

const DirectList = memo(function DirectList({
  activityByAddress,
  canOpen,
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
    return [...directEntries].sort((first, second) => {
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
  }, [directEntries, activityByAddress]);

  if (directs.length === 0) {
    return <p className="empty">{t('hint.noDirectChats')}</p>;
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

function getMessageSnippet(message: ChatMessage, t: TranslateFunction, maxLength = 140) {
  const body = decodeChatMessage(message, t).body || t('message.empty');
  const flattened = body.replace(/\s+/g, ' ').trim();

  return flattened.length > maxLength ? `${flattened.slice(0, maxLength - 1)}…` : flattened;
}

type ImagePreviewState =
  | {
      phase: 'loading';
    }
  | {
      phase: 'ready';
      previews: QdnImagePreview[];
    }
  | {
      message: string;
      phase: 'error';
    };

function MessageImagePreview({ resource, t }: { resource: QdnImageResource; t: TranslateFunction }) {
  const [state, setState] = useState<ImagePreviewState>({ phase: 'loading' });

  useEffect(() => {
    let isDisposed = false;

    setState({ phase: 'loading' });

    void fetchQdnImagePreviews(resource)
      .then((previews) => {
        if (!isDisposed) {
          setState({ phase: 'ready', previews });
        }
      })
      .catch((error) => {
        if (!isDisposed) {
          setState({
            phase: 'error',
            message: error instanceof Error ? error.message : t('status.loadingError.imagePreview'),
          });
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [resource.identifier, resource.name, resource.path, resource.qdnUrl, resource.service, t]);

  if (state.phase === 'loading') {
    return (
      <div className="message__image-preview message__image-preview--loading">
        {t('status.loading.imagePreview')}
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="message__image-preview message__image-preview--error">
        {state.message}
      </div>
    );
  }

  return (
    <>
      {state.previews.map((preview) => (
        <figure className="message__image-preview" key={preview.qdnUrl}>
          <img alt={preview.alt} src={preview.src} />
          <figcaption>{preview.alt}</figcaption>
        </figure>
      ))}
    </>
  );
}

function MessageImagePreviews({ resources, t }: { resources: QdnImageResource[]; t: TranslateFunction }) {
  return (
    <div className="message__image-previews">
      {resources.map((resource, index) => (
        <MessageImagePreview key={`${resource.qdnUrl}-${index}`} resource={resource} t={t} />
      ))}
    </div>
  );
}

function MessageReactionPicker({
  onReact,
  original,
  pendingReactionKey,
  reactions,
  t,
}: {
  onReact: (message: ChatMessage, reaction: string, contentState: boolean) => void;
  original: ChatMessage;
  pendingReactionKey: string;
  reactions: MessageReactionSummary[];
  t: TranslateFunction;
}) {
  const [fullPickerOpen, setFullPickerOpen] = useState(false);

  if (!original.signature) {
    return null;
  }

  const selectReaction = (reaction: string) => {
    const existingReaction = reactions.find((summary) => summary.content === reaction);

    onReact(original, reaction, !existingReaction?.reactedBySelf);
  };

  return (
    <div className="message__reaction-picker" aria-label={t('label.reactions')}>
      <div className="message__reaction-quick-row" role="toolbar" aria-label={t('label.reactions')}>
        {DEFAULT_REACTION_OPTIONS.map((reaction) => {
          const existingReaction = reactions.find((summary) => summary.content === reaction);
          const contentState = !existingReaction?.reactedBySelf;
          const pendingKey = getReactionPendingKey(original.signature ?? '', reaction);

          return (
            <button
              aria-label={contentState ? t('action.addReaction') : t('action.removeReaction')}
              aria-pressed={existingReaction?.reactedBySelf ?? false}
              disabled={pendingReactionKey === pendingKey}
              key={reaction}
              onClick={() => selectReaction(reaction)}
              title={contentState ? t('action.addReaction') : t('action.removeReaction')}
              type="button"
            >
              {reaction}
            </button>
          );
        })}
        <button
          aria-expanded={fullPickerOpen}
          aria-label={t('label.reactions')}
          className="message__reaction-more"
          onClick={() => setFullPickerOpen((current) => !current)}
          title={t('label.reactions')}
          type="button"
        >
          {fullPickerOpen ? '×' : '+'}
        </button>
      </div>
      {fullPickerOpen ? (
        <div className="message__emoji-picker-panel">
          <EmojiPicker
            allowExpandReactions
            autoFocusSearch={false}
            emojiStyle={EmojiStyle.NATIVE}
            height="min(360px, 60dvh)"
            lazyLoadEmojis
            onEmojiClick={(emoji: EmojiClickData) => selectReaction(emoji.emoji)}
            onReactionClick={(emoji: EmojiClickData) => selectReaction(emoji.emoji)}
            previewConfig={{ showPreview: false }}
            reactions={[...DEFAULT_REACTION_OPTIONS]}
            searchPlaceHolder={t('label.search')}
            theme={Theme.AUTO}
            width="100%"
          />
        </div>
      ) : null}
    </div>
  );
}

function MessageReactionDetails({
  avatarProfiles,
  canReact,
  now,
  onClose,
  onReact,
  original,
  pendingReactionKey,
  reaction,
  t,
}: {
  avatarProfiles: AvatarProfilesByAddress;
  canReact: boolean;
  now: number;
  onClose: () => void;
  onReact: (message: ChatMessage, reaction: string, contentState: boolean) => void;
  original: ChatMessage;
  pendingReactionKey: string;
  reaction: MessageReactionSummary;
  t: TranslateFunction;
}) {
  const contentState = !reaction.reactedBySelf;
  const pendingKey = getReactionPendingKey(original.signature ?? '', reaction.content);
  const actionLabel = contentState ? t('action.addReaction') : t('action.removeReaction');

  return (
    <section
      aria-label={t('label.reactionDetails')}
      className="message__reaction-details"
      id={getReactionDetailsDomId(original.signature ?? '', reaction.content)}
    >
      <header className="message__reaction-details-header">
        <span>
          {reaction.content} {t('label.reactions')}
        </span>
        <button
          aria-label={t('button.close')}
          className="message__reaction-details-close"
          onClick={onClose}
          title={t('button.close')}
          type="button"
        >
          X
        </button>
      </header>
      <ol className="message__reaction-reactors">
        {reaction.reactors.map((reactor) => {
          const profile = avatarProfiles.get(reactor.sender);
          const label = getMessageSenderLabel({ sender: reactor.sender, senderName: null }, profile);

          return (
            <li className="message__reaction-reactor" key={`${reactor.sender}-${reactor.timestamp}`}>
              <span className="message__reaction-reactor-name" title={reactor.sender}>
                {label}
              </span>
              <time
                className="message__reaction-reactor-time"
                dateTime={new Date(reactor.timestamp).toISOString()}
                title={formatTimestamp(reactor.timestamp)}
              >
                {formatTimeAgo(reactor.timestamp, now)}
              </time>
            </li>
          );
        })}
      </ol>
      <button
        className="button button--secondary message__reaction-details-action"
        disabled={!canReact || pendingReactionKey === pendingKey}
        onClick={() => {
          onClose();
          onReact(original, reaction.content, contentState);
        }}
        type="button"
      >
        {actionLabel}
      </button>
    </section>
  );
}

// Floating, viewport-anchored container for the reaction picker and the reaction
// details. It is rendered outside the message bubble so opening it never expands
// the message, and it grows upward (bottom pinned just above the trigger) rather
// than pushing content down. A transparent backdrop closes it on an outside tap.
function ReactionPopover({
  anchorRect,
  children,
  label,
  onClose,
  width,
}: {
  anchorRect: DOMRect;
  children: ReactNode;
  label: string;
  onClose: () => void;
  width: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Focus the popover on open and restore focus to the trigger on close. Mount
  // only, so a parent re-render (the 30s clock, a new message) cannot re-steal
  // focus out of the emoji search field while the user is typing in it.
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    cardRef.current?.focus();

    return () => {
      if (trigger && document.contains(trigger)) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    function handleResize() {
      // A mobile soft keyboard fires resize; keep the popover open while its
      // search field is focused, else the stale anchor warrants a dismiss.
      if (cardRef.current?.contains(document.activeElement)) {
        return;
      }

      onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [onClose]);

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const clampedWidth = Math.min(width, viewportWidth - 16);
  const left = Math.max(8, Math.min(anchorRect.left, viewportWidth - clampedWidth - 8));
  const spaceAbove = anchorRect.top - 16;
  const spaceBelow = viewportHeight - anchorRect.bottom - 16;
  // Open upward (the requested behaviour) whenever there is room; only flip down
  // for a near-top trigger with little room above and more below, so the panel is
  // never clipped off the top of the viewport. maxHeight caps it to the space on
  // the chosen side and the content scrolls if it does not fit.
  const openUp = spaceAbove >= 240 || spaceAbove >= spaceBelow;
  const position = openUp
    ? { bottom: viewportHeight - anchorRect.top + 8, maxHeight: Math.max(40, spaceAbove) }
    : { top: anchorRect.bottom + 8, maxHeight: Math.max(40, spaceBelow) };

  return (
    <>
      <button
        aria-hidden="true"
        className="reaction-popover__backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label={label}
        className="reaction-popover"
        ref={cardRef}
        role="dialog"
        style={{ left, width: clampedWidth, ...position }}
        tabIndex={-1}
      >
        {children}
      </div>
    </>
  );
}

function MessageReactionChips({
  onToggleReactionDetails,
  openReactionDetailsKey,
  original,
  pendingReactionKey,
  reactions,
  t,
}: {
  onToggleReactionDetails: (detailsKey: string, anchor: HTMLElement) => void;
  openReactionDetailsKey: string;
  original: ChatMessage;
  pendingReactionKey: string;
  reactions: MessageReactionSummary[];
  t: TranslateFunction;
}) {
  if (!original.signature || reactions.length === 0) {
    return null;
  }

  return (
    <div className="message__reaction-block">
      <div className="message__reactions" aria-label={t('label.reactions')}>
        {reactions.map((reaction) => {
          const pendingKey = getReactionPendingKey(original.signature ?? '', reaction.content);
          const isOpen = openReactionDetailsKey === pendingKey;
          const label = t('action.viewReactionDetails', { reaction: reaction.content });

          return (
            <button
              aria-expanded={isOpen}
              aria-label={label}
              aria-haspopup="dialog"
              className={`message__reaction-chip${reaction.reactedBySelf ? ' message__reaction-chip--active' : ''}`}
              disabled={pendingReactionKey === pendingKey}
              key={reaction.content}
              onClick={(event) => onToggleReactionDetails(pendingKey, event.currentTarget)}
              title={label}
              type="button"
            >
              <span>{reaction.content}</span>
              <span>{reaction.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MessageList = memo(function MessageList({
  avatarProfiles,
  canCompose,
  canOpenDocumentViewer,
  canOpenMediaPlayer,
  canSaveQdnResource,
  initialScrollTop,
  messages,
  olderMessagesError,
  olderMessagesLoading,
  olderMessagesReachedStart,
  onEdit,
  onLoadOlder,
  onOpenAccount,
  onOpenAvatar,
  onReact,
  onReply,
  onScrollPositionChange,
  pendingReactionKey,
  scrollChatKey,
  selfAddress,
  sentMessageNonce,
  systemMessages,
  t,
  unreadDividerCeiling,
  unreadDividerTimestamp,
  now,
}: {
  avatarProfiles: AvatarProfilesByAddress;
  canCompose: boolean;
  canOpenDocumentViewer: boolean;
  canOpenMediaPlayer: boolean;
  canSaveQdnResource: boolean;
  initialScrollTop: number | undefined;
  messages: ChatMessage[];
  olderMessagesError: string;
  olderMessagesLoading: boolean;
  olderMessagesReachedStart: boolean;
  onEdit: (thread: MessageThread) => void;
  onLoadOlder: () => void;
  onOpenAccount: (target: AccountInfoTarget) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  onReact: (message: ChatMessage, reaction: string, contentState: boolean) => void;
  onReply: (message: ChatMessage) => void;
  onScrollPositionChange: (chatKey: string, scrollTop: number) => void;
  pendingReactionKey: string;
  scrollChatKey: string;
  selfAddress: string | null;
  sentMessageNonce: number;
  systemMessages: TrackedTransaction[];
  t: TranslateFunction;
  unreadDividerCeiling: number | null;
  unreadDividerTimestamp: number | null;
  now: number;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottomRef = useRef(true);
  // Set when the user sends, so the message that lands a moment later scrolls into
  // view even if their scroll position was not at the bottom.
  const forceBottomRef = useRef(false);
  // Restores the reading position when returning to a chat: false until the saved
  // (or default-bottom) scroll position has been applied for the current chat.
  const didRestoreScrollRef = useRef(false);
  // Captured before older history is prepended so we can restore the viewport to
  // the same message instead of jumping when scrollHeight grows.
  const olderScrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const itemsRef = useRef(new Map<string, HTMLLIElement>());
  // The "new messages" divider element, so the jump-to-unread control can scroll
  // it into view and so its viewport position drives whether that control shows.
  const dividerRef = useRef<HTMLLIElement>(null);
  const highlightTimeoutRef = useRef(0);
  const expandedTimeTimeoutRef = useRef(0);
  const [openHistories, setOpenHistories] = useState<ReadonlySet<string>>(new Set());
  const [openImagePreviews, setOpenImagePreviews] = useState<ReadonlySet<string>>(new Set());
  const [openReactionPickerKey, setOpenReactionPickerKey] = useState('');
  const [openReactionDetailsKey, setOpenReactionDetailsKey] = useState('');
  // Viewport rect of the trigger (React button / reaction chip) that opened the
  // floating reaction popover, so it can be anchored above that element.
  const [reactionAnchorRect, setReactionAnchorRect] = useState<DOMRect | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  // Shown while the unread divider is scrolled above the viewport, offering a
  // jump up to where reading left off (the chat opens pinned to the bottom).
  const [unreadJumpVisible, setUnreadJumpVisible] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState('');
  const [expandedTimeKey, setExpandedTimeKey] = useState('');
  const threads = useMemo(() => buildMessageThreads(messages), [messages]);
  // Index of the first thread newer than the user's read watermark; the "new
  // messages" divider is drawn just above it. Only shown when at least one read
  // message sits above the boundary, so it reads as a separator (not a top edge).
  const unreadDividerIndex = useMemo(() => {
    if (unreadDividerTimestamp === null || unreadDividerCeiling === null) {
      return -1;
    }

    // The divider marks the backlog that was unread when the chat was opened:
    // newer than the read watermark, but no newer than the open moment. Messages
    // sent or received while reading (including the user's own) sit past the
    // ceiling, so they never spawn or move the divider.
    const index = threads.findIndex(
      (thread) =>
        thread.original.timestamp > unreadDividerTimestamp && thread.original.timestamp <= unreadDividerCeiling,
    );

    if (index > 0) {
      return index;
    }

    // Every loaded message is newer than the watermark: anchor the marker at the
    // top while older (read) history can still page in, so it shows from open
    // instead of popping in mid-feed on scroll-up. If the start is already loaded
    // there is no read context to separate, so suppress it.
    return index === 0 && !olderMessagesReachedStart ? 0 : -1;
  }, [threads, unreadDividerTimestamp, unreadDividerCeiling, olderMessagesReachedStart]);
  // Count of messages in the unread-on-open backlog (the contiguous run from the
  // divider up to the open moment), shown on the jump-to-unread control.
  const unreadCount = useMemo(() => {
    if (unreadDividerIndex < 0 || unreadDividerCeiling === null) {
      return 0;
    }

    let count = 0;

    for (let index = unreadDividerIndex; index < threads.length; index += 1) {
      if (threads[index].original.timestamp <= unreadDividerCeiling) {
        count += 1;
      }
    }

    return count;
  }, [threads, unreadDividerIndex, unreadDividerCeiling]);
  const reactionsBySignature = useMemo(
    () => buildMessageReactionIndex(messages, selfAddress),
    [messages, selfAddress],
  );
  const threadsBySignature = useMemo(() => {
    const bySignature = new Map<string, MessageThread>();

    for (const thread of threads) {
      if (thread.original.signature) {
        bySignature.set(thread.original.signature, thread);
      }

      for (const revision of thread.revisions) {
        if (revision.signature) {
          bySignature.set(revision.signature, thread);
        }
      }
    }

    return bySignature;
  }, [threads]);
  const threadByKey = useMemo(() => {
    const byKey = new Map<string, MessageThread>();

    threads.forEach((thread, index) => byKey.set(getMessageKey(thread.original, index), thread));

    return byKey;
  }, [threads]);
  // Resolve which message/reaction the open popover belongs to. Looked up live
  // (not snapshotted) so reaction counts stay current while it is open.
  const reactionPopoverContent = useMemo(() => {
    const pickerThread = openReactionPickerKey ? threadByKey.get(openReactionPickerKey) : undefined;
    const pickerSignature = pickerThread?.original.signature ?? '';
    const pickerReactions = pickerSignature ? reactionsBySignature.get(pickerSignature) ?? [] : [];

    let detailsThread: MessageThread | undefined;
    let detailsReaction: MessageReactionSummary | undefined;

    if (openReactionDetailsKey) {
      for (const thread of threadByKey.values()) {
        const signature = thread.original.signature;

        if (!signature) {
          continue;
        }

        const match = (reactionsBySignature.get(signature) ?? []).find(
          (reaction) => getReactionPendingKey(signature, reaction.content) === openReactionDetailsKey,
        );

        if (match) {
          detailsThread = thread;
          detailsReaction = match;
          break;
        }
      }
    }

    return { detailsReaction, detailsThread, pickerReactions, pickerThread };
  }, [openReactionDetailsKey, openReactionPickerKey, reactionsBySignature, threadByKey]);
  // If a live update removes the message/reaction the open popover points at, the
  // lookup fails; close so the keys + anchor cannot linger or spontaneously reopen.
  useEffect(() => {
    if (
      (openReactionPickerKey && !reactionPopoverContent.pickerThread) ||
      (openReactionDetailsKey && !reactionPopoverContent.detailsReaction)
    ) {
      closeReactionPopover();
    }
  }, [openReactionDetailsKey, openReactionPickerKey, reactionPopoverContent]);
  const lastThread = threads[threads.length - 1] ?? null;
  const lastMessageKey = lastThread !== null ? getMessageKey(lastThread.latest, threads.length - 1) : '';
  const firstMessageKey = messages.length > 0 ? getMessageKey(messages[0], 0) : '';

  function captureScrollAnchor() {
    const list = listRef.current;

    if (list) {
      olderScrollAnchorRef.current = { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop };
    }
  }

  function updateBottomState(list: HTMLOListElement) {
    const isAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 48;

    stickToBottomRef.current = isAtBottom;
    setShowScrollToBottom(!isAtBottom);

    const dividerEl = dividerRef.current;

    if (dividerEl) {
      // Offer the jump only while the divider is scrolled above the visible area;
      // once the user reaches it (or scrolls past it) the prompt is dismissed.
      const listRect = list.getBoundingClientRect();
      const dividerRect = dividerEl.getBoundingClientRect();

      setUnreadJumpVisible(dividerRect.bottom < listRect.top + 8);
    } else {
      setUnreadJumpVisible(false);
    }
  }

  // Bring the unread divider just below the top edge so the last read message
  // above it gives context for where new messages begin.
  function scrollToUnread() {
    const dividerEl = dividerRef.current;
    const list = listRef.current;

    if (!dividerEl || !list) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    const dividerRect = dividerEl.getBoundingClientRect();

    list.scrollTop += dividerRect.top - listRect.top - 12;
    updateBottomState(list);
  }

  // Pin the feed to the bottom now, then again after the next frame so a layout
  // settling pass (the composer reflowing on a narrow screen, a late image or
  // font measurement) cannot leave the newest message just out of view.
  function scrollToBottom() {
    const list = listRef.current;

    if (!list) {
      return;
    }

    list.scrollTop = list.scrollHeight;
    updateBottomState(list);

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const nextList = listRef.current;

        if (nextList) {
          nextList.scrollTop = nextList.scrollHeight;
          updateBottomState(nextList);
        }
      });
    }
  }

  // Manual retry after an error — bypasses the auto-trigger's error guard.
  function handleLoadOlder() {
    captureScrollAnchor();
    onLoadOlder();
  }

  // Auto-trigger when the user scrolls near the top. Skips while a fetch is in
  // flight, once history is exhausted, or after an error (so it does not loop).
  function maybeLoadOlder(list: HTMLOListElement) {
    if (list.scrollTop > 80 || olderMessagesLoading || olderMessagesReachedStart || olderMessagesError) {
      return;
    }

    captureScrollAnchor();
    onLoadOlder();
  }

  // System messages (transaction status) trail the feed, so a new or updated one
  // should also scroll the feed when the user is stuck to the bottom.
  const systemMessagesKey = systemMessages.map((entry) => `${entry.id}:${entry.phase}`).join('|');

  // Reset restoration when switching chats so the next chat's saved position (or
  // bottom) is applied instead of the previous chat's, and drop any open popover.
  useEffect(() => {
    didRestoreScrollRef.current = false;
    closeReactionPopover();
  }, [scrollChatKey]);

  // Restore the saved reading position (or default to the bottom) once the chat's
  // messages have rendered. Runs before the stick-to-bottom effect below so a
  // restored mid-feed position is not immediately yanked to the bottom.
  useLayoutEffect(() => {
    const list = listRef.current;

    if (!list || didRestoreScrollRef.current || messages.length === 0) {
      return;
    }

    didRestoreScrollRef.current = true;

    if (typeof initialScrollTop === 'number' && Number.isFinite(initialScrollTop)) {
      const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
      const target = Math.min(initialScrollTop, maxScrollTop);

      list.scrollTop = target;
      updateBottomState(list);
    } else {
      list.scrollTop = list.scrollHeight;
      updateBottomState(list);
    }
  }, [initialScrollTop, messages.length, scrollChatKey]);

  // Keep the newest content in view when the user is reading at the bottom (or a
  // send just landed); if they have scrolled up, their position is left untouched.
  // A layout effect so it measures the committed DOM (incl. the new message's
  // height) before paint, avoiding a flash of unscrolled content.
  useLayoutEffect(() => {
    if (!didRestoreScrollRef.current) {
      return;
    }

    if (forceBottomRef.current || stickToBottomRef.current) {
      forceBottomRef.current = false;
      scrollToBottom();
    }
  }, [lastMessageKey, systemMessagesKey]);

  // Sending a message always returns the user to the bottom so their own message
  // is in view, regardless of where they had scrolled. forceBottomRef survives
  // until the sent message lands (it arrives a tick after the nonce bumps), so the
  // landing scroll fires even if an intervening scroll cleared stickToBottom.
  // Guarding on the nonce value (not a mount ref) keeps this firing on every send.
  useLayoutEffect(() => {
    if (sentMessageNonce === 0) {
      return;
    }

    stickToBottomRef.current = true;
    forceBottomRef.current = true;

    if (didRestoreScrollRef.current) {
      scrollToBottom();
    }
  }, [sentMessageNonce]);

  // After older history is prepended the list grows upward; restore the viewport
  // so the message the user was reading stays put instead of jumping.
  useLayoutEffect(() => {
    const list = listRef.current;
    const anchor = olderScrollAnchorRef.current;

    if (!list || !anchor) {
      return;
    }

    olderScrollAnchorRef.current = null;
    list.scrollTop = list.scrollHeight - anchor.scrollHeight + anchor.scrollTop;
    updateBottomState(list);
  }, [firstMessageKey]);

  useEffect(() => {
    return () => {
      window.clearTimeout(highlightTimeoutRef.current);
      window.clearTimeout(expandedTimeTimeoutRef.current);
    };
  }, []);

  function toggleTimeDisplay(threadKey: string) {
    window.clearTimeout(expandedTimeTimeoutRef.current);

    if (expandedTimeKey === threadKey) {
      setExpandedTimeKey('');
      return;
    }

    setExpandedTimeKey(threadKey);
    expandedTimeTimeoutRef.current = window.setTimeout(() => setExpandedTimeKey(''), 5000);
  }

  function scrollToThread(threadKey: string) {
    const item = itemsRef.current.get(threadKey);

    if (!item) {
      return;
    }

    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedKey(threadKey);
    window.clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = window.setTimeout(() => setHighlightedKey(''), 1800);
  }

  function toggleHistory(threadKey: string) {
    setOpenHistories((current) => {
      const next = new Set(current);

      if (next.has(threadKey)) {
        next.delete(threadKey);
      } else {
        next.add(threadKey);
      }

      return next;
    });
  }

  function toggleImagePreview(threadKey: string) {
    setOpenImagePreviews((current) => {
      const next = new Set(current);

      if (next.has(threadKey)) {
        next.delete(threadKey);
      } else {
        next.add(threadKey);
      }

      return next;
    });
  }

  function closeReactionPopover() {
    setOpenReactionPickerKey('');
    setOpenReactionDetailsKey('');
    setReactionAnchorRect(null);
  }

  function toggleReactionPicker(threadKey: string, anchor: HTMLElement) {
    const willOpen = openReactionPickerKey !== threadKey;

    setOpenReactionDetailsKey('');
    setOpenReactionPickerKey(willOpen ? threadKey : '');
    setReactionAnchorRect(willOpen ? anchor.getBoundingClientRect() : null);
  }

  function toggleReactionDetails(detailsKey: string, anchor: HTMLElement) {
    const willOpen = openReactionDetailsKey !== detailsKey;

    setOpenReactionPickerKey('');
    setOpenReactionDetailsKey(willOpen ? detailsKey : '');
    setReactionAnchorRect(willOpen ? anchor.getBoundingClientRect() : null);
  }

  function playMedia(resource: QdnMediaResource) {
    void openQdnMediaPlayer(resource).catch((error) => {
      console.warn('Unable to open QDN media player.', error);
    });
  }

  function openDocument(resource: QdnDocumentResource) {
    void openQdnDocumentViewer(resource).catch((error) => {
      console.warn('Unable to open QDN document viewer.', error);
    });
  }

  function saveResource(resource: QdnDocumentResource) {
    void saveQdnResource(resource).catch((error) => {
      console.warn('Unable to save QDN resource.', error);
    });
  }

  if (messages.length === 0 && systemMessages.length === 0) {
    return <p className="empty">{t('hint.noMessages')}</p>;
  }

  const { detailsReaction, detailsThread, pickerReactions, pickerThread } = reactionPopoverContent;

  return (
    <>
      <div className="message-feed">
        <ol
          className="message-list"
          onScroll={(event) => {
            const list = event.currentTarget;

            updateBottomState(list);

            // The feed moving (e.g. a new message auto-scrolling) would leave a
            // viewport-anchored reaction popover misaligned, so dismiss it.
            if (openReactionPickerKey || openReactionDetailsKey) {
              closeReactionPopover();
            }

            // Remember where the user is reading so it can be restored on return.
            // Skip until the initial position is applied so transient scrolls during
            // mount/restore do not overwrite the saved position.
            if (didRestoreScrollRef.current) {
              onScrollPositionChange(scrollChatKey, list.scrollTop);
            }

            maybeLoadOlder(list);
          }}
          ref={listRef}
        >
          {olderMessagesLoading || olderMessagesError ? (
            <li className="message-list__history-control">
              {olderMessagesLoading ? (
                <span className="muted">{t('status.loadingOlderMessages')}</span>
              ) : (
                <>
                  <span className="error">{olderMessagesError}</span>
                  <button className="button button--secondary" onClick={handleLoadOlder} type="button">
                    {t('button.retry')}
                  </button>
                </>
              )}
            </li>
          ) : null}
          {olderMessagesReachedStart && !olderMessagesLoading && !olderMessagesError && messages.length > 0 ? (
            <li className="message-list__history-note">
              <span className="muted">{t('hint.olderMessagesExpired')}</span>
            </li>
          ) : null}
          {threads.map((thread, index) => {
            const { latest, original, revisions } = thread;
            const decoded = decodeChatMessage(latest, t);
            const threadKey = getMessageKey(original, index);
            const isOwn = selfAddress !== null && original.sender === selfAddress;
            const isEdited = revisions.length > 0;
            const isHistoryOpen = isEdited && openHistories.has(threadKey);
            const previousVersions = isHistoryOpen ? [original, ...revisions.slice(0, -1)] : [];
            const repliedThread = decoded.repliedTo ? threadsBySignature.get(decoded.repliedTo) : undefined;
            const isHighlighted = highlightedKey === threadKey;
            const isContinuation = isThreadContinuation(threads[index - 1], thread);
            const canEdit = isOwn && decoded.kind === 'text';
            const isTimeExpanded = expandedTimeKey === threadKey;
            const imageResources = decoded.kind === 'text' ? getImageQdnResources(decoded.body) : [];
            const mediaResources = decoded.kind === 'text' ? getMediaQdnResources(decoded.body) : [];
            const documentResources = decoded.kind === 'text' ? getDocumentQdnResources(decoded.body) : [];
            const hasImagePreviews = imageResources.length > 0;
            const hasMediaActions = canOpenMediaPlayer && mediaResources.length > 0;
            const hasDocumentResources = documentResources.length > 0;
            const hasDocumentViewerActions = canOpenDocumentViewer && hasDocumentResources;
            const hasDocumentSaveActions = canSaveQdnResource && hasDocumentResources;
            const areImagePreviewsOpen = openImagePreviews.has(threadKey);
            const canReplyOrEdit = canCompose && !!original.signature;
            const canReact = canReplyOrEdit;
            const isReactionPickerOpen = openReactionPickerKey === threadKey;
            const reactions = original.signature ? reactionsBySignature.get(original.signature) ?? [] : [];
            const senderProfile = avatarProfiles.get(original.sender);
            const actionButtons =
              canReplyOrEdit ||
              canReact ||
              hasImagePreviews ||
              hasMediaActions ||
              hasDocumentViewerActions ||
              hasDocumentSaveActions ? (
                <div className="message__actions">
                  {hasImagePreviews ? (
                    <button aria-expanded={areImagePreviewsOpen} onClick={() => toggleImagePreview(threadKey)} type="button">
                      {areImagePreviewsOpen ? t('button.hideImagePreview') : t('button.viewImagePreview')}
                    </button>
                  ) : null}
                  {hasMediaActions
                    ? mediaResources.map((resource, resourceIndex) => (
                        <button
                          aria-label={t('action.openMediaPlayer')}
                          key={`${resource.qdnUrl}-${resourceIndex}`}
                          onClick={() => playMedia(resource)}
                          title={resource.qdnUrl}
                          type="button"
                        >
                          {t('button.playMedia')}
                        </button>
                      ))
                    : null}
                  {hasDocumentViewerActions
                    ? documentResources.map((resource, resourceIndex) => (
                        <button
                          key={`view-${resource.qdnUrl}-${resourceIndex}`}
                          onClick={() => openDocument(resource)}
                          title={resource.qdnUrl}
                          type="button"
                        >
                          {t('button.open')}
                        </button>
                      ))
                    : null}
                  {hasDocumentSaveActions
                    ? documentResources.map((resource, resourceIndex) => (
                        <button
                          key={`save-${resource.qdnUrl}-${resourceIndex}`}
                          onClick={() => saveResource(resource)}
                          title={resource.qdnUrl}
                          type="button"
                        >
                          {t('button.save')}
                        </button>
                      ))
                    : null}
                  {canReplyOrEdit ? (
                    <button onClick={() => onReply(original)} type="button">
                      {t('button.reply')}
                    </button>
                  ) : null}
                  {canReact ? (
                    <button
                      aria-expanded={isReactionPickerOpen}
                      aria-haspopup="dialog"
                      onClick={(event) => toggleReactionPicker(threadKey, event.currentTarget)}
                      type="button"
                    >
                      {t('button.react')}
                    </button>
                  ) : null}
                  {canReplyOrEdit && canEdit ? (
                    <button onClick={() => onEdit(thread)} type="button">
                      {t('button.edit')}
                    </button>
                  ) : null}
                </div>
              ) : null;

            return (
              <Fragment key={threadKey}>
                {unreadDividerIndex === index ? (
                  <li className="message-list__unread-divider" ref={dividerRef} role="separator">
                    <span>{t('label.newMessages')}</span>
                  </li>
                ) : null}
              <li
                className={`message message--${decoded.kind}${isOwn ? ' message--own' : ''}${isHighlighted ? ' message--highlight' : ''}${isContinuation ? ' message--continuation' : ''}`}
                ref={(element) => {
                  if (element) {
                    itemsRef.current.set(threadKey, element);
                  } else {
                    itemsRef.current.delete(threadKey);
                  }
                }}
              >
                {isContinuation ? null : (
                  <div className="message__meta">
                    <MessageIdentity
                      message={original}
                      onOpenAccount={onOpenAccount}
                      onOpenAvatar={onOpenAvatar}
                      openAvatarLabel={t('action.openAvatarImage')}
                      profile={senderProfile}
                      t={t}
                    />
                    {actionButtons}
                  </div>
                )}
                {decoded.repliedTo ? (
                  repliedThread ? (
                    <button
                      className="message__reply-preview"
                      onClick={() => scrollToThread(decoded.repliedTo ?? '')}
                      title={t('action.goToOriginal')}
                      type="button"
                    >
                      <strong>
                        {getMessageSenderLabel(
                          repliedThread.original,
                          avatarProfiles.get(repliedThread.original.sender),
                        )}
                      </strong>
                      <span>{getMessageSnippet(repliedThread.latest, t)}</span>
                    </button>
                  ) : (
                    <span className="message__reply-preview message__reply-preview--missing">
                      {t('message.replyUnavailable')}
                    </span>
                  )
                ) : null}
                <div className="message__body">
                  {decoded.body ? renderMessageTextWithAppLinks(decoded.body, t) : t('message.empty')}
                </div>
                {areImagePreviewsOpen ? <MessageImagePreviews resources={imageResources} t={t} /> : null}
                <MessageReactionChips
                  onToggleReactionDetails={toggleReactionDetails}
                  openReactionDetailsKey={openReactionDetailsKey}
                  original={original}
                  pendingReactionKey={pendingReactionKey}
                  reactions={reactions}
                  t={t}
                />
                <div className="message__footer">
                  <button
                    className="message__time"
                    onClick={() => toggleTimeDisplay(threadKey)}
                    title={formatTimestamp(original.timestamp)}
                    type="button"
                  >
                    {isTimeExpanded ? formatTimestamp(original.timestamp) : formatTimeAgo(original.timestamp, now)}
                  </button>
                  {isEdited ? (
                    <button
                      aria-expanded={isHistoryOpen}
                      className="message__edited"
                      onClick={() => toggleHistory(threadKey)}
                      title={t('action.toggleEditHistory')}
                      type="button"
                    >
                      {t('label.message.edited')} · {formatTimeAgo(latest.timestamp, now)}
                    </button>
                  ) : null}
                  {isContinuation ? actionButtons : null}
                </div>
                {isHistoryOpen ? (
                  <ol className="message__history" aria-label={t('label.editHistory')}>
                    {previousVersions.map((version, versionIndex) => {
                      const versionBody = decodeChatMessage(version, t).body;

                      return (
                        <li key={getMessageKey(version, versionIndex)}>
                          <span className="message__history-meta">
                            {versionIndex === 0 ? `${t('label.message.original')} · ` : ''}
                            {formatTimestamp(version.timestamp)}
                          </span>
                          <span className="message__history-body">
                            {versionBody ? renderMessageTextWithAppLinks(versionBody, t) : t('message.empty')}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </li>
              </Fragment>
            );
          })}
          {systemMessages.map((transaction) => (
            <li className={`tx-status tx-status--${transaction.phase}`} key={transaction.id}>
              <strong>
                {transaction.phase === 'confirmed'
                  ? t('status.transaction.confirmed')
                  : transaction.phase === 'failed'
                    ? t('status.transaction.failed')
                    : t('status.transaction.pending')}
              </strong>
              <span>{transaction.message}</span>
              {transaction.signature ? <small>{transaction.signature}</small> : null}
            </li>
          ))}
        </ol>
        {unreadJumpVisible && unreadCount > 0 ? (
          <button
            aria-label={t('aria.jumpToUnread')}
            className="message-feed__jump-unread"
            onClick={scrollToUnread}
            type="button"
          >
            <UpIcon />
            <span>{t('label.newMessagesCount', { count: unreadCount })}</span>
          </button>
        ) : null}
        {showScrollToBottom ? (
          <button aria-label={t('aria.scrollToBottom')} className="message-feed__scroll-bottom" onClick={scrollToBottom} type="button">
            <DownIcon />
          </button>
        ) : null}
      </div>
    {reactionAnchorRect && pickerThread ? (
      <ReactionPopover
        anchorRect={reactionAnchorRect}
        label={t('label.reactions')}
        onClose={closeReactionPopover}
        width={360}
      >
        <MessageReactionPicker
          onReact={(message, reaction, contentState) => {
            closeReactionPopover();
            onReact(message, reaction, contentState);
          }}
          original={pickerThread.original}
          pendingReactionKey={pendingReactionKey}
          reactions={pickerReactions}
          t={t}
        />
      </ReactionPopover>
    ) : null}
    {reactionAnchorRect && detailsThread && detailsReaction ? (
      <ReactionPopover
        anchorRect={reactionAnchorRect}
        label={t('label.reactionDetails')}
        onClose={closeReactionPopover}
        width={300}
      >
        <MessageReactionDetails
          avatarProfiles={avatarProfiles}
          canReact={canCompose && !!detailsThread.original.signature}
          now={now}
          onClose={closeReactionPopover}
          onReact={onReact}
          original={detailsThread.original}
          pendingReactionKey={pendingReactionKey}
          reaction={detailsReaction}
          t={t}
        />
      </ReactionPopover>
    ) : null}
    </>
  );
});

function GroupMemberList({
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

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

export default function App() {
  const [bridge, setBridge] = useState<AsyncState<BridgeState>>(createState({ actions: [], isHomeBridge: false, isUsingPublicNode: false, ui: 'BROWSER_DEV' }));
  const [account, setAccount] = useState<QdnSelectedAccount | null>(null);
  const [accountError, setAccountError] = useState('');
  const [groups, setGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  const [groupMembers, setGroupMembers] = useState<AsyncState<GroupMember[]>>(createState(emptyMembers));
  const [accountJoinRequests, setAccountJoinRequests] =
    useState<AsyncState<GroupJoinRequest[]>>(createState(emptyJoinRequests));
  const [adminJoinRequests, setAdminJoinRequests] =
    useState<AsyncState<GroupWithJoinRequests[]>>(createState(emptyAdminJoinRequests));
  const [memberGroups, setMemberGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  const [activeChats, setActiveChats] = useState<AsyncState<ActiveChats>>(createState(emptyActiveChats));
  // Direct chats kept in the sidebar even after their messages expire off the
  // active-chats list, persisted per account; removable when no longer active.
  const [persistedDirects, setPersistedDirects] = useState<PersistedDirect[]>([]);
  // Tracks the account whose saved last-chat has already been restored, so the
  // restore runs once per account rather than fighting later selections.
  const restoredForAccountRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<AsyncState<ChatMessage[]>>(createState(emptyMessages));
  const [messagesChatKey, setMessagesChatKey] = useState('');
  // Screen-reader announcement for newly-arrived chat messages. The visible feed
  // is not a live region (announcing the whole transcript on load/switch would be
  // unusable), so a dedicated polite live region mirrors only genuinely new
  // incoming messages. See the announce effect below.
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const lastAnnouncedRef = useRef<{ chatKey: string; signature: string }>({ chatKey: '', signature: '' });
  // History loaded on demand behind the live tail. The live `messages` state is
  // capped at the latest 100; this buffer accumulates older windows paged in as
  // the user scrolls toward the top, so the full group history can be read.
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>(emptyMessages);
  // `reachedStart` defaults true so paging stays off until a full initial page
  // (== the cap) proves there may be older history worth fetching.
  const [olderMessagesState, setOlderMessagesState] = useState<{
    error: string;
    loading: boolean;
    reachedStart: boolean;
  }>({ error: '', loading: false, reachedStart: true });
  // Synchronous guard so rapid scroll events cannot fire overlapping fetches.
  const loadingOlderRef = useRef(false);
  const [cachedGeneralChatMembers, setCachedGeneralChatMembers] = useState<GroupMember[]>(emptyMembers);
  const [loadedGroupActivityById, setLoadedGroupActivityById] =
    useState<ReadonlyMap<number, number | null>>(() => new Map());
  const [loadedDirectActivityByAddress, setLoadedDirectActivityByAddress] =
    useState<ReadonlyMap<string, number | null>>(() => new Map());
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [search, setSearch] = useState('');
  const [isGroupSearchOpen, setGroupSearchOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [composeContext, setComposeContext] = useState<
    | { kind: 'edit'; thread: MessageThread }
    | { kind: 'reply'; message: ChatMessage }
    | null
  >(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const groupSearchInputRef = useRef<HTMLInputElement>(null);
  const loadedGroupActivityRef = useRef<ReadonlyMap<number, number | null>>(new Map());
  const loadedDirectActivityRef = useRef<ReadonlyMap<string, number | null>>(new Map());
  const requestedPrivateGroupKeysRef = useRef(new Set<string>());
  const resolvedPrivateGroupKeyRequestsRef = useRef(new Set<string>());
  const pendingApprovalsRequestRef = useRef(0);
  const [directAddress, setDirectAddress] = useState('');
  const [isDirectSearchOpen, setDirectSearchOpen] = useState(false);
  const [directLookupPending, setDirectLookupPending] = useState(false);
  const [directLookupError, setDirectLookupError] = useState('');
  const directSearchInputRef = useRef<HTMLInputElement>(null);
  // Per-chat read watermark (latest activity timestamp the user has seen). Held in
  // memory for the session: baselined to current activity when a chat is first
  // discovered so existing history is not flagged, then advanced as chats are read.
  const [lastReadByGroupId, setLastReadByGroupId] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [lastReadByAddress, setLastReadByAddress] = useState<ReadonlyMap<string, number>>(() => new Map());
  // Mirrors of the read watermarks, read synchronously when a chat opens to
  // snapshot the divider position before the "mark read" effect advances them.
  const lastReadByGroupIdRef = useRef(lastReadByGroupId);
  const lastReadByAddressRef = useRef(lastReadByAddress);
  // Skip the one render right after an account switch, where the watermark maps
  // still hold the previous account's values, so we never persist them under the
  // new account's key. The load effect raises this; the persist effect clears it.
  const skipWatermarkPersistRef = useRef(true);
  // Saved scroll position per chat key so the reading position is restored when
  // the user returns to a conversation after visiting another.
  const scrollPositionsRef = useRef(new Map<string, number>());
  const [mintingStatus, setMintingStatus] = useState<AsyncState<MintingStatus | null>>(createState(null));
  const [joinPending, setJoinPending] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [startMintingPending, setStartMintingPending] = useState(false);
  const [pendingApprovals, setPendingApprovals] =
    useState<AsyncState<PendingApprovalTransaction[]>>(createState(emptyPendingApprovals));
  const [approvalVotes, setApprovalVotes] =
    useState<AsyncState<GroupApprovalVote[]>>(createState(emptyApprovalVotes));
  const [currentBlockHeight, setCurrentBlockHeight] = useState<number | null>(null);
  const [votedSignatures, setVotedSignatures] = useState<Record<string, { approval: boolean }>>({});
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalActionSignature, setApprovalActionSignature] = useState<string | null>(null);
  const [approvePendingJoiner, setApprovePendingJoiner] = useState<string | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const [reactionPendingKey, setReactionPendingKey] = useState('');
  const [writeError, setWriteError] = useState('');
  const [privateGroupKeyStatus, setPrivateGroupKeyStatus] = useState('');
  const [privateGroupKeyError, setPrivateGroupKeyError] = useState('');
  // Members are auto-hidden behind a toggle so groups/chat get the full width;
  // on a narrow screen the panel opens as an off-canvas overlay instead.
  const [membersOpen, setMembersOpen] = useState(false);
  // Narrow-screen single-view navigation: false shows the group/direct list,
  // true shows the open conversation (toggled by selecting a chat / the back
  // button). Ignored by the desktop layout, which shows both side by side.
  const [mobileChatView, setMobileChatView] = useState(false);
  // Tracks the single-view breakpoint so the members panel can behave as a modal
  // overlay (focus, Escape, inert background) only when it is actually one.
  const isNarrowLayout = useMediaQuery('(max-width: 860px)');
  const membersToggleRef = useRef<HTMLButtonElement>(null);
  const membersCloseRef = useRef<HTMLButtonElement>(null);
  // Read watermark + open moment captured when a chat is opened, frozen for the
  // session: the "new messages" divider spans (watermark, openedAt], so it marks
  // the backlog that was unread on open and stays put as new messages arrive.
  const [unreadDividerTimestamp, setUnreadDividerTimestamp] = useState<number | null>(null);
  const [unreadDividerCeiling, setUnreadDividerCeiling] = useState<number | null>(null);
  // Bumped on every message the user sends, so the feed scrolls back to the
  // bottom to reveal it even if they had scrolled up.
  const [sentMessageNonce, setSentMessageNonce] = useState(0);
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const [trackedTransactions, setTrackedTransactions] = useState<Record<string, TrackedTransaction>>({});
  const [accountInfoTarget, setAccountInfoTarget] = useState<AccountInfoTarget | null>(null);
  const [avatarLightboxImage, setAvatarLightboxImage] = useState<AvatarLightboxImage | null>(null);
  const t = useMemo(() => createTranslator(displaySettings.language), [displaySettings.language]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const joinedIds = useMemo(
    () => new Set(memberGroups.value.filter((group) => !isGeneralChatGroup(group)).map((group) => group.groupId)),
    [memberGroups.value],
  );
  const selectedGroup = selectedChat?.kind === 'group' ? selectedChat.group : null;
  const selectedDirect = selectedChat?.kind === 'direct' ? selectedChat.direct : null;
  const selectedGroupId = selectedGroup?.groupId ?? null;
  const selectedDirectAddress = selectedDirect?.address ?? null;
  const selectedChatKey = getSelectedChatKey(selectedChat);
  const selectedGroupIdRef = useRef<number | null>(selectedGroupId);
  // Live mirror of the current selection so async callbacks (e.g. a group search
  // resolving after the saved-chat restore) don't auto-select over a real choice.
  const hasSelectedChatRef = useRef(selectedChat !== null);
  // Live mirror of the account address so storage writes update the visible state
  // only while that account is still selected (avoids cross-account contamination).
  const currentAccountAddressRef = useRef<string | null>(account?.address ?? null);
  // Set once the user explicitly picks a chat, so a late-arriving account does not
  // restore over their choice. Reset per account so each account restores once.
  const userSelectedChatRef = useRef(false);

  selectedGroupIdRef.current = selectedGroupId;
  hasSelectedChatRef.current = selectedChat !== null;
  currentAccountAddressRef.current = account?.address ?? null;
  const groupActivityById = useMemo(() => {
    const activity = new Map<number, number>();

    for (const activeGroup of activeChats.value.groups ?? []) {
      if (typeof activeGroup.timestamp === 'number') {
        activity.set(activeGroup.groupId, activeGroup.timestamp);
      }
    }

    for (const [groupId, timestamp] of loadedGroupActivityById) {
      if (timestamp === null) {
        // Tombstone: loaded history found no real (non-reaction) message.
        activity.delete(groupId);
      } else {
        // Merge as a floor, not an override, so a newer live active-chats
        // timestamp (a fresh message in an already-loaded group) still wins and
        // can surface as unread.
        activity.set(groupId, Math.max(activity.get(groupId) ?? Number.NEGATIVE_INFINITY, timestamp));
      }
    }

    return activity;
  }, [activeChats.value.groups, loadedGroupActivityById]);
  const directActivityByAddress = useMemo(() => {
    const activity = new Map<string, number>();

    for (const direct of activeChats.value.direct ?? []) {
      if (typeof direct.timestamp === 'number') {
        activity.set(direct.address, direct.timestamp);
      }
    }

    for (const [address, timestamp] of loadedDirectActivityByAddress) {
      if (timestamp === null) {
        // Tombstone: loaded history found no real (non-reaction) message.
        activity.delete(address);
      } else {
        // Merge as a floor, not an override, so a newer live timestamp still
        // wins and can surface as unread.
        activity.set(address, Math.max(activity.get(address) ?? Number.NEGATIVE_INFINITY, timestamp));
      }
    }

    return activity;
  }, [activeChats.value.direct, loadedDirectActivityByAddress]);
  // Sidebar direct list = active chats plus persisted ones whose messages have
  // expired off the active list. Persisted-only entries (no active messages) are
  // the removable ones — surfaced via removableDirectAddresses.
  const activeDirectAddresses = useMemo(
    () => new Set((activeChats.value.direct ?? []).map((direct) => direct.address)),
    [activeChats.value.direct],
  );
  const mergedDirects = useMemo(() => {
    const active = activeChats.value.direct ?? [];
    const extras = persistedDirects
      .filter((direct) => !activeDirectAddresses.has(direct.address))
      .map((direct): ActiveDirectChat => (direct.name ? { address: direct.address, name: direct.name } : { address: direct.address }));

    return [...active, ...extras];
  }, [activeChats.value.direct, activeDirectAddresses, persistedDirects]);
  const removableDirectAddresses = useMemo(
    () => new Set(mergedDirects.map((direct) => direct.address).filter((address) => !activeDirectAddresses.has(address))),
    [mergedDirects, activeDirectAddresses],
  );
  const sortedGroups = useMemo(() => sortGroups(groups.value, t, groupActivityById), [groupActivityById, groups.value, t]);
  const isGroupSearchVisible = isGroupSearchOpen || search.trim().length > 0;
  const isDirectFormVisible = isDirectSearchOpen || directAddress.trim().length > 0;
  // A chat is unread when its latest activity is newer than the user's read
  // watermark. The currently open chat is excluded (it is being read).
  const unreadGroupIds = useMemo(() => {
    const ids = new Set<number>();

    for (const [groupId, timestamp] of groupActivityById) {
      if (groupId === selectedGroupId) {
        continue;
      }

      const lastRead = lastReadByGroupId.get(groupId);

      if (lastRead !== undefined && timestamp > lastRead) {
        ids.add(groupId);
      }
    }

    return ids;
  }, [groupActivityById, lastReadByGroupId, selectedGroupId]);
  const unreadDirectAddresses = useMemo(() => {
    const addresses = new Set<string>();

    for (const [address, timestamp] of directActivityByAddress) {
      if (address === selectedDirectAddress) {
        continue;
      }

      const lastRead = lastReadByAddress.get(address);

      if (lastRead !== undefined && timestamp > lastRead) {
        addresses.add(address);
      }
    }

    return addresses;
  }, [directActivityByAddress, lastReadByAddress, selectedDirectAddress]);
  const hasUnreadGroups = unreadGroupIds.size > 0;
  const hasUnreadDirect = unreadDirectAddresses.size > 0;
  const isSelectedGeneralChat = isGeneralChatGroup(selectedGroup);
  const selectedGroupMembersLabel = isSelectedGeneralChat ? t('label.common.active') : t('label.common.members');
  const hasSelectedMessages = selectedChatKey !== '' && messagesChatKey === selectedChatKey;
  const selectedGeneralChatMembers = useMemo(
    () =>
      isSelectedGeneralChat && hasSelectedMessages
        ? getActiveMessageGroupMembers(messages.value, GENERAL_CHAT_GROUP_ID)
        : emptyMembers,
    [hasSelectedMessages, isSelectedGeneralChat, messages.value],
  );
  const generalChatMembersForUi =
    isSelectedGeneralChat && hasSelectedMessages && messages.phase === 'ready'
      ? selectedGeneralChatMembers
      : cachedGeneralChatMembers;
  const syntheticMemberCountsByGroupId = useMemo(() => {
    const counts = new Map<number, number>();

    if (isSelectedGeneralChat || cachedGeneralChatMembers.length > 0) {
      counts.set(GENERAL_CHAT_GROUP_ID, generalChatMembersForUi.length);
    }

    return counts;
  }, [cachedGeneralChatMembers.length, generalChatMembersForUi.length, isSelectedGeneralChat]);
  const selectedGroupMembers = isSelectedGeneralChat ? generalChatMembersForUi : groupMembers.value;
  const selectedGroupMembersPhase = isSelectedGeneralChat
    ? !hasSelectedMessages && messages.phase === 'ready'
      ? 'loading'
      : messages.phase
    : groupMembers.phase;
  const selectedGroupMembersError =
    isSelectedGeneralChat
      ? messages.phase === 'error'
        ? messages.error
        : ''
      : groupMembers.phase === 'error'
        ? groupMembers.error
        : '';
  const showGroupMembers = !!selectedGroup;
  // The members panel is a modal overlay (not a side column) only at the narrow
  // breakpoint; that is when it needs dialog semantics + an inert background.
  const isMembersOverlay = isNarrowLayout && showGroupMembers && membersOpen;
  const pendingJoinGroupIds = useMemo(
    () => new Set(accountJoinRequests.value.map((request) => request.groupId)),
    [accountJoinRequests.value],
  );
  const pendingTrackedJoinGroupIds = useMemo(
    () =>
      new Set(
        Object.values(trackedTransactions)
          .filter((transaction) => transaction.action === 'join' && transaction.phase === 'pending')
          .map((transaction) => transaction.groupId),
      ),
    [trackedTransactions],
  );
  const pendingTrackedLeaveGroupIds = useMemo(
    () =>
      new Set(
        Object.values(trackedTransactions)
          .filter((transaction) => transaction.action === 'leave' && transaction.phase === 'pending')
          .map((transaction) => transaction.groupId),
      ),
    [trackedTransactions],
  );
  const adminJoinRequestGroups = useMemo(
    () => new Map(adminJoinRequests.value.map((entry) => [entry.group.groupId, entry])),
    [adminJoinRequests.value],
  );
  const selectedAdminJoinRequests =
    selectedGroupId === null || isSelectedGeneralChat ? [] : adminJoinRequestGroups.get(selectedGroupId)?.joinRequests ?? [];
  const selectedTransactions = Object.values(trackedTransactions).filter(
    (transaction) => selectedGroupId !== null && transaction.groupId === selectedGroupId,
  );
  const actions = bridge.value.actions;
  const actionsKey = actions.join('\n');
  // The rendered feed is the live tail plus any older history paged in behind it.
  const combinedMessages = useMemo(
    () => (olderMessages.length === 0 ? messages.value : mergeMessages(olderMessages, messages.value, Infinity)),
    [olderMessages, messages.value],
  );
  const knownAvatarNames = useMemo(() => {
    const namesByAddress = new Map<string, string>();
    const accountName = normalizeRegisteredName(account?.name);

    if (account?.address && accountName) {
      namesByAddress.set(account.address, accountName);
    }

    const accountInfoName = normalizeRegisteredName(accountInfoTarget?.senderName);

    if (accountInfoTarget?.sender && accountInfoName) {
      namesByAddress.set(accountInfoTarget.sender, accountInfoName);
    }

    for (const message of messages.value) {
      const senderName = normalizeRegisteredName(message.senderName);

      if (senderName && !namesByAddress.has(message.sender)) {
        namesByAddress.set(message.sender, senderName);
      }
    }

    for (const member of groupMembers.value) {
      const address = getGroupMemberAddress(member);
      const memberName = getGroupMemberRegisteredName(member);

      if (address && memberName && !namesByAddress.has(address)) {
        namesByAddress.set(address, memberName);
      }
    }

    if (selectedGroup?.owner && selectedGroup.ownerPrimaryName) {
      namesByAddress.set(selectedGroup.owner, selectedGroup.ownerPrimaryName);
    }

    return namesByAddress;
  }, [
    account?.address,
    account?.name,
    accountInfoTarget?.sender,
    accountInfoTarget?.senderName,
    groupMembers.value,
    messages.value,
    selectedGroup?.owner,
    selectedGroup?.ownerPrimaryName,
  ]);
  const avatarAddresses = useMemo(() => {
    const addresses = new Set<string>();

    if (account?.address) {
      addresses.add(account.address);
    }

    if (accountInfoTarget?.sender) {
      addresses.add(accountInfoTarget.sender);
    }

    for (const message of messages.value) {
      addresses.add(message.sender);
    }

    for (const member of groupMembers.value) {
      const address = getGroupMemberAddress(member);

      if (address) {
        addresses.add(address);
      }
    }

    if (selectedGroup?.owner) {
      addresses.add(selectedGroup.owner);
    }

    for (const transaction of pendingApprovals.value) {
      if (transaction.creatorAddress) {
        addresses.add(transaction.creatorAddress);
      }
    }

    return Array.from(addresses);
  }, [
    account?.address,
    accountInfoTarget?.sender,
    groupMembers.value,
    messages.value,
    pendingApprovals.value,
    selectedGroup?.owner,
  ]);
  const avatarProfiles = useAvatarProfiles(avatarAddresses, knownAvatarNames, actions, actionsKey);

  useEffect(() => {
    if (isSelectedGeneralChat && hasSelectedMessages && messages.phase === 'ready') {
      setCachedGeneralChatMembers(selectedGeneralChatMembers);
    }
  }, [hasSelectedMessages, isSelectedGeneralChat, messages.phase, selectedGeneralChatMembers]);

  const canJoinGroup = hasAction(actions, 'JOIN_GROUP');
  const canLeaveGroup = hasAction(actions, 'LEAVE_GROUP');
  const canApproveGroupJoinRequests = hasAction(actions, 'APPROVE_GROUP_JOIN_REQUEST');
  const canSendGroupChat = hasAction(actions, 'SEND_CHAT_MESSAGE');
  const canReadPrivateGroupChat = hasAction(actions, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES');
  const canReadPrivateDirectChat = hasAction(actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES');
  const canLoadPrivateDirectChats = hasAction(actions, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS');
  const canOpenMediaPlayer = hasAction(actions, 'OPEN_QDN_MEDIA_PLAYER');
  const canOpenDocumentViewer = hasAction(actions, 'OPEN_QDN_DOCUMENT_VIEWER');
  const canSaveQdnResource = hasAction(actions, 'SAVE_QDN_RESOURCE');
  const canRequestUnlock = hasAction(actions, 'UNLOCK_SELECTED_ACCOUNT');
  const canSendDirectChat = canSendGroupChat;
  const isAccountUnlocked = account?.isUnlocked === true;
  const canUseSelectedAccount = !!account && (isAccountUnlocked || canRequestUnlock);
  const canOpenDirectChat = canUseSelectedAccount && (canReadPrivateDirectChat || canSendDirectChat);
  const isJoinedGroup = selectedGroupId !== null && joinedIds.has(selectedGroupId);
  const isRegularSelectedGroup = selectedChat?.kind === 'group' && !isSelectedGeneralChat;
  const isSelectedGroupMembershipConfirmed = !isRegularSelectedGroup || memberGroups.phase === 'ready';
  const isConfirmedJoinedGroup = memberGroups.phase === 'ready' && isJoinedGroup;
  const shouldDecryptSelectedGroupMessages =
    selectedChat?.kind === 'group' &&
    shouldDecryptGroupMessages(selectedChat.group, {
      canReadPrivateGroupChat,
      isAccountUnlocked,
      isGroupMembershipConfirmed: isSelectedGroupMembershipConfirmed,
      isJoinedGroup: isConfirmedJoinedGroup,
    });
  const selectedClosedGroupReadKey =
    selectedChat?.kind === 'group' && selectedChat.group.isOpen === false
      ? `${memberGroups.phase}:${isConfirmedJoinedGroup ? 'joined' : 'not-joined'}`
      : '';
  const canPostInSelectedGroup =
    selectedChat?.kind === 'group' &&
    (isSelectedGeneralChat || isConfirmedJoinedGroup);
  const hasPendingJoinRequest = selectedGroupId !== null && pendingJoinGroupIds.has(selectedGroupId);
  const hasPendingJoinTransaction = selectedGroupId !== null && pendingTrackedJoinGroupIds.has(selectedGroupId);
  const hasPendingLeaveTransaction = selectedGroupId !== null && pendingTrackedLeaveGroupIds.has(selectedGroupId);
  const isJoinableGroup =
    selectedGroupId !== null &&
    selectedGroupId > 0 &&
    isSelectedGroupMembershipConfirmed &&
    !isConfirmedJoinedGroup &&
    !hasPendingJoinRequest &&
    !hasPendingJoinTransaction;
  const canSubmitJoin = canUseSelectedAccount && !!selectedGroup && canJoinGroup && isJoinableGroup && !joinPending;
  const canSubmitLeave =
    canUseSelectedAccount &&
    !!selectedGroup &&
    selectedGroupId !== null &&
    selectedGroupId > 0 &&
    canLeaveGroup &&
    isConfirmedJoinedGroup &&
    !leavePending &&
    !hasPendingLeaveTransaction;
  const canStartMinting = hasAction(actions, 'START_MINTING');
  const isSelectedMintingGroup = selectedGroup?.isMintingGroup === true;
  const accountMintingStatus = mintingStatus.value;
  const showMintingControls = isSelectedMintingGroup && isConfirmedJoinedGroup && !!account;
  const hasPendingRewardShareTransaction = Object.values(trackedTransactions).some(
    (transaction) => transaction.action === 'rewardshare' && transaction.phase === 'pending',
  );
  const canSubmitStartMinting =
    showMintingControls &&
    canUseSelectedAccount &&
    canStartMinting &&
    accountMintingStatus?.keyOnNode === false &&
    !hasPendingRewardShareTransaction &&
    !startMintingPending;
  // On a public/network node Home only accepts the keyless broadcast for open
  // groups; direct and closed-group sends are rejected there. Block them in the
  // UI so we never present an unsupported send. Trusted nodes are unaffected.
  const isPublicNodeSendBlocked =
    !!selectedChat &&
    isPublicNodeSendUnsupported(
      bridge.value.isUsingPublicNode,
      selectedChat.kind === 'group' ? { group: selectedChat.group, kind: 'group' } : { kind: 'direct' },
    );
  const canComposeMessage =
    canUseSelectedAccount &&
    !!selectedChat &&
    !isPublicNodeSendBlocked &&
    (selectedChat.kind === 'group' ? canSendGroupChat && canPostInSelectedGroup : canSendDirectChat);
  const canSubmitMessage =
    canComposeMessage && draft.trim().length > 0 && !sendPending;
  const publicNodeSendNotice = isPublicNodeSendBlocked ? t('action.publicNodeSendUnavailable') : '';
  const showGroupComposerNotice =
    canUseSelectedAccount &&
    canSendGroupChat &&
    isRegularSelectedGroup &&
    !canPostInSelectedGroup;
  const groupComposerNotice =
    memberGroups.phase === 'error'
      ? t('hint.groupMembershipUnavailable')
      : !isSelectedGroupMembershipConfirmed
        ? t('hint.groupMembershipChecking')
        : t('hint.groupJoinToPost');
  const accountRequiredLabel = bridge.value.isHomeBridge
    ? t('action.account.notShared')
    : t('action.noAccountUse');
  const accountLockedLabel = bridge.value.isHomeBridge
    ? t('label.account.locked.home')
    : t('label.account.locked.browser');
  const directAccessUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : bridge.value.isHomeBridge
      ? t('action.directReadOnly')
      : t('action.privateChatUnavailable');
  const directReadUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : bridge.value.isHomeBridge
      ? t('action.directReadOnly')
      : t('action.directReadUnavailableBrowser');
  const directListUnavailableLabel =
    t('action.directListUnavailable');
  const directSendUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : bridge.value.isHomeBridge
      ? t('action.directSendUnavailable')
      : t('action.directSendUnavailableBrowser');
  const groupJoinUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : bridge.value.isHomeBridge
      ? t('action.groupJoinUnavailable')
      : t('action.groupJoinUnavailableBrowser');
  const groupLeaveUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : bridge.value.isHomeBridge
      ? t('action.groupLeaveUnavailable')
      : t('action.groupLeaveUnavailableBrowser');
  const startMintingTitle = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : !canStartMinting
      ? bridge.value.isHomeBridge
        ? t('action.mintingUnavailable')
        : t('action.mintingUnavailableBrowser')
    : hasPendingRewardShareTransaction
      ? t('status.minting.authorization.pending')
      : accountMintingStatus?.keyOnNode === null
        ? t('status.mintingNodeHint')
        : accountMintingStatus?.hasRewardShare === false
          ? t('action.mintingAuthorizeChain')
          : t('action.mintingAddKey');
  const groupSendUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : bridge.value.isHomeBridge
      ? t('action.groupMessagesUnavailable')
      : t('action.groupMessagesUnavailableBrowser');
  const selectedDirectHistoryUnavailable =
    selectedChat?.kind === 'direct' && (!isAccountUnlocked || !canReadPrivateDirectChat);
  const selectedClosedGroupHistoryUnavailable =
    selectedChat?.kind === 'group' && selectedChat.group.isOpen === false && !shouldDecryptSelectedGroupMessages;
  const closedGroupHistoryUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
      : !canReadPrivateGroupChat
        ? t('action.closedGroupHistoryUnsupported')
        : memberGroups.phase === 'error'
          ? t('hint.groupMembershipUnavailable')
        : !isSelectedGroupMembershipConfirmed
          ? t('hint.groupMembershipChecking')
          : t('hint.groupJoinToRead');
  const canGroupApproval = hasAction(actions, 'GROUP_APPROVAL');
  const isSelectedDevGroup = selectedGroupId !== null && DEV_GROUP_IDS.has(selectedGroupId);
  const isAdminOfSelectedGroup =
    selectedGroupId !== null &&
    memberGroups.value.some((group) => group.groupId === selectedGroupId && group.isAdmin === true);
  const isMemberOfSelectedGroup =
    selectedGroupId !== null && memberGroups.value.some((group) => group.groupId === selectedGroupId);
  // When the selected group's only admin is the null account it has no real
  // admins, so every member may approve. Detect that from the loaded member list
  // and treat members as approvers, mirroring the Core's group-approval rules.
  const selectedGroupMembersLoaded = groupMembers.phase === 'ready';
  const selectedGroupHasRealAdmin = groupMembers.value.some(
    (member) => member.isAdmin === true && (member.member ?? member.address) !== NULL_ACCOUNT_ADDRESS,
  );
  const isApproverOfSelectedGroup =
    isAdminOfSelectedGroup ||
    (selectedGroupMembersLoaded && !selectedGroupHasRealAdmin && isMemberOfSelectedGroup);
  const showApprovalControls = isSelectedDevGroup && isApproverOfSelectedGroup && !!account;
  const pendingApprovalCount = pendingApprovals.value.length;
  const approvalProgressReady = selectedGroupMembersLoaded && approvalVotes.phase === 'ready';
  const approvalProgressBySignature = useMemo(() => {
    const map = new Map<string, ApprovalProgress>();

    if (!approvalProgressReady) {
      return map;
    }

    for (const transaction of pendingApprovals.value) {
      map.set(
        transaction.signature,
        computeApprovalProgress(
          transaction,
          selectedGroup,
          groupMembers.value,
          approvalVotes.value,
          account?.address ?? null,
        ),
      );
    }

    return map;
  }, [account?.address, approvalProgressReady, approvalVotes.value, groupMembers.value, pendingApprovals.value, selectedGroup]);
  const canSubmitGroupApproval =
    showApprovalControls && canUseSelectedAccount && canGroupApproval && approvalActionSignature === null;
  const groupApprovalUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
      : bridge.value.isHomeBridge
        ? t('action.groupApprovalUnavailable')
        : t('action.groupApprovalUnavailableBrowser');

  async function loadGroups(nextSearch = search, actionList = actions) {
    setGroups({ phase: 'loading', value: groups.value });

    try {
      const nextGroups = withGeneralChatGroup(await searchGroups(nextSearch, actionList), nextSearch, t);

      setGroups({ phase: 'ready', value: nextGroups });
      if (!hasSelectedChatRef.current && nextGroups.length > 0) {
        setSelectedChat({ group: nextGroups[0], kind: 'group' });
      }
    } catch (error) {
      const fallbackGroups = withGeneralChatGroup(emptyGroups, nextSearch, t);

      setGroups({
        error: getBridgeErrorMessage(error, t('status.loadingError.groups'), t),
        phase: 'error',
        value: fallbackGroups,
      });
      if (!hasSelectedChatRef.current && fallbackGroups.length > 0) {
        setSelectedChat({ group: fallbackGroups[0], kind: 'group' });
      }
    }
  }

  async function loadGroupMembers(group: GroupData, actionList = actions, options: { quiet?: boolean } = {}) {
    if (isGeneralChatGroup(group)) {
      setGroupMembers({ phase: 'ready', value: emptyMembers });
      return;
    }

    if (!options.quiet) {
      setGroupMembers({ phase: 'loading', value: groupMembers.value });
    }

    try {
      setGroupMembers({ phase: 'ready', value: await getGroupMembers(group.groupId, actionList) });
    } catch (error) {
      setGroupMembers({
        error: getBridgeErrorMessage(error, t('status.loadingError.groupMembers'), t),
        phase: 'error',
        value: groupMembers.value,
      });
    }
  }

  async function loadAccountJoinRequests(
    selectedAccount: QdnSelectedAccount,
    actionList = actions,
    options: { quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setAccountJoinRequests({ phase: 'loading', value: accountJoinRequests.value });
    }

    try {
      setAccountJoinRequests({
        phase: 'ready',
        value: await getAccountGroupJoinRequests(selectedAccount.address, actionList),
      });
    } catch (error) {
      setAccountJoinRequests({
        error: getBridgeErrorMessage(error, t('status.loadingError.joinRequests'), t),
        phase: 'error',
        value: accountJoinRequests.value,
      });
    }
  }

  async function loadAdminJoinRequests(
    selectedAccount: QdnSelectedAccount,
    actionList = actions,
    options: { quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setAdminJoinRequests({ phase: 'loading', value: adminJoinRequests.value });
    }

    try {
      setAdminJoinRequests({
        phase: 'ready',
        value: await getAdminGroupJoinRequests(selectedAccount.address, actionList),
      });
    } catch (error) {
      setAdminJoinRequests({
        error: getBridgeErrorMessage(error, t('status.loadingError.groupApprovals'), t),
        phase: 'error',
        value: adminJoinRequests.value,
      });
    }
  }

  async function loadMintingStatus(
    selectedAccount: QdnSelectedAccount,
    actionList = actions,
    options: { quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setMintingStatus({ phase: 'loading', value: mintingStatus.value });
    }

    try {
      setMintingStatus({ phase: 'ready', value: await getMintingStatus(selectedAccount.address, actionList) });
    } catch (error) {
      setMintingStatus({
        error: getBridgeErrorMessage(error, t('status.loadingError.minting'), t),
        phase: 'error',
        value: mintingStatus.value,
      });
    }
  }

  // Refresh just the active-chats list (group + direct). Split out of
  // loadAccountData so a write that only affects the conversation list — a
  // direct send/reaction — can update it without re-fetching member groups,
  // join requests, admin requests, and minting status. When `quiet`, skip the
  // loading flip and (like the poll/WS path) the error transition, so a
  // transient blip after a send never clobbers the working list.
  async function loadActiveChats(
    selectedAccount: QdnSelectedAccount,
    actionList = actions,
    options: { quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setActiveChats({ phase: 'loading', value: activeChats.value });
    }

    try {
      const nextActiveChats = await getActiveChats(selectedAccount.address, actionList);
      const direct = selectedAccount.isUnlocked && hasAction(actionList, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS')
        ? await getPrivateDirectActiveChats(actionList)
        : nextActiveChats.direct;

      setActiveChats({ phase: 'ready', value: { ...nextActiveChats, direct } });
      // Keep these directs listed after their messages later expire. Done here
      // (not in an effect) so the write is tied to the account just loaded.
      persistDirects(selectedAccount.address, direct ?? []);
    } catch (error) {
      if (!options.quiet) {
        setActiveChats({
          error: getBridgeErrorMessage(error, t('status.loadingError.activeChats'), t),
          phase: 'error',
          value: activeChats.value,
        });
      }
    }
  }

  async function loadAccountData(selectedAccount: QdnSelectedAccount, actionList = actions) {
    setMemberGroups({ phase: 'loading', value: memberGroups.value });

    try {
      setMemberGroups({ phase: 'ready', value: await getMemberGroups(selectedAccount.address, actionList) });
    } catch (error) {
      setMemberGroups({
        error: getBridgeErrorMessage(error, t('status.loadingError.joinedGroups'), t),
        phase: 'error',
        value: memberGroups.value,
      });
    }

    await loadActiveChats(selectedAccount, actionList);

    void loadAccountJoinRequests(selectedAccount, actionList);
    void loadAdminJoinRequests(selectedAccount, actionList);
    void loadMintingStatus(selectedAccount, actionList);
  }

  async function loadMessages(
    chat: SelectedChat | null,
    actionList = actions,
    options: { accountUnlocked?: boolean; quiet?: boolean; skipKeyRecovery?: boolean } = {},
  ) {
    if (!chat) {
      return;
    }

    const canReadUnlockedMessages = options.accountUnlocked ?? isAccountUnlocked;
    const chatKey = getSelectedChatKey(chat);

    if (!options.quiet) {
      setMessagesChatKey('');
      setMessages({ phase: 'loading', value: messages.value });
    }

    try {
      if (chat.kind === 'direct' && !canReadUnlockedMessages) {
        setMessagesChatKey(chatKey);
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      if (chat.kind === 'direct' && !hasAction(actionList, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES')) {
        setMessagesChatKey(chatKey);
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      const shouldDecryptPrivateGroup =
        chat.kind === 'group' &&
        shouldDecryptGroupMessages(chat.group, {
          canReadPrivateGroupChat: hasAction(actionList, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES'),
          isAccountUnlocked: canReadUnlockedMessages,
          isGroupMembershipConfirmed: memberGroups.phase === 'ready',
          isJoinedGroup: joinedIds.has(chat.group.groupId),
        });

      const nextMessages =
        chat.kind === 'group'
          ? await getGroupMessages(chat.group, actionList, { decryptPrivate: shouldDecryptPrivateGroup })
          : await getDirectMessages(chat.direct.address, actionList);

      if (chat.kind === 'group') {
        setLoadedGroupActivityById((current) => mergeActivityTimestamp(current, chat.group.groupId, nextMessages));
      } else {
        setLoadedDirectActivityByAddress((current) => mergeActivityTimestamp(current, chat.direct.address, nextMessages));
      }

      setMessagesChatKey(chatKey);
      setMessages({ phase: 'ready', value: nextMessages });

      // Only the initial (non-quiet) load establishes whether older history may
      // exist; quiet 15s polls must not disturb paging once the user has paged.
      if (!options.quiet) {
        setOlderMessagesState({
          error: '',
          loading: false,
          reachedStart: nextMessages.length < DEFAULT_LIST_LIMIT,
        });
      }

      if (
        chat.kind === 'group' &&
        chat.group.isOpen === false &&
        !options.skipKeyRecovery &&
        account?.isUnlocked === true &&
        shouldDecryptPrivateGroup
      ) {
        void recoverMissingPrivateGroupKeys(chat.group, nextMessages, account, actionList, {
          quiet: options.quiet,
        });
      }
    } catch (error) {
      // Quiet background polls (the 15s direct/closed-group poll) and the
      // websocket REST-fallback must never replace a working chat with an
      // error banner + stale value on a transient blip — keep the last good
      // state and let the next poll recover.
      if (options.quiet) {
        return;
      }

      setMessagesChatKey('');
      // Functional update so the displayed value is the live state, never a
      // stale value captured by this closure.
      setMessages((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.messages'), t),
        phase: 'error',
        value: current.value,
      }));
    }
  }

  async function loadOlderMessages() {
    const chat = selectedChat;

    if (!chat || loadingOlderRef.current || olderMessagesState.reachedStart) {
      return;
    }

    const shouldDecryptPrivateGroup =
      chat.kind === 'group' &&
      shouldDecryptGroupMessages(chat.group, {
        canReadPrivateGroupChat,
        isAccountUnlocked,
        isGroupMembershipConfirmed: memberGroups.phase === 'ready',
        isJoinedGroup: joinedIds.has(chat.group.groupId),
      });

    // Page backward from the oldest message currently shown (live tail + any
    // history already paged in).
    const loadedMessages = mergeMessages(olderMessages, messages.value, Infinity);
    const oldest = loadedMessages[0];

    if (!oldest) {
      return;
    }

    // `before` is exclusive, so query one millisecond past the oldest message to
    // include any siblings sharing its exact timestamp; mergeMessages dedupes the
    // boundary message back out by signature.
    const olderBefore = oldest.timestamp + 1;

    loadingOlderRef.current = true;
    setOlderMessagesState((current) => ({ ...current, error: '', loading: true }));

    try {
      const olderWindow =
        chat.kind === 'group'
          ? await getGroupMessages(chat.group, actions, {
              before: olderBefore,
              decryptPrivate: shouldDecryptPrivateGroup,
            })
          : await getDirectMessages(chat.direct.address, actions, { before: olderBefore });

      const merged = mergeMessages(olderWindow, loadedMessages, Infinity);

      // A short window (fewer than the cap) means the Core has no more history
      // before this point; no net-new messages means the same (and guards
      // against same-timestamp windows that never advance).
      const reachedStart = olderWindow.length < DEFAULT_LIST_LIMIT || merged.length <= loadedMessages.length;

      setOlderMessages(merged);
      setOlderMessagesState({ error: '', loading: false, reachedStart });
    } catch (error) {
      setOlderMessagesState({
        error: getBridgeErrorMessage(error, t('status.loadingError.olderMessages'), t),
        loading: false,
        reachedStart: false,
      });
    } finally {
      loadingOlderRef.current = false;
    }
  }

  async function recoverMissingPrivateGroupKeys(
    group: GroupData,
    nextMessages: ChatMessage[],
    selectedAccount: QdnSelectedAccount,
    actionList: QdnAction[],
    options: { quiet?: boolean } = {},
  ) {
    const missingKeyRequests = getMissingPrivateGroupKeyRequests(nextMessages, group.groupId);

    if (missingKeyRequests.length === 0) {
      setPrivateGroupKeyStatus('');
      setPrivateGroupKeyError('');
      return;
    }

    const canRequestPrivateGroupChatKey = hasAction(actionList, 'REQUEST_PRIVATE_GROUP_CHAT_KEY');
    const canResolvePrivateGroupChatKeyRequests = hasAction(actionList, 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS');
    const newKeyRequests = canRequestPrivateGroupChatKey
      ? missingKeyRequests.filter((request) => {
          const key = getPrivateGroupKeyRecoveryKey(selectedAccount.address, request);

          return !requestedPrivateGroupKeysRef.current.has(key);
        })
      : [];
    const resolveKey = `${selectedAccount.address}:${group.groupId}`;
    const shouldResolveKeyRequests =
      canResolvePrivateGroupChatKeyRequests &&
      (newKeyRequests.length > 0 || !resolvedPrivateGroupKeyRequestsRef.current.has(resolveKey));

    if (newKeyRequests.length === 0 && !shouldResolveKeyRequests) {
      return;
    }

    for (const request of newKeyRequests) {
      requestedPrivateGroupKeysRef.current.add(getPrivateGroupKeyRecoveryKey(selectedAccount.address, request));
    }

    if (shouldResolveKeyRequests) {
      resolvedPrivateGroupKeyRequestsRef.current.add(resolveKey);
    }

    if (!options.quiet) {
      setPrivateGroupKeyStatus(t('status.privateGroupKey.requesting'));
    }

    setPrivateGroupKeyError('');

    try {
      for (const request of newKeyRequests) {
        await requestPrivateGroupChatKey(request, actionList);
      }

      if (shouldResolveKeyRequests) {
        await resolvePrivateGroupChatKeyRequests(group.groupId, actionList);
      }

      if (newKeyRequests.length > 0) {
        setPrivateGroupKeyStatus(t('status.privateGroupKey.requested'));
      } else if (shouldResolveKeyRequests) {
        setPrivateGroupKeyStatus(t('status.privateGroupKey.recoveryChecked'));
      }

      await loadMessages({ group, kind: 'group' }, actionList, {
        accountUnlocked: selectedAccount.isUnlocked,
        quiet: true,
        skipKeyRecovery: true,
      });
    } catch (error) {
      setPrivateGroupKeyError(
        getBridgeErrorMessage(error, t('status.loadingError.privateGroupKeyRecovery'), t),
      );
    }
  }

  async function ensureSelectedAccountUnlocked() {
    if (!account) {
      setWriteError(accountRequiredLabel);
      return null;
    }

    if (account.isUnlocked) {
      return account;
    }

    if (!canRequestUnlock) {
      setWriteError(accountLockedLabel);
      return null;
    }

    setWriteError('');

    try {
      const selectedAccount = normalizeSelectedAccount(
        await qdnRequest<QdnSelectedAccount>({ action: 'UNLOCK_SELECTED_ACCOUNT' }),
      );

      setAccount(selectedAccount);
      setAccountError('');

      return selectedAccount.isUnlocked ? selectedAccount : null;
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.selectedAccount'), t));
      return null;
    }
  }

  async function handleJoinGroup() {
    if (!selectedGroup || !canSubmitJoin) {
      return;
    }

    setJoinPending(true);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      const result = await joinGroup(selectedGroup.groupId);

      trackTransaction({
        action: 'join',
        group: selectedGroup,
        message: selectedGroup.isOpen === false ? t('status.join.request.submitted') : t('status.join.submitted'),
        result,
      });

      await loadAccountData(selectedAccount);
      await loadGroupMembers(selectedGroup);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.join'), t));
    } finally {
      setJoinPending(false);
    }
  }

  async function handleLeaveGroup() {
    if (!selectedGroup || !canSubmitLeave) {
      return;
    }

    setLeavePending(true);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      const result = await leaveGroup(selectedGroup.groupId);

      trackTransaction({
        action: 'leave',
        group: selectedGroup,
        message: t('status.leave.submitted'),
        result,
      });

      await loadAccountData(selectedAccount);
      await loadGroupMembers(selectedGroup);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.leave'), t));
    } finally {
      setLeavePending(false);
    }
  }

  async function handleStartMinting() {
    if (!account || !selectedGroup || !canSubmitStartMinting) {
      return;
    }

    setStartMintingPending(true);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      const result = await startMinting();

      if (result.rewardSharePending) {
        trackTransaction({
          action: 'rewardshare',
          group: selectedGroup,
          message: t('status.minting.authorization.submitted'),
          result,
        });
      }

      await loadMintingStatus(selectedAccount);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.startMinting'), t));
      void loadMintingStatus(account, actions, { quiet: true });
    } finally {
      setStartMintingPending(false);
    }
  }

  async function loadPendingApprovals(groupId: number, options: { quiet?: boolean } = {}) {
    const requestId = pendingApprovalsRequestRef.current + 1;

    pendingApprovalsRequestRef.current = requestId;

    if (!options.quiet) {
      // Clear the previous group's queue while a non-quiet (selection) load runs;
      // quiet refreshes keep the current value to avoid flicker.
      setPendingApprovals({ phase: 'loading', value: emptyPendingApprovals });
    }

    // Vote tally and tip height are best-effort context for the dialog; their
    // failures must not break the pending list, so they are fetched separately.
    void (async () => {
      try {
        const votes = await getGroupApprovalVotes();

        if (pendingApprovalsRequestRef.current === requestId && selectedGroupIdRef.current === groupId) {
          setApprovalVotes({ phase: 'ready', value: votes });
        }
      } catch {
        if (pendingApprovalsRequestRef.current === requestId && selectedGroupIdRef.current === groupId) {
          setApprovalVotes({ error: '', phase: 'error', value: emptyApprovalVotes });
        }
      }
    })();

    void (async () => {
      try {
        const height = await getCurrentBlockHeight();

        if (pendingApprovalsRequestRef.current === requestId && selectedGroupIdRef.current === groupId) {
          setCurrentBlockHeight(typeof height === 'number' ? height : null);
        }
      } catch {
        // Leave the previous height; ETA simply falls back to height-only display.
      }
    })();

    try {
      const value = await getPendingGroupApprovals(groupId);

      if (pendingApprovalsRequestRef.current !== requestId || selectedGroupIdRef.current !== groupId) {
        return;
      }

      setPendingApprovals({ phase: 'ready', value });
    } catch (error) {
      if (pendingApprovalsRequestRef.current !== requestId || selectedGroupIdRef.current !== groupId) {
        return;
      }

      setPendingApprovals({
        error: getBridgeErrorMessage(error, t('status.loadingError.pendingApprovals'), t),
        phase: 'error',
        value: emptyPendingApprovals,
      });
    }
  }

  async function handleGroupApproval(pendingSignature: string, approval: boolean) {
    if (!selectedGroup || !canSubmitGroupApproval) {
      return;
    }

    setApprovalActionSignature(pendingSignature);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      const result = await submitGroupApproval(pendingSignature, approval, selectedGroup.groupId);

      // Optimistic: reflect the just-cast vote until the next reload sees it
      // confirmed on-chain (the tx stays pending until the threshold is met).
      setVotedSignatures((previous) => ({ ...previous, [pendingSignature]: { approval } }));

      trackTransaction({
        action: 'groupApproval',
        group: selectedGroup,
        message: approval ? t('status.approval.vote.submitted') : t('status.approval.oppose.submitted'),
        result,
      });

      await loadPendingApprovals(selectedGroup.groupId);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.submitError.groupApproval'), t));
    } finally {
      setApprovalActionSignature(null);
    }
  }

  async function handleApproveJoinRequest(request: GroupJoinRequest) {
    if (!selectedGroup || !canApproveGroupJoinRequests || !canUseSelectedAccount || approvePendingJoiner) {
      return;
    }

    setApprovePendingJoiner(request.joiner);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      const result = await approveGroupJoinRequest(request.groupId, request.joiner);

      trackTransaction({
        action: 'approve',
        group: selectedGroup,
        joiner: request.joiner,
        message: t('status.approval.submitted'),
        result,
      });

      await loadAdminJoinRequests(selectedAccount);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.approveJoin'), t));
    } finally {
      setApprovePendingJoiner(null);
    }
  }

  function trackTransaction({
    action,
    group,
    joiner,
    message,
    result,
  }: {
    action: TrackedTransaction['action'];
    group: GroupData;
    joiner?: string;
    message: string;
    result: { transactionSignature?: string };
  }) {
    const id = result.transactionSignature || `${action}:${group.groupId}:${Date.now()}`;

    setTrackedTransactions((current) => ({
      ...current,
      [id]: {
        action,
        groupId: group.groupId,
        groupName: getGroupTitle(group, t),
        id,
        joiner,
        message: result.transactionSignature
          ? message
          : `${message}; ${t('status.transaction.waitingForNodeStatus')}`,
        phase: 'pending',
        signature: result.transactionSignature,
      },
    }));
  }

  function startReply(message: ChatMessage) {
    if (!message.signature) {
      return;
    }

    setComposeContext({ kind: 'reply', message });
    composerRef.current?.focus();
  }

  function startEdit(thread: MessageThread) {
    if (!thread.original.signature) {
      return;
    }

    setComposeContext({ kind: 'edit', thread });
    setDraft(decodeChatMessage(thread.latest, t).body);
    composerRef.current?.focus();
  }

  function cancelComposeContext() {
    if (composeContext?.kind === 'edit') {
      setDraft('');
    }

    setComposeContext(null);
  }

  async function handleSendMessage(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedChat || !canSubmitMessage) {
      return;
    }

    const text = draft.trim();
    const chat = selectedChat;
    const context = composeContext;
    let message = text;
    let chatReference: string | undefined;

    if (context?.kind === 'edit') {
      // An edit is a new transaction replacing the original via chatReference;
      // keep the original's reply target so the reply preview survives edits.
      chatReference = context.thread.original.signature ?? undefined;
      message = buildChatMessageText(text, decodeChatMessage(context.thread.original).repliedTo);
    } else if (context?.kind === 'reply') {
      message = buildChatMessageText(text, context.message.signature);
    }

    setSendPending(true);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      if (chat.kind === 'group') {
        await sendChatMessage(chat.group.groupId, message, chatReference);
      } else {
        await sendDirectChatMessage(chat.direct.address, message, chatReference);
      }

      setDraft('');
      setComposeContext(null);
      // Return the feed to the bottom so the just-sent message is in view.
      setSentMessageNonce((nonce) => nonce + 1);
      if (chat.kind === 'direct') {
        // A direct send only touches the conversation list, not membership/
        // minting; refresh just that (quietly) instead of the whole account.
        await loadActiveChats(selectedAccount, actions, { quiet: true });
      }

      await loadMessages(chat, actions, { accountUnlocked: selectedAccount.isUnlocked, quiet: true });
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.sendMessage'), t));
    } finally {
      setSendPending(false);
    }
  }

  async function handleMessageReaction(message: ChatMessage, reaction: string, contentState: boolean) {
    if (!selectedChat || !canComposeMessage || !message.signature) {
      return;
    }

    const chat = selectedChat;
    const pendingKey = getReactionPendingKey(message.signature, reaction);

    setReactionPendingKey(pendingKey);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      const reactionMessage = buildReactionMessageText(reaction, contentState);

      if (chat.kind === 'group') {
        await sendChatMessage(chat.group.groupId, reactionMessage, message.signature);
      } else {
        await sendDirectChatMessage(chat.direct.address, reactionMessage, message.signature);
      }

      if (chat.kind === 'direct') {
        await loadActiveChats(selectedAccount, actions, { quiet: true });
      }

      await loadMessages(chat, actions, { accountUnlocked: selectedAccount.isUnlocked, quiet: true });
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.sendReaction'), t));
    } finally {
      setReactionPendingKey('');
    }
  }

  // Persist the user's last explicit selection so the app reopens on it next time
  // (per account). The provisional General Chat auto-select and restore do not
  // call this, so they never overwrite a real choice.
  function rememberLastChat(chat: SelectedChat) {
    if (account) {
      writeLastChat(account.address, toStoredSelectedChat(chat));
    }
  }

  // Keep directs in the sidebar after their messages expire off the active list.
  // Storage is the source of truth (keyed by account), so a write always targets
  // the right account even when activeChats/state for a prior account lag behind;
  // the visible state updates only while that account is still selected.
  function persistDirects(accountAddress: string, directs: ActiveDirectChat[]) {
    if (directs.length === 0) {
      return;
    }

    const stored = readPersistedDirects(accountAddress);
    let next = stored;

    for (const direct of directs) {
      next = mergePersistedDirect(next, direct.address, direct.name);
    }

    if (next === stored) {
      return;
    }

    writePersistedDirects(accountAddress, next);

    if (currentAccountAddressRef.current === accountAddress) {
      setPersistedDirects(next);
    }
  }

  function rememberDirect(direct: ActiveDirectChat) {
    if (account) {
      persistDirects(account.address, [direct]);
    }
  }

  function selectGroup(group: GroupData) {
    setWriteError('');
    setPrivateGroupKeyStatus('');
    setPrivateGroupKeyError('');
    setDirectLookupError('');
    setComposeContext(null);
    userSelectedChatRef.current = true;
    setSelectedChat({ group, kind: 'group' });
    rememberLastChat({ group, kind: 'group' });
    setMobileChatView(true);
  }

  function selectDirect(direct: ActiveDirectChat) {
    setWriteError('');
    setPrivateGroupKeyStatus('');
    setPrivateGroupKeyError('');
    setDirectLookupError('');
    setComposeContext(null);
    userSelectedChatRef.current = true;
    setSelectedChat({ direct, kind: 'direct' });
    rememberLastChat({ direct, kind: 'direct' });
    rememberDirect(direct);
    setMobileChatView(true);
  }

  // Remove a persisted direct from the sidebar. If it is the open chat, fall back
  // to General Chat and return to the list on narrow screens so the user is not
  // left on a chat that no longer exists; also repoint a saved last-chat that
  // pointed at the removed direct so it does not dangle on the next open.
  function removeDirect(address: string) {
    const accountAddress = account?.address ?? null;
    const generalChat = groups.value.find((group) => isGeneralChatGroup(group)) ?? null;

    if (accountAddress) {
      const stored = readPersistedDirects(accountAddress);
      const next = stored.filter((direct) => direct.address !== address);

      if (next.length !== stored.length) {
        writePersistedDirects(accountAddress, next);
      }

      if (currentAccountAddressRef.current === accountAddress) {
        setPersistedDirects(next);
      }

      const savedChat = readLastChat(accountAddress);

      if (savedChat?.kind === 'direct' && savedChat.direct.address === address && generalChat) {
        writeLastChat(accountAddress, toStoredSelectedChat({ group: generalChat, kind: 'group' }));
      }
    } else {
      setPersistedDirects((current) => current.filter((direct) => direct.address !== address));
    }

    if (selectedChat?.kind === 'direct' && selectedChat.direct.address === address) {
      if (generalChat) {
        setSelectedChat({ group: generalChat, kind: 'group' });
      } else {
        setSelectedChat(null);
      }

      setMobileChatView(false);
    }
  }

  // Narrow-screen "back" control: returns to the group/direct list and dismisses
  // the members overlay. A no-op visually on desktop, where both panes show.
  function showChatList() {
    setMobileChatView(false);
    setMembersOpen(false);
  }

  function toggleGroupSearch() {
    setGroupSearchOpen((current) => !current || search.trim().length > 0);
  }

  function toggleDirectSearch() {
    setDirectSearchOpen((current) => !current || directAddress.trim().length > 0);
  }

  function mentionAccount(target: AccountInfoTarget) {
    const label = getMessageSenderLabel(target, avatarProfiles.get(target.sender));
    const mention = `@${label} `;

    setAccountInfoTarget(null);
    setDraft((current) => {
      if (!current) {
        return mention;
      }

      return /\s$/.test(current) ? `${current}${mention}` : `${current} ${mention}`;
    });
    composerRef.current?.focus();
  }

  async function openDirectFromAccount(address: string, name: string | null) {
    if (!canOpenDirectChat) {
      return;
    }

    if (!(await ensureSelectedAccountUnlocked())) {
      return;
    }

    setAccountInfoTarget(null);
    selectDirect({ address, name: name ?? undefined });
  }

  async function handleOpenDirectChat(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = directAddress.trim();

    if (!value || !canOpenDirectChat || directLookupPending) {
      return;
    }

    if (!(await ensureSelectedAccountUnlocked())) {
      return;
    }

    setWriteError('');
    setDirectLookupError('');

    let address = value;
    let name: string | undefined;

    // Anything that does not look like an address is treated as a registered name
    // and resolved to its owner address so the chat opens for that account.
    if (!looksLikeQortalAddress(value)) {
      setDirectLookupPending(true);

      try {
        const ownerAddress = await getNameOwnerAddress(value);

        if (!ownerAddress) {
          setDirectLookupError(t('status.direct.nameNotFound'));
          return;
        }

        address = ownerAddress;
        name = value;
      } catch (error) {
        setDirectLookupError(getBridgeErrorMessage(error, t('status.loadingError.nameLookup'), t));
        return;
      } finally {
        setDirectLookupPending(false);
      }
    }

    setComposeContext(null);
    setDirectAddress('');
    setDirectSearchOpen(false);
    const direct: ActiveDirectChat = name ? { address, name } : { address };
    userSelectedChatRef.current = true;
    setSelectedChat({ direct, kind: 'direct' });
    rememberLastChat({ direct, kind: 'direct' });
    rememberDirect(direct);
    setMobileChatView(true);
  }

  async function connectSelectedAccount(actionList = actions) {
    try {
      const selectedAccount = normalizeSelectedAccount(
        await qdnRequest<QdnSelectedAccount>({ action: 'GET_SELECTED_ACCOUNT' }),
      );
      setAccount(selectedAccount);
      setAccountError('');
      void loadAccountData(selectedAccount, actionList);
      return selectedAccount;
    } catch (error) {
      setAccount(null);
      setAccountError(getBridgeErrorMessage(error, t('status.loadingError.selectedAccount'), t));
      setMemberGroups({ phase: 'ready', value: emptyGroups });
      setAccountJoinRequests({ phase: 'ready', value: emptyJoinRequests });
      setAdminJoinRequests({ phase: 'ready', value: emptyAdminJoinRequests });
      setActiveChats({ phase: 'ready', value: emptyActiveChats });
      setMintingStatus({ phase: 'ready', value: null });
      return null;
    }
  }

  async function initializeSession() {
    setBridge({ phase: 'loading', value: bridge.value });
    let nextActions = bridge.value.actions;

    try {
      const nextBridge = await getBridgeState();
      nextActions = nextBridge.actions;
      setBridge({ phase: 'ready', value: nextBridge });
    } catch (error) {
      setBridge({
        error: getBridgeErrorMessage(error, t('status.loadingError.bridge'), t),
        phase: 'error',
        value: bridge.value,
      });
    }

    void loadGroups(search, nextActions);
    void connectSelectedAccount(nextActions);
  }

  async function refreshAfterTrackedTransaction(transaction: TrackedTransaction) {
    await loadGroups(search);

    if (account) {
      await loadAccountData(account);
    }

    if (selectedGroup?.groupId === transaction.groupId) {
      await loadGroupMembers(selectedGroup);
    }

    if (transaction.action === 'groupApproval' && selectedGroupId === transaction.groupId) {
      await loadPendingApprovals(transaction.groupId);
    }
  }

  useEffect(() => {
    void initializeSession();
  }, []);

  useEffect(() => {
    if (!account || selectedGroupId === null || !isSelectedDevGroup || !isApproverOfSelectedGroup) {
      pendingApprovalsRequestRef.current += 1;
      setPendingApprovals(createState(emptyPendingApprovals));
      setApprovalVotes(createState(emptyApprovalVotes));
      setVotedSignatures({});
      setApprovalModalOpen(false);
      return;
    }

    // Optimistic votes belong to the previous group; clear them before loading.
    setVotedSignatures({});
    void loadPendingApprovals(selectedGroupId);
  }, [account?.address, selectedGroupId, isSelectedDevGroup, isApproverOfSelectedGroup]);

  // Reconcile optimistic votes with on-chain truth: once the confirmed tally
  // reflects a vote (or its transaction is no longer pending), drop the optimistic
  // entry so computeApprovalProgress.myVote becomes authoritative. This avoids a
  // stale "Vote submitted" label sticking forever if a vote is dropped/orphaned.
  useEffect(() => {
    if (!approvalProgressReady) {
      return;
    }

    setVotedSignatures((previous) => {
      const next: Record<string, { approval: boolean }> = {};
      let changed = false;

      for (const [signature, vote] of Object.entries(previous)) {
        const stillPending = pendingApprovals.value.some((transaction) => transaction.signature === signature);
        const confirmed = approvalProgressBySignature.get(signature)?.myVote != null;

        if (stillPending && !confirmed) {
          next[signature] = vote;
        } else {
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [approvalProgressReady, approvalProgressBySignature, pendingApprovals.value]);

  useEffect(() => {
    if (isGroupSearchVisible) {
      groupSearchInputRef.current?.focus();
    }
  }, [isGroupSearchVisible]);

  useEffect(() => {
    if (isDirectFormVisible) {
      directSearchInputRef.current?.focus();
    }
  }, [isDirectFormVisible]);

  // Baseline the read watermark for any chat the first time its activity is seen,
  // so pre-existing history is not flagged as unread. Established entries are left
  // alone so genuinely new activity can surface as unread.
  useEffect(() => {
    setLastReadByGroupId((current) => {
      let next: Map<number, number> | null = null;

      for (const [groupId, timestamp] of groupActivityById) {
        if (!current.has(groupId)) {
          next ??= new Map(current);
          next.set(groupId, timestamp);
        }
      }

      return next ?? current;
    });
  }, [groupActivityById]);

  // Announce only genuinely new incoming messages to screen readers: a message
  // newer than the last seen tail, in the SAME chat already on screen (so chat
  // switches and first loads are silent), not sent by the current account, and
  // an actual text message (reactions/edits/system frames are skipped).
  useEffect(() => {
    if (messages.phase !== 'ready') {
      return;
    }

    const list = messages.value;
    const newest = list.length > 0 ? list[list.length - 1] : null;
    const signature = newest ? newest.signature ?? `${newest.timestamp}-${newest.sender}` : '';
    const previous = lastAnnouncedRef.current;

    if (
      newest &&
      previous.chatKey === messagesChatKey &&
      previous.signature &&
      signature !== previous.signature &&
      newest.sender !== account?.address &&
      decodeChatMessage(newest, t).kind === 'text'
    ) {
      setLiveAnnouncement(`${getMessageSenderLabel(newest, undefined)}: ${getMessageSnippet(newest, t)}`);
    }

    lastAnnouncedRef.current = { chatKey: messagesChatKey, signature };
  }, [messages, messagesChatKey, account?.address, t]);

  useEffect(() => {
    setLastReadByAddress((current) => {
      let next: Map<string, number> | null = null;

      for (const [address, timestamp] of directActivityByAddress) {
        if (!current.has(address)) {
          next ??= new Map(current);
          next.set(address, timestamp);
        }
      }

      return next ?? current;
    });
  }, [directActivityByAddress]);

  // Mark the open chat read once its messages are shown, and keep it read as new
  // activity arrives while it stays open (so reading clears unread, not just the
  // initial click).
  useEffect(() => {
    // Require at least one rendered message: a locked / read-only private chat
    // reports its messages ready but empty, and must not be silently marked read.
    if (!selectedChat || !hasSelectedMessages || messages.value.length === 0) {
      return;
    }

    if (selectedChat.kind === 'group') {
      const groupId = selectedChat.group.groupId;
      const timestamp = groupActivityById.get(groupId);

      if (typeof timestamp === 'number') {
        setLastReadByGroupId((current) =>
          (current.get(groupId) ?? -1) >= timestamp ? current : new Map(current).set(groupId, timestamp),
        );
      }
    } else {
      const address = selectedChat.direct.address;
      const timestamp = directActivityByAddress.get(address);

      if (typeof timestamp === 'number') {
        setLastReadByAddress((current) =>
          (current.get(address) ?? -1) >= timestamp ? current : new Map(current).set(address, timestamp),
        );
      }
    }
  }, [selectedChat, hasSelectedMessages, messages.value, groupActivityById, directActivityByAddress]);

  useEffect(() => {
    lastReadByGroupIdRef.current = lastReadByGroupId;
  }, [lastReadByGroupId]);

  useEffect(() => {
    lastReadByAddressRef.current = lastReadByAddress;
  }, [lastReadByAddress]);

  // Snapshot the read watermark for the chat being opened so the "new messages"
  // divider can sit above the first unread message. Keyed on the chat only, so
  // it captures the pre-open watermark and stays frozen as new messages arrive.
  useEffect(() => {
    if (!selectedChat) {
      setUnreadDividerTimestamp(null);
      setUnreadDividerCeiling(null);
      return;
    }

    const watermark =
      selectedChat.kind === 'group'
        ? lastReadByGroupIdRef.current.get(selectedChat.group.groupId)
        : lastReadByAddressRef.current.get(selectedChat.direct.address);

    setUnreadDividerTimestamp(typeof watermark === 'number' ? watermark : null);
    // Freeze the upper bound at the open moment so live/own messages stay below it.
    setUnreadDividerCeiling(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatKey]);

  // While the members panel is a modal overlay (narrow screens), close it on
  // Escape and move focus into it, restoring focus to the toggle on dismissal.
  useEffect(() => {
    if (!(membersOpen && isNarrowLayout && showGroupMembers)) {
      return undefined;
    }

    const toggle = membersToggleRef.current;

    membersCloseRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMembersOpen(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      toggle?.focus();
    };
  }, [membersOpen, isNarrowLayout, showGroupMembers]);

  useEffect(() => {
    loadedGroupActivityRef.current = loadedGroupActivityById;
  }, [loadedGroupActivityById]);

  useEffect(() => {
    loadedDirectActivityRef.current = loadedDirectActivityByAddress;
  }, [loadedDirectActivityByAddress]);

  useEffect(() => {
    setLoadedDirectActivityByAddress(new Map());
    // Restore this account's read watermarks so unread state survives reloads;
    // unseen groups/directs still get baselined to "read" by the effects below.
    const watermarks = account ? readReadWatermarks(account.address) : null;
    skipWatermarkPersistRef.current = true;
    setLastReadByGroupId(watermarks?.groups ?? new Map());
    setLastReadByAddress(watermarks?.directs ?? new Map());
    scrollPositionsRef.current.clear();
    requestedPrivateGroupKeysRef.current.clear();
    resolvedPrivateGroupKeyRequestsRef.current.clear();
    setPrivateGroupKeyStatus('');
    setPrivateGroupKeyError('');
    setDirectLookupError('');
    // A new account restores its own last chat, regardless of the prior choice.
    userSelectedChatRef.current = false;
  }, [account?.address]);

  // Persist read watermarks as they advance. Runs after the load effect above, so
  // on an account switch it skips the transitional render (stale maps) once and
  // then writes the freshly loaded/advanced watermarks under the current account.
  useEffect(() => {
    if (!account) {
      return;
    }

    if (skipWatermarkPersistRef.current) {
      skipWatermarkPersistRef.current = false;
      return;
    }

    writeReadWatermarks(account.address, { directs: lastReadByAddress, groups: lastReadByGroupId });
  }, [account, lastReadByGroupId, lastReadByAddress]);

  // Load this account's persisted direct chats from storage.
  useEffect(() => {
    setPersistedDirects(account ? readPersistedDirects(account.address) : []);
  }, [account?.address]);

  // Reopen on the account's last-selected chat (once per account), overriding the
  // provisional General Chat default. Skips if the user already picked a chat for
  // this account; falls back to General Chat when nothing usable is saved (the
  // account-switch path does not re-run the group auto-select that mount uses).
  useEffect(() => {
    if (!account || restoredForAccountRef.current === account.address) {
      return;
    }

    restoredForAccountRef.current = account.address;

    if (userSelectedChatRef.current) {
      return;
    }

    const saved = readLastChat(account.address);

    if (saved?.kind === 'direct') {
      setSelectedChat({ direct: saved.direct, kind: 'direct' });
      return;
    }

    if (saved?.kind === 'group') {
      setSelectedChat({ group: saved.group, kind: 'group' });
      return;
    }

    // Nothing saved: fall back to General Chat when it is loaded, otherwise leave
    // the mount-time group auto-select to pick it once groups arrive.
    const generalChat = groups.value.find((group) => isGeneralChatGroup(group)) ?? null;

    if (generalChat) {
      setSelectedChat({ group: generalChat, kind: 'group' });
    }
  }, [account?.address]);

  useEffect(() => {
    if (groups.value.length === 0) {
      return undefined;
    }

    let isDisposed = false;
    let isHydrating = false;

    // Hydrate every listed group, not just readable ones: closed groups the user
    // is not a member of still expose message timestamps (without decryption), so
    // their sidebar activity + unread dot can surface a new message has arrived.
    async function hydrateGroupActivity(refresh: boolean) {
      if (isHydrating) {
        // A prior sweep is still in flight; skip so passes do not pile up.
        return;
      }

      isHydrating = true;

      // The open group has its own live socket; skip it to avoid redundant reads.
      const openGroupId = selectedGroupIdRef.current;

      try {
        for (const group of groups.value) {
          if (isDisposed) {
            return;
          }

          if (group.groupId === openGroupId) {
            continue;
          }

          // First pass only fills gaps; the periodic refresh re-reads known groups
          // so non-member / browsed groups (off the active-chats stream) stay live.
          if (!refresh && loadedGroupActivityRef.current.has(group.groupId)) {
            continue;
          }

          try {
            const nextMessages = await getGroupMessages(group, actions, {
              decryptPrivate: shouldDecryptGroupMessages(group, {
                canReadPrivateGroupChat,
                isAccountUnlocked,
                isGroupMembershipConfirmed: memberGroups.phase === 'ready',
                isJoinedGroup: joinedIds.has(group.groupId),
              }),
            });

            if (isDisposed) {
              return;
            }

            setLoadedGroupActivityById((current) => mergeActivityTimestamp(current, group.groupId, nextMessages));
          } catch {
            // Some closed groups cannot expose history in the current Home/Core context.
          }
        }
      } finally {
        isHydrating = false;
      }
    }

    void hydrateGroupActivity(false);

    // Refresh on a slow cadence (only while the tab is visible) so the indicator
    // keeps up for groups the active-chats websocket does not cover.
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      void hydrateGroupActivity(true);
    }, 30000);

    return () => {
      isDisposed = true;
      window.clearInterval(interval);
    };
  }, [actionsKey, canReadPrivateGroupChat, groups.value, isAccountUnlocked, joinedIds, memberGroups.phase]);

  useEffect(() => {
    const directs = activeChats.value.direct ?? [];

    if (!isAccountUnlocked || !canReadPrivateDirectChat || directs.length === 0) {
      return undefined;
    }

    let isDisposed = false;

    async function hydrateDirectActivity() {
      for (const direct of directs) {
        if (isDisposed || loadedDirectActivityRef.current.has(direct.address)) {
          continue;
        }

        try {
          const nextMessages = await getDirectMessages(direct.address, actions);

          if (isDisposed) {
            return;
          }

          setLoadedDirectActivityByAddress((current) => mergeActivityTimestamp(current, direct.address, nextMessages));
        } catch {
          // Direct history is optional in older Home/Core bridge contexts.
        }
      }
    }

    void hydrateDirectActivity();

    return () => {
      isDisposed = true;
    };
  }, [actionsKey, activeChats.value.direct, canReadPrivateDirectChat, isAccountUnlocked]);

  useEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  useEffect(() => {
    const language = normalizeLanguage(displaySettings.language);

    document.documentElement.lang = language ?? 'en';
    document.title = t('app.title');
  }, [displaySettings.language, t]);

  useEffect(() => {
    function handleHostMessage(event: MessageEvent) {
      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);

      if (isSelectedAccountChangedMessage(event.data)) {
        void connectSelectedAccount(actions);
      }
    }

    window.addEventListener('message', handleHostMessage);

    return () => window.removeEventListener('message', handleHostMessage);
  }, [actionsKey]);

  useEffect(() => {
    const pendingTransactions = Object.values(trackedTransactions).filter(
      (transaction) => transaction.phase === 'pending' && transaction.signature,
    );

    if (pendingTransactions.length === 0) {
      return undefined;
    }

    let isDisposed = false;

    async function checkPendingTransactions() {
      for (const transaction of pendingTransactions) {
        if (!transaction.signature) {
          continue;
        }

        try {
          const status = await getTransactionStatus(transaction.signature);

          if (isDisposed) {
            return;
          }

          if (typeof status.blockHeight === 'number' && status.blockHeight > 0) {
            setTrackedTransactions((current) => ({
              ...current,
              [transaction.id]: {
                ...transaction,
                message:
                  transaction.action === 'groupApproval'
                    ? t('status.approval.transaction.confirmed')
                    : transaction.action === 'approve'
                    ? t('status.approval.confirmed')
                    : transaction.action === 'rewardshare'
                      ? t('status.minting.authorization.confirmed')
                      : transaction.action === 'leave'
                        ? t('status.leave.transaction.confirmed')
                        : t('status.join.transaction.confirmed'),
                phase: 'confirmed',
              },
            }));
            void refreshAfterTrackedTransaction(transaction);
          }
        } catch (error) {
          if (isDisposed) {
            return;
          }

          const message = getBridgeErrorMessage(error, t('status.loadingError.transactionStatus'), t);

          if (!/TRANSACTION_UNKNOWN|transaction unknown|HTTP 404/i.test(message)) {
            setTrackedTransactions((current) => ({
              ...current,
              [transaction.id]: {
                ...transaction,
                message,
                phase: 'failed',
              },
            }));
          }
        }
      }
    }

    void checkPendingTransactions();
    const interval = window.setInterval(() => {
      void checkPendingTransactions();
    }, 5000);

    return () => {
      isDisposed = true;
      window.clearInterval(interval);
    };
  }, [Object.values(trackedTransactions).map((transaction) => `${transaction.id}:${transaction.phase}`).join('|')]);

  useEffect(() => {
    // A new conversation starts with no paged-in history; the live tail reloads
    // below and decides (from its page size) whether older history may exist.
    setOlderMessages(emptyMessages);
    setOlderMessagesState({ error: '', loading: false, reachedStart: true });
    loadingOlderRef.current = false;

    if (!selectedChat) {
      setMessagesChatKey('');
      setMessages({ phase: 'ready', value: emptyMessages });
      setGroupMembers({ phase: 'ready', value: emptyMembers });
      return undefined;
    }

    if (selectedChat.kind === 'group') {
      void loadGroupMembers(selectedChat.group);
    } else {
      setGroupMembers({ phase: 'ready', value: emptyMembers });
    }

    if (selectedChat.kind === 'group' && selectedChat.group.isOpen === false && !shouldDecryptSelectedGroupMessages) {
      void loadMessages(selectedChat);
      return undefined;
    }

    if (selectedChat.kind !== 'group' || selectedChat.group.isOpen === false) {
      // Direct and closed-group chats have no public websocket; poll quietly
      // so newly received messages show up without a manual refresh.
      const chat = selectedChat;

      void loadMessages(chat);

      const interval = window.setInterval(() => {
        void loadMessages(chat, actions, { quiet: true });
      }, 15000);

      return () => window.clearInterval(interval);
    }

    const chat = selectedChat;
    const chatKey = getSelectedChatKey(chat);
    let socket: WebSocket | null = null;
    let reconnectTimeout = 0;
    let isDisposed = false;
    let receivedInitialMessages = false;
    let usedRestFallback = false;

    setMessagesChatKey('');
    setMessages({ phase: 'loading', value: messages.value });

    function connect() {
      if (isDisposed) {
        return;
      }

      socket = new WebSocket(buildGroupMessagesWebSocketUrl(chat.group.groupId));

      socket.addEventListener('message', (event) => {
        try {
          const nextMessages = parseChatMessages(event.data);

          setLoadedGroupActivityById((current) => mergeActivityTimestamp(current, chat.group.groupId, nextMessages));

          if (!receivedInitialMessages) {
            receivedInitialMessages = true;
            setMessagesChatKey(chatKey);
            setMessages({ phase: 'ready', value: sortMessagesByTimestamp(nextMessages) });
            // Older history can only exist if this first window filled the cap.
            setOlderMessagesState({
              error: '',
              loading: false,
              reachedStart: nextMessages.length < DEFAULT_LIST_LIMIT,
            });
            return;
          }

          // Reconnects resend the initial batch; merging dedupes by signature.
          setMessagesChatKey(chatKey);
          setMessages((current) => ({
            phase: 'ready',
            value: mergeMessages(current.value, nextMessages),
          }));
        } catch (error) {
          setMessagesChatKey('');
          setMessages({
            error: getBridgeErrorMessage(error, t('status.loadingError.readLiveMessages'), t),
            phase: 'error',
            value: messages.value,
          });
        }
      });

      socket.addEventListener('close', () => {
        if (isDisposed) {
          return;
        }

        if (!receivedInitialMessages) {
          // No websocket (e.g. browser dev against a REST-only node): fall back
          // to REST, quietly after the first load so the list does not flicker.
          void loadMessages(chat, actions, { quiet: usedRestFallback });
          usedRestFallback = true;
        }

        reconnectTimeout = window.setTimeout(connect, 5000);
      });
    }

    connect();

    return () => {
      isDisposed = true;
      window.clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }, [selectedChatKey, actionsKey, isAccountUnlocked, selectedClosedGroupReadKey]);

  useEffect(() => {
    if (!account) {
      return undefined;
    }

    const address = account.address;
    let socket: WebSocket | null = null;
    let reconnectTimeout = 0;
    let isDisposed = false;

    function handleMessage(event: MessageEvent) {
      try {
        const nextActiveChats = parseActiveChats(event.data);

        setActiveChats((current) => ({
          phase: 'ready',
          value: {
            ...current.value,
            groups: nextActiveChats.groups ?? current.value.groups,
          },
        }));

        // The public stream's group entries carry live timestamps; fold them in
        // as an activity floor too so the sidebar indicator survives a stream
        // that later drops a group from its active list.
        const groupActivity = nextActiveChats.groups ?? [];

        if (groupActivity.length > 0) {
          setLoadedGroupActivityById((currentActivity) => {
            let next: Map<number, number | null> | null = null;

            for (const group of groupActivity) {
              if (typeof group.timestamp !== 'number') {
                continue;
              }

              if (group.timestamp > (currentActivity.get(group.groupId) ?? Number.NEGATIVE_INFINITY)) {
                next ??= new Map(currentActivity);
                next.set(group.groupId, group.timestamp);
              }
            }

            return next ?? currentActivity;
          });
        }

        // The public stream's direct entries lack decrypted names, so they do not
        // replace the decrypted direct list; their timestamps are still folded in
        // as a live activity signal so a new inbound direct message can surface as
        // unread without the chat being opened.
        const directActivity = nextActiveChats.direct ?? [];

        if (directActivity.length > 0) {
          setLoadedDirectActivityByAddress((currentActivity) => {
            let next: Map<string, number | null> | null = null;

            for (const direct of directActivity) {
              if (typeof direct.timestamp !== 'number') {
                continue;
              }

              if (direct.timestamp > (currentActivity.get(direct.address) ?? Number.NEGATIVE_INFINITY)) {
                next ??= new Map(currentActivity);
                next.set(direct.address, direct.timestamp);
              }
            }

            return next ?? currentActivity;
          });
        }
      } catch {
        // Keep the last active-chat snapshot.
      }
    }

    // The active-chats stream is the sidebar's only live signal, so reconnect on
    // drop (idle timeout, network blip) the way the group-message socket does —
    // otherwise unread indicators silently stop updating after the first close.
    function connect() {
      if (isDisposed) {
        return;
      }

      socket = new WebSocket(buildActiveChatsWebSocketUrl(address));
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', () => {
        if (isDisposed) {
          return;
        }

        reconnectTimeout = window.setTimeout(connect, 5000);
      });
    }

    connect();

    return () => {
      isDisposed = true;
      window.clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }, [account?.address]);

  useEffect(() => {
    if (!account) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadAccountJoinRequests(account, actions, { quiet: true });
      void loadAdminJoinRequests(account, actions, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [account?.address, actionsKey]);

  useEffect(() => {
    if (!selectedGroup || isGeneralChatGroup(selectedGroup)) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadGroupMembers(selectedGroup, actions, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [selectedGroupId, actionsKey]);

  useEffect(() => {
    if (!account || selectedGroupId === null || !isSelectedDevGroup || !isApproverOfSelectedGroup) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadPendingApprovals(selectedGroupId, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [account?.address, selectedGroupId, isSelectedDevGroup, isApproverOfSelectedGroup]);

  function renderJoinGroupButton() {
    if (!(
      selectedChat?.kind === 'group' &&
      selectedGroupId !== null &&
      selectedGroupId > 0 &&
      isSelectedGroupMembershipConfirmed &&
      !isConfirmedJoinedGroup &&
      canJoinGroup
    )) {
      return null;
    }

    return (
      <button
        className="button button--secondary"
        disabled={!canSubmitJoin}
        onClick={() => void handleJoinGroup()}
        title={
          hasPendingJoinTransaction
            ? t('button.join.transaction.pending')
            : hasPendingJoinRequest
              ? t('button.join.request.pending')
              : canUseSelectedAccount && canJoinGroup
                ? t('button.join')
                : groupJoinUnavailableLabel
        }
        type="button"
      >
        {joinPending
          ? t('button.joining')
          : hasPendingJoinTransaction
            ? t('button.join.pending')
            : hasPendingJoinRequest
              ? t('button.join.request.pending')
              : t('button.join')}
      </button>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar__title">
          <BrandMark />
          <h1>{t('app.title')}</h1>
        </div>
        <div className="topbar__account">
          <AccountSummary
            account={account}
            error={accountError}
            isHomeBridge={bridge.value.isHomeBridge}
            onConnect={() => void connectSelectedAccount()}
            onOpenAvatar={setAvatarLightboxImage}
            profile={account ? avatarProfiles.get(account.address) : undefined}
            t={t}
          />
        </div>
      </header>

      <section
        className={`layout${showGroupMembers && membersOpen ? ' layout--members-open' : ''}${
          mobileChatView ? ' layout--mobile-chat' : ''
        }`}
      >
        <aside className="sidebar" aria-label={t('aria.navigation')} inert={isMembersOverlay || undefined}>
          <section className="panel">
            <div className="panel__header">
              <h2>{t('label.common.groups')}</h2>
              <div className="panel__header-actions">
                {hasUnreadGroups ? (
                  <span
                    aria-label={t('aria.unreadGroups')}
                    className="panel__unread-dot"
                    role="img"
                    title={t('aria.unreadGroups')}
                  />
                ) : null}
                <span className="panel__count">{groups.value.length}</span>
                <button
                  aria-expanded={isGroupSearchVisible}
                  aria-label={t('label.searchGroups')}
                  className="icon-button"
                  onClick={toggleGroupSearch}
                  title={t('label.searchGroups')}
                  type="button"
                >
                  <SearchIcon />
                </button>
              </div>
            </div>
            {isGroupSearchVisible ? (
              <form
                className="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadGroups(search);
                }}
              >
                <input
                  aria-label={t('label.searchGroups')}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('placeholder.searchGroups')}
                  ref={groupSearchInputRef}
                  value={search}
                />
                <button className="button" type="submit">
                  {t('button.search')}
                </button>
              </form>
            ) : null}
            {groups.phase === 'error' ? <p className="error">{groups.error}</p> : null}
            {groups.phase === 'loading' ? (
              <LoadingRows count={5} label={t('label.loading')} />
            ) : (
              <GroupList
                activityByGroupId={groupActivityById}
                groups={sortedGroups}
                memberCountsByGroupId={syntheticMemberCountsByGroupId}
                onSelect={selectGroup}
                selectedGroupId={selectedGroupId}
                t={t}
                unreadGroupIds={unreadGroupIds}
                now={now}
              />
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>{t('label.common.direct')}</h2>
              <div className="panel__header-actions">
                {hasUnreadDirect ? (
                  <span
                    aria-label={t('aria.unreadDirect')}
                    className="panel__unread-dot"
                    role="img"
                    title={t('aria.unreadDirect')}
                  />
                ) : null}
                <span className="panel__count">{mergedDirects.length}</span>
                <button
                  aria-expanded={isDirectFormVisible}
                  aria-label={t('label.newDirectChat')}
                  className="icon-button"
                  onClick={toggleDirectSearch}
                  title={t('label.newDirectChat')}
                  type="button"
                >
                  <PlusIcon />
                </button>
              </div>
            </div>
            {isDirectFormVisible ? (
              <form className="search" onSubmit={handleOpenDirectChat}>
                <input
                  aria-label={t('placeholder.directNameOrAddress')}
                  disabled={!canOpenDirectChat || directLookupPending}
                  onChange={(event) => {
                    setDirectAddress(event.target.value);
                    setDirectLookupError('');
                  }}
                  placeholder={t('placeholder.directNameOrAddress')}
                  ref={directSearchInputRef}
                  value={directAddress}
                />
                <button
                  className="button"
                  disabled={!canOpenDirectChat || !directAddress.trim() || directLookupPending}
                  title={canOpenDirectChat ? t('action.directTooltip') : directAccessUnavailableLabel}
                  type="submit"
                >
                  {directLookupPending ? t('button.opening') : t('button.open')}
                </button>
              </form>
            ) : null}
            {directLookupError ? <p className="error">{directLookupError}</p> : null}
            {activeChats.phase === 'error' ? <p className="error">{activeChats.error}</p> : null}
            {!canOpenDirectChat ? <p className="muted">{directAccessUnavailableLabel}</p> : null}
            {canOpenDirectChat && !canLoadPrivateDirectChats ? <p className="muted">{directListUnavailableLabel}</p> : null}
            {activeChats.phase === 'loading' ? (
              <LoadingRows count={3} label={t('label.loading')} />
            ) : (
              <DirectList
                activityByAddress={directActivityByAddress}
                canOpen={canOpenDirectChat}
                directs={mergedDirects}
                onRemove={removeDirect}
                onSelect={selectDirect}
                removableAddresses={removableDirectAddresses}
                selectedAddress={selectedDirectAddress}
                t={t}
                unreadAddresses={unreadDirectAddresses}
                now={now}
              />
            )}
          </section>
        </aside>

        <section className="chat-pane" aria-label={t('aria.selectedChat')} inert={isMembersOverlay || undefined}>
          <div className="chat-pane__header">
            <button
              aria-label={t('button.back')}
              className="chat-pane__back"
              onClick={showChatList}
              title={t('button.back')}
              type="button"
            >
              <BackIcon />
            </button>
            <div className="chat-pane__heading">
              <h2 className="chat-pane__title">
                {selectedChat?.kind === 'group' &&
                !isGeneralChatGroup(selectedChat.group) &&
                selectedChat.group.isOpen === false ? (
                  <span
                    aria-label={t('label.group.closed')}
                    className="chat-pane__title-lock"
                    role="img"
                    title={t('label.group.closed')}
                  >
                    <LockIcon />
                  </span>
                ) : null}
                <span className="chat-pane__title-text">
                {selectedChat
                  ? selectedChat.kind === 'group'
                    ? getGroupTitle(selectedChat.group, t)
                    : getDirectTitle(selectedChat.direct)
                  : t('label.chat.select')}
                </span>
              </h2>
              {selectedChat?.kind === 'group' && selectedChat.group.description?.trim() ? (
                <p>{selectedChat.group.description.trim()}</p>
              ) : null}
              {selectedChat?.kind === 'direct' ? (
                <p>
                  {canReadPrivateDirectChat ? t('group.meta.directPrivateRead') : t('group.meta.direct')} /{' '}
                  {selectedChat.direct.address}
                </p>
              ) : null}
            </div>
            <div className="chat-pane__actions">
              {selectedChat?.kind === 'group' ? (
                <button
                  aria-controls="members-drawer"
                  aria-expanded={membersOpen}
                  className="button button--secondary"
                  onClick={() => setMembersOpen((current) => !current)}
                  ref={membersToggleRef}
                  type="button"
                >
                  {membersOpen
                    ? t('button.hideMembers')
                    : `${selectedGroupMembersLabel} (${selectedGroupMembers.length})`}
                </button>
              ) : null}
              {selectedChat?.kind === 'direct' &&
              selectedDirectAddress !== null &&
              removableDirectAddresses.has(selectedDirectAddress) ? (
                <button
                  className="button button--secondary"
                  onClick={() => removeDirect(selectedDirectAddress)}
                  title={t('action.removeDirectChat', { name: getDirectTitle(selectedChat.direct) })}
                  type="button"
                >
                  {t('button.removeChat')}
                </button>
              ) : null}
              {renderJoinGroupButton()}
              {selectedChat?.kind === 'group' && selectedGroupId !== null && selectedGroupId > 0 && isConfirmedJoinedGroup && canLeaveGroup ? (
                <button
                  className="button button--secondary"
                  disabled={!canSubmitLeave}
                  onClick={() => void handleLeaveGroup()}
                  title={
                    hasPendingLeaveTransaction
                      ? t('button.leave.transaction.pending')
                      : canUseSelectedAccount && canLeaveGroup
                        ? t('button.leave')
                        : groupLeaveUnavailableLabel
                  }
                  type="button"
                >
                  {leavePending
                    ? t('button.leaving')
                    : hasPendingLeaveTransaction
                      ? t('button.leave.pending')
                      : t('button.leave')}
                </button>
              ) : null}
              {showMintingControls && accountMintingStatus && accountMintingStatus.isMinting !== true ? (
                <button
                  className="button button--secondary"
                  disabled={!canSubmitStartMinting}
                  onClick={() => void handleStartMinting()}
                  title={startMintingTitle}
                  type="button"
                >
                  {startMintingPending
                    ? t('button.startingMinting')
                    : hasPendingRewardShareTransaction
                      ? t('button.authorization.pending')
                      : t('button.startMinting')}
                </button>
              ) : null}
              {showApprovalControls && pendingApprovalCount > 0 ? (
                <button
                  className="button button--secondary"
                  onClick={() => setApprovalModalOpen(true)}
                  title={t('button.pendingApproval.title')}
                  type="button"
                >
                  {t('button.pendingApproval')} ({pendingApprovalCount})
                </button>
              ) : null}
            </div>
          </div>

          {messages.phase === 'error' ? <p className="error">{messages.error}</p> : null}
          {writeError ? <p className="error">{writeError}</p> : null}
          {privateGroupKeyError ? <p className="error">{privateGroupKeyError}</p> : null}
          {privateGroupKeyStatus ? <p className="muted">{privateGroupKeyStatus}</p> : null}
          {accountJoinRequests.phase === 'error' ? <p className="error">{accountJoinRequests.error}</p> : null}
          {adminJoinRequests.phase === 'error' ? <p className="error">{adminJoinRequests.error}</p> : null}
          {showMintingControls && mintingStatus.phase === 'error' ? <p className="error">{mintingStatus.error}</p> : null}
          {showApprovalControls && pendingApprovals.phase === 'error' ? (
            <p className="error">{pendingApprovals.error}</p>
          ) : null}
          {selectedDirectHistoryUnavailable ? <p className="muted">{directReadUnavailableLabel}</p> : null}
          {selectedClosedGroupHistoryUnavailable ? (
            <p className="muted">{closedGroupHistoryUnavailableLabel}</p>
          ) : null}
          <div aria-atomic="true" aria-live="polite" className="sr-only" role="log">
            {liveAnnouncement}
          </div>
          {messages.phase === 'loading' ? (
            <LoadingRows count={4} label={t('label.loading')} />
          ) : (
            <MessageList
              avatarProfiles={avatarProfiles}
              canCompose={canComposeMessage}
              canOpenDocumentViewer={canOpenDocumentViewer}
              canOpenMediaPlayer={canOpenMediaPlayer}
              canSaveQdnResource={canSaveQdnResource}
              initialScrollTop={scrollPositionsRef.current.get(selectedChatKey)}
              messages={combinedMessages}
              olderMessagesError={olderMessagesState.error}
              olderMessagesReachedStart={olderMessagesState.reachedStart}
              olderMessagesLoading={olderMessagesState.loading}
              onEdit={startEdit}
              onLoadOlder={() => void loadOlderMessages()}
              onOpenAccount={setAccountInfoTarget}
              onOpenAvatar={setAvatarLightboxImage}
              onReact={(message, reaction, contentState) => void handleMessageReaction(message, reaction, contentState)}
              onReply={startReply}
              onScrollPositionChange={(chatKey, scrollTop) => {
                scrollPositionsRef.current.set(chatKey, scrollTop);
              }}
              now={now}
              pendingReactionKey={reactionPendingKey}
              scrollChatKey={selectedChatKey}
              selfAddress={account?.address ?? null}
              sentMessageNonce={sentMessageNonce}
              systemMessages={selectedTransactions}
              t={t}
              unreadDividerCeiling={unreadDividerCeiling}
              unreadDividerTimestamp={unreadDividerTimestamp}
            />
          )}

          {publicNodeSendNotice ? (
            <div aria-live="polite" className="composer composer--notice">
              <p>{publicNodeSendNotice}</p>
            </div>
          ) : showGroupComposerNotice ? (
            <div aria-live="polite" className="composer composer--notice">
              <p>{groupComposerNotice}</p>
              {isSelectedGroupMembershipConfirmed ? renderJoinGroupButton() : null}
            </div>
          ) : (
            <form className="composer" onSubmit={(event) => void handleSendMessage(event)}>
              {composeContext ? (
                <div className="composer__context">
                  <div className="composer__context-text">
                    <strong>
                      {composeContext.kind === 'edit'
                        ? t('label.composer.editing')
                        : t('label.composer.replyingTo', {
                            name: getMessageSenderLabel(
                              composeContext.message,
                              avatarProfiles.get(composeContext.message.sender),
                            ),
                          })}
                    </strong>
                    <span>
                      {getMessageSnippet(
                        composeContext.kind === 'edit' ? composeContext.thread.latest : composeContext.message,
                        t,
                      )}
                    </span>
                  </div>
                  <button className="button button--secondary" onClick={cancelComposeContext} type="button">
                    {t('button.cancel')}
                  </button>
                </div>
              ) : null}
              <textarea
                aria-label={t('label.common.message')}
                disabled={!canComposeMessage || sendPending}
                maxLength={4000}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={t('placeholder.message')}
                ref={composerRef}
                rows={1}
                value={draft}
              />
              <button
                className="button"
                disabled={!canSubmitMessage}
                title={
                  selectedChat?.kind === 'direct'
                    ? canComposeMessage
                      ? t('button.sendDirectMessage')
                      : directSendUnavailableLabel
                    : canComposeMessage
                      ? t('button.sendMessage')
                      : groupSendUnavailableLabel
                }
                type="submit"
              >
                {sendPending ? t('button.sending') : t('button.send')}
              </button>
            </form>
          )}
        </section>

        {showGroupMembers && membersOpen ? (
          <>
            <button
              aria-hidden="true"
              className="members-drawer__scrim"
              onClick={() => setMembersOpen(false)}
              tabIndex={-1}
              type="button"
            />
          <aside
            aria-label={t('aria.groupMembers')}
            aria-modal={isMembersOverlay || undefined}
            className="members-drawer"
            id="members-drawer"
            role={isMembersOverlay ? 'dialog' : undefined}
          >
            <div className="members-drawer__header">
              <div>
                <h2>{selectedGroupMembersLabel}</h2>
                <p>{getGroupTitle(selectedGroup, t)}</p>
              </div>
              <span>{selectedGroupMembers.length}</span>
              <button
                aria-label={t('button.close')}
                className="members-drawer__close"
                onClick={() => setMembersOpen(false)}
                ref={membersCloseRef}
                title={t('button.close')}
                type="button"
              >
                X
              </button>
            </div>
            {selectedGroupMembersPhase === 'error' ? <p className="error">{selectedGroupMembersError}</p> : null}
            {selectedGroupMembersPhase === 'loading' ? (
              <LoadingRows count={5} label={t('label.loading')} />
            ) : (
              <GroupMemberList
                avatarProfiles={avatarProfiles}
                group={isSelectedGeneralChat ? null : selectedGroup}
                members={selectedGroupMembers}
                onOpenAccount={setAccountInfoTarget}
                onOpenAvatar={setAvatarLightboxImage}
                t={t}
              />
            )}
            {selectedAdminJoinRequests.length > 0 ? (
              <div className="join-requests" aria-label={t('title.joinRequests')}>
                <div className="join-requests__header">
                  <strong>{t('title.joinRequests')}</strong>
                  <span>{selectedAdminJoinRequests.length}</span>
                </div>
                {selectedAdminJoinRequests.map((request) => (
                  <div className="join-request" key={`${request.groupId}:${request.joiner}`}>
                    <span>{getShortAddress(request.joiner)}</span>
                    <button
                      className="button button--secondary"
                      disabled={!canUseSelectedAccount || !canApproveGroupJoinRequests || approvePendingJoiner === request.joiner}
                      onClick={() => void handleApproveJoinRequest(request)}
                      title={
                        !account
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
        ) : null}
      </section>
      {accountInfoTarget ? (
        <AccountInfoDialog
          canMention={canComposeMessage}
          canOpenDirect={canOpenDirectChat}
          directUnavailableLabel={directAccessUnavailableLabel}
          onClose={() => setAccountInfoTarget(null)}
          onMention={mentionAccount}
          onOpenAvatar={(image) => {
            setAccountInfoTarget(null);
            setAvatarLightboxImage(image);
          }}
          onOpenDirect={openDirectFromAccount}
          profile={avatarProfiles.get(accountInfoTarget.sender)}
          target={accountInfoTarget}
          t={t}
        />
      ) : null}
      {avatarLightboxImage ? (
        <AvatarLightbox
          image={avatarLightboxImage}
          onClose={() => setAvatarLightboxImage(null)}
          t={t}
        />
      ) : null}
      {approvalModalOpen ? (
        <GroupApprovalDialog
          actionSignature={approvalActionSignature}
          avatarProfiles={avatarProfiles}
          canVote={canSubmitGroupApproval}
          currentHeight={currentBlockHeight}
          group={selectedGroup}
          knownNames={knownAvatarNames}
          onApprove={(signature) => void handleGroupApproval(signature, true)}
          onClose={() => setApprovalModalOpen(false)}
          onOppose={(signature) => void handleGroupApproval(signature, false)}
          pending={pendingApprovals}
          progressBySignature={approvalProgressBySignature}
          progressReady={approvalProgressReady}
          t={t}
          voteUnavailableLabel={groupApprovalUnavailableLabel}
          votedSignatures={votedSignatures}
        />
      ) : null}
    </main>
  );
}
