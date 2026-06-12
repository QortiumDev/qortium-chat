import { type SubmitEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildActiveChatsWebSocketUrl,
  buildGroupMessagesWebSocketUrl,
  approveGroupJoinRequest,
  getActiveChats,
  getAccountGroupJoinRequests,
  getAdminGroupJoinRequests,
  getDirectMessages,
  getGroupMembers,
  getGroupMessages,
  getMemberGroups,
  getMintingStatus,
  getTransactionStatus,
  getPrivateDirectActiveChats,
  leaveGroup,
  joinGroup,
  searchGroups,
  sendChatMessage,
  sendDirectChatMessage,
  startMinting,
} from './coreApi';
import { buildChatMessageText, decodeChatMessage, formatTimeAgo, formatTimestamp, getSenderLabel } from './chatText';
import { buildMessageThreads, isThreadContinuation, sortMessagesByTimestamp, type MessageThread } from './messageThreads';
import { getBridgeState, hasAction, qdnRequest } from './qdnRequest';
import {
  fetchQdnImagePreview,
  getImageQdnResources,
  renderMessageTextWithQdnLinks,
  type QdnImagePreview,
  type QdnImageResource,
} from './messageLinks';
import { createTranslator, normalizeLanguage, type TranslateFunction } from './i18n';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import {
  getAvatarFallbackCharacter,
  loadAvatarProfile,
  normalizeRegisteredName,
  type AvatarProfile,
} from './avatarProfiles';
import type {
  ActiveChats,
  ActiveDirectChat,
  BridgeState,
  ChatMessage,
  GroupData,
  GroupJoinRequest,
  GroupWithJoinRequests,
  GroupMember,
  MintingStatus,
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
const emptyActiveChats: ActiveChats = { direct: [], groups: [] };

type SelectedChat =
  | {
      group: GroupData;
      kind: 'group';
    }
  | {
      direct: ActiveDirectChat;
      kind: 'direct';
    };

type TrackedTransaction = {
  action: 'approve' | 'join' | 'leave' | 'rewardshare';
  groupId: number;
  groupName: string;
  id: string;
  joiner?: string;
  message: string;
  phase: 'confirmed' | 'failed' | 'pending';
  signature?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
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

function getGroupTitle(group: GroupData, t: TranslateFunction) {
  return group.groupName || t('title.groupTitle', { groupId: group.groupId });
}

function getShortAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function getDirectTitle(direct: ActiveDirectChat) {
  return direct.name || getShortAddress(direct.address);
}

function getMemberAddress(member: GroupMember) {
  return member.address || member.member || '';
}

function getMemberLabel(member: GroupMember, t: TranslateFunction) {
  const address = getMemberAddress(member);

  return member.primaryName || member.name || (address ? getShortAddress(address) : t('member.label'));
}

function sortGroups(groups: GroupData[], t: TranslateFunction) {
  return [...groups].sort((first, second) => {
    const firstName = getGroupTitle(first, t).toLocaleLowerCase();
    const secondName = getGroupTitle(second, t).toLocaleLowerCase();

    return firstName.localeCompare(secondName);
  });
}

function getMessageKey(message: ChatMessage, index = 0) {
  return message.signature || `${message.timestamp}-${message.sender}-${index}`;
}

function mergeMessages(currentMessages: ChatMessage[], nextMessages: ChatMessage[]) {
  const messages = new Map<string, ChatMessage>();

  for (const [index, message] of currentMessages.entries()) {
    messages.set(getMessageKey(message, index), message);
  }

  for (const [index, message] of nextMessages.entries()) {
    messages.set(getMessageKey(message, index), message);
  }

  return sortMessagesByTimestamp([...messages.values()]).slice(-100);
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

type AvatarProfilesByAddress = Record<string, CachedAvatarProfile | undefined>;

type AvatarLightboxImage = {
  name: string | null;
  src: string;
};

function getAvatarView(profile: AvatarProfile | undefined, preferredName: string | null | undefined) {
  const name = normalizeRegisteredName(preferredName) ?? profile?.name ?? null;
  const avatarSrc = profile?.name === name ? profile.avatarSrc : null;

  return { avatarSrc, name };
}

function getMessageSenderName(message: Pick<ChatMessage, 'senderName'>, profile: AvatarProfile | undefined) {
  return normalizeRegisteredName(message.senderName) ?? profile?.name ?? null;
}

function getMessageSenderLabel(message: Pick<ChatMessage, 'sender' | 'senderName'>, profile: AvatarProfile | undefined) {
  return getMessageSenderName(message, profile) ?? getSenderLabel(message);
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
  onOpenAvatar,
  openAvatarLabel,
  profile,
}: {
  message: ChatMessage;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  openAvatarLabel: string;
  profile: AvatarProfile | undefined;
}) {
  const { avatarSrc, name } = getAvatarView(profile, message.senderName);

  return (
    <span className="message__identity" title={message.sender}>
      <UserAvatar
        className="message__avatar"
        name={name}
        onOpen={onOpenAvatar}
        openLabel={openAvatarLabel}
        src={avatarSrc}
      />
      <strong>{getMessageSenderLabel(message, profile)}</strong>
    </span>
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
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-label={t('aria.avatarLightbox')}
      aria-modal="true"
      className="avatar-lightbox"
      onClick={onClose}
      role="dialog"
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
  const [profiles, setProfiles] = useState<AvatarProfilesByAddress>({});
  const latestRequestKeysRef = useRef(new Map<string, string>());
  const addressKey = JSON.stringify(addresses);
  const knownNamesKey = JSON.stringify(Array.from(knownNamesByAddress.entries()));

  useEffect(() => {
    let isDisposed = false;

    for (const address of addresses) {
      const preferredName = knownNamesByAddress.get(address) ?? null;
      const requestKey = getAvatarRequestKey(address, preferredName, actionsKey);

      latestRequestKeysRef.current.set(address, requestKey);

      if (profiles[address]?.requestKey === requestKey) {
        continue;
      }

      void loadAvatarProfile({ actions, address, preferredName })
        .then((profile) => {
          if (isDisposed || latestRequestKeysRef.current.get(address) !== requestKey) {
            return;
          }

          setProfiles((current) => ({
            ...current,
            [address]: {
              ...profile,
              requestKey,
            },
          }));
        });
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

function GroupList({
  groups,
  joinedIds,
  onSelect,
  selectedGroupId,
  t,
}: {
  groups: GroupData[];
  joinedIds: Set<number>;
  onSelect: (group: GroupData) => void;
  selectedGroupId: number | null;
  t: TranslateFunction;
}) {
  if (groups.length === 0) {
    return <p className="empty">{t('hint.noGroups')}</p>;
  }

  return (
    <div className="group-list">
      {groups.map((group) => (
        <button
          className={`group-row${selectedGroupId === group.groupId ? ' group-row--selected' : ''}`}
          key={group.groupId}
          onClick={() => onSelect(group)}
          type="button"
        >
          <span className="group-row__name">{getGroupTitle(group, t)}</span>
          <span className="group-row__meta">
            {joinedIds.has(group.groupId) ? t('label.joined') : group.isOpen === false ? t('label.group.closed') : t('label.group.open')}
            {typeof group.memberCount === 'number' ? ` / ${group.memberCount.toLocaleString()}` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

function DirectList({
  activeChats,
  canOpen,
  onSelect,
  selectedAddress,
  t,
}: {
  activeChats: ActiveChats;
  canOpen: boolean;
  onSelect: (direct: ActiveDirectChat) => void;
  selectedAddress: string | null;
  t: TranslateFunction;
}) {
  const directs = activeChats.direct ?? [];

  if (directs.length === 0) {
    return <p className="empty">{t('hint.noDirectChats')}</p>;
  }

  return (
    <div className="direct-list">
      {directs.map((direct) => (
        <button
          className={`direct-row${selectedAddress === direct.address ? ' direct-row--selected' : ''}`}
          disabled={!canOpen}
          key={direct.address}
          onClick={() => onSelect(direct)}
          title={canOpen ? t('action.directTooltip') : t('action.directReadOnly')}
          type="button"
        >
          <span>{getDirectTitle(direct)}</span>
          <small>{formatTimestamp(direct.timestamp)}</small>
        </button>
      ))}
    </div>
  );
}

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
      preview: QdnImagePreview;
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

    void fetchQdnImagePreview(resource)
      .then((preview) => {
        if (!isDisposed) {
          setState({ phase: 'ready', preview });
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
    <figure className="message__image-preview">
      <img alt={state.preview.alt} src={state.preview.src} />
      <figcaption>{state.preview.alt}</figcaption>
    </figure>
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

function MessageList({
  avatarProfiles,
  canCompose,
  messages,
  onEdit,
  onOpenAvatar,
  onReply,
  selfAddress,
  t,
}: {
  avatarProfiles: AvatarProfilesByAddress;
  canCompose: boolean;
  messages: ChatMessage[];
  onEdit: (thread: MessageThread) => void;
  onOpenAvatar: (image: AvatarLightboxImage) => void;
  onReply: (message: ChatMessage) => void;
  selfAddress: string | null;
  t: TranslateFunction;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottomRef = useRef(true);
  const itemsRef = useRef(new Map<string, HTMLLIElement>());
  const highlightTimeoutRef = useRef(0);
  const expandedTimeTimeoutRef = useRef(0);
  const [openHistories, setOpenHistories] = useState<ReadonlySet<string>>(new Set());
  const [openImagePreviews, setOpenImagePreviews] = useState<ReadonlySet<string>>(new Set());
  const [highlightedKey, setHighlightedKey] = useState('');
  const [expandedTimeKey, setExpandedTimeKey] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const threads = useMemo(() => buildMessageThreads(messages), [messages]);
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
  const lastThread = threads[threads.length - 1] ?? null;
  const lastMessageKey = lastThread !== null ? getMessageKey(lastThread.latest, threads.length - 1) : '';
  const lastMessageIsOwn = selfAddress !== null && lastThread?.original.sender === selfAddress;

  useEffect(() => {
    const list = listRef.current;

    if (list && (stickToBottomRef.current || lastMessageIsOwn)) {
      list.scrollTop = list.scrollHeight;
    }
  }, [lastMessageIsOwn, lastMessageKey]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);

    return () => {
      window.clearInterval(interval);
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

  if (messages.length === 0) {
    return <p className="empty">{t('hint.noMessages')}</p>;
  }

  return (
    <ol
      className="message-list"
      onScroll={(event) => {
        const list = event.currentTarget;

        stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
      }}
      ref={listRef}
    >
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
        const hasImagePreviews = imageResources.length > 0;
        const areImagePreviewsOpen = openImagePreviews.has(threadKey);
        const canReplyOrEdit = canCompose && original.signature;
        const senderProfile = avatarProfiles[original.sender];
        const actionButtons =
          canReplyOrEdit || hasImagePreviews ? (
            <div className="message__actions">
              {hasImagePreviews ? (
                <button aria-expanded={areImagePreviewsOpen} onClick={() => toggleImagePreview(threadKey)} type="button">
                  {areImagePreviewsOpen ? t('button.hideImagePreview') : t('button.viewImagePreview')}
                </button>
              ) : null}
              {canReplyOrEdit ? (
                <button onClick={() => onReply(original)} type="button">
                  {t('button.reply')}
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
          <li
            className={`message message--${decoded.kind}${isOwn ? ' message--own' : ''}${isHighlighted ? ' message--highlight' : ''}${isContinuation ? ' message--continuation' : ''}`}
            key={threadKey}
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
                  onOpenAvatar={onOpenAvatar}
                  openAvatarLabel={t('action.openAvatarImage')}
                  profile={senderProfile}
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
                      avatarProfiles[repliedThread.original.sender],
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
              {decoded.body ? renderMessageTextWithQdnLinks(decoded.body) : t('message.empty')}
            </div>
            {areImagePreviewsOpen ? <MessageImagePreviews resources={imageResources} t={t} /> : null}
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
                        {versionBody ? renderMessageTextWithQdnLinks(versionBody) : t('message.empty')}
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function GroupMemberList({ members, t }: { members: GroupMember[]; t: TranslateFunction }) {
  if (members.length === 0) {
    return <p className="empty">{t('hint.noMembers')}</p>;
  }

  return (
    <div className="member-list">
      {members.slice(0, 24).map((member) => {
        const address = getMemberAddress(member);

        return (
          <span className="member-chip" key={address || getMemberLabel(member, t)} title={address}>
            {getMemberLabel(member, t)}
          </span>
        );
      })}
    </div>
  );
}

export default function App() {
  const [bridge, setBridge] = useState<AsyncState<BridgeState>>(createState({ actions: [], isHomeBridge: false, ui: 'BROWSER_DEV' }));
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
  const [messages, setMessages] = useState<AsyncState<ChatMessage[]>>(createState(emptyMessages));
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [composeContext, setComposeContext] = useState<
    | { kind: 'edit'; thread: MessageThread }
    | { kind: 'reply'; message: ChatMessage }
    | null
  >(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [directAddress, setDirectAddress] = useState('');
  const [mintingStatus, setMintingStatus] = useState<AsyncState<MintingStatus | null>>(createState(null));
  const [joinPending, setJoinPending] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [startMintingPending, setStartMintingPending] = useState(false);
  const [approvePendingJoiner, setApprovePendingJoiner] = useState<string | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [membersOpen, setMembersOpen] = useState(true);
  const [displaySettings, setDisplaySettings] = useState(getInitialDisplaySettings);
  const [trackedTransactions, setTrackedTransactions] = useState<Record<string, TrackedTransaction>>({});
  const [avatarLightboxImage, setAvatarLightboxImage] = useState<AvatarLightboxImage | null>(null);
  const t = useMemo(() => createTranslator(displaySettings.language), [displaySettings.language]);

  const joinedIds = useMemo(
    () => new Set(memberGroups.value.map((group) => group.groupId)),
    [memberGroups.value],
  );
  const sortedGroups = useMemo(() => sortGroups(groups.value, t), [groups.value, t]);
  const selectedGroup = selectedChat?.kind === 'group' ? selectedChat.group : null;
  const selectedDirect = selectedChat?.kind === 'direct' ? selectedChat.direct : null;
  const selectedGroupId = selectedGroup?.groupId ?? null;
  const selectedDirectAddress = selectedDirect?.address ?? null;
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
    selectedGroupId === null ? [] : adminJoinRequestGroups.get(selectedGroupId)?.joinRequests ?? [];
  const selectedTransactions = Object.values(trackedTransactions).filter(
    (transaction) => selectedGroupId !== null && transaction.groupId === selectedGroupId,
  );
  const selectedChatKey = selectedChat
    ? selectedChat.kind === 'group'
      ? `group:${selectedChat.group.groupId}`
      : `direct:${selectedChat.direct.address}`
    : '';
  const actions = bridge.value.actions;
  const actionsKey = actions.join('\n');
  const knownAvatarNames = useMemo(() => {
    const namesByAddress = new Map<string, string>();
    const accountName = normalizeRegisteredName(account?.name);

    if (account?.address && accountName) {
      namesByAddress.set(account.address, accountName);
    }

    for (const message of messages.value) {
      const senderName = normalizeRegisteredName(message.senderName);

      if (senderName && !namesByAddress.has(message.sender)) {
        namesByAddress.set(message.sender, senderName);
      }
    }

    return namesByAddress;
  }, [account?.address, account?.name, messages.value]);
  const avatarAddresses = useMemo(() => {
    const addresses = new Set<string>();

    if (account?.address) {
      addresses.add(account.address);
    }

    for (const message of messages.value) {
      addresses.add(message.sender);
    }

    return Array.from(addresses);
  }, [account?.address, messages.value]);
  const avatarProfiles = useAvatarProfiles(avatarAddresses, knownAvatarNames, actions, actionsKey);
  const canJoinGroup = hasAction(actions, 'JOIN_GROUP');
  const canLeaveGroup = hasAction(actions, 'LEAVE_GROUP');
  const canApproveGroupJoinRequests = hasAction(actions, 'APPROVE_GROUP_JOIN_REQUEST');
  const canSendGroupChat = hasAction(actions, 'SEND_CHAT_MESSAGE');
  const canReadPrivateGroupChat = hasAction(actions, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES');
  const canReadPrivateDirectChat = hasAction(actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES');
  const canLoadPrivateDirectChats = hasAction(actions, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS');
  const canSendDirectChat = canSendGroupChat;
  const isAccountUnlocked = account?.isUnlocked === true;
  const canOpenDirectChat = !!account && isAccountUnlocked && (canReadPrivateDirectChat || canSendDirectChat);
  const isJoinedGroup = selectedGroupId !== null && joinedIds.has(selectedGroupId);
  const hasPendingJoinRequest = selectedGroupId !== null && pendingJoinGroupIds.has(selectedGroupId);
  const hasPendingJoinTransaction = selectedGroupId !== null && pendingTrackedJoinGroupIds.has(selectedGroupId);
  const hasPendingLeaveTransaction = selectedGroupId !== null && pendingTrackedLeaveGroupIds.has(selectedGroupId);
  const isJoinableGroup =
    selectedGroupId !== null && selectedGroupId > 0 && !isJoinedGroup && !hasPendingJoinRequest && !hasPendingJoinTransaction;
  const canSubmitJoin = !!account && isAccountUnlocked && !!selectedGroup && canJoinGroup && isJoinableGroup && !joinPending;
  const canSubmitLeave =
    !!account &&
    isAccountUnlocked &&
    !!selectedGroup &&
    selectedGroupId !== null &&
    selectedGroupId > 0 &&
    canLeaveGroup &&
    isJoinedGroup &&
    !leavePending &&
    !hasPendingLeaveTransaction;
  const canStartMinting = hasAction(actions, 'START_MINTING');
  const isSelectedMintingGroup = selectedGroup?.isMintingGroup === true;
  const accountMintingStatus = mintingStatus.value;
  const showMintingControls = isSelectedMintingGroup && isJoinedGroup && !!account;
  const hasPendingRewardShareTransaction = Object.values(trackedTransactions).some(
    (transaction) => transaction.action === 'rewardshare' && transaction.phase === 'pending',
  );
  const canSubmitStartMinting =
    showMintingControls &&
    isAccountUnlocked &&
    canStartMinting &&
    accountMintingStatus?.keyOnNode === false &&
    !hasPendingRewardShareTransaction &&
    !startMintingPending;
  const canComposeMessage =
    !!account &&
    isAccountUnlocked &&
    !!selectedChat &&
    (selectedChat.kind === 'group' ? canSendGroupChat : canSendDirectChat);
  const canSubmitMessage =
    canComposeMessage && draft.trim().length > 0 && !sendPending;
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
    selectedChat?.kind === 'group' && selectedChat.group.isOpen === false && (!isAccountUnlocked || !canReadPrivateGroupChat);
  const closedGroupHistoryUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
      : t('action.closedGroupHistoryUnsupported');

  async function loadGroups(nextSearch = search, actionList = actions) {
    setGroups({ phase: 'loading', value: groups.value });

    try {
      const nextGroups = await searchGroups(nextSearch, actionList);

      setGroups({ phase: 'ready', value: nextGroups });
      if (!selectedChat && nextGroups.length > 0) {
        setSelectedChat({ group: nextGroups[0], kind: 'group' });
      }
    } catch (error) {
      setGroups({
        error: getBridgeErrorMessage(error, t('status.loadingError.groups'), t),
        phase: 'error',
        value: groups.value,
      });
    }
  }

  async function loadGroupMembers(group: GroupData, actionList = actions, options: { quiet?: boolean } = {}) {
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

  async function loadAccountData(selectedAccount: QdnSelectedAccount, actionList = actions) {
    setMemberGroups({ phase: 'loading', value: memberGroups.value });
    setActiveChats({ phase: 'loading', value: activeChats.value });

    try {
      setMemberGroups({ phase: 'ready', value: await getMemberGroups(selectedAccount.address, actionList) });
    } catch (error) {
      setMemberGroups({
        error: getBridgeErrorMessage(error, t('status.loadingError.joinedGroups'), t),
        phase: 'error',
        value: memberGroups.value,
      });
    }

    try {
      const nextActiveChats = await getActiveChats(selectedAccount.address, actionList);
      const direct = selectedAccount.isUnlocked && hasAction(actionList, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS')
        ? await getPrivateDirectActiveChats(actionList)
        : nextActiveChats.direct;

      setActiveChats({ phase: 'ready', value: { ...nextActiveChats, direct } });
    } catch (error) {
      setActiveChats({
        error: getBridgeErrorMessage(error, t('status.loadingError.activeChats'), t),
        phase: 'error',
        value: activeChats.value,
      });
    }

    void loadAccountJoinRequests(selectedAccount, actionList);
    void loadAdminJoinRequests(selectedAccount, actionList);
    void loadMintingStatus(selectedAccount, actionList);
  }

  async function loadMessages(chat: SelectedChat | null, actionList = actions, options: { quiet?: boolean } = {}) {
    if (!chat) {
      return;
    }

    if (!options.quiet) {
      setMessages({ phase: 'loading', value: messages.value });
    }

    try {
      if (chat.kind === 'direct' && !isAccountUnlocked) {
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      if (chat.kind === 'direct' && !hasAction(actionList, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES')) {
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      if (chat.kind === 'group' && chat.group.isOpen === false && !isAccountUnlocked) {
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      if (
        chat.kind === 'group' &&
        chat.group.isOpen === false &&
        !hasAction(actionList, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES')
      ) {
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      const nextMessages =
        chat.kind === 'group'
          ? await getGroupMessages(chat.group, actionList)
          : await getDirectMessages(chat.direct.address, actionList);

      setMessages({ phase: 'ready', value: nextMessages });
    } catch (error) {
      setMessages({
        error: getBridgeErrorMessage(error, t('status.loadingError.messages'), t),
        phase: 'error',
        value: messages.value,
      });
    }
  }

  async function handleJoinGroup() {
    if (!selectedGroup || !canSubmitJoin) {
      return;
    }

    setJoinPending(true);
    setWriteError('');

    try {
      const result = await joinGroup(selectedGroup.groupId);

      trackTransaction({
        action: 'join',
        group: selectedGroup,
        message: selectedGroup.isOpen === false ? t('status.join.request.submitted') : t('status.join.submitted'),
        result,
      });

      if (account) {
        await loadAccountData(account);
      }
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
      const result = await leaveGroup(selectedGroup.groupId);

      trackTransaction({
        action: 'leave',
        group: selectedGroup,
        message: t('status.leave.submitted'),
        result,
      });

      if (account) {
        await loadAccountData(account);
      }
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
      const result = await startMinting();

      if (result.rewardSharePending) {
        trackTransaction({
          action: 'rewardshare',
          group: selectedGroup,
          message: t('status.minting.authorization.submitted'),
          result,
        });
      }

      await loadMintingStatus(account);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.startMinting'), t));
      void loadMintingStatus(account, actions, { quiet: true });
    } finally {
      setStartMintingPending(false);
    }
  }

  async function handleApproveJoinRequest(request: GroupJoinRequest) {
    if (!selectedGroup || !canApproveGroupJoinRequests || !isAccountUnlocked || approvePendingJoiner) {
      return;
    }

    setApprovePendingJoiner(request.joiner);
    setWriteError('');

    try {
      const result = await approveGroupJoinRequest(request.groupId, request.joiner);

      trackTransaction({
        action: 'approve',
        group: selectedGroup,
        joiner: request.joiner,
        message: t('status.approval.submitted'),
        result,
      });

      if (account) {
        await loadAdminJoinRequests(account);
      }
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
      if (chat.kind === 'group') {
        await sendChatMessage(chat.group.groupId, message, chatReference);
      } else {
        await sendDirectChatMessage(chat.direct.address, message, chatReference);
      }

      setDraft('');
      setComposeContext(null);
      if (chat.kind === 'direct' && account) {
        await loadAccountData(account);
      }

      await loadMessages(chat, actions, { quiet: true });
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.sendMessage'), t));
    } finally {
      setSendPending(false);
    }
  }

  function selectGroup(group: GroupData) {
    setWriteError('');
    setComposeContext(null);
    setSelectedChat({ group, kind: 'group' });
  }

  function selectDirect(direct: ActiveDirectChat) {
    setWriteError('');
    setComposeContext(null);
    setSelectedChat({ direct, kind: 'direct' });
  }

  function handleOpenDirectChat(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const address = directAddress.trim();

    if (!address || !canOpenDirectChat) {
      return;
    }

    setWriteError('');
    setComposeContext(null);
    setSelectedChat({
      direct: {
        address,
      },
      kind: 'direct',
    });
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
  }

  useEffect(() => {
    void initializeSession();
  }, []);

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
                  transaction.action === 'approve'
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
    if (!selectedChat) {
      setMessages({ phase: 'ready', value: emptyMessages });
      setGroupMembers({ phase: 'ready', value: emptyMembers });
      return undefined;
    }

    if (selectedChat.kind === 'group') {
      void loadGroupMembers(selectedChat.group);
    } else {
      setGroupMembers({ phase: 'ready', value: emptyMembers });
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
    let socket: WebSocket | null = null;
    let reconnectTimeout = 0;
    let isDisposed = false;
    let receivedInitialMessages = false;
    let usedRestFallback = false;

    setMessages({ phase: 'loading', value: messages.value });

    function connect() {
      if (isDisposed) {
        return;
      }

      socket = new WebSocket(buildGroupMessagesWebSocketUrl(chat.group.groupId));

      socket.addEventListener('message', (event) => {
        try {
          const nextMessages = parseChatMessages(event.data);

          if (!receivedInitialMessages) {
            receivedInitialMessages = true;
            setMessages({ phase: 'ready', value: sortMessagesByTimestamp(nextMessages) });
            return;
          }

          // Reconnects resend the initial batch; merging dedupes by signature.
          setMessages((current) => ({
            phase: 'ready',
            value: mergeMessages(current.value, nextMessages),
          }));
        } catch (error) {
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
  }, [selectedChatKey, actionsKey, isAccountUnlocked]);

  useEffect(() => {
    if (!account) {
      return undefined;
    }

    const socket = new WebSocket(buildActiveChatsWebSocketUrl(account.address));

    socket.addEventListener('message', (event) => {
      try {
        const nextActiveChats = parseActiveChats(event.data);

        setActiveChats((current) => ({
          phase: 'ready',
          value: {
            ...current.value,
            groups: nextActiveChats.groups ?? current.value.groups,
          },
        }));
      } catch {
        // Keep the last active-chat snapshot.
      }
    });

    return () => socket.close();
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
    if (!selectedGroup) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadGroupMembers(selectedGroup, actions, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [selectedGroupId, actionsKey]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar__title">
          <h1>{t('app.title')}</h1>
        </div>
        <div className="topbar__account">
          <AccountSummary
            account={account}
            error={accountError}
            isHomeBridge={bridge.value.isHomeBridge}
            onConnect={() => void connectSelectedAccount()}
            onOpenAvatar={setAvatarLightboxImage}
            profile={account ? avatarProfiles[account.address] : undefined}
            t={t}
          />
        </div>
      </header>

      <section className={`layout${selectedGroup && membersOpen ? ' layout--members-open' : ''}`}>
        <aside className="sidebar" aria-label={t('aria.navigation')}>
          <section className="panel">
            <div className="panel__header">
              <h2>{t('label.common.groups')}</h2>
              <span>{groups.value.length}</span>
            </div>
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
                value={search}
              />
              <button className="button" type="submit">
                {t('button.search')}
              </button>
            </form>
            {groups.phase === 'error' ? <p className="error">{groups.error}</p> : null}
            {groups.phase === 'loading' ? (
              <LoadingRows count={5} label={t('label.loading')} />
            ) : (
              <GroupList
                groups={sortedGroups}
                joinedIds={joinedIds}
                onSelect={selectGroup}
                selectedGroupId={selectedGroupId}
                t={t}
              />
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>{t('label.common.direct')}</h2>
              <span>{activeChats.value.direct?.length ?? 0}</span>
            </div>
            <form className="search" onSubmit={handleOpenDirectChat}>
              <input
                aria-label={t('placeholder.directAddress')}
                disabled={!canOpenDirectChat}
                onChange={(event) => setDirectAddress(event.target.value)}
                placeholder={t('placeholder.directAddress')}
                value={directAddress}
              />
              <button
                className="button"
                disabled={!canOpenDirectChat || !directAddress.trim()}
                title={canOpenDirectChat ? t('action.directTooltip') : directAccessUnavailableLabel}
                type="submit"
              >
                {t('button.open')}
              </button>
            </form>
            {activeChats.phase === 'error' ? <p className="error">{activeChats.error}</p> : null}
            {!canOpenDirectChat ? <p className="muted">{directAccessUnavailableLabel}</p> : null}
            {canOpenDirectChat && !canLoadPrivateDirectChats ? <p className="muted">{directListUnavailableLabel}</p> : null}
            {activeChats.phase === 'loading' ? (
              <LoadingRows count={3} label={t('label.loading')} />
            ) : (
              <DirectList
                activeChats={activeChats.value}
                canOpen={canOpenDirectChat}
                onSelect={selectDirect}
                selectedAddress={selectedDirectAddress}
                t={t}
              />
            )}
          </section>
        </aside>

        <section className="chat-pane" aria-label={t('aria.selectedChat')}>
          <div className="chat-pane__header">
            <div>
              <h2>
                {selectedChat
                  ? selectedChat.kind === 'group'
                    ? getGroupTitle(selectedChat.group, t)
                    : getDirectTitle(selectedChat.direct)
                  : t('label.chat.select')}
              </h2>
              {selectedChat?.kind === 'group' ? (
                <p>
                  {selectedChat.group.isOpen === false
                    ? canReadPrivateGroupChat
                      ? t('hint.groupMeta.privateRead')
                      : t('hint.groupMeta.privateHistoryUnavailable')
                    : t('group.meta.open')}
                  {isSelectedMintingGroup ? t('group.status.minting.group') : ''}
                  {showMintingControls
                    ? accountMintingStatus?.isMinting === true
                      ? t('group.status.minting.minting')
                      : accountMintingStatus?.isMinting === false
                        ? t('group.status.minting.notMinting')
                        : accountMintingStatus
                          ? t('group.status.minting.unavailable')
                          : ''
                    : ''}
                  {hasPendingJoinTransaction
                    ? t('group.status.join.pending')
                    : hasPendingLeaveTransaction
                      ? t('group.status.leave.pending')
                    : hasPendingJoinRequest
                      ? t('group.status.request.pending')
                      : ''}
                  {typeof selectedChat.group.memberCount === 'number'
                    ? ` / ${selectedChat.group.memberCount.toLocaleString()} ${t('label.common.members')}`
                    : ''}
                </p>
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
                  className="button button--secondary"
                  onClick={() => setMembersOpen((current) => !current)}
                  type="button"
                >
                  {membersOpen
                    ? t('button.hideMembers')
                    : `${t('label.common.members')} (${groupMembers.value.length})`}
                </button>
              ) : null}
              {selectedChat?.kind === 'group' && selectedGroupId !== null && selectedGroupId > 0 && !isJoinedGroup && canJoinGroup ? (
                <button
                  className="button button--secondary"
                  disabled={!canSubmitJoin}
                  onClick={() => void handleJoinGroup()}
                  title={
                    hasPendingJoinTransaction
                      ? t('button.join.transaction.pending')
                      : hasPendingJoinRequest
                        ? t('button.join.request.pending')
                        : isAccountUnlocked && canJoinGroup
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
              ) : null}
              {selectedChat?.kind === 'group' && selectedGroupId !== null && selectedGroupId > 0 && isJoinedGroup && canLeaveGroup ? (
                <button
                  className="button button--secondary"
                  disabled={!canSubmitLeave}
                  onClick={() => void handleLeaveGroup()}
                  title={
                    hasPendingLeaveTransaction
                      ? t('button.leave.transaction.pending')
                      : isAccountUnlocked && canLeaveGroup
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
            </div>
          </div>

          {messages.phase === 'error' ? <p className="error">{messages.error}</p> : null}
          {writeError ? <p className="error">{writeError}</p> : null}
          {accountJoinRequests.phase === 'error' ? <p className="error">{accountJoinRequests.error}</p> : null}
          {adminJoinRequests.phase === 'error' ? <p className="error">{adminJoinRequests.error}</p> : null}
          {showMintingControls && mintingStatus.phase === 'error' ? <p className="error">{mintingStatus.error}</p> : null}
          {selectedDirectHistoryUnavailable ? <p className="muted">{directReadUnavailableLabel}</p> : null}
          {selectedClosedGroupHistoryUnavailable ? (
            <p className="muted">{closedGroupHistoryUnavailableLabel}</p>
          ) : null}
          {selectedTransactions.length > 0 ? (
            <div className="tx-status-list" aria-label={t('aria.transactionStatus')}>
              {selectedTransactions.map((transaction) => (
                <div className={`tx-status tx-status--${transaction.phase}`} key={transaction.id}>
                  <strong>
                    {transaction.phase === 'confirmed'
                      ? t('status.transaction.confirmed')
                      : transaction.phase === 'failed'
                        ? t('status.transaction.failed')
                        : t('status.transaction.pending')}
                  </strong>
                  <span>{transaction.message}</span>
                  {transaction.signature ? <small>{transaction.signature}</small> : null}
                </div>
              ))}
            </div>
          ) : null}

          {messages.phase === 'loading' ? (
            <LoadingRows count={4} label={t('label.loading')} />
          ) : (
            <MessageList
              avatarProfiles={avatarProfiles}
              canCompose={canComposeMessage}
              messages={messages.value}
              onEdit={startEdit}
              onOpenAvatar={setAvatarLightboxImage}
              onReply={startReply}
              selfAddress={account?.address ?? null}
              t={t}
            />
          )}

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
                            avatarProfiles[composeContext.message.sender],
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
        </section>

        {selectedGroup && membersOpen ? (
          <aside className="members-drawer" aria-label={t('aria.groupMembers')}>
            <div className="members-drawer__header">
              <div>
                <h2>{t('label.common.members')}</h2>
                <p>{getGroupTitle(selectedGroup, t)}</p>
              </div>
              <span>{groupMembers.value.length}</span>
            </div>
            {groupMembers.phase === 'error' ? <p className="error">{groupMembers.error}</p> : null}
            {groupMembers.phase === 'loading' ? (
              <LoadingRows count={5} label={t('label.loading')} />
            ) : (
              <GroupMemberList members={groupMembers.value} t={t} />
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
                      disabled={!isAccountUnlocked || !canApproveGroupJoinRequests || approvePendingJoiner === request.joiner}
                      onClick={() => void handleApproveJoinRequest(request)}
                      title={
                        !isAccountUnlocked
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
        ) : null}
      </section>
      {avatarLightboxImage ? (
        <AvatarLightbox
          image={avatarLightboxImage}
          onClose={() => setAvatarLightboxImage(null)}
          t={t}
        />
      ) : null}
    </main>
  );
}
