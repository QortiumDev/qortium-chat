import {
  lazy,
  Suspense,
  type ClipboardEvent,
  type DragEvent,
  type SubmitEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react';
import {
  buildAttachmentIdentifier,
  buildAttachmentLink,
  formatAttachmentSize,
  getFirstTransferFile,
  getAttachmentMaxBytes,
  getAttachmentService,
  prepareAttachment,
  ATTACHMENT_FILE_MAX_BYTES,
  type PreparedAttachment,
} from './attachments';
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
  getGroup,
  getGroupApprovalVotes,
  getGroupInvites,
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
  publishQdnAttachment,
  requestPrivateGroupChatKey,
  resolvePrivateGroupChatKeyRequests,
  searchGroups,
  sendChatMessage,
  sendDirectChatMessage,
  startMinting,
  submitGroupApproval,
} from './coreApi';
import { getNetworkBridgeState, hasNetworkBridge } from './chatNetwork';
import { hasLegacyQortalBridgeCandidate, hasQortalChatBridgeActions } from './qortalRequest';
import { computeApprovalProgress, NULL_ACCOUNT_ADDRESS } from './approvalProgress';
import {
  buildChatMessageText,
  buildDeletedMessageText,
  buildReactionMessageText,
  decodeChatMessage,
  getMessageSnippet,
  isHiddenChatMessage,
} from './chatText';
import {
  getLatestActivityMessageTimestamp,
  getMessageKey,
  sortMessagesByTimestamp,
  type MessageThread,
} from './messageThreads';
import { retainChatMessagesWhenEqual } from './messageUpdates';
import {
  createLocalSendId,
  createPendingRevision,
  createPendingSend,
  expirePendingRevisions,
  expirePendingSends,
  failPendingRevision,
  failPendingSend,
  getPendingSignatureIdentity,
  hasActiveDuplicateSend,
  indexPendingRevisionsByTarget,
  mergeOptimisticMessages,
  prunePendingRevisions,
  prunePendingSends,
  resolvePendingRevision,
  resolvePendingSend,
  retryPendingRevision,
  retryPendingSend,
  type PendingRevision,
  type PendingSend,
  type PendingSendTarget,
} from './pendingSends';
import { updatePendingStateRef } from './pendingState';
import { resolveGroupPreviewRevision, type GroupPreviewRevision } from './groupPreviews';
import {
  getReactionPendingKey,
} from './messageReactions';
import { getBridgeState, hasAction, qdnRequest } from './qdnRequest';
import { isHomeV2AppTab } from './hostContext';
import { createTranslator, normalizeLanguage, type TranslateFunction } from './i18n';
import { applyDisplaySettings, getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
import {
  getInitialDeepLinkTarget,
  isPlausibleQortiumAddress,
  parseOpenAppTargetMessage,
  writeChatRoute,
  type ChatDeepLinkTarget,
  type ChatHistoryMode,
} from './deepLink';
import {
  GENERAL_CHAT_GROUP_ID,
  getGroupTitle,
  isGeneralChatGroup,
  sortGroups,
  withGeneralChatGroup,
} from './generalChat';
import { AvatarLightbox, type AvatarLightboxImage } from './AvatarLightbox';
import { AccountInfoDialog, ConfirmDeleteMessageDialog, GroupApprovalDialog } from './dialogs';
import { DirectList, GroupList } from './chatLists';
import {
  createGroupConversationSummary,
  getConversationKey,
  qualifyPublicGroupDiscoveries,
  type GroupConversationSummary,
  type PublicGroupDiscovery,
} from './conversationModel';
import { getConversationInitials } from './conversationPresentation';
import { GroupMemberList } from './GroupMemberList';
import { MessageList } from './MessageList';
import {
  getAvatarView,
  getDirectCounterpartName,
  getDirectTitle,
  getMessageSenderLabel,
  getShortAddress,
  UserAvatar,
  type AccountInfoTarget,
  type AvatarProfilesByIdentity,
  type CachedAvatarProfile,
  selectAvatarProfilesForNetwork,
} from './accountDisplay';
import {
  BackIcon,
  BellIcon,
  BrandMark,
  CloseIcon,
  DownIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
} from './icons';
import {
  canManageChatNotifications,
  canShowChatNotifications,
  DISABLED_CHAT_NOTIFICATION_PREFERENCES,
  disableDirectMessageNotifications,
  enableDirectMessageNotifications,
  getEnabledChatAttentionKind,
  getChatAttentionKinds,
  getChatSelfIdentity,
  hasAnyChatNotificationsEnabled,
  isIncomingChatMessage,
  readChatNotificationPreferences,
  reconcileChatNotifications,
  showChatAttentionNotification,
  writeChatNotificationPreferences,
  type ChatNotificationPreferences,
} from './notifications';
import { LatestRequestGuard } from './latestRequest';
import { loadQortalAccountSnapshot } from './qortalAccountSession';
import { StartupAccountRefreshCoordinator } from './startupAccountRefresh';
import {
  mergePersistedDirect,
  readLastChat,
  readPersistedDirects,
  readReadWatermarks,
  readScrollBookmarks,
  readSidebarCollapse,
  setChatStorageMode,
  toStoredSelectedChat,
  writeLastChat,
  writePersistedDirects,
  writeReadWatermarks,
  writeScrollBookmarks,
  writeSidebarCollapse,
  type PersistedDirect,
} from './chatStorage';
import {
  getActiveMessageGroupMembers,
  getGroupMemberAddress,
  getGroupMemberRegisteredName,
} from './groupMembers';
import {
  isPublicNodePrivateGroupKeyRecoveryUnsupported,
  isPublicNodeSendUnsupported,
  shouldDecryptGroupMessages,
} from './groupAccess';
import {
  fetchAccountAvatar,
  fetchGroupAvatar,
  getAvatarProfileKey,
  getGroupAvatarProfileKey,
  getNextAvatarPendingRetry,
  loadAvatarProfile,
  normalizeRegisteredName,
  revokeAvatarObjectUrl,
  resolveAvatarIdentities,
  type AvatarProfile,
  type AvatarPendingRetryState,
  type GroupAvatarProfile,
} from './avatarProfiles';
import { AvatarTaskQueue } from './avatarQueue';
import type {
  ActiveChats,
  ActiveDirectChat,
  ActiveGroupChat,
  BridgeState,
  ApprovalProgress,
  ChatMessage,
  ChatNetwork,
  ChatScrollPosition,
  GroupApprovalVote,
  GroupData,
  GroupInvite,
  GroupJoinRequest,
  GroupWithJoinRequests,
  GroupMember,
  MintingStatus,
  AsyncState,
  PendingApprovalTransaction,
  QdnAction,
  QdnSelectedAccount,
  TrackedTransaction,
} from './types';

const APP_VERSION = __APP_VERSION__;

const emptyGroups: GroupData[] = [];
const emptyMembers: GroupMember[] = [];
const emptyMessages: ChatMessage[] = [];
const emptyJoinRequests: GroupJoinRequest[] = [];
const emptyAdminJoinRequests: GroupWithJoinRequests[] = [];
const emptyPendingApprovals: PendingApprovalTransaction[] = [];
const emptyApprovalVotes: GroupApprovalVote[] = [];
const emptyActiveChats: ActiveChats = { direct: [], groups: [] };
const emptyInvites: GroupInvite[] = [];
const emptyPendingSends: PendingSend[] = [];
// The 30s sidebar activity sweeps only need the latest real (non-reaction)
// message timestamp per chat, not a full transcript page — a small window cuts
// each probe's payload ~10x. Deep enough that a burst of reactions rarely
// fills it; when one does, the merge skips rather than guessing (see
// mergeActivityTimestamp's allowTombstone).
const ACTIVITY_SWEEP_MESSAGE_LIMIT = 10;

// Loaded on demand, same as the reaction picker in MessageList: the shared
// emoji-picker-react chunk must not weigh down app startup, so only type-only
// imports appear at module top and enum values are passed as literals.
const ComposerEmojiPicker = lazy(() => import('emoji-picker-react'));

// Websocket reconnects back off 5s → 60s while the node stays unreachable
// (reset by any successful frame) instead of hammering a fixed 5s cadence;
// while the tab is hidden, reconnection waits for visibility instead.
const WS_RECONNECT_BASE_MS = 5000;
const WS_RECONNECT_MAX_MS = 60000;
const SEND_CONFIRMATION_TIMEOUT_MS = 120000;

// Groups whose transactions are gated by development-group approval (e.g. Core
// auto-updates). Previewnet uses group id 1 ("development"); override with the
// VITE_QORTIUM_DEV_GROUP_IDS env var (comma-separated) for other networks.
const DEV_GROUP_IDS = new Set(
  (import.meta.env.VITE_QORTIUM_DEV_GROUP_IDS || '1')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0),
);

// `network` is optional and defaults to 'qortium' wherever it is read below —
// every slice-1 construction site that never sets it (there are many, spread
// across this file) keeps behaving exactly as it did before Chat 2.0 slice 2.
// Direct chats are Qortium-only in this slice (Qortal DM is deferred — see
// docs/HOME_V2_BRIDGE_COMPATIBILITY.md in qortium-home), so only the 'group'
// arm is ever constructed with network: 'qortal'.
type SelectedChat =
  | {
      group: GroupData;
      kind: 'group';
      network?: ChatNetwork;
    }
  | {
      direct: ActiveDirectChat;
      kind: 'direct';
      network?: ChatNetwork;
    };

function getSelectedChatKey(chat: SelectedChat | null) {
  if (!chat) {
    return '';
  }

  // Only a non-default (qortal) network changes the key, so every existing
  // Qortium chatKey (draft storage, scroll bookmarks, view cache, ...) is
  // byte-identical to before this field existed.
  const prefix = chat.network === 'qortal' ? 'qortal:' : '';

  return chat.kind === 'group' ? `${prefix}group:${chat.group.groupId}` : `${prefix}direct:${chat.direct.address}`;
}

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

// An active-chats entry whose latest message is an emoji reaction or an
// app-to-app machine message must not drive sidebar activity ("time ago",
// unread, sort) or previews: Core filters reactions out of the stream via
// haschatreference=false, but a reaction published without a chatReference
// (older clients, Home's network-mode keyless send) slips through that filter,
// and machine messages are indistinguishable from chat at the stream level —
// so the payload itself is checked here. Encrypted payloads that cannot be
// decoded are indeterminate and keep their timestamp.
function isHiddenActiveChatEntry(entry: {
  data?: string | null;
  decryptionStatus?: string;
  encoding?: 'BASE58' | 'BASE64';
  isEncrypted?: boolean;
  isText?: boolean;
}) {
  if (!entry.data) {
    return false;
  }

  if (entry.isEncrypted && entry.decryptionStatus !== 'DECRYPTED') {
    return false;
  }

  // Group entries from the public stream carry no isText flag; group chat
  // payloads are text (same assertion the sidebar preview memo makes).
  return isHiddenChatMessage({
    data: entry.data,
    decryptionStatus: entry.decryptionStatus,
    encoding: entry.encoding ?? 'BASE64',
    isEncrypted: entry.isEncrypted,
    isText: entry.isText ?? true,
  });
}

function mergeActivityTimestamp<Key>(
  current: ReadonlyMap<Key, number | null>,
  key: Key,
  messages: ChatMessage[],
  options: { allowTombstone?: boolean } = {},
) {
  const latestTimestamp = getLatestActivityMessageTimestamp(messages);
  const currentTimestamp = current.get(key);

  if (latestTimestamp === null) {
    // A window with no real message only proves "this chat has no messages"
    // when the caller saw the full history. The activity sweep fetches small
    // windows, and a window filled entirely by reactions is indeterminate —
    // it must not erase a known timestamp with a tombstone.
    if (options.allowTombstone === false) {
      return current;
    }

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

// Equality signal for active-chats group entries: groupId + timestamp identify
// an entry's content — a new last message always advances its timestamp, and
// the sidebar reads names/previews from other sources. Order-sensitive on
// purpose: a genuinely reordered list should produce new state.
function areActiveGroupChatsEqual(current: ActiveGroupChat[] | undefined, next: ActiveGroupChat[]) {
  if (!current || current.length !== next.length) {
    return false;
  }

  for (let index = 0; index < next.length; index += 1) {
    if (current[index].groupId !== next[index].groupId || current[index].timestamp !== next[index].timestamp) {
      return false;
    }
  }

  return true;
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



type AvatarTarget = { address: string; network: ChatNetwork };

function getAvatarRequestKey(target: AvatarTarget, preferredName: string | null | undefined, actionsKey: string) {
  return JSON.stringify([target.network, target.address, normalizeRegisteredName(preferredName) ?? '', actionsKey]);
}

const AVATAR_REQUEST_CONCURRENCY = 6;

function useAvatarProfiles(
  targets: AvatarTarget[],
  knownNamesByIdentity: ReadonlyMap<string, string>,
  actionsByNetwork: Readonly<Record<ChatNetwork, QdnAction[]>>,
  actionsKeysByNetwork: Readonly<Record<ChatNetwork, string>>,
  protectedObjectUrl: string | null,
) {
  const [profiles, setProfiles] = useState<AvatarProfilesByIdentity>(() => new Map());
  const latestRequestKeysRef = useRef(new Map<string, string>());
  const avatarTaskQueueRef = useRef<AvatarTaskQueue | null>(null);

  avatarTaskQueueRef.current ??= new AvatarTaskQueue(AVATAR_REQUEST_CONCURRENCY);
  // Requests already issued and still awaiting their final commit, so an
  // effect re-run (new sender in a busy chat) does not fire a duplicate
  // name-resolution/avatar-fetch chain for an address whose request is still
  // in flight.
  const pendingRequestKeysRef = useRef(new Map<string, string>());
  const retryTimersRef = useRef(new Map<string, { requestKey: string; timer: number }>());
  const retryStatesRef = useRef(
    new Map<string, { requestKey: string; state: AvatarPendingRetryState }>(),
  );
  // The hook owns profile URLs. A lightbox captures its source independently,
  // so a departed profile's URL is deferred only while that exact URL remains
  // open; all other departed/replaced URLs are released immediately.
  const avatarObjectUrlsRef = useRef(new Set<string>());
  const profileAvatarObjectUrlsRef = useRef(new Map<string, string>());
  const deferredAvatarObjectUrlsRef = useRef(new Set<string>());
  // Tracks genuine unmount, distinct from an effect re-run. An in-flight avatar
  // fetch must still commit when the effect merely re-ran (e.g. a new sender
  // changed the address list) as long as its request key is still current.
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;

    for (const { timer } of retryTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    retryTimersRef.current.clear();
    retryStatesRef.current.clear();

    for (const objectUrl of avatarObjectUrlsRef.current) {
      revokeAvatarObjectUrl(objectUrl);
    }
  }, []);
  const targetKey = JSON.stringify(targets);
  const knownNamesKey = JSON.stringify(Array.from(knownNamesByIdentity.entries()));

  useEffect(() => {
    const releaseObjectUrl = (objectUrl: string) => {
      if (objectUrl === protectedObjectUrl) {
        deferredAvatarObjectUrlsRef.current.add(objectUrl);
        return;
      }

      deferredAvatarObjectUrlsRef.current.delete(objectUrl);
      avatarObjectUrlsRef.current.delete(objectUrl);
      revokeAvatarObjectUrl(objectUrl);
    };

    for (const objectUrl of deferredAvatarObjectUrlsRef.current) {
      if (objectUrl !== protectedObjectUrl) {
        releaseObjectUrl(objectUrl);
      }
    }

    const targetByKey = new Map(targets.map((target) => [getAvatarProfileKey(target.network, target.address), target]));
    const visibleAddresses = new Set(targetByKey.keys());
    const departedAddresses: string[] = [];

    for (const address of latestRequestKeysRef.current.keys()) {
      if (!visibleAddresses.has(address)) {
        departedAddresses.push(address);
        latestRequestKeysRef.current.delete(address);
        pendingRequestKeysRef.current.delete(address);

        const scheduledRetry = retryTimersRef.current.get(address);

        if (scheduledRetry) {
          window.clearTimeout(scheduledRetry.timer);
          retryTimersRef.current.delete(address);
        }
        retryStatesRef.current.delete(address);

        const objectUrl = profileAvatarObjectUrlsRef.current.get(address);

        if (objectUrl) {
          profileAvatarObjectUrlsRef.current.delete(address);
          releaseObjectUrl(objectUrl);
        }
      }
    }

    if (departedAddresses.length > 0) {
      setProfiles((current) => {
        const next = new Map(current);

        for (const address of departedAddresses) {
          next.delete(address);
        }

        return next;
      });
    }

    const requestKeyByAddress = new Map<string, string>();
    const needed: string[] = [];

    for (const [address, target] of targetByKey) {
      const preferredName = knownNamesByIdentity.get(address) ?? null;
      const requestKey = getAvatarRequestKey(target, preferredName, actionsKeysByNetwork[target.network]);

      latestRequestKeysRef.current.set(address, requestKey);
      requestKeyByAddress.set(address, requestKey);

      const scheduledRetry = retryTimersRef.current.get(address);

      if (scheduledRetry && scheduledRetry.requestKey !== requestKey) {
        window.clearTimeout(scheduledRetry.timer);
        retryTimersRef.current.delete(address);
      }

      const retryState = retryStatesRef.current.get(address);

      if (retryState && retryState.requestKey !== requestKey) {
        retryStatesRef.current.delete(address);
      }

      if (
        profiles.get(address)?.requestKey !== requestKey &&
        pendingRequestKeysRef.current.get(address) !== requestKey
      ) {
        needed.push(address);
      }
    }

    for (const address of needed) {
      pendingRequestKeysRef.current.set(address, requestKeyByAddress.get(address) as string);
    }

    // Release an address for future re-requests once its request reaches a
    // final outcome (committed, failed, or superseded); key-checked so a
    // newer run's pending marker is never cleared by an older completion.
    const settlePending = (address: string) => {
      if (pendingRequestKeysRef.current.get(address) === requestKeyByAddress.get(address)) {
        pendingRequestKeysRef.current.delete(address);
      }
    };

    // A result is still wanted if the component is mounted and the address's
    // latest request key still matches the one this run issued (a changed key
    // means a newer run superseded it). Crucially this does NOT drop results
    // just because the effect re-ran with an unchanged key.
    const isCurrent = (address: string) =>
      mountedRef.current && latestRequestKeysRef.current.get(address) === requestKeyByAddress.get(address);

    const clearRetry = (address: string) => {
      const scheduledRetry = retryTimersRef.current.get(address);

      if (scheduledRetry) {
        window.clearTimeout(scheduledRetry.timer);
        retryTimersRef.current.delete(address);
      }

      retryStatesRef.current.delete(address);
    };

    const commit = (profile: AvatarProfile) => {
      const profileKey = getAvatarProfileKey(profile.network, profile.address);
      settlePending(profileKey);
      clearRetry(profileKey);

      if (!isCurrent(profileKey)) {
        revokeAvatarObjectUrl(profile.avatarSrc);
        return;
      }

      const previousObjectUrl = profileAvatarObjectUrlsRef.current.get(profileKey);

      if (previousObjectUrl && previousObjectUrl !== profile.avatarSrc) {
        profileAvatarObjectUrlsRef.current.delete(profileKey);
        releaseObjectUrl(previousObjectUrl);
      }

      if (profile.avatarSrc) {
        profileAvatarObjectUrlsRef.current.set(profileKey, profile.avatarSrc);
        avatarObjectUrlsRef.current.add(profile.avatarSrc);
      }

      setProfiles((current) => {
        const next = new Map(current);
        next.set(profileKey, { ...profile, requestKey: requestKeyByAddress.get(profileKey) as string });
        return next;
      });
    };

    const commitMany = (batch: AvatarProfile[]) => {
      if (!mountedRef.current) {
        return;
      }

      setProfiles((current) => {
        let next: Map<string, CachedAvatarProfile> | null = null;

        for (const profile of batch) {
          const profileKey = getAvatarProfileKey(profile.network, profile.address);
          if (!isCurrent(profileKey)) {
            continue;
          }

          next ??= new Map(current);
          // Keep a current address-scoped image during the small interval while
          // its refreshed pointer request is pending. A final unavailable
          // result clears it through commit(), and a ready result replaces it.
          const existing = current.get(profileKey);
          next.set(profileKey, {
            ...profile,
            avatarSrc: existing?.avatarSrc ?? profile.avatarSrc,
            requestKey: requestKeyByAddress.get(profileKey) as string,
          });
        }

        return next ?? current;
      });
    };

    function scheduleAvatarRetry(profile: AvatarProfile, retryAfterSeconds: number) {
      const profileKey = getAvatarProfileKey(profile.network, profile.address);
      if (!isCurrent(profileKey)) {
        settlePending(profileKey);
        return;
      }

      const requestKey = requestKeyByAddress.get(profileKey) as string;
      const existing = retryTimersRef.current.get(profileKey);

      if (existing?.requestKey === requestKey) {
        return;
      }

      const previousRetry = retryStatesRef.current.get(profileKey);
      const retry = getNextAvatarPendingRetry(
        previousRetry?.requestKey === requestKey ? previousRetry.state : undefined,
        retryAfterSeconds,
      );

      if (!retry) {
        commit(profile);
        return;
      }

      retryStatesRef.current.set(profileKey, {
        requestKey,
        state: retry.state,
      });
      const timer = window.setTimeout(() => {
        retryTimersRef.current.delete(profileKey);

        if (isCurrent(profileKey)) {
          enqueueAccountAvatar(profile);
        } else {
          settlePending(profileKey);
        }
      }, retry.delayMs);

      retryTimersRef.current.set(profileKey, { requestKey, timer });
    }

    async function loadAccountAvatar(profile: AvatarProfile) {
      const profileKey = getAvatarProfileKey(profile.network, profile.address);
      if (!isCurrent(profileKey)) {
        settlePending(profileKey);
        return;
      }

      try {
        const avatar = await fetchAccountAvatar(
          profile.network,
          profile.address,
          actionsByNetwork[profile.network],
          profile.name,
        );

        if (avatar.kind === 'ready') {
          commit({ ...profile, avatarSrc: avatar.src });
        } else if (avatar.kind === 'pending') {
          scheduleAvatarRetry(profile, avatar.retryAfterSeconds);
        } else {
          commit(profile);
        }
      } catch {
        // The bridge parser is intentionally fail-closed. An unexpected
        // rejection has the same UI result as an unavailable avatar.
        commit(profile);
      }
    }

    function enqueueAvatarTask(address: string, task: () => Promise<void>) {
      const priority = Array.from(targetByKey.keys()).indexOf(address);

      void avatarTaskQueueRef.current
        ?.enqueue(async () => {
          if (!isCurrent(address)) {
            settlePending(address);
            return;
          }

          await task();
        }, priority < 0 ? targets.length : priority)
        .catch(() => {
          settlePending(address);
        });
    }

    function enqueueAccountAvatar(profile: AvatarProfile) {
      enqueueAvatarTask(getAvatarProfileKey(profile.network, profile.address), () => loadAccountAvatar(profile));
    }

    const loadIndividually = (targets: string[]) => {
      for (const address of targets) {
        const target = targetByKey.get(address);
        if (!target) continue;
        const preferredName = knownNamesByIdentity.get(address) ?? null;

        enqueueAvatarTask(address, async () => {
          try {
            const profile = await loadAvatarProfile({
              actions: actionsByNetwork[target.network],
              address: target.address,
              network: target.network,
              preferredName,
            });

            commitMany([profile]);
            await loadAccountAvatar(profile);
          } catch {
            // loadAvatarProfile normally degrades to a name-less profile. This
            // guard only handles an unexpected failure without starting a
            // duplicate request chain.
            settlePending(address);
          }
        });
      }
    };

    if (needed.length > 0) {
      const qortiumNeeded = needed.filter((key) => targetByKey.get(key)?.network === 'qortium');
      const otherNeeded = needed.filter((key) => targetByKey.get(key)?.network !== 'qortium');

      if (qortiumNeeded.length > 0 && hasAction(actionsByNetwork.qortium, 'RESOLVE_IDENTITIES')) {
        // Batch only display-name resolution. RESOLVE_IDENTITIES.avatarSrc is
        // a legacy named-thumbnail hint, not evidence of a current pointer.
        const qortiumAddresses = qortiumNeeded.map((key) => targetByKey.get(key)?.address as string);
        const knownQortiumNames = new Map(qortiumNeeded.map((key) => [targetByKey.get(key)?.address as string, knownNamesByIdentity.get(key) ?? '']));
        void resolveAvatarIdentities({ actions: actionsByNetwork.qortium, addresses: qortiumAddresses, knownNamesByAddress: knownQortiumNames })
          .then((resolved) => {
            // Commit names first in a single update so labels are not gated on images.
            const profiles = qortiumAddresses.map((address) => ({
              address,
              avatarSrc: null,
              name: resolved.get(address)?.name ?? null,
              network: 'qortium' as const,
            }));

            commitMany(profiles);

            for (const profile of profiles) {
              // Fetch every currently rendered address. Accounts without a
              // registered name can still have an explicit avatar pointer.
              enqueueAccountAvatar(profile);
            }
          })
          .catch(() => {
            // Batch resolution failed unexpectedly — fall back to per-address loads.
            loadIndividually(qortiumNeeded);
          });
      } else {
        loadIndividually(qortiumNeeded);
      }

      loadIndividually(otherNeeded);
    }
  }, [actionsKeysByNetwork.qortal, actionsKeysByNetwork.qortium, knownNamesKey, protectedObjectUrl, targetKey]);

  return profiles;
}

type GroupAvatarTarget = { group: GroupData; network: ChatNetwork };
type CachedGroupAvatarProfile = GroupAvatarProfile & { requestKey: string };

function useGroupAvatarProfiles(
  targets: GroupAvatarTarget[],
  actionsByNetwork: Readonly<Record<ChatNetwork, QdnAction[]>>,
  actionsKeysByNetwork: Readonly<Record<ChatNetwork, string>>,
  protectedObjectUrl: string | null,
) {
  const [profiles, setProfiles] = useState<ReadonlyMap<string, CachedGroupAvatarProfile>>(() => new Map());
  const objectUrlsRef = useRef(new Map<string, string>());
  const latestKeysRef = useRef(new Map<string, string>());
  const timersRef = useRef(new Map<string, number>());
  const queueRef = useRef<AvatarTaskQueue | null>(null);
  const mountedRef = useRef(true);
  queueRef.current ??= new AvatarTaskQueue(AVATAR_REQUEST_CONCURRENCY);
  const targetsKey = JSON.stringify(targets.map(({ group, network }) => [
    network,
    group.groupId,
    group.owner ?? '',
    group.ownerPrimaryName ?? '',
  ]));

  useEffect(() => () => {
    mountedRef.current = false;
    for (const timer of timersRef.current.values()) window.clearTimeout(timer);
    for (const src of objectUrlsRef.current.values()) revokeAvatarObjectUrl(src);
  }, []);

  useEffect(() => {
    const targetByKey = new Map(targets.map((target) => [
      getGroupAvatarProfileKey(target.network, target.group.groupId),
      target,
    ]));
    const wanted = new Set(targetByKey.keys());

    for (const key of latestKeysRef.current.keys()) {
      if (wanted.has(key)) continue;
      latestKeysRef.current.delete(key);
      const timer = timersRef.current.get(key);
      if (typeof timer === 'number') window.clearTimeout(timer);
      timersRef.current.delete(key);
      const src = objectUrlsRef.current.get(key);
      if (src && src !== protectedObjectUrl) {
        revokeAvatarObjectUrl(src);
        objectUrlsRef.current.delete(key);
      }
    }
    for (const [key, src] of objectUrlsRef.current) {
      if (!wanted.has(key) && src !== protectedObjectUrl) {
        revokeAvatarObjectUrl(src);
        objectUrlsRef.current.delete(key);
      }
    }
    setProfiles((current) => {
      const next = new Map(current);
      for (const key of current.keys()) if (!wanted.has(key)) next.delete(key);
      return next.size === current.size ? current : next;
    });

    for (const [key, target] of targetByKey) {
      const requestKey = JSON.stringify([
        key,
        target.group.owner ?? '',
        target.group.ownerPrimaryName ?? '',
        actionsKeysByNetwork[target.network],
      ]);
      if (latestKeysRef.current.get(key) === requestKey) continue;
      latestKeysRef.current.set(key, requestKey);

      const load = async (retryState?: AvatarPendingRetryState): Promise<void> => {
        if (!mountedRef.current || latestKeysRef.current.get(key) !== requestKey) return;
        const result = await fetchGroupAvatar(target.network, target.group, actionsByNetwork[target.network]);
        if (!mountedRef.current || latestKeysRef.current.get(key) !== requestKey) {
          if (result.kind === 'ready') revokeAvatarObjectUrl(result.src);
          return;
        }
        if (result.kind === 'pending') {
          const retry = getNextAvatarPendingRetry(retryState, result.retryAfterSeconds);
          if (retry) {
            const timer = window.setTimeout(() => {
              timersRef.current.delete(key);
              void load(retry.state);
            }, retry.delayMs);
            timersRef.current.set(key, timer);
          }
          return;
        }

        const previous = objectUrlsRef.current.get(key);
        if (previous && previous !== protectedObjectUrl && (result.kind !== 'ready' || previous !== result.src)) {
          revokeAvatarObjectUrl(previous);
          objectUrlsRef.current.delete(key);
        }
        if (result.kind === 'ready') objectUrlsRef.current.set(key, result.src);
        setProfiles((current) => {
          const next = new Map(current);
          next.set(key, {
            avatarSrc: result.kind === 'ready' ? result.src : null,
            groupId: target.group.groupId,
            network: target.network,
            requestKey,
          });
          return next;
        });
      };

      void queueRef.current?.enqueue(load, Array.from(targetByKey.keys()).indexOf(key)).catch(() => undefined);
    }
  }, [actionsKeysByNetwork.qortal, actionsKeysByNetwork.qortium, protectedObjectUrl, targetsKey]);

  return profiles;
}

function AccountSummary({
  account,
  error,
  isHomeBridge,
  isGateway,
  onConnect,
  onOpenAvatar,
  profile,
  t,
}: {
  account: QdnSelectedAccount | null;
  error: string;
  isHomeBridge: boolean;
  isGateway: boolean;
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

  if (isGateway) {
    return (
      <div className="account-connect account-connect--gateway">
        <p className="muted">{t('status.gateway.readOnly')}</p>
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

// Returns a function with a stable identity whose body always calls the latest
// render's closure (the "useEvent" pattern). App re-declares its handlers on
// every render, and passing them directly to a React.memo child would defeat
// the memo's shallow prop compare — so child-bound handlers are wrapped here.
function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
  const callbackRef = useRef(callback);

  callbackRef.current = callback;

  return useRef((...args: Args) => callbackRef.current(...args)).current;
}

export default function App() {
  const homeV2AppTab = isHomeV2AppTab(window.location.search);
  const [bridge, setBridge] = useState<AsyncState<BridgeState>>(createState({
    actions: [],
    isHomeBridge: false,
    isUsingPublicNode: false,
    transport: 'browser-dev',
    ui: 'BROWSER_DEV',
  }));
  const [chatStorageReady, setChatStorageReady] = useState(false);
  const [account, setAccount] = useState<QdnSelectedAccount | null>(null);
  const [accountError, setAccountError] = useState('');
  const [groups, setGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  const [groupMembers, setGroupMembers] = useState<AsyncState<GroupMember[]>>(createState(emptyMembers));
  const [accountJoinRequests, setAccountJoinRequests] =
    useState<AsyncState<GroupJoinRequest[]>>(createState(emptyJoinRequests));
  const [adminJoinRequests, setAdminJoinRequests] =
    useState<AsyncState<GroupWithJoinRequests[]>>(createState(emptyAdminJoinRequests));
  const [memberGroups, setMemberGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  const [groupDiscoveries, setGroupDiscoveries] =
    useState<AsyncState<PublicGroupDiscovery[]>>(createState([]));
  const [activeChats, setActiveChats] = useState<AsyncState<ActiveChats>>(createState(emptyActiveChats));
  // Qortal keeps its chain-specific bridge/account state separate, while the
  // rendered group rows are normalized later into the same source-qualified
  // conversation model as Qortium. Home 2 supplies window.qortalRequest;
  // Home 1.7 is admitted only after its Qortal-prefixed qdnRequest catalogue
  // proves the required read contract (see qortalAvailable below).
  const [qortalAvailable, setQortalAvailable] = useState(false);
  const qortalAvailableRef = useRef(false);
  const [qortalBridge, setQortalBridge] = useState<AsyncState<BridgeState>>(createState({
    actions: [],
    isHomeBridge: false,
    isUsingPublicNode: false,
    transport: 'browser-dev',
    ui: 'BROWSER_DEV',
  }));
  const [qortalAccount, setQortalAccount] = useState<{ address: string; name: string | null } | null>(null);
  const [qortalAccountError, setQortalAccountError] = useState('');
  const [qortalGroups, setQortalGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  // Groups the connected Qortal account has actually joined — Core rejects a
  // CHAT_MESSAGE to a group the sender has not joined (mirrors canPostInSelectedGroup
  // below), and there is no JOIN_GROUP bridge action for Qortal in this slice to
  // fix that from inside the app, so this only gates the composer.
  const [qortalMemberGroups, setQortalMemberGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  const [qortalActiveChats, setQortalActiveChats] = useState<AsyncState<ActiveChats>>(createState(emptyActiveChats));
  const [qortalGroupDiscoveries, setQortalGroupDiscoveries] =
    useState<AsyncState<PublicGroupDiscovery[]>>(createState([]));
  const [qortalSearch, setQortalSearch] = useState('');
  const [isQortalGroupSearchOpen, setQortalGroupSearchOpen] = useState(false);
  const [isQortalGroupsCollapsed, setQortalGroupsCollapsed] = useState(false);
  const [qortalGroupActivityById, setQortalGroupActivityById] =
    useState<ReadonlyMap<number, number | null>>(() => new Map());
  const qortalGroupSearchInputRef = useRef<HTMLInputElement>(null);
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
  const [chatNotificationPreferences, setChatNotificationPreferences] = useState<ChatNotificationPreferences>(
    () => ({ ...DISABLED_CHAT_NOTIFICATION_PREFERENCES }),
  );
  const [chatNotificationsBusy, setChatNotificationsBusy] = useState(false);
  const [chatNotificationsError, setChatNotificationsError] = useState('');
  const [isChatNotificationMenuOpen, setChatNotificationMenuOpen] = useState(false);
  const chatNotificationsEnabled = hasAnyChatNotificationsEnabled(chatNotificationPreferences);
  const chatNotificationsDesiredRef = useRef(chatNotificationPreferences);
  const chatNotificationSettingsRef = useRef<HTMLDivElement | null>(null);
  const chatNotificationToggleRef = useRef<HTMLButtonElement | null>(null);
  // Account/language reconciliation and button clicks can overlap. Serialize
  // them so a late passive re-registration can never resurrect a rule after the
  // user has switched the bell off.
  const chatNotificationOperationRef = useRef<Promise<void>>(Promise.resolve());
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
  // Conversation loads can resolve edit revisions that active-chats excludes.
  // Cache those bodies by the original activity identity so switching groups
  // does not immediately fall back to stale original text.
  const [loadedGroupPreviewById, setLoadedGroupPreviewById] =
    useState<ReadonlyMap<number, GroupPreviewRevision>>(() => new Map());
  const [loadedDirectActivityByAddress, setLoadedDirectActivityByAddress] =
    useState<ReadonlyMap<string, number | null>>(() => new Map());
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  // A target may arrive before the parallel group/account loads finish. Keep the
  // newest one until both have settled, so it wins over the normal first-group
  // fallback and a saved last chat without racing either source.
  const pendingDeepLinkRef = useRef<{
    historyMode: ChatHistoryMode;
    isInitial: boolean;
    target: ChatDeepLinkTarget | null;
  } | null | undefined>(undefined);
  const deepLinkResolutionRef = useRef(0);

  if (pendingDeepLinkRef.current === undefined) {
    const target = getInitialDeepLinkTarget();

    pendingDeepLinkRef.current = { historyMode: 'replace', isInitial: true, target };
  }
  const [deepLinkRevision, setDeepLinkRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [isGroupSearchOpen, setGroupSearchOpen] = useState(false);
  // Sidebar sections start collapsed; unread items still render through a
  // collapsed section (see GroupList/DirectList `collapsed`), so a collapsed
  // section only ever shows the chats that need attention. The expanded/collapsed
  // choice is persisted (app-wide) and restored on the next app start.
  const [isGroupsCollapsed, setGroupsCollapsed] = useState(true);
  const [isDirectCollapsed, setDirectCollapsed] = useState(true);
  const [showGroupOnboarding, setShowGroupOnboarding] = useState(true);
  const [draft, setDraft] = useState('');
  const [composeContext, setComposeContext] = useState<
    | { kind: 'edit'; thread: MessageThread }
    | { kind: 'reply'; message: ChatMessage }
    | null
  >(null);
  // Per-chat composer drafts (in-memory, session-scoped). The open chat's draft
  // lives in `draft`; this map stashes the other chats' unsent text so switching
  // chats neither carries text into the wrong conversation nor loses it.
  const draftsByChatKeyRef = useRef(new Map<string, string>());
  // Chat key the current `draft`/`composeContext` belong to.
  const draftChatKeyRef = useRef('');
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const groupSearchInputRef = useRef<HTMLInputElement>(null);
  const loadedGroupActivityRef = useRef<ReadonlyMap<number, number | null>>(new Map());
  const loadedDirectActivityRef = useRef<ReadonlyMap<string, number | null>>(new Map());
  const activeChatsGroupIdsRef = useRef<ReadonlySet<number>>(new Set());
  const requestedPrivateGroupKeysRef = useRef(new Set<string>());
  const resolvedPrivateGroupKeyRequestsRef = useRef(new Set<string>());
  const pendingApprovalsRequestRef = useRef(0);
  const groupMembersRequestGuardRef = useRef(new LatestRequestGuard());
  const qortalAccountRefreshGuardRef = useRef(new LatestRequestGuard());
  const qortalActiveChatsRequestGuardRef = useRef(new LatestRequestGuard());
  const groupDiscoveryRequestRef = useRef(0);
  const qortalGroupDiscoveryRequestRef = useRef(0);
  const startupAccountRefreshCoordinatorRef = useRef<StartupAccountRefreshCoordinator | null>(null);
  const selectedAccountRefreshCallbackRef = useRef<() => void>(() => undefined);
  const [directAddress, setDirectAddress] = useState('');
  const [isDirectSearchOpen, setDirectSearchOpen] = useState(false);
  const [directLookupPending, setDirectLookupPending] = useState(false);
  const [directLookupError, setDirectLookupError] = useState('');
  const directSearchInputRef = useRef<HTMLInputElement>(null);
  // Per-chat read watermark (latest activity timestamp the user has seen). Held in
  // memory for the session: baselined to current activity when a chat is first
  // discovered so existing history is not flagged, then advanced as chats are read.
  const [lastReadByGroupId, setLastReadByGroupId] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [lastReadByQortalGroupId, setLastReadByQortalGroupId] =
    useState<ReadonlyMap<number, number>>(() => new Map());
  const [lastReadByAddress, setLastReadByAddress] = useState<ReadonlyMap<string, number>>(() => new Map());
  // Mirrors of the read watermarks, read synchronously when a chat opens to
  // snapshot the divider position before the "mark read" effect advances them.
  const lastReadByGroupIdRef = useRef(lastReadByGroupId);
  const lastReadByQortalGroupIdRef = useRef(lastReadByQortalGroupId);
  const lastReadByAddressRef = useRef(lastReadByAddress);
  // Skip the one render right after an account switch, where the watermark maps
  // still hold the previous account's values, so we never persist them under the
  // new account's key. The load effect raises this; the persist effect clears it.
  const skipWatermarkPersistRef = useRef(true);
  // Saved scroll position per chat key so the reading position is restored when
  // the user returns to a conversation after visiting another.
  const scrollPositionsRef = useRef(new Map<string, ChatScrollPosition>());
  // Trailing-debounce state for persisting the bookmarks: the map above is
  // updated per scroll event; localStorage catches up on a pause or a flush
  // (hide/unmount/account switch). The address is captured at schedule time so
  // a flush can never write one account's bookmarks under another's key.
  const scrollPersistTimerRef = useRef(0);
  const scrollPersistAddressRef = useRef<string | null>(null);
  // Per-chat snapshot of the full loaded message view (live tail + any paged-in
  // older history). On returning to a chat this is restored so the saved scroll
  // bookmark resolves even when the user had read back beyond the latest window
  // (which a fresh load alone would not include). Bounded to the recent chats.
  const chatViewCacheRef = useRef(new Map<string, ChatMessage[]>());
  const loadedChatKeyRef = useRef('');
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
  const [isComposerEmojiOpen, setComposerEmojiOpen] = useState(false);
  // One attachment per message (Qortal Hub's model): staged, encoded, and
  // size-checked up front; published on Send and then linked in the text.
  const [stagedAttachment, setStagedAttachment] = useState<
    { filename: string; phase: 'processing' } | ({ phase: 'ready' } & PreparedAttachment) | null
  >(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [isDraggingAttachment, setDraggingAttachment] = useState(false);
  // dragenter/dragleave fire per child element; a counter tells actual exits
  // from nested re-entries so the drop overlay does not flicker.
  const attachmentDragDepthRef = useRef(0);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [reactionPendingKey, setReactionPendingKey] = useState('');
  // Optimistic pending -> confirmed -> failed send state (Chat 2.0 slice 1).
  // New messages and reactions live in `pendingSends` and are merged straight
  // into the rendered feed (see displayMessages below); edits/deletes target
  // an already-confirmed message and are tracked separately in
  // `pendingRevisions`, driving a lightweight inline status instead of an
  // injected bubble (see pendingSends.ts's module doc for why). Both are
  // mirrored into refs so the detached async send/retry runners below always
  // see the current value, not one captured at dispatch time.
  const [pendingSends, setPendingSends] = useState<PendingSend[]>([]);
  const pendingSendsRef = useRef<PendingSend[]>(pendingSends);
  const [pendingRevisions, setPendingRevisions] = useState<PendingRevision[]>([]);
  const pendingRevisionsRef = useRef<PendingRevision[]>(pendingRevisions);
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
  // Invitations sent TO this account (closed groups are otherwise invisible
  // until joined, so an invite has no other surface in the app).
  const [groupInvites, setGroupInvites] = useState<AsyncState<GroupInvite[]>>(createState(emptyInvites));
  const [inviteActionGroupId, setInviteActionGroupId] = useState<number | null>(null);
  const [accountInfoTarget, setAccountInfoTarget] = useState<(AccountInfoTarget & { network: ChatNetwork }) | null>(null);
  const [avatarLightboxImage, setAvatarLightboxImage] = useState<AvatarLightboxImage | null>(null);
  // Message thread awaiting delete confirmation (the dialog is the commit).
  const [deleteTarget, setDeleteTarget] = useState<MessageThread | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const t = useMemo(() => createTranslator(displaySettings.language), [displaySettings.language]);
  const [now, setNow] = useState(() => Date.now());
  const actions = bridge.value.actions;
  const actionsKey = actions.join('\n');
  const qortalActionsKey = qortalBridge.value.actions.join('\n');
  const avatarActionsByNetwork = useMemo(
    () => ({ qortal: qortalBridge.value.actions, qortium: actions }),
    [actionsKey, qortalActionsKey],
  );
  const avatarActionKeysByNetwork = useMemo(
    () => ({ qortal: qortalActionsKey, qortium: actionsKey }),
    [actionsKey, qortalActionsKey],
  );
  const selectedAccountRefreshActionsRef = useRef({
    qortal: qortalBridge.value.actions,
    qortium: actions,
  });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const timeoutError = t('status.loadingError.sendMessage');

    updatePendingSends((current) =>
      expirePendingSends(current, now, SEND_CONFIRMATION_TIMEOUT_MS, timeoutError),
    );
    updatePendingRevisions((current) =>
      expirePendingRevisions(current, now, SEND_CONFIRMATION_TIMEOUT_MS, timeoutError),
    );
  }, [now, t]);

  const joinedIds = useMemo(
    () => new Set(memberGroups.value.filter((group) => !isGeneralChatGroup(group)).map((group) => group.groupId)),
    [memberGroups.value],
  );
  const qortalJoinedIds = useMemo(
    () => new Set(qortalMemberGroups.value.map((group) => group.groupId)),
    [qortalMemberGroups.value],
  );
  // Invitations worth showing: unexpired, not already a member, and without a
  // join transaction already in flight (Core keeps the invite listed until
  // the join confirms).
  const pendingGroupInvites = useMemo(() => {
    const pendingJoinGroupIds = new Set(
      Object.values(trackedTransactions)
        .filter((transaction) => transaction.action === 'join' && transaction.phase === 'pending')
        .map((transaction) => transaction.groupId),
    );

    return groupInvites.value.filter(
      (invite) =>
        (!invite.expiry || invite.expiry > now) &&
        !joinedIds.has(invite.groupId) &&
        !pendingJoinGroupIds.has(invite.groupId),
    );
  }, [groupInvites.value, joinedIds, now, trackedTransactions]);
  const selectedGroup = selectedChat?.kind === 'group' ? selectedChat.group : null;
  const selectedDirect = selectedChat?.kind === 'direct' ? selectedChat.direct : null;
  const selectedGroupId = selectedGroup?.groupId ?? null;
  const selectedDirectAddress = selectedDirect?.address ?? null;
  const selectedChatKey = getSelectedChatKey(selectedChat);
  const selectedGroupConversationKey =
    selectedChat?.kind === 'group'
      ? getConversationKey({
          id: selectedChat.group.groupId,
          kind: 'group',
          network: selectedChat.network ?? 'qortium',
          protocol: 'chat',
        })
      : null;
  const selectedGroupIdRef = useRef<number | null>(selectedGroupId);
  const selectedDirectAddressRef = useRef<string | null>(selectedDirectAddress);
  // Live mirror of the selected chat key so async loads can drop results that
  // resolve after the user has switched chats (see loadMessages).
  const selectedChatKeyRef = useRef(selectedChatKey);
  // Live mirror of "a dialog (account info / avatar lightbox) is open", read
  // by lower-layer Escape handlers so one press dismisses one layer only.
  const hasStackedDialogRef = useRef(false);
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
  selectedDirectAddressRef.current = selectedDirectAddress;
  selectedChatKeyRef.current = selectedChatKey;
  hasSelectedChatRef.current = selectedChat !== null;
  currentAccountAddressRef.current = account?.address ?? null;
  hasStackedDialogRef.current =
    accountInfoTarget !== null || avatarLightboxImage !== null || deleteTarget !== null;
  const groupActivityById = useMemo(() => {
    const activity = new Map<number, number>();

    for (const activeGroup of activeChats.value.groups ?? []) {
      if (typeof activeGroup.timestamp === 'number' && !isHiddenActiveChatEntry(activeGroup)) {
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
  // Qortal counterpart of groupActivityById. Home 1.7 and Home 2 both expose
  // GET_ACTIVE_CHATS for Qortal, while loaded history remains an activity
  // floor for nodes whose active window omits an older conversation.
  const qortalGroupActivityByIdDisplay = useMemo(() => {
    const activity = new Map<number, number>();

    for (const activeGroup of qortalActiveChats.value.groups ?? []) {
      if (typeof activeGroup.timestamp === 'number' && !isHiddenActiveChatEntry(activeGroup)) {
        activity.set(activeGroup.groupId, activeGroup.timestamp);
      }
    }

    for (const [groupId, timestamp] of qortalGroupActivityById) {
      if (timestamp !== null) {
        activity.set(groupId, Math.max(activity.get(groupId) ?? Number.NEGATIVE_INFINITY, timestamp));
      }
    }

    return activity;
  }, [qortalActiveChats.value.groups, qortalGroupActivityById]);
  const directActivityByAddress = useMemo(() => {
    const activity = new Map<string, number>();

    for (const direct of activeChats.value.direct ?? []) {
      if (typeof direct.timestamp === 'number' && !isHiddenActiveChatEntry(direct)) {
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
      if (selectedChat?.network !== 'qortal' && groupId === selectedGroupId) {
        continue;
      }

      const lastRead = lastReadByGroupId.get(groupId);

      if (lastRead !== undefined && timestamp > lastRead) {
        ids.add(groupId);
      }
    }

    return ids;
  }, [groupActivityById, lastReadByGroupId, selectedChat?.network, selectedGroupId]);
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
  const unreadQortalGroupIds = useMemo(() => {
    const ids = new Set<number>();

    for (const [groupId, timestamp] of qortalGroupActivityByIdDisplay) {
      if (selectedChat?.network === 'qortal' && groupId === selectedGroupId) {
        continue;
      }

      const lastRead = lastReadByQortalGroupId.get(groupId);

      if (lastRead !== undefined && timestamp > lastRead) {
        ids.add(groupId);
      }
    }

    return ids;
  }, [lastReadByQortalGroupId, qortalGroupActivityByIdDisplay, selectedChat?.network, selectedGroupId]);
  const hasUnreadGroups = unreadGroupIds.size > 0;
  const hasUnreadQortalGroups = unreadQortalGroupIds.size > 0;
  const hasUnreadDirect = unreadDirectAddresses.size > 0;
  const canManageNotifications = !!account && canManageChatNotifications(actions);
  const canShowNotifications = canShowChatNotifications(actions);
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
  // One-line last-message previews for the sidebar rows. The active-chats entry
  // owns activity ordering/timestamps; a matching loaded conversation thread
  // can replace only its stale original body with the latest accepted edit.
  // This does not add any fetches. Closed groups' encrypted payloads remain
  // filtered out at render via group.isOpen.
  const groupPreviewByGroupId = useMemo(() => {
    const previews = new Map<number, string>();

    for (const activeGroup of activeChats.value.groups ?? []) {
      // A reaction entry has no preview-worthy body ("X: Empty message") and its
      // timestamp is already excluded from sidebar activity; show no preview.
      if (!activeGroup.data || isHiddenActiveChatEntry(activeGroup)) {
        continue;
      }

      const loadedRevision = loadedGroupPreviewById.get(activeGroup.groupId);
      const isCurrentRevision =
        !!loadedRevision &&
        loadedRevision.activityTimestamp === activeGroup.timestamp &&
        loadedRevision.originalData === activeGroup.data &&
        loadedRevision.originalSender === (activeGroup.sender ?? null) &&
        loadedRevision.originalSignature === (activeGroup.signature ?? null);

      // Once loaded history proves the active entry was deleted, leave the row
      // preview empty. Showing either the original body or a tombstone would
      // defeat the sender's request to remove the message from visible chat UI.
      if (isCurrentRevision && loadedRevision.isDeleted) {
        continue;
      }

      const previewMessage = isCurrentRevision
        ? loadedRevision.latest
        : { data: activeGroup.data, encoding: activeGroup.encoding ?? 'BASE64' as const, isText: true };
      const snippet = getMessageSnippet(previewMessage, t, 80);

      previews.set(
        activeGroup.groupId,
        activeGroup.senderName ? `${activeGroup.senderName}: ${snippet}` : snippet,
      );
    }

    return previews;
  }, [activeChats.value.groups, loadedGroupPreviewById, t]);
  const qortalGroupPreviewByGroupId = useMemo(() => {
    const previews = new Map<number, string>();

    for (const activeGroup of qortalActiveChats.value.groups ?? []) {
      if (!activeGroup.data || isHiddenActiveChatEntry(activeGroup)) {
        continue;
      }

      const snippet = getMessageSnippet(
        { data: activeGroup.data, encoding: activeGroup.encoding ?? 'BASE64', isText: true },
        t,
        80,
      );

      previews.set(
        activeGroup.groupId,
        activeGroup.senderName ? `${activeGroup.senderName}: ${snippet}` : snippet,
      );
    }

    return previews;
  }, [qortalActiveChats.value.groups, t]);
  const groupConversations = useMemo(
    () =>
      sortedGroups.map((group) =>
        createGroupConversationSummary({
          access: 'interactive',
          activityAt: groupActivityById.get(group.groupId) ?? null,
          group,
          memberCount:
            syntheticMemberCountsByGroupId.get(group.groupId) ??
            (isGeneralChatGroup(group) ? null : group.memberCount ?? null),
          membership: isGeneralChatGroup(group) ? 'public' : 'joined',
          network: 'qortium',
          preview: groupPreviewByGroupId.get(group.groupId) ?? null,
          title: getGroupTitle(group, t),
          unread: unreadGroupIds.has(group.groupId),
        }),
      ),
    [
      groupActivityById,
      groupPreviewByGroupId,
      sortedGroups,
      syntheticMemberCountsByGroupId,
      t,
      unreadGroupIds,
    ],
  );
  const groupDiscoveryConversations = useMemo(
    () =>
      groupDiscoveries.value
        .filter(({ group }) => !joinedIds.has(group.groupId))
        .map(({ activityAt, group, latestMessage }) =>
          createGroupConversationSummary({
            access: 'read-only',
            activityAt,
            group,
            membership: 'preview',
            network: 'qortium',
            preview: getMessageSnippet(latestMessage, t, 80),
            title: getGroupTitle(group, t),
          }),
        ),
    [groupDiscoveries.value, joinedIds, t],
  );
  const qortalGroupConversations = useMemo(
    () =>
      sortGroups(qortalGroups.value, t, qortalGroupActivityByIdDisplay).map((group) =>
        createGroupConversationSummary({
          access: 'interactive',
          activityAt: qortalGroupActivityByIdDisplay.get(group.groupId) ?? null,
          group,
          membership: 'joined',
          network: 'qortal',
          preview: qortalGroupPreviewByGroupId.get(group.groupId) ?? null,
          title: getGroupTitle(group, t),
          unread: unreadQortalGroupIds.has(group.groupId),
        }),
      ),
    [qortalGroupActivityByIdDisplay, qortalGroupPreviewByGroupId, qortalGroups.value, t, unreadQortalGroupIds],
  );
  const qortalGroupDiscoveryConversations = useMemo(
    () =>
      qortalGroupDiscoveries.value
        .filter(({ group }) => !qortalJoinedIds.has(group.groupId))
        .map(({ activityAt, group, latestMessage }) =>
          createGroupConversationSummary({
            access: 'read-only',
            activityAt,
            group,
            membership: 'preview',
            network: 'qortal',
            preview: getMessageSnippet(latestMessage, t, 80),
            title: getGroupTitle(group, t),
          }),
        ),
    [qortalGroupDiscoveries.value, qortalJoinedIds, t],
  );
  // Direct entries come from the decrypted private list when Home provides it;
  // anything still encrypted stays preview-less rather than showing a stub.
  const directPreviewByAddress = useMemo(() => {
    const previews = new Map<string, string>();

    for (const direct of activeChats.value.direct ?? []) {
      if (
        !direct.data ||
        (direct.isEncrypted && direct.decryptionStatus !== 'DECRYPTED') ||
        isHiddenActiveChatEntry(direct)
      ) {
        continue;
      }

      previews.set(direct.address, getMessageSnippet(direct, t, 80));
    }

    return previews;
  }, [activeChats.value.direct, t]);
  // Memoized: this array feeds the memoized MessageList as `systemMessages`,
  // and a fresh identity per render would defeat its memo bailout.
  const selectedTransactions = useMemo(
    () =>
      Object.values(trackedTransactions).filter(
        (transaction) => selectedGroupId !== null && transaction.groupId === selectedGroupId,
      ),
    [trackedTransactions, selectedGroupId],
  );
  // The rendered feed is the live tail plus any older history paged in behind
  // it. The live tail only participates while it belongs to the selected chat
  // (`hasSelectedMessages`): after a failed switch load, `messages.value` still
  // holds the previous chat's transcript, which must never render under the new
  // chat's header. Older history is per-chat (re-seeded by the switch effect),
  // so it is always safe to show.
  const combinedMessages = useMemo(() => {
    const liveTail = hasSelectedMessages ? messages.value : emptyMessages;

    return olderMessages.length === 0 ? liveTail : mergeMessages(olderMessages, liveTail, Infinity);
  }, [olderMessages, messages.value, hasSelectedMessages]);
  // Optimistic overlay for the open chat only: a still-sending/failed message
  // or reaction from another chat must not bleed into this one. Reconciliation
  // itself (dropping an entry once its signature is confirmed) is the pure
  // mergeOptimisticMessages / prunePendingSends pair in pendingSends.ts.
  const pendingSendsForSelectedChat = useMemo(
    () => (selectedChatKey ? pendingSends.filter((entry) => entry.chatKey === selectedChatKey) : emptyPendingSends),
    [pendingSends, selectedChatKey],
  );
  const displayMessages = useMemo(
    () => mergeOptimisticMessages(combinedMessages, pendingSendsForSelectedChat),
    [combinedMessages, pendingSendsForSelectedChat],
  );
  const pendingRevisionBySignature = useMemo(
    () => indexPendingRevisionsByTarget(pendingRevisions, selectedChatKey),
    [pendingRevisions, selectedChatKey],
  );
  // Drop a pending send/revision once its resolved signature actually shows up
  // in a fetched/live message — regardless of which path delivered it (the
  // quiet reload runPendingSend/runPendingRevision already fire, the group
  // websocket's next frame, or the 15s poll). This is the state-side half of
  // "confirmed replace on signature match"; mergeOptimisticMessages is the
  // render-side half.
  useEffect(() => {
    // messages.value is always exactly one chat's (one network's) transcript;
    // prunePendingSends/prunePendingRevisions run over the FULL pending list
    // (every chat, both networks), so the identity here is (network,
    // signature) — see getPendingSignatureIdentity — not a bare signature.
    const confirmedNetwork = selectedChat?.network ?? 'qortium';
    const confirmedSignatures = new Set<string>();

    for (const entry of messages.value) {
      if (entry.signature) {
        confirmedSignatures.add(getPendingSignatureIdentity(confirmedNetwork, entry.signature));
      }
    }

    if (confirmedSignatures.size === 0) {
      return;
    }

    updatePendingSends((current) => prunePendingSends(current, confirmedSignatures));
    updatePendingRevisions((current) => prunePendingRevisions(current, confirmedSignatures));
  }, [messages.value, selectedChat?.network]);
  // Stable identities for every handler passed to the memoized GroupList /
  // DirectList / MessageList (the handlers themselves are re-declared each
  // render). With these, the shared 30s clock is the only prop that should
  // invalidate the lists on a quiet tick. The wrapped functions are declared
  // later in this component; function declarations hoist.
  const handleSelectGroup = useStableCallback((conversation: GroupConversationSummary) =>
    selectGroup(conversation.group),
  );
  const handleSelectQortalGroup = useStableCallback((conversation: GroupConversationSummary) =>
    selectQortalGroup(conversation.group),
  );
  const handleSelectDirect = useStableCallback(selectDirect);
  const handleRemoveDirect = useStableCallback(removeDirect);
  const handleStartReply = useStableCallback(startReply);
  const handleStartEdit = useStableCallback(startEdit);
  const handleLoadOlderMessages = useStableCallback(() => void loadOlderMessages());
  const handleReactToMessage = useStableCallback(
    (message: ChatMessage, reaction: string, contentState: boolean) =>
      void handleMessageReaction(message, reaction, contentState),
  );
  const handleRetryMessage = useStableCallback((localId: string) => handleRetryPendingSend(localId));
  const handleDiscardMessage = useStableCallback((localId: string) => handleDiscardPendingSend(localId));
  const handleRetryRevision = useStableCallback((localId: string) => handleRetryPendingRevision(localId));
  const handleDiscardRevision = useStableCallback((localId: string) => handleDiscardPendingRevision(localId));
  const flushScrollBookmarks = useStableCallback(() => {
    window.clearTimeout(scrollPersistTimerRef.current);
    scrollPersistTimerRef.current = 0;

    const address = scrollPersistAddressRef.current;

    scrollPersistAddressRef.current = null;

    if (address) {
      writeScrollBookmarks(address, scrollPositionsRef.current);
    }
  });
  const handleScrollPositionChange = useStableCallback((chatKey: string, position: ChatScrollPosition) => {
    scrollPositionsRef.current.set(chatKey, position);

    if (!account) {
      return;
    }

    // Persist the bookmark so the reading position survives a restart — on a
    // trailing debounce: scroll events fire at frame rate during flings, and a
    // synchronous localStorage JSON write per event janks the feed. The map
    // above is always current; the write catches up on a pause and is flushed
    // on hide/unmount/account switch.
    scrollPersistAddressRef.current = account.address;
    window.clearTimeout(scrollPersistTimerRef.current);
    scrollPersistTimerRef.current = window.setTimeout(flushScrollBookmarks, 400);
  });
  const knownAvatarNames = useMemo(() => {
    const namesByAddress = new Map<string, string>();
    const accountName = normalizeRegisteredName(account?.name);

    if (account?.address && accountName) {
      namesByAddress.set(getAvatarProfileKey('qortium', account.address), accountName);
    }

    const qortalAccountName = normalizeRegisteredName(qortalAccount?.name);
    if (qortalAccount?.address && qortalAccountName) {
      namesByAddress.set(getAvatarProfileKey('qortal', qortalAccount.address), qortalAccountName);
    }

    const accountInfoName = normalizeRegisteredName(accountInfoTarget?.senderName);

    if (accountInfoTarget?.sender && accountInfoName) {
      namesByAddress.set(
        getAvatarProfileKey(accountInfoTarget.network, accountInfoTarget.sender),
        accountInfoName,
      );
    }

    for (const direct of mergedDirects) {
      // Direction-aware: senderName/recipientName describe the latest message,
      // which the local account may have sent — mapping that name onto the
      // counterpart's address would poison name display everywhere.
      const directName = normalizeRegisteredName(getDirectCounterpartName(direct));

      const key = getAvatarProfileKey('qortium', direct.address);
      if (directName && !namesByAddress.has(key)) {
        namesByAddress.set(key, directName);
      }
    }

    const selectedNetwork = selectedChat?.network ?? 'qortium';
    for (const message of messages.value) {
      const senderName = normalizeRegisteredName(message.senderName);
      const key = getAvatarProfileKey(selectedNetwork, message.sender);

      if (senderName && !namesByAddress.has(key)) {
        namesByAddress.set(key, senderName);
      }
    }

    for (const member of selectedGroupMembers) {
      const address = getGroupMemberAddress(member);
      const memberName = getGroupMemberRegisteredName(member);
      const key = address ? getAvatarProfileKey(selectedNetwork, address) : '';

      if (address && memberName && !namesByAddress.has(key)) {
        namesByAddress.set(key, memberName);
      }
    }

    if (selectedGroup?.owner && selectedGroup.ownerPrimaryName) {
      namesByAddress.set(
        getAvatarProfileKey(selectedNetwork, selectedGroup.owner),
        selectedGroup.ownerPrimaryName,
      );
    }

    return namesByAddress;
  }, [
    account?.address,
    account?.name,
    qortalAccount?.address,
    qortalAccount?.name,
    accountInfoTarget?.sender,
    accountInfoTarget?.senderName,
    accountInfoTarget?.network,
    mergedDirects,
    messages.value,
    selectedChat?.network,
    selectedGroup?.owner,
    selectedGroup?.ownerPrimaryName,
    selectedGroupMembers,
  ]);
  const avatarTargets = useMemo(() => {
    const targets = new Map<string, AvatarTarget>();
    const add = (network: ChatNetwork, address: string | null | undefined) => {
      if (address && targets.size < 96) targets.set(getAvatarProfileKey(network, address), { address, network });
    };

    add('qortium', account?.address);
    add('qortal', qortalAccount?.address);

    if (accountInfoTarget?.sender) {
      add(accountInfoTarget.network, accountInfoTarget.sender);
    }

    const selectedNetwork = selectedChat?.network ?? 'qortium';
    // Prefer the newest senders and keep the cache bounded even after a long
    // history page-in. The selected feed and currently rendered row surfaces
    // are the only identities that should trigger avatar traffic.
    for (let index = combinedMessages.length - 1; index >= 0; index -= 1) {
      add(selectedNetwork, combinedMessages[index]?.sender);
    }

    for (const direct of mergedDirects) {
      // A collapsed direct list renders only unread rows plus the selected
      // chat. Do not download an image just because a direct is stored.
      if (!isDirectCollapsed || unreadDirectAddresses.has(direct.address) || direct.address === selectedDirectAddress) {
        add('qortium', direct.address);
      }
    }

    if (showGroupMembers && membersOpen) {
      for (const member of selectedGroupMembers) {
        const address = getGroupMemberAddress(member);

        if (address) {
          add(selectedNetwork, address);
        }
      }
    }

    if (approvalModalOpen) {
      for (const transaction of pendingApprovals.value) {
        if (transaction.creatorAddress) {
          add('qortium', transaction.creatorAddress);
        }
      }
    }

    return Array.from(targets.values());
  }, [
    account?.address,
    qortalAccount?.address,
    accountInfoTarget?.sender,
    accountInfoTarget?.network,
    approvalModalOpen,
    combinedMessages,
    isDirectCollapsed,
    membersOpen,
    mergedDirects,
    pendingApprovals.value,
    selectedDirectAddress,
    selectedChat?.network,
    selectedGroupMembers,
    showGroupMembers,
    unreadDirectAddresses,
  ]);
  const avatarProfiles = useAvatarProfiles(
    avatarTargets,
    knownAvatarNames,
    avatarActionsByNetwork,
    avatarActionKeysByNetwork,
    avatarLightboxImage?.src ?? null,
  );
  const qortiumAvatarProfiles = useMemo(
    () => selectAvatarProfilesForNetwork(avatarProfiles, 'qortium'),
    [avatarProfiles],
  );
  const qortalAvatarProfiles = useMemo(
    () => selectAvatarProfilesForNetwork(avatarProfiles, 'qortal'),
    [avatarProfiles],
  );
  const selectedAvatarProfiles = selectedChat?.network === 'qortal' ? qortalAvatarProfiles : qortiumAvatarProfiles;
  const qortiumKnownAvatarNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const [key, name] of knownAvatarNames) {
      if (key.startsWith('qortium:')) names.set(key.slice('qortium:'.length), name);
    }
    return names;
  }, [knownAvatarNames]);
  const groupAvatarTargets = useMemo(() => {
    const targets = new Map<string, GroupAvatarTarget>();
    const counts: Record<ChatNetwork, number> = { qortal: 0, qortium: 0 };
    const add = (target: GroupAvatarTarget) => {
      if (target.group.groupId < 1) return;
      const key = getGroupAvatarProfileKey(target.network, target.group.groupId);
      if (targets.has(key) || counts[target.network] >= 48) return;
      targets.set(key, target);
      counts[target.network] += 1;
    };

    if (selectedGroup && selectedChat?.network) add({ group: selectedGroup, network: selectedChat.network });
    if (!isGroupsCollapsed) for (const conversation of groupConversations) add(conversation);
    if (isGroupSearchVisible) for (const conversation of groupDiscoveryConversations) add(conversation);
    if (!isQortalGroupsCollapsed) for (const conversation of qortalGroupConversations) add(conversation);
    if (isQortalGroupSearchOpen) for (const conversation of qortalGroupDiscoveryConversations) add(conversation);

    return Array.from(targets.values());
  }, [
    groupConversations,
    groupDiscoveryConversations,
    isGroupSearchVisible,
    isGroupsCollapsed,
    isQortalGroupSearchOpen,
    isQortalGroupsCollapsed,
    qortalGroupConversations,
    qortalGroupDiscoveryConversations,
    selectedChat?.network,
    selectedGroup,
  ]);
  const groupAvatarProfiles = useGroupAvatarProfiles(
    groupAvatarTargets,
    avatarActionsByNetwork,
    avatarActionKeysByNetwork,
    avatarLightboxImage?.src ?? null,
  );
  const selectedGroupAvatar = selectedGroup && selectedChat?.network
    ? groupAvatarProfiles.get(getGroupAvatarProfileKey(selectedChat.network, selectedGroup.groupId))
    : undefined;

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
  // network !== 'qortal': joinedIds is derived purely from Qortium's
  // memberGroups — without this guard, a Qortal group would coincidentally
  // read as "joined" whenever a Qortium group happens to share the same
  // numeric groupId the user has actually joined on Qortium, which would let
  // a Leave click fire a Qortium LEAVE_GROUP against a Qortal-selected chat.
  const isJoinedGroup =
    selectedGroupId !== null && selectedChat?.network !== 'qortal' && joinedIds.has(selectedGroupId);
  // network !== 'qortal' keeps this (and everything gated on it below —
  // isSelectedGroupMembershipConfirmed, showGroupComposerNotice, the closed-
  // group history label, ...) from ever firing for a Qortal chat, which has
  // its own parallel gates (see showQortalGroupComposerNotice etc.).
  const isRegularSelectedGroup = selectedChat?.kind === 'group' && selectedChat.network !== 'qortal' && !isSelectedGeneralChat;
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
  // network !== 'qortal': JOIN_GROUP is not in the Qortal bridge slice at all
  // (see docs/HOME_V2_BRIDGE_COMPATIBILITY.md in qortium-home) — without this,
  // isSelectedGroupMembershipConfirmed's Qortium-only !isRegularSelectedGroup
  // shortcut (true for any non-general chat network doesn't recognize) would
  // make a Qortal group look "joinable", and clicking Join would fire a
  // Qortium JOIN_GROUP request against a Qortal groupId.
  const isJoinableGroup =
    selectedGroupId !== null &&
    selectedGroupId > 0 &&
    selectedChat?.network !== 'qortal' &&
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
  // Chat 2.0 slice 2: Qortal composer gating. Mirrors the Qortium block above
  // (canPostInSelectedGroup / canComposeMessage / ...) but against the Qortal
  // bridge/account/membership — Core rejects a CHAT_MESSAGE to a group the
  // sender has not joined on Qortal too, and there is no JOIN_GROUP bridge
  // action there in this slice to fix that from inside the app, so this only
  // ever gates the composer (no join affordance — see qortalGroupComposerNotice).
  const canSendQortalGroupChat = hasAction(qortalBridge.value.actions, 'SEND_CHAT_MESSAGE');
  const isSelectedQortalGroup = selectedChat?.kind === 'group' && selectedChat.network === 'qortal';
  const isConfirmedJoinedQortalGroup =
    isSelectedQortalGroup &&
    qortalMemberGroups.phase === 'ready' &&
    qortalMemberGroups.value.some((candidate) => candidate.groupId === selectedGroupId);
  const canPostInSelectedQortalGroup =
    isSelectedQortalGroup &&
    selectedChat.group.isOpen === true &&
    isConfirmedJoinedQortalGroup;
  // Qortal has no UNLOCK_SELECTED_ACCOUNT shortcut of its own — a pure-Qortal
  // send depends on the shared Home wallet already being unlocked via
  // Qortium's canUseSelectedAccount gate (see handleSendMessage's reuse of
  // ensureSelectedAccountUnlocked), plus having actually resolved a Qortal
  // identity to send as.
  const canUseQortalAccount = canUseSelectedAccount && !!qortalAccount;
  // On a public/network node Home only accepts the keyless broadcast for open
  // groups; direct and closed-group sends are rejected there. Block them in the
  // UI so we never present an unsupported send. Trusted nodes are unaffected.
  const isPublicNodeSendBlocked =
    !!selectedChat &&
    (selectedChat.network === 'qortal'
      ? selectedChat.kind === 'group' &&
        isPublicNodeSendUnsupported(qortalBridge.value.isUsingPublicNode, { group: selectedChat.group, kind: 'group' })
      : isPublicNodeSendUnsupported(
          bridge.value.isUsingPublicNode,
          selectedChat.kind === 'group' ? { group: selectedChat.group, kind: 'group' } : { kind: 'direct' },
        ));
  const canComposeMessage =
    !!selectedChat &&
    !isPublicNodeSendBlocked &&
    (selectedChat.network === 'qortal'
      ? canUseQortalAccount && canSendQortalGroupChat && canPostInSelectedQortalGroup
      : canUseSelectedAccount &&
        (selectedChat.kind === 'group' ? canSendGroupChat && canPostInSelectedGroup : canSendDirectChat));
  const canSubmitMessage =
    canComposeMessage &&
    (draft.trim().length > 0 || stagedAttachment?.phase === 'ready') &&
    !sendPending;
  // Attachments are public QDN data (no encrypt-on-publish in Home yet), so
  // they are offered in open groups only, and publishing requires the Home
  // bridge plus a registered name to publish under. Edits keep the original
  // message's media, so no attaching mid-edit. PUBLISH_QDN_RESOURCE is
  // Qortium-only (deferred on qortalRequest), so a Qortal chat never attaches.
  const canAttach =
    selectedChat?.kind === 'group' &&
    selectedChat.network !== 'qortal' &&
    selectedChat.group.isOpen !== false &&
    canComposeMessage &&
    composeContext?.kind !== 'edit' &&
    !!normalizeRegisteredName(account?.name) &&
    hasAction(actions, 'PUBLISH_QDN_RESOURCE');
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
  // No renderJoinGroupButton counterpart — JOIN_GROUP is not in the Qortal
  // bridge slice at all (docs/HOME_V2_BRIDGE_COMPATIBILITY.md in
  // qortium-home), so this notice is informational only.
  const showQortalGroupComposerNotice = canUseQortalAccount && canSendQortalGroupChat && isSelectedQortalGroup && !canPostInSelectedQortalGroup;
  const qortalGroupComposerNotice =
    isSelectedQortalGroup && selectedChat.group.isOpen !== true
      ? t('action.closedGroupHistoryUnsupported')
      : qortalMemberGroups.phase === 'error'
      ? t('hint.groupMembershipUnavailable')
      : qortalMemberGroups.phase !== 'ready'
        ? t('hint.groupMembershipChecking')
        : t('hint.groupJoinToPost');
  // "Own message" styling and reply/mention self-detection must compare
  // against THIS chat's chain identity — a confirmed Qortal message carries a
  // Qortal sender address, which never equals the Qortium account.address.
  const selfIdentity = getChatSelfIdentity(
    selectedChat?.network ?? 'qortium',
    account,
    qortalAccount,
  );
  const selfAddress = selfIdentity.address;
  const selfName = normalizeRegisteredName(selfIdentity.name);
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
  // Reuses the same two labels — both are Home-app wording ("Open in Qortium
  // Home to..."), accurate regardless of which chain the group chat is on.
  const qortalGroupSendUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : !qortalAccount
      ? qortalAccountError || accountRequiredLabel
    : qortalBridge.value.isHomeBridge
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
  // network !== 'qortal': DEV_GROUP_IDS/GROUP_APPROVAL are Qortium-only —
  // without this a Qortal group could coincidentally share a numeric groupId
  // with a Qortium dev-approval group (small ids collide easily) and surface
  // Qortium approval-vote controls while a Qortal chat is open.
  const isSelectedDevGroup =
    selectedGroupId !== null && selectedChat?.network !== 'qortal' && DEV_GROUP_IDS.has(selectedGroupId);
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
  const topActionUnavailableLabel =
    selectedChat?.kind === 'group' &&
    selectedGroupId !== null &&
    selectedGroupId > 0 &&
    isSelectedGroupMembershipConfirmed &&
    !isConfirmedJoinedGroup &&
    canJoinGroup &&
    !canSubmitJoin
      ? hasPendingJoinTransaction
        ? t('button.join.transaction.pending')
        : hasPendingJoinRequest
          ? t('button.join.request.pending')
          : groupJoinUnavailableLabel
      : selectedChat?.kind === 'group' &&
          selectedGroupId !== null &&
          selectedGroupId > 0 &&
          isConfirmedJoinedGroup &&
          canLeaveGroup &&
          !canSubmitLeave
        ? hasPendingLeaveTransaction
          ? t('button.leave.transaction.pending')
          : groupLeaveUnavailableLabel
        : showMintingControls && accountMintingStatus?.isMinting !== true && !canSubmitStartMinting
          ? startMintingTitle
          : '';

  async function loadGroupDiscoveries(nextSearch = search, actionList = actions) {
    const requestId = ++groupDiscoveryRequestRef.current;

    setGroupDiscoveries((current) => ({ phase: 'loading', value: current.value }));

    try {
      const catalogue = await searchGroups('qortium', nextSearch, actionList);
      const discoveries = await qualifyPublicGroupDiscoveries({
        groups: catalogue,
        loadMessages: (group) =>
          getGroupMessages('qortium', group, actionList, {
            decryptPrivate: false,
            limit: ACTIVITY_SWEEP_MESSAGE_LIMIT,
          }),
        memberGroupIds: new Set(memberGroups.value.map((group) => group.groupId)),
      });

      if (groupDiscoveryRequestRef.current === requestId) {
        setGroupDiscoveries({ phase: 'ready', value: discoveries });
      }
    } catch (error) {
      if (groupDiscoveryRequestRef.current === requestId) {
        setGroupDiscoveries({
          error: getBridgeErrorMessage(error, t('status.loadingError.groups'), t),
          phase: 'error',
          value: [],
        });
      }
    }
  }

  // --- Chat 2.0 slice 2: Qortal groups --------------------------------------
  // Discovery is always explicit: neither network loads the public catalogue
  // during startup or account refresh. That keeps joined chats stable while a
  // user is composing and bounds the extra public-node reads to this surface.
  async function loadQortalGroupDiscoveries(
    nextSearch = qortalSearch,
    actionList = qortalBridge.value.actions,
  ) {
    const requestId = ++qortalGroupDiscoveryRequestRef.current;

    setQortalGroupDiscoveries((current) => ({ phase: 'loading', value: current.value }));

    try {
      const catalogue = await searchGroups('qortal', nextSearch, actionList);
      const discoveries = await qualifyPublicGroupDiscoveries({
        groups: catalogue,
        loadMessages: (group) =>
          getGroupMessages('qortal', group, actionList, {
            decryptPrivate: false,
            limit: ACTIVITY_SWEEP_MESSAGE_LIMIT,
          }),
        memberGroupIds: new Set(qortalMemberGroups.value.map((group) => group.groupId)),
      });

      if (qortalGroupDiscoveryRequestRef.current === requestId) {
        setQortalGroupDiscoveries({ phase: 'ready', value: discoveries });
      }
    } catch (error) {
      if (qortalGroupDiscoveryRequestRef.current === requestId) {
        setQortalGroupDiscoveries({
          error: getBridgeErrorMessage(error, t('status.loadingError.groups'), t),
          phase: 'error',
          value: [],
        });
      }
    }
  }

  async function loadQortalActiveChats(
    address: string,
    actionList = qortalBridge.value.actions,
    options: { quiet?: boolean } = {},
  ) {
    const requestId = qortalActiveChatsRequestGuardRef.current.begin();

    if (!options.quiet) {
      setQortalActiveChats((current) => ({ phase: 'loading', value: current.value }));
    }

    try {
      const nextActiveChats = await getActiveChats('qortal', address, actionList);

      if (qortalActiveChatsRequestGuardRef.current.isLatest(requestId)) {
        setQortalActiveChats({ phase: 'ready', value: nextActiveChats });
      }
    } catch (error) {
      if (!options.quiet && qortalActiveChatsRequestGuardRef.current.isLatest(requestId)) {
        setQortalActiveChats((current) => ({
          error: getBridgeErrorMessage(error, t('status.loadingError.activeChats'), t),
          phase: 'error',
          value: current.value,
        }));
      }
    }
  }

  async function refreshQortalSelectedAccount(actionList = qortalBridge.value.actions) {
    const requestId = qortalAccountRefreshGuardRef.current.begin();

    qortalActiveChatsRequestGuardRef.current.begin();

    // A selected-account event means the old chain identity is no longer safe
    // to use. Clear it synchronously so the composer cannot send with the old
    // sender while Home resolves the new Qortal wallet account.
    setQortalAccount(null);
    setQortalAccountError('');
    setQortalMemberGroups({ phase: 'loading', value: emptyGroups });
    setQortalGroups({ phase: 'loading', value: emptyGroups });
    setQortalActiveChats({ phase: 'loading', value: emptyActiveChats });
    qortalGroupDiscoveryRequestRef.current += 1;
    setQortalGroupDiscoveries(createState([]));

    try {
      const snapshot = await loadQortalAccountSnapshot(actionList);

      if (!qortalAccountRefreshGuardRef.current.isLatest(requestId)) {
        return;
      }

      if (snapshot.phase === 'membership-error') {
        setQortalAccount(snapshot.account);
        setQortalMemberGroups({
          error: getBridgeErrorMessage(snapshot.error, t('status.loadingError.joinedGroups'), t),
          phase: 'error',
          value: emptyGroups,
        });
        setQortalGroups({
          error: getBridgeErrorMessage(snapshot.error, t('status.loadingError.joinedGroups'), t),
          phase: 'error',
          value: emptyGroups,
        });
        void loadQortalActiveChats(snapshot.account.address, actionList);
        return;
      }

      // Commit identity and membership from one request generation together,
      // so a late prior lookup cannot pair one account with another's groups.
      setQortalAccount(snapshot.account);
      setQortalAccountError('');
      setQortalMemberGroups({ phase: 'ready', value: snapshot.memberGroups });
      setQortalGroups({
        phase: 'ready',
        value: snapshot.memberGroups.filter((group) => group.groupId !== GENERAL_CHAT_GROUP_ID),
      });
      void loadQortalActiveChats(snapshot.account.address, actionList);
    } catch (error) {
      if (!qortalAccountRefreshGuardRef.current.isLatest(requestId)) {
        return;
      }

      setQortalAccount(null);
      setQortalAccountError(getBridgeErrorMessage(error, t('status.loadingError.selectedAccount'), t));
      setQortalMemberGroups({ phase: 'ready', value: emptyGroups });
      setQortalGroups({ phase: 'ready', value: emptyGroups });
      setQortalActiveChats({ phase: 'ready', value: emptyActiveChats });
    }
  }

  async function initializeQortalSession() {
    setQortalBridge({ phase: 'loading', value: qortalBridge.value });

    try {
      const nextBridge = await getNetworkBridgeState('qortal');

      setQortalBridge({ phase: 'ready', value: nextBridge });
      return nextBridge;
    } catch (error) {
      setQortalBridge({
        error: getBridgeErrorMessage(error, t('status.loadingError.bridge'), t),
        phase: 'error',
        value: qortalBridge.value,
      });
      return null;
    }
  }

  async function loadGroupMembers(
    group: GroupData,
    actionList = actions,
    options: { network?: ChatNetwork; quiet?: boolean } = {},
  ) {
    const requestId = groupMembersRequestGuardRef.current.begin();

    if (isGeneralChatGroup(group)) {
      setGroupMembers({ phase: 'ready', value: emptyMembers });
      return;
    }

    if (!options.quiet) {
      setGroupMembers({ phase: 'loading', value: groupMembers.value });
    }

    try {
      const members = await getGroupMembers(options.network ?? 'qortium', group.groupId, actionList);

      if (groupMembersRequestGuardRef.current.isLatest(requestId)) {
        setGroupMembers({ phase: 'ready', value: members });
      }
    } catch (error) {
      // Quiet 30s refreshes keep the last good roster on a transient blip
      // instead of flashing an error banner (same rule as loadMessages).
      if (options.quiet || !groupMembersRequestGuardRef.current.isLatest(requestId)) {
        return;
      }

      setGroupMembers((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.groupMembers'), t),
        phase: 'error',
        value: current.value,
      }));
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
      // Quiet 30s refreshes keep the last good value on a transient blip;
      // this error renders as a persistent banner over every chat otherwise.
      if (options.quiet) {
        return;
      }

      setAccountJoinRequests((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.joinRequests'), t),
        phase: 'error',
        value: current.value,
      }));
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
      // Quiet 30s refreshes keep the last good value on a transient blip;
      // this error renders as a persistent banner over every chat otherwise.
      if (options.quiet) {
        return;
      }

      setAdminJoinRequests((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.groupApprovals'), t),
        phase: 'error',
        value: current.value,
      }));
    }
  }

  async function loadGroupInvites(
    selectedAccount: QdnSelectedAccount,
    options: { quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setGroupInvites({ phase: 'loading', value: groupInvites.value });
    }

    try {
      setGroupInvites({ phase: 'ready', value: await getGroupInvites(selectedAccount.address) });
    } catch (error) {
      // Quiet 30s refreshes keep the last good value on a transient blip.
      if (options.quiet) {
        return;
      }

      setGroupInvites((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.invites'), t),
        phase: 'error',
        value: current.value,
      }));
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
      // Quiet refreshes keep the last good value on a transient blip.
      if (options.quiet) {
        return;
      }

      setMintingStatus((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.minting'), t),
        phase: 'error',
        value: current.value,
      }));
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
      const nextActiveChats = await getActiveChats('qortium', selectedAccount.address, actionList);
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
    const generalOnly = withGeneralChatGroup(emptyGroups, '', t);

    setMemberGroups((current) => ({ phase: 'loading', value: current.value }));
    setGroups((current) => ({
      phase: 'loading',
      value: current.value.length > 0 ? current.value : generalOnly,
    }));

    try {
      const nextMemberGroups = await getMemberGroups('qortium', selectedAccount.address, actionList);

      setMemberGroups({ phase: 'ready', value: nextMemberGroups });
      setGroups({ phase: 'ready', value: withGeneralChatGroup(nextMemberGroups, '', t) });
    } catch (error) {
      const message = getBridgeErrorMessage(error, t('status.loadingError.joinedGroups'), t);

      setMemberGroups((current) => ({
        error: message,
        phase: 'error',
        value: current.value,
      }));
      setGroups((current) => ({ error: message, phase: 'error', value: current.value }));
    }

    await loadActiveChats(selectedAccount, actionList);

    void loadAccountJoinRequests(selectedAccount, actionList);
    void loadAdminJoinRequests(selectedAccount, actionList);
    void loadGroupInvites(selectedAccount);
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

    // Qortal groups take a small, self-contained path (below): no direct-chat
    // branch (Qortal DM is deferred), no private-group decrypt/key-recovery
    // (not advertised on qortalRequest in this slice — see getGroupMessages),
    // and its own activity map, so nothing here needs to change for Qortium.
    // (chat.kind is always 'group' for network 'qortal' by construction —
    // selectQortalGroup is the only place that sets network: 'qortal' — the
    // kind check just gives TypeScript the same narrowing.)
    if (chat.network === 'qortal' && chat.kind === 'group') {
      return loadQortalGroupMessages(chat, { quiet: options.quiet });
    }

    const canReadUnlockedMessages = options.accountUnlocked ?? isAccountUnlocked;
    const chatKey = getSelectedChatKey(chat);
    // A load can outlive its chat: the switch effect clears timers/sockets but
    // cannot cancel an in-flight promise, and quiet callers (post-send refresh,
    // key recovery, the websocket REST fallback) capture the chat at call time.
    // Drop any result that resolves after the user has moved on, so one chat's
    // messages are never committed into another chat's pane (mirrors the
    // request guard loadPendingApprovals already uses).
    const isStale = () => selectedChatKeyRef.current !== chatKey;

    if (isStale()) {
      return;
    }

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
          ? await getGroupMessages('qortium', chat.group, actionList, { decryptPrivate: shouldDecryptPrivateGroup })
          : await getDirectMessages(chat.direct.address, actionList);

      // The activity merge is keyed by group/address, so it is correct for the
      // fetched chat even when the user has switched away — apply it either way.
      if (chat.kind === 'group') {
        setLoadedGroupActivityById((current) => mergeActivityTimestamp(current, chat.group.groupId, nextMessages));
      } else {
        setLoadedDirectActivityByAddress((current) => mergeActivityTimestamp(current, chat.direct.address, nextMessages));
      }

      if (isStale()) {
        return;
      }

      setMessagesChatKey(chatKey);
      setMessages((current) => {
        const value = options.quiet
          ? retainChatMessagesWhenEqual(current.value, nextMessages)
          : nextMessages;

        return options.quiet && current.phase === 'ready' && value === current.value
          ? current
          : { phase: 'ready', value };
      });

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
      // state and let the next poll recover. A stale request's failure equally
      // must not clobber whichever chat is open now.
      if (options.quiet || isStale()) {
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

  // Qortal counterpart of the group-open branch of loadMessages above, minus
  // everything that branch has to handle for Qortium and Qortal does not yet
  // support: private-group decrypt/key-recovery and direct chat. Shares the
  // same `messages`/`messagesChatKey`/`olderMessagesState` — only one chat
  // (either network) is ever open in the single chat pane at a time.
  async function loadQortalGroupMessages(
    chat: Extract<SelectedChat, { kind: 'group' }>,
    options: { quiet?: boolean } = {},
  ) {
    const chatKey = getSelectedChatKey(chat);
    const isStale = () => selectedChatKeyRef.current !== chatKey;

    if (isStale()) {
      return;
    }

    if (!options.quiet) {
      setMessagesChatKey('');
      setMessages({ phase: 'loading', value: messages.value });
    }

    try {
      if (chat.group.isOpen === false) {
        // Same gate getGroupMessages applies server-side (no private-group
        // decrypt on qortalRequest in this slice) — fail the same way here so
        // the notice matches a closed Qortium group without that support.
        throw new Error('Closed group chat reads require Qortium Home private group chat support.');
      }

      const nextMessages = await getGroupMessages('qortal', chat.group, qortalBridge.value.actions, {});

      setQortalGroupActivityById((current) => mergeActivityTimestamp(current, chat.group.groupId, nextMessages));

      if (isStale()) {
        return;
      }

      setMessagesChatKey(chatKey);
      setMessages((current) => {
        const value = options.quiet ? retainChatMessagesWhenEqual(current.value, nextMessages) : nextMessages;

        return options.quiet && current.phase === 'ready' && value === current.value
          ? current
          : { phase: 'ready', value };
      });

      if (!options.quiet) {
        setOlderMessagesState({
          error: '',
          loading: false,
          reachedStart: nextMessages.length < DEFAULT_LIST_LIMIT,
        });
      }
    } catch (error) {
      if (options.quiet || isStale()) {
        return;
      }

      setMessagesChatKey('');
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

    // Same staleness rule as loadMessages: never commit a window fetched for a
    // chat the user has since left (the switch effect re-seeds older history
    // for the new chat, and a late result would overwrite that seed).
    const chatKey = getSelectedChatKey(chat);
    const isStale = () => selectedChatKeyRef.current !== chatKey;

    const shouldDecryptPrivateGroup =
      chat.kind === 'group' &&
      shouldDecryptGroupMessages(chat.group, {
        canReadPrivateGroupChat,
        isAccountUnlocked,
        isGroupMembershipConfirmed: memberGroups.phase === 'ready',
        isJoinedGroup: joinedIds.has(chat.group.groupId),
      });

    // Page backward from the oldest message currently shown (live tail + any
    // history already paged in). The live tail only counts while it belongs to
    // the selected chat — after a failed switch load it still holds the
    // previous chat's messages, which must not be folded into this chat's
    // paged history.
    const liveTail = hasSelectedMessages ? messages.value : emptyMessages;
    const loadedMessages = mergeMessages(olderMessages, liveTail, Infinity);
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
          ? await getGroupMessages(chat.network ?? 'qortium', chat.group, chat.network === 'qortal' ? qortalBridge.value.actions : actions, {
              before: olderBefore,
              decryptPrivate: chat.network === 'qortal' ? false : shouldDecryptPrivateGroup,
            })
          : await getDirectMessages(chat.direct.address, actions, { before: olderBefore });

      if (isStale()) {
        return;
      }

      const merged = mergeMessages(olderWindow, loadedMessages, Infinity);

      // A short window (fewer than the cap) means the Core has no more history
      // before this point; no net-new messages means the same (and guards
      // against same-timestamp windows that never advance).
      const reachedStart = olderWindow.length < DEFAULT_LIST_LIMIT || merged.length <= loadedMessages.length;

      setOlderMessages(merged);
      setOlderMessagesState({ error: '', loading: false, reachedStart });
    } catch (error) {
      if (isStale()) {
        return;
      }

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
    // Belt-and-suspenders membership gate: key recovery publishes a request as
    // this account, so never fire it for a group the account hasn't joined even
    // if a caller's gate ever regresses. Callers already require membership, but
    // keeping the precondition local to the side-effecting function prevents a
    // future caller from prompting a non-member.
    if (!joinedIds.has(group.groupId)) {
      return;
    }

    // Public/network node: the request + relay broadcasts are rejected, so the
    // prompts dead-end and nothing ever decrypts. Skip them entirely and show a
    // clear "needs a local/trusted node" notice instead of several futile
    // approval dialogs followed by silence.
    if (isPublicNodePrivateGroupKeyRecoveryUnsupported(bridge.value.isUsingPublicNode)) {
      setPrivateGroupKeyStatus('');
      setPrivateGroupKeyError(t('action.publicNodeSendUnavailable'));
      return;
    }

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

  async function handleAcceptInvite(invite: GroupInvite) {
    if (!canUseSelectedAccount || !canJoinGroup || inviteActionGroupId !== null) {
      return;
    }

    // An invited join is auto-approved by the standing invite, so the plain
    // JOIN_GROUP flow is all an accept needs. The invite may point at a group
    // outside the browsed list (closed groups often are); synthesize a
    // minimal GroupData for the transaction tracker in that case.
    const group =
      groups.value.find((candidate) => candidate.groupId === invite.groupId) ??
      ({ groupId: invite.groupId, groupName: `id:${invite.groupId}` } as GroupData);

    setInviteActionGroupId(invite.groupId);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      const result = await joinGroup(invite.groupId);

      trackTransaction({
        action: 'join',
        group,
        message: t('status.join.submitted'),
        result,
      });

      await loadAccountData(selectedAccount);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.join'), t));
    } finally {
      setInviteActionGroupId(null);
    }
  }

  // --- Optimistic send/reconcile plumbing (Chat 2.0 slice 1) ---------------
  // setPendingSends/setPendingRevisions alone would leave the detached async
  // send runners below reading a stale closure once a later render commits;
  // updating the ref in lockstep with every state write is what lets
  // runPendingSend/runPendingRevision (fired with `void`, not awaited by the
  // caller) always look up the current entry by localId.
  function updatePendingSends(updater: (current: PendingSend[]) => PendingSend[]) {
    setPendingSends(updatePendingStateRef(pendingSendsRef, updater));
  }

  function updatePendingRevisions(updater: (current: PendingRevision[]) => PendingRevision[]) {
    setPendingRevisions(updatePendingStateRef(pendingRevisionsRef, updater));
  }

  function pendingSendTargetFor(chat: SelectedChat): PendingSendTarget {
    return chat.kind === 'group'
      ? { groupId: chat.group.groupId, kind: 'group', network: chat.network }
      : { address: chat.direct.address, kind: 'direct', network: chat.network };
  }

  // This one dispatch point is what makes reactions/edits/deletes (which all
  // ride the same SEND_CHAT_MESSAGE path as a plain message — see
  // handleMessageReaction / runPendingRevision) work correctly for a Qortal
  // group too, with no extra plumbing: they already go through
  // pendingSendTargetFor + this function.
  function dispatchChatSend(target: PendingSendTarget, text: string, chatReference: string | undefined) {
    return target.kind === 'group'
      ? sendChatMessage(target.network ?? 'qortium', target.groupId, text, chatReference)
      : sendDirectChatMessage(target.address, text, chatReference);
  }

  // The actual network round trip (local MemoryPoW + broadcast — several
  // seconds) for a new message or reaction, run detached from the submit
  // handler so composing the next message is never blocked on it. Shared by
  // the first send and by a retry click.
  async function runPendingSend(
    localId: string,
    chat: SelectedChat,
    selectedAccount: QdnSelectedAccount,
    options: { onSettled?: () => void } = {},
  ) {
    const entry = pendingSendsRef.current.find((candidate) => candidate.localId === localId);

    if (!entry) {
      options.onSettled?.();
      return;
    }
    const attemptUpdatedAt = entry.delivery.updatedAt;

    try {
      const result = await dispatchChatSend(entry.target, entry.text, entry.chatReference);

      updatePendingSends((current) =>
        current.map((candidate) =>
          candidate.localId === localId &&
          candidate.delivery.phase === 'pending' &&
          candidate.delivery.updatedAt === attemptUpdatedAt
            ? resolvePendingSend(candidate, result)
            : candidate,
        ),
      );

      if (chat.kind === 'direct') {
        void loadActiveChats(selectedAccount, actions, { quiet: true });
      }

      // Only refresh the chat the send actually targets, and only while the
      // user is still on it — a stale-chat quiet refresh is a no-op at best
      // (loadMessages already guards on isStale()) and unnecessary work at
      // worst. If the user has moved on, the normal poll/websocket for that
      // chat picks up the confirmed message whenever they return to it.
      if (selectedChatKeyRef.current === entry.chatKey) {
        void loadMessages(chat, actions, { accountUnlocked: selectedAccount.isUnlocked, quiet: true });
      }
    } catch (error) {
      const fallback = entry.kind === 'reaction' ? t('status.loadingError.sendReaction') : t('status.loadingError.sendMessage');
      const message = getBridgeErrorMessage(error, fallback, t);

      updatePendingSends((current) =>
        current.map((candidate) =>
          candidate.localId === localId &&
          candidate.delivery.phase === 'pending' &&
          candidate.delivery.updatedAt === attemptUpdatedAt
            ? failPendingSend(candidate, message)
            : candidate,
        ),
      );

      // A failed reaction reverts its chip (mergeOptimisticMessages drops a
      // failed 'reaction' entry) — the existing write-error banner is enough
      // feedback for that lightweight action. A failed message/reply gets its
      // own bubble with a retry affordance instead (no banner needed there).
      if (entry.kind === 'reaction') {
        setWriteError(message);
      }
    } finally {
      options.onSettled?.();
    }
  }

  async function runPendingRevision(localId: string, chat: SelectedChat, selectedAccount: QdnSelectedAccount) {
    const entry = pendingRevisionsRef.current.find((candidate) => candidate.localId === localId);

    if (!entry) {
      return;
    }
    const attemptUpdatedAt = entry.delivery.updatedAt;

    try {
      const result = await dispatchChatSend(entry.target, entry.text, entry.chatReference);

      updatePendingRevisions((current) =>
        current.map((candidate) =>
          candidate.localId === localId &&
          candidate.delivery.phase === 'pending' &&
          candidate.delivery.updatedAt === attemptUpdatedAt
            ? resolvePendingRevision(candidate, result)
            : candidate,
        ),
      );

      if (chat.kind === 'direct') {
        void loadActiveChats(selectedAccount, actions, { quiet: true });
      }

      if (selectedChatKeyRef.current === entry.chatKey) {
        void loadMessages(chat, actions, { accountUnlocked: selectedAccount.isUnlocked, quiet: true });
      }
    } catch (error) {
      const message = getBridgeErrorMessage(error, t('status.loadingError.sendMessage'), t);

      updatePendingRevisions((current) =>
        current.map((candidate) =>
          candidate.localId === localId &&
          candidate.delivery.phase === 'pending' &&
          candidate.delivery.updatedAt === attemptUpdatedAt
            ? failPendingRevision(candidate, message)
            : candidate,
        ),
      );
    }
  }

  function handleRetryPendingSend(localId: string) {
    const chat = selectedChat;

    if (!chat) {
      return;
    }

    void (async () => {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      updatePendingSends((current) =>
        current.map((candidate) => (candidate.localId === localId ? retryPendingSend(candidate) : candidate)),
      );
      void runPendingSend(localId, chat, selectedAccount);
    })();
  }

  function handleDiscardPendingSend(localId: string) {
    updatePendingSends((current) => current.filter((candidate) => candidate.localId !== localId));
  }

  function handleRetryPendingRevision(localId: string) {
    const chat = selectedChat;

    if (!chat) {
      return;
    }

    void (async () => {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      updatePendingRevisions((current) =>
        current.map((candidate) => (candidate.localId === localId ? retryPendingRevision(candidate) : candidate)),
      );
      void runPendingRevision(localId, chat, selectedAccount);
    })();
  }

  function handleDiscardPendingRevision(localId: string) {
    updatePendingRevisions((current) => current.filter((candidate) => candidate.localId !== localId));
  }
  // ---------------------------------------------------------------------

  async function handleDeleteMessage(thread: MessageThread) {
    const chat = selectedChat;
    const chatReference = thread.original.signature ?? undefined;

    if (!chat || !canComposeMessage || !chatReference || deletePending) {
      return;
    }

    setDeletePending(true);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      // Same shape as an edit: a revision over the original's signature —
      // just with an empty body (the reply target is preserved so the
      // tombstone stays threaded).
      const message = buildDeletedMessageText(decodeChatMessage(thread.original).repliedTo);
      const chatKey = getSelectedChatKey(chat);
      const localId = createLocalSendId();

      updatePendingRevisions((current) => [
        ...current.filter((candidate) => !(candidate.chatKey === chatKey && candidate.chatReference === chatReference)),
        createPendingRevision({
          chatKey,
          chatReference,
          kind: 'delete',
          localId,
          target: pendingSendTargetFor(chat),
          text: message,
        }),
      ]);

      setDeleteTarget(null);
      void runPendingRevision(localId, chat, selectedAccount);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.sendMessage'), t));
    } finally {
      setDeletePending(false);
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

      // A quiet 30s refresh failure must not zero the queue: that hides the
      // "Pending approvals (N)" button (gated on count > 0) and empties an
      // open approval dialog on a transient blip — keep the last good value.
      if (options.quiet) {
        return;
      }

      setPendingApprovals((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.pendingApprovals'), t),
        phase: 'error',
        value: current.value,
      }));
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
    // Edits keep the original message's media; a staged new attachment does
    // not belong in an edit.
    setStagedAttachment(null);
    setAttachmentError('');
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
    const submittedDraft = draft;
    const chat = selectedChat;
    const context = composeContext;
    // Attachments publish via PUBLISH_QDN_RESOURCE, which is Qortium-only
    // (deferred on qortalRequest — see canAttach's network gate below), so a
    // Qortal chat never has a staged attachment to begin with; the network
    // check here is defense in depth.
    const staged =
      chat.kind === 'group' && chat.network !== 'qortal' && stagedAttachment?.phase === 'ready'
        ? stagedAttachment
        : null;
    let publishedLink = '';

    setSendPending(true);
    setWriteError('');

    try {
      // Qortal has no unlock shortcut of its own (a pure-Qortal app cannot
      // drive UNLOCK_SELECTED_ACCOUNT — see docs/HOME_V2_BRIDGE_COMPATIBILITY.md
      // in qortium-home); reusing this Qortium unlock is exactly what the doc
      // says a dual-chain app should do, since both chains sign from the same
      // underlying Home wallet.
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      if (staged && chat.kind === 'group') {
        // Publish the attachment first (Home shows its approval prompt);
        // only a successful publish gets linked into the message.
        const publisherName = normalizeRegisteredName(selectedAccount.name);

        if (!publisherName) {
          setWriteError(t('status.attachment.nameRequired'));
          return;
        }

        const identifier = buildAttachmentIdentifier(chat.group.groupId, Date.now());

        await publishQdnAttachment({
          dataBase64: staged.dataBase64,
          filename: staged.filename,
          identifier,
          name: publisherName,
          service: staged.service,
        });
        publishedLink = buildAttachmentLink(staged.service, publisherName, identifier);
      }

      const bodyText = publishedLink ? (text ? `${text}\n${publishedLink}` : publishedLink) : text;
      let message = bodyText;
      let chatReference: string | undefined;

      if (context?.kind === 'edit') {
        // An edit is a new transaction replacing the original via chatReference;
        // keep the original's reply target so the reply preview survives edits.
        chatReference = context.thread.original.signature ?? undefined;
        message = buildChatMessageText(bodyText, decodeChatMessage(context.thread.original).repliedTo);
      } else if (context?.kind === 'reply') {
        message = buildChatMessageText(bodyText, context.message.signature);
      }

      // The actual send (local MemoryPoW + broadcast, several seconds) runs
      // detached below so the composer is free for the next message right
      // away — an edit tracks its own lifecycle in pendingRevisions (see that
      // module's doc for why edits/deletes stay off the rendered echo path);
      // everything else (new message or reply) gets an optimistic bubble via
      // pendingSends.
      const chatKey = getSelectedChatKey(chat);
      const target = pendingSendTargetFor(chat);
      const localId = createLocalSendId();
      // The optimistic echo's sender must be THIS chat's chain identity — the
      // real confirmed message that eventually replaces it will carry the
      // Qortal sender address, and self/"own message" styling compares
      // against that same identity (see selfAddress below) — using the
      // Qortium account.address here would make a Qortal message never read
      // as "own" even after it confirms.
      const senderAddress = chat.network === 'qortal' ? (qortalAccount?.address ?? selectedAccount.address) : selectedAccount.address;
      const senderName = chat.network === 'qortal' ? (qortalAccount?.name ?? null) : selectedAccount.name;

      if (context?.kind === 'edit' && chatReference) {
        updatePendingRevisions((current) => [
          ...current.filter((candidate) => !(candidate.chatKey === chatKey && candidate.chatReference === chatReference)),
          createPendingRevision({ chatKey, chatReference, kind: 'edit', localId, target, text: message }),
        ]);
        void runPendingRevision(localId, chat, selectedAccount);
      } else {
        const pendingSend = createPendingSend({
          chatKey,
          chatReference,
          kind: 'message',
          localId,
          recipient: chat.kind === 'direct' ? chat.direct.address : null,
          recipientName: chat.kind === 'direct' ? (chat.direct.name ?? null) : null,
          sender: senderAddress,
          senderName,
          target,
          text: message,
          timestamp: Date.now(),
          txGroupId: chat.kind === 'group' ? chat.group.groupId : 0,
        });

        if (hasActiveDuplicateSend(pendingSendsRef.current, pendingSend)) {
          return;
        }

        updatePendingSends((current) => [...current, pendingSend]);
        void runPendingSend(localId, chat, selectedAccount);
      }

      // The sent text is consumed: drop any stashed draft for that chat, and
      // clear the live composer only if the user is still on it (they may have
      // switched chats while the send was pending — the swap stashed their
      // text, and the new chat's draft must not be wiped).
      draftsByChatKeyRef.current.delete(chatKey);

      if (selectedChatKeyRef.current === chatKey) {
        // The textarea stays enabled during the send, so only clear what was
        // actually submitted — anything typed since must survive.
        setDraft((current) => (current === submittedDraft ? '' : current));
        setComposeContext(null);
        setStagedAttachment(null);
        setAttachmentError('');
        // Return the feed to the bottom so the just-sent message is in view.
        setSentMessageNonce((nonce) => nonce + 1);
      }
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.sendMessage'), t));

      // The attachment published but something before the send was dispatched
      // failed (unlock, or an unexpected throw building the pending entry):
      // the resource exists on QDN either way, so fold its link into the
      // draft and drop the staged file — resubmitting then re-sends the link
      // without publishing (and paying for) a duplicate resource. Once
      // dispatched, a send failure surfaces on its own pending bubble instead
      // of here (see runPendingSend).
      if (publishedLink && selectedChatKeyRef.current === getSelectedChatKey(chat)) {
        setDraft((current) =>
          current === submittedDraft ? `${submittedDraft ? `${submittedDraft}\n` : ''}${publishedLink}` : current,
        );
        setStagedAttachment(null);
        setAttachmentError('');
      }
    } finally {
      setSendPending(false);
    }
  }

  async function handleMessageReaction(message: ChatMessage, reaction: string, contentState: boolean) {
    if (!selectedChat || !canComposeMessage || !message.signature) {
      return;
    }

    const chat = selectedChat;
    const targetSignature = message.signature;
    const pendingKey = getReactionPendingKey(targetSignature, reaction);

    // Kept disabled for the whole round trip (not just the dispatch below) —
    // same debounce this already did, now driven by the background runner's
    // onSettled instead of an outer await, so a rapid double-click on the
    // same chip cannot race two toggles of the same reaction.
    setReactionPendingKey(pendingKey);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        setReactionPendingKey('');
        return;
      }

      const reactionMessage = buildReactionMessageText(reaction, contentState);
      const localId = createLocalSendId();
      const senderAddress = chat.network === 'qortal' ? (qortalAccount?.address ?? selectedAccount.address) : selectedAccount.address;
      const senderName = chat.network === 'qortal' ? (qortalAccount?.name ?? null) : selectedAccount.name;

      // Merged straight into the feed (see mergeOptimisticMessages): the
      // reaction chip flips the instant this is dispatched, well before the
      // broadcast round trip completes.
      updatePendingSends((current) => [
        ...current,
        createPendingSend({
          chatKey: getSelectedChatKey(chat),
          chatReference: targetSignature,
          kind: 'reaction',
          localId,
          recipient: chat.kind === 'direct' ? chat.direct.address : null,
          recipientName: chat.kind === 'direct' ? (chat.direct.name ?? null) : null,
          sender: senderAddress,
          senderName,
          target: pendingSendTargetFor(chat),
          text: reactionMessage,
          timestamp: Date.now(),
          txGroupId: chat.kind === 'group' ? chat.group.groupId : 0,
        }),
      ]);

      void runPendingSend(localId, chat, selectedAccount, { onSettled: () => setReactionPendingKey('') });
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.sendReaction'), t));
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

  // Stage a file for the next send: route to IMAGE/ATTACHMENT, compress
  // images, base64-encode, and size-check. Replaces any previously staged
  // file (one attachment per message).
  function stageAttachment(file: File) {
    if (!canAttach || stagedAttachment?.phase === 'processing') {
      return;
    }

    setAttachmentError('');

    // Fail a hopeless drop fast: non-image files publish as-is, so a raw
    // size over the cap can never succeed (images may still shrink below
    // their cap during compression, so they are checked after preparing).
    if (getAttachmentService(file) === 'ATTACHMENT' && file.size > ATTACHMENT_FILE_MAX_BYTES) {
      setAttachmentError(
        t('status.attachment.tooLarge', { max: String(Math.round(ATTACHMENT_FILE_MAX_BYTES / 1024 / 1024)) }),
      );
      return;
    }

    const filename = file.name || 'attachment';
    const chatKey = selectedChatKeyRef.current;

    setStagedAttachment({ filename, phase: 'processing' });

    void prepareAttachment(file)
      .then((prepared) => {
        // Attachments are per-conversation; drop a result that finished
        // preparing after the user moved to another chat.
        if (selectedChatKeyRef.current !== chatKey) {
          return;
        }

        const maxBytes = getAttachmentMaxBytes(prepared.service);

        if (prepared.size > maxBytes) {
          setAttachmentError(
            t('status.attachment.tooLarge', { max: String(Math.round(maxBytes / 1024 / 1024)) }),
          );
          setStagedAttachment(null);
          return;
        }

        setStagedAttachment({ phase: 'ready', ...prepared });
      })
      .catch(() => {
        if (selectedChatKeyRef.current !== chatKey) {
          return;
        }

        setAttachmentError(t('status.attachment.error'));
        setStagedAttachment(null);
      });
  }

  function clearStagedAttachment() {
    setStagedAttachment(null);
    setAttachmentError('');
  }

  function isFileDrag(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  function handleAttachmentDragEnter(event: DragEvent<HTMLElement>) {
    if (!canAttach || !isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    attachmentDragDepthRef.current += 1;
    setDraggingAttachment(true);
  }

  function handleAttachmentDragOver(event: DragEvent<HTMLElement>) {
    if (!canAttach || !isFileDrag(event)) {
      return;
    }

    // preventDefault marks the pane as a valid drop target.
    event.preventDefault();
  }

  function handleAttachmentDragLeave(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    attachmentDragDepthRef.current = Math.max(0, attachmentDragDepthRef.current - 1);

    if (attachmentDragDepthRef.current === 0) {
      setDraggingAttachment(false);
    }
  }

  function handleAttachmentDrop(event: DragEvent<HTMLElement>) {
    if (!isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    attachmentDragDepthRef.current = 0;
    setDraggingAttachment(false);

    if (!canAttach) {
      return;
    }

    // One attachment per message: only the first dropped file is taken.
    const file = event.dataTransfer.files[0];

    if (file) {
      stageAttachment(file);
    }
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = getFirstTransferFile(event.clipboardData);

    // Only intercept when the clipboard carries a file (e.g. a screenshot or
    // file copied from the desktop); plain text pastes flow through untouched.
    if (file && canAttach) {
      event.preventDefault();
      stageAttachment(file);
    }
  }

  // Insert an emoji at the composer caret (falling back to the end), keeping
  // focus and caret position so picking several emojis in a row flows.
  function insertComposerEmoji(emoji: string) {
    const composer = composerRef.current;
    const start = composer?.selectionStart ?? draft.length;
    const end = composer?.selectionEnd ?? draft.length;

    setDraft((current) => `${current.slice(0, start)}${emoji}${current.slice(end)}`);
    requestAnimationFrame(() => {
      const element = composerRef.current;

      if (element) {
        const caret = start + emoji.length;

        element.focus();
        element.setSelectionRange(caret, caret);
      }
    });
  }

  // Stash the outgoing chat's unsent composer text under its chat key. An edit
  // draft is the original message's historical text, not something the user
  // typed for this chat — it is dropped, never stashed, so it can never be sent
  // into another conversation as an ordinary message.
  function stashDraft(previousKey: string) {
    if (!previousKey) {
      return;
    }

    if (composeContext?.kind !== 'edit' && draft.trim() !== '') {
      draftsByChatKeyRef.current.set(previousKey, draft);
    } else {
      draftsByChatKeyRef.current.delete(previousKey);
    }
  }

  // Swap the composer to the chat being opened: stash the current chat's draft
  // and restore whatever the next chat had. Reads `draft`/`composeContext` from
  // this render, so it must run before the setters that clear them.
  function switchDraftTo(nextKey: string) {
    if (draftChatKeyRef.current === nextKey) {
      return;
    }

    stashDraft(draftChatKeyRef.current);
    draftChatKeyRef.current = nextKey;
    setDraft(draftsByChatKeyRef.current.get(nextKey) ?? '');
  }

  type ChatSelectionOptions = {
    historyMode?: ChatHistoryMode;
    remember?: boolean;
    showConversation?: boolean;
    userInitiated?: boolean;
  };

  function selectGroup(group: GroupData, options: ChatSelectionOptions = {}) {
    const {
      historyMode = 'push',
      remember = true,
      showConversation = true,
      userInitiated = true,
    } = options;

    setWriteError('');
    setPrivateGroupKeyStatus('');
    setPrivateGroupKeyError('');
    setDirectLookupError('');
    switchDraftTo(getSelectedChatKey({ group, kind: 'group' }));
    setComposeContext(null);
    if (userInitiated) {
      userSelectedChatRef.current = true;
    }
    setSelectedChat({ group, kind: 'group' });
    if (remember) {
      rememberLastChat({ group, kind: 'group' });
    }
    if (showConversation) {
      setMobileChatView(true);
    }
    writeChatRoute({ group: group.groupId, network: 'qortium' }, historyMode);
  }

  function selectQortalGroup(group: GroupData, options: ChatSelectionOptions = {}) {
    const {
      historyMode = 'push',
      remember = true,
      showConversation = true,
      userInitiated = true,
    } = options;

    setWriteError('');
    setDirectLookupError('');
    switchDraftTo(getSelectedChatKey({ group, kind: 'group', network: 'qortal' }));
    setComposeContext(null);
    if (userInitiated) {
      userSelectedChatRef.current = true;
    }
    const chat: SelectedChat = { group, kind: 'group', network: 'qortal' };

    setSelectedChat(chat);
    if (remember) {
      rememberLastChat(chat);
    }
    if (showConversation) {
      setMobileChatView(true);
    }
    writeChatRoute({ group: group.groupId, network: 'qortal' }, historyMode);
  }

  function selectDirect(direct: ActiveDirectChat, options: ChatSelectionOptions = {}) {
    const {
      historyMode = 'push',
      remember = true,
      showConversation = true,
      userInitiated = true,
    } = options;

    setWriteError('');
    setPrivateGroupKeyStatus('');
    setPrivateGroupKeyError('');
    setDirectLookupError('');
    switchDraftTo(getSelectedChatKey({ direct, kind: 'direct' }));
    setComposeContext(null);
    if (userInitiated) {
      userSelectedChatRef.current = true;
    }
    setSelectedChat({ direct, kind: 'direct' });
    if (remember) {
      rememberLastChat({ direct, kind: 'direct' });
      rememberDirect(direct);
    }
    if (showConversation) {
      setMobileChatView(true);
    }
    writeChatRoute({ address: direct.address, network: 'qortium' }, historyMode);
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
        selectGroup(generalChat, {
          historyMode: 'replace',
          remember: false,
          showConversation: false,
          userInitiated: false,
        });
      } else {
        setSelectedChat(null);
        writeChatRoute({}, 'replace');
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

  // The toggles must always respond visibly: while the field has text, the
  // form stays visible regardless of the open flag, so "close" also clears the
  // query (and clears its discovery results) instead of doing nothing.
  function toggleGroupSearch() {
    if (isGroupSearchVisible) {
      setGroupSearchOpen(false);
      setSearch('');
      groupDiscoveryRequestRef.current += 1;
      setGroupDiscoveries(createState([]));

      return;
    }

    // Opening search must reveal the form, so expand a collapsed section.
    setGroupsCollapsed(false);
    setGroupSearchOpen(true);
  }

  function toggleQortalGroupSearch() {
    if (isQortalGroupSearchOpen) {
      setQortalGroupSearchOpen(false);
      setQortalSearch('');
      qortalGroupDiscoveryRequestRef.current += 1;
      setQortalGroupDiscoveries(createState([]));
      return;
    }

    setQortalGroupsCollapsed(false);
    setQortalGroupSearchOpen(true);
  }

  function toggleDirectSearch() {
    if (isDirectFormVisible) {
      setDirectSearchOpen(false);
      setDirectAddress('');
      return;
    }

    setDirectCollapsed(false);
    setDirectSearchOpen(true);
  }

  function mentionAccount(target: AccountInfoTarget & { network: ChatNetwork }) {
    const scopedProfiles = target.network === 'qortal' ? qortalAvatarProfiles : qortiumAvatarProfiles;
    const label = getMessageSenderLabel(target, scopedProfiles.get(target.sender));
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
    if (!isPlausibleQortiumAddress(value)) {
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

    setDirectAddress('');
    setDirectSearchOpen(false);
    const direct: ActiveDirectChat = name ? { address, name } : { address };
    selectDirect(direct);
  }

  async function connectSelectedAccount(actionList = actions) {
    const generalOnly = withGeneralChatGroup(emptyGroups, '', t);

    groupDiscoveryRequestRef.current += 1;
    setGroupDiscoveries(createState([]));
    setMemberGroups({ phase: 'loading', value: emptyGroups });
    setGroups({ phase: 'loading', value: generalOnly });

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
      setGroups({ phase: 'ready', value: generalOnly });
      setAccountJoinRequests({ phase: 'ready', value: emptyJoinRequests });
      setAdminJoinRequests({ phase: 'ready', value: emptyAdminJoinRequests });
      setActiveChats({ phase: 'ready', value: emptyActiveChats });
      setMintingStatus({ phase: 'ready', value: null });
      return null;
    }
  }

  async function updateChatNotificationPreference(
    key: Exclude<keyof ChatNotificationPreferences, 'version'>,
    enabled: boolean,
  ) {
    if (!account || !canManageNotifications || chatNotificationsBusy) {
      return;
    }

    setChatNotificationsBusy(true);
    setChatNotificationsError('');
    const previousPreferences = chatNotificationPreferences;
    const nextPreferences = { ...previousPreferences, [key]: enabled };
    chatNotificationsDesiredRef.current = nextPreferences;

    try {
      const operation = chatNotificationOperationRef.current.then(async () => {
        let directRuleRegistered = false;

        if (hasAnyChatNotificationsEnabled(nextPreferences)) {
          const permission = await qdnRequest<unknown>({ action: 'NOTIFICATION_HAS_PERMISSION' });
          const permissionGranted = (
            !!permission &&
            typeof permission === 'object' &&
            'granted' in permission &&
            permission.granted === true
          );

          if (!permissionGranted) {
            if (nextPreferences.direct) {
              await enableDirectMessageNotifications(account.address, t('notification.direct.title'));
              directRuleRegistered = true;
            } else {
              // SHOW_NOTIFICATION uses the same durable Home grant. Because this
              // click occurs in the focused app, Home grants permission and then
              // suppresses the setup notification as already focused.
              await showChatAttentionNotification(t('action.notifications.enable'));
            }
          }
        }

        if (nextPreferences.direct) {
          if (!directRuleRegistered) {
            await enableDirectMessageNotifications(account.address, t('notification.direct.title'));
          }
        } else {
          await disableDirectMessageNotifications();
        }
      });
      chatNotificationOperationRef.current = operation.then(() => undefined, () => undefined);
      await operation;

      writeChatNotificationPreferences(nextPreferences);
      setChatNotificationPreferences(nextPreferences);
    } catch (error) {
      chatNotificationsDesiredRef.current = previousPreferences;
      setChatNotificationsError(getErrorMessage(error, t('label.error')));
    } finally {
      setChatNotificationsBusy(false);
    }
  }

  selectedAccountRefreshCallbackRef.current = () => {
    const refreshActions = selectedAccountRefreshActionsRef.current;

    void connectSelectedAccount(refreshActions.qortium);
    if (qortalAvailableRef.current) {
      void refreshQortalSelectedAccount(refreshActions.qortal);
    }
  };

  function requestSelectedAccountRefresh() {
    const coordinator = startupAccountRefreshCoordinatorRef.current;

    if (coordinator) {
      coordinator.request();
      return;
    }

    void connectSelectedAccount();
  }

  async function initializeSession(accountRefreshCoordinator: StartupAccountRefreshCoordinator) {
    setBridge({ phase: 'loading', value: bridge.value });
    let nextActions = bridge.value.actions;

    try {
      const nextBridge = await getBridgeState();
      nextActions = nextBridge.actions;
      setChatStorageMode(nextBridge.transport === 'gateway' ? 'memory' : 'persistent');
      const storedNotificationPreferences = nextBridge.transport === 'gateway'
        ? { ...DISABLED_CHAT_NOTIFICATION_PREFERENCES }
        : readChatNotificationPreferences();
      const storedSidebar = readSidebarCollapse();

      chatNotificationsDesiredRef.current = storedNotificationPreferences;
      setChatNotificationPreferences(storedNotificationPreferences);

      if (storedSidebar) {
        setDirectCollapsed(storedSidebar.direct);
        setGroupsCollapsed(storedSidebar.groups);
      }

      setChatStorageReady(true);
      setBridge({ phase: 'ready', value: nextBridge });
      selectedAccountRefreshActionsRef.current.qortium = nextActions;
    } catch (error) {
      setChatStorageMode('persistent');
      setChatStorageReady(true);
      setBridge({
        error: getBridgeErrorMessage(error, t('status.loadingError.bridge'), t),
        phase: 'error',
        value: bridge.value,
      });
    }

    const initialGroups = withGeneralChatGroup(emptyGroups, '', t);

    setGroups({ phase: 'ready', value: initialGroups });
    if (
      !hasSelectedChatRef.current &&
      !pendingDeepLinkRef.current?.target &&
      initialGroups.length > 0
    ) {
      selectGroup(initialGroups[0], {
        historyMode: 'replace',
        remember: false,
        showConversation: false,
        userInitiated: false,
      });
    }

    // Home 2 injects window.qortalRequest. Home 1.7 instead advertises its
    // Qortal-prefixed actions through window.qdnRequest, so availability must
    // be proven from the normalized action catalogue before the section is
    // shown. Older Qortium-only hosts remain hidden.
    if (hasNetworkBridge('qortal') || hasLegacyQortalBridgeCandidate()) {
      const nextQortalBridge = await initializeQortalSession();
      const isAvailable = !!nextQortalBridge && hasQortalChatBridgeActions(nextQortalBridge.actions);

      qortalAvailableRef.current = isAvailable;
      setQortalAvailable(isAvailable);
      selectedAccountRefreshActionsRef.current.qortal = isAvailable ? nextQortalBridge.actions : [];
    } else {
      setQortalBridge((current) => ({ phase: 'ready', value: current.value }));
    }

    accountRefreshCoordinator.markReady(() => selectedAccountRefreshCallbackRef.current());
  }

  async function refreshAfterTrackedTransaction(transaction: TrackedTransaction) {
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
    const accountRefreshCoordinator = new StartupAccountRefreshCoordinator();
    startupAccountRefreshCoordinatorRef.current = accountRefreshCoordinator;
    void initializeSession(accountRefreshCoordinator);

    return () => {
      if (startupAccountRefreshCoordinatorRef.current === accountRefreshCoordinator) {
        startupAccountRefreshCoordinatorRef.current = null;
      }
      accountRefreshCoordinator.dispose();
    };
  }, []);

  // Initial URL targets and runtime Home targets share this one resolver. It
  // intentionally waits for both initial lists: group targets need the group
  // catalogue, and waiting for active chats prevents a late load from racing a
  // just-opened direct conversation. A later runtime message replaces any
  // earlier pending target before this effect gets a chance to apply it.
  useEffect(() => {
    const pending = pendingDeepLinkRef.current;
    const targetNetwork = pending?.target?.network ?? 'qortium';
    const targetGroups = targetNetwork === 'qortal' ? qortalGroups : groups;
    const targetActiveChats = targetNetwork === 'qortal' ? qortalActiveChats : activeChats;

    if (
      !pending ||
      targetGroups.phase === 'idle' ||
      targetGroups.phase === 'loading' ||
      targetActiveChats.phase === 'idle' ||
      targetActiveChats.phase === 'loading'
    ) {
      return;
    }

    pendingDeepLinkRef.current = null;
    const resolutionId = ++deepLinkResolutionRef.current;

    // Home supplies a single conversation target. When both optional fields are
    // present, prefer the direct conversation, matching the notification's most
    // specific recipient target.
    if (pending.target?.address) {
      if (targetNetwork === 'qortium') {
        selectDirect(
          { address: pending.target.address },
          { historyMode: pending.historyMode },
        );
      }
      return;
    }

    const group = targetGroups.value.find((candidate) => candidate.groupId === pending.target?.group);
    const selectTargetGroup = targetNetwork === 'qortal' ? selectQortalGroup : selectGroup;

    if (group) {
      selectTargetGroup(group, { historyMode: pending.historyMode });
      return;
    }

    if (targetNetwork === 'qortium' && pending.target?.group === GENERAL_CHAT_GROUP_ID) {
      selectGroup(withGeneralChatGroup([], '', t)[0], { historyMode: pending.historyMode });
      return;
    }

    if (pending.target?.group !== undefined) {
      const targetActions = targetNetwork === 'qortal' ? qortalBridge.value.actions : actions;

      void getGroup(targetNetwork, pending.target.group, targetActions)
        .then((resolvedGroup) => {
          if (deepLinkResolutionRef.current === resolutionId) {
            selectTargetGroup(resolvedGroup, { historyMode: pending.historyMode });
          }
        })
        .catch(() => {
          if (
            deepLinkResolutionRef.current === resolutionId &&
            ((pending.isInitial && !hasSelectedChatRef.current) || pending.historyMode === 'none') &&
            targetGroups.value.length > 0
          ) {
            selectTargetGroup(targetGroups.value[0], {
              historyMode: pending.historyMode,
              remember: false,
              showConversation: false,
              userInitiated: false,
            });
          }
        });
      return;
    }

    // An unresolved URL group should behave like the pre-deep-link startup
    // path. Runtime requests retain the current conversation instead.
    if (pending.isInitial && !hasSelectedChatRef.current && targetGroups.value.length > 0) {
      selectTargetGroup(targetGroups.value[0], {
        historyMode: pending.historyMode,
        remember: false,
        showConversation: false,
        userInitiated: false,
      });
      return;
    }

    // A route without a conversation target can also be reached by Back from an
    // older app build. Rehydrate the fallback without mutating that history
    // entry; subsequent deliberate selections will push normally.
    if (!pending.isInitial && !pending.target && groups.value.length > 0) {
      selectGroup(groups.value[0], {
        historyMode: 'none',
        remember: false,
        showConversation: false,
        userInitiated: false,
      });
    }
  }, [
    actionsKey,
    activeChats.phase,
    deepLinkRevision,
    groups.phase,
    groups.value,
    qortalActiveChats.phase,
    qortalBridge.value.actions.join('\n'),
    qortalGroups.phase,
    qortalGroups.value,
  ]);

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
    if (isQortalGroupSearchOpen) {
      qortalGroupSearchInputRef.current?.focus();
    }
  }, [isQortalGroupSearchOpen]);

  useEffect(() => {
    if (isDirectFormVisible) {
      directSearchInputRef.current?.focus();
    }
  }, [isDirectFormVisible]);

  // The active-chats endpoint intentionally excludes chatReference rows, so it
  // keeps the original message body after an edit. Whenever a group's real
  // conversation window is loaded (initial REST read, websocket update, or
  // post-send refresh), resolve that active entry through the same edit-thread
  // model as MessageList and cache only the resulting preview body.
  useEffect(() => {
    if (!selectedGroup || !hasSelectedMessages) {
      return;
    }

    const activeGroup = (activeChats.value.groups ?? []).find(
      (entry) => entry.groupId === selectedGroup.groupId,
    );

    if (!activeGroup) {
      return;
    }

    const revision = resolveGroupPreviewRevision(activeGroup, messages.value);

    if (!revision) {
      return;
    }

    setLoadedGroupPreviewById((current) => {
      const existing = current.get(selectedGroup.groupId);

      if (
        existing?.activityTimestamp === revision.activityTimestamp &&
        existing.originalData === revision.originalData &&
        existing.originalSender === revision.originalSender &&
        existing.originalSignature === revision.originalSignature &&
        existing.latest.signature === revision.latest.signature &&
        existing.latest.data === revision.latest.data &&
        existing.latest.status === revision.latest.status &&
        existing.latest.decryptionStatus === revision.latest.decryptionStatus
      ) {
        return current;
      }

      const next = new Map(current);

      next.set(selectedGroup.groupId, revision);
      return next;
    });
  }, [activeChats.value.groups, hasSelectedMessages, messages.value, selectedGroup]);

  useEffect(() => {
    if (!isChatNotificationMenuOpen) {
      return;
    }

    function closeNotificationMenuOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !chatNotificationSettingsRef.current?.contains(event.target)
      ) {
        setChatNotificationMenuOpen(false);
      }
    }

    function closeNotificationMenuOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      setChatNotificationMenuOpen(false);
      chatNotificationToggleRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeNotificationMenuOnOutsidePointer);
    window.addEventListener('keydown', closeNotificationMenuOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeNotificationMenuOnOutsidePointer);
      window.removeEventListener('keydown', closeNotificationMenuOnEscape);
    };
  }, [isChatNotificationMenuOpen]);

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

  useEffect(() => {
    setLastReadByQortalGroupId((current) => {
      let next: Map<number, number> | null = null;

      for (const [groupId, timestamp] of qortalGroupActivityByIdDisplay) {
        if (!current.has(groupId)) {
          next ??= new Map(current);
          next.set(groupId, timestamp);
        }
      }

      return next ?? current;
    });
  }, [qortalGroupActivityByIdDisplay]);

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
      isIncomingChatMessage(newest.sender, selfAddress) &&
      decodeChatMessage(newest, t).kind === 'text'
    ) {
      const decoded = decodeChatMessage(newest, t);
      setLiveAnnouncement(`${getMessageSenderLabel(newest, undefined)}: ${getMessageSnippet(newest, t)}`);

      if (
        canShowNotifications &&
        selectedChat?.kind === 'group' &&
        selfAddress
      ) {
        const attention = getChatAttentionKinds({
          body: decoded.body,
          message: newest,
          messages: [...olderMessages, ...list],
          repliedTo: decoded.repliedTo,
          selfAddress,
          selfName,
        });

        const enabledAttention = getEnabledChatAttentionKind(attention, chatNotificationPreferences);

        if (enabledAttention) {
          const title = enabledAttention === 'reply'
            ? t('notification.reply.title')
            : t('notification.mention.title');
          void showChatAttentionNotification(title).catch(() => {
            // Direct/background registration remains enabled. A transient live
            // notification failure should not interrupt the chat stream.
          });
        }
      }
    }

    lastAnnouncedRef.current = { chatKey: messagesChatKey, signature };
  }, [
    canShowNotifications,
    chatNotificationPreferences.mentions,
    chatNotificationPreferences.replies,
    messages,
    messagesChatKey,
    olderMessages,
    selectedChat,
    selfAddress,
    selfName,
    t,
  ]);

  // Durable rules are tagged with the account that was selected when they were
  // registered. Reconcile after startup/account changes, but never prompt from
  // this passive path: an explicit bell-button click is the only permission ask.
  useEffect(() => {
    if (!account || !chatNotificationsEnabled || !canManageNotifications) {
      return;
    }

    let isDisposed = false;

    const operation = chatNotificationOperationRef.current.then(() => {
      const desiredPreferences = chatNotificationsDesiredRef.current;
      return hasAnyChatNotificationsEnabled(desiredPreferences)
        ? reconcileChatNotifications(
            account.address,
            t('notification.direct.title'),
            desiredPreferences,
          )
        : false;
    });
    chatNotificationOperationRef.current = operation.then(() => undefined, () => undefined);

    void operation
      .then((granted) => {
        if (isDisposed) {
          return;
        }
        setChatNotificationsError('');
        if (granted) {
          return;
        }
        const disabledPreferences: ChatNotificationPreferences = {
          direct: false,
          mentions: false,
          replies: false,
          version: 2,
        };
        chatNotificationsDesiredRef.current = disabledPreferences;
        writeChatNotificationPreferences(disabledPreferences);
        setChatNotificationPreferences(disabledPreferences);
      })
      .catch((error) => {
        if (!isDisposed) {
          setChatNotificationsError(getErrorMessage(error, t('label.error')));
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [
    account?.address,
    canManageNotifications,
    chatNotificationPreferences.direct,
    chatNotificationPreferences.mentions,
    chatNotificationPreferences.replies,
    chatNotificationsEnabled,
    displaySettings.language,
  ]);

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
      const isQortal = selectedChat.network === 'qortal';
      const timestamp = isQortal
        ? qortalGroupActivityByIdDisplay.get(groupId)
        : groupActivityById.get(groupId);

      if (typeof timestamp === 'number') {
        const setLastRead = isQortal ? setLastReadByQortalGroupId : setLastReadByGroupId;

        setLastRead((current) =>
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
  }, [
    selectedChat,
    hasSelectedMessages,
    messages.value,
    groupActivityById,
    qortalGroupActivityByIdDisplay,
    directActivityByAddress,
  ]);

  useEffect(() => {
    lastReadByGroupIdRef.current = lastReadByGroupId;
  }, [lastReadByGroupId]);

  useEffect(() => {
    lastReadByQortalGroupIdRef.current = lastReadByQortalGroupId;
  }, [lastReadByQortalGroupId]);

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
        ? selectedChat.network === 'qortal'
          ? lastReadByQortalGroupIdRef.current.get(selectedChat.group.groupId)
          : lastReadByGroupIdRef.current.get(selectedChat.group.groupId)
        : lastReadByAddressRef.current.get(selectedChat.direct.address);

    setUnreadDividerTimestamp(typeof watermark === 'number' ? watermark : null);
    // Freeze the upper bound at the open moment so live/own messages stay below it.
    setUnreadDividerCeiling(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatKey]);

  // A file dropped outside the attachment target (or where attaching is not
  // allowed) must never trigger the browser default of navigating to the
  // file — that would replace the whole app. The chat pane's own drop handler
  // runs first via bubbling; this window-level guard only kills the default.
  useEffect(() => {
    function preventWindowDrop(event: Event) {
      event.preventDefault();
    }

    window.addEventListener('dragover', preventWindowDrop);
    window.addEventListener('drop', preventWindowDrop);

    return () => {
      window.removeEventListener('dragover', preventWindowDrop);
      window.removeEventListener('drop', preventWindowDrop);
    };
  }, []);

  // The composer emoji panel and any staged attachment are per-conversation
  // UI: drop them when the chat changes (Escape dismisses the panel too).
  useEffect(() => {
    setComposerEmojiOpen(false);
    setStagedAttachment(null);
    setAttachmentError('');
    attachmentDragDepthRef.current = 0;
    setDraggingAttachment(false);
    // A pending delete confirmation belongs to the previous chat's thread —
    // committing it after a switch would send the tombstone with the new
    // chat's context, so drop it.
    setDeleteTarget(null);
  }, [selectedChatKey]);

  useEffect(() => {
    if (!isComposerEmojiOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      // Yield to a dialog stacked above (account info / avatar lightbox):
      // its own Escape handler dismisses that layer first.
      if (event.key === 'Escape' && !hasStackedDialogRef.current) {
        setComposerEmojiOpen(false);
        composerRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isComposerEmojiOpen]);

  // Fallback for selection changes that bypass the click handlers (saved-chat
  // restore, auto-select, removed-direct fallback): perform the same per-chat
  // draft swap the handlers do, and drop any reply/edit context still aimed at
  // the previous chat so it cannot compose into this one. No-ops when a click
  // handler already swapped.
  useEffect(() => {
    if (draftChatKeyRef.current === selectedChatKey) {
      return;
    }

    switchDraftTo(selectedChatKey);
    setComposeContext(null);
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
      // A dialog stacked above the drawer (account info, avatar lightbox)
      // owns Escape via its own handler; one press must dismiss one layer,
      // not the whole stack. Read via refs so this effect (which also moves
      // focus on re-run) does not re-run when a dialog opens or closes.
      if (event.key === 'Escape' && !hasStackedDialogRef.current) {
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

  // Scroll-bookmark persistence is debounced; land a pending write before the
  // page is hidden or closed (mobile webviews often skip unload paths, so
  // visibilitychange is the reliable signal) and on unmount. The flush handler
  // has a stable identity, so this binds once.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushScrollBookmarks();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushScrollBookmarks);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flushScrollBookmarks);
      flushScrollBookmarks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live mirror of the group ids whose activity timestamps the active-chats
  // stream already delivers (a ref, so the 30s sweep effect does not re-run on
  // every websocket frame). Read by the sweep to skip covered groups. A group
  // whose stream entry is a reaction is NOT covered — its usable timestamp is
  // unknown, so the sweep must read it to find the latest real message.
  useEffect(() => {
    activeChatsGroupIdsRef.current = new Set(
      (activeChats.value.groups ?? [])
        .filter(
          (activeGroup) =>
            typeof activeGroup.timestamp === 'number' && !isHiddenActiveChatEntry(activeGroup),
        )
        .map((activeGroup) => activeGroup.groupId),
    );
  }, [activeChats.value.groups]);

  useEffect(() => {
    setLoadedDirectActivityByAddress(new Map());
    // Restore this account's read watermarks so unread state survives reloads;
    // unseen groups/directs still get baselined to "read" by the effects below.
    const watermarks = account ? readReadWatermarks(account.address) : null;
    skipWatermarkPersistRef.current = true;
    setLastReadByGroupId(watermarks?.groups ?? new Map());
    setLastReadByQortalGroupId(watermarks?.qortalGroups ?? new Map());
    setLastReadByAddress(watermarks?.directs ?? new Map());
    // Land any debounced bookmark write for the previous account before its map
    // is replaced below (the flush writes under the address captured when the
    // scroll happened, so this cannot leak across accounts).
    flushScrollBookmarks();
    // Restore this account's saved scroll bookmarks so reading positions survive
    // restarts; the in-memory view cache is per-session and starts empty.
    scrollPositionsRef.current = account ? readScrollBookmarks(account.address) : new Map();
    chatViewCacheRef.current.clear();
    loadedChatKeyRef.current = '';
    requestedPrivateGroupKeysRef.current.clear();
    resolvedPrivateGroupKeyRequestsRef.current.clear();
    // Drafts are per-account session state: never carry one account's unsent
    // text (or a reply/edit context) into another account's composer. The now-
    // empty draft belongs to whichever chat is still selected.
    draftsByChatKeyRef.current.clear();
    draftChatKeyRef.current = selectedChatKeyRef.current;
    setDraft('');
    setComposeContext(null);
    setStagedAttachment(null);
    setAttachmentError('');
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

    writeReadWatermarks(account.address, {
      directs: lastReadByAddress,
      groups: lastReadByGroupId,
      qortalGroups: lastReadByQortalGroupId,
    });
  }, [account, lastReadByGroupId, lastReadByQortalGroupId, lastReadByAddress]);

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

    if (userSelectedChatRef.current) {
      restoredForAccountRef.current = account.address;
      return;
    }

    const saved = readLastChat(account.address);

    if (saved?.network === 'qortal' && (qortalBridge.phase === 'idle' || qortalBridge.phase === 'loading')) {
      return;
    }

    restoredForAccountRef.current = account.address;

    if (saved?.kind === 'direct') {
      if (saved.network === 'qortal') {
        return;
      }
      selectDirect(saved.direct, {
        historyMode: 'replace',
        remember: false,
        showConversation: false,
        userInitiated: false,
      });
      return;
    }

    if (saved?.kind === 'group') {
      if (saved.network === 'qortal' && !qortalAvailable) {
        return;
      }
      const selectSavedGroup = saved.network === 'qortal' ? selectQortalGroup : selectGroup;

      selectSavedGroup(saved.group, {
        historyMode: 'replace',
        remember: false,
        showConversation: false,
        userInitiated: false,
      });
      return;
    }

    // Nothing saved: fall back to General Chat when it is loaded, otherwise leave
    // the mount-time group auto-select to pick it once groups arrive.
    const generalChat = groups.value.find((group) => isGeneralChatGroup(group)) ?? null;

    if (generalChat) {
      selectGroup(generalChat, {
        historyMode: 'replace',
        remember: false,
        showConversation: false,
        userInitiated: false,
      });
    }
  }, [account?.address, qortalAvailable, qortalBridge.phase]);

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

          // Groups on the active-chats stream get their timestamps for free
          // (the stream is already reaction-filtered and refreshed on its own
          // cadence); this sweep only exists for the groups that stream does
          // not cover — non-member / browsed groups and memberships with no
          // active-chats entry yet. Exception: a loaded null tombstone ("no
          // real messages") outranks stream timestamps in the activity fold,
          // so a tombstoned group must still be re-read to clear the tombstone
          // once its first real message arrives on the stream.
          if (
            activeChatsGroupIdsRef.current.has(group.groupId) &&
            loadedGroupActivityRef.current.get(group.groupId) !== null
          ) {
            continue;
          }

          // First pass only fills gaps; the periodic refresh re-reads known groups
          // so non-member / browsed groups (off the active-chats stream) stay live.
          if (!refresh && loadedGroupActivityRef.current.has(group.groupId)) {
            continue;
          }

          try {
            const nextMessages = await getGroupMessages('qortium', group, actions, {
              decryptPrivate: shouldDecryptGroupMessages(group, {
                canReadPrivateGroupChat,
                isAccountUnlocked,
                isGroupMembershipConfirmed: memberGroups.phase === 'ready',
                isJoinedGroup: joinedIds.has(group.groupId),
              }),
              limit: ACTIVITY_SWEEP_MESSAGE_LIMIT,
            });

            if (isDisposed) {
              return;
            }

            setLoadedGroupActivityById((current) =>
              mergeActivityTimestamp(current, group.groupId, nextMessages, {
                // A short window saw the whole history, so "no real messages"
                // is a fact; a full window of reactions-only is indeterminate.
                allowTombstone: nextMessages.length < ACTIVITY_SWEEP_MESSAGE_LIMIT,
              }),
            );
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
    let isHydrating = false;

    // Mirror the group activity sweep: the first pass only fills gaps, the
    // periodic refresh re-reads known directs so their sidebar activity + unread
    // dot stay live. Without this, a private direct chat has no background poll
    // at all — its only live signal is the account-level active-chats websocket,
    // so a recipient gets no "new message" notice when that stream is unavailable.
    async function hydrateDirectActivity(refresh: boolean) {
      if (isHydrating) {
        return;
      }

      isHydrating = true;

      // The open direct chat has its own 15s poll; skip it here to avoid redundant reads.
      const openDirectAddress = selectedDirectAddressRef.current;

      try {
        for (const direct of directs) {
          if (isDisposed) {
            return;
          }

          if (direct.address === openDirectAddress) {
            continue;
          }

          if (!refresh && loadedDirectActivityRef.current.has(direct.address)) {
            continue;
          }

          try {
            const nextMessages = await getDirectMessages(direct.address, actions, {
              limit: ACTIVITY_SWEEP_MESSAGE_LIMIT,
            });

            if (isDisposed) {
              return;
            }

            setLoadedDirectActivityByAddress((current) =>
              mergeActivityTimestamp(current, direct.address, nextMessages, {
                // A short window saw the whole history, so "no real messages"
                // is a fact; a full window of reactions-only is indeterminate.
                allowTombstone: nextMessages.length < ACTIVITY_SWEEP_MESSAGE_LIMIT,
              }),
            );
          } catch {
            // Direct history is optional in older Home/Core bridge contexts.
          }
        }
      } finally {
        isHydrating = false;
      }
    }

    void hydrateDirectActivity(false);

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      void hydrateDirectActivity(true);
    }, 30000);

    return () => {
      isDisposed = true;
      window.clearInterval(interval);
    };
  }, [actionsKey, activeChats.value.direct, canReadPrivateDirectChat, isAccountUnlocked]);

  // Refresh the decrypted active-chats list on a slow cadence so a brand-new
  // direct conversation (from a sender not yet in the list) surfaces in the
  // sidebar without the user reloading. The active-chats websocket folds in
  // timestamps for known addresses but never adds new decrypted entries, so the
  // list itself must be re-fetched periodically to discover new conversations.
  useEffect(() => {
    if (!account || !isAccountUnlocked || !canReadPrivateDirectChat) {
      return undefined;
    }

    const selectedAccount = account;

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      void loadActiveChats(selectedAccount, actions, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [account?.address, actionsKey, canReadPrivateDirectChat, isAccountUnlocked]);

  // Qortal does not have a protocol-specific websocket route in the current
  // bridge, so refresh its active group snapshot while visible. This drives
  // sidebar previews and Chat-owned unread watermarks without asking Home to
  // maintain any unread state.
  useEffect(() => {
    if (!qortalAccount || !qortalAvailable) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      void loadQortalActiveChats(qortalAccount.address, qortalBridge.value.actions, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [qortalAccount?.address, qortalAvailable, qortalBridge.value.actions.join('\n')]);

  useEffect(() => {
    applyDisplaySettings(displaySettings);
  }, [displaySettings]);

  // Persist the sidebar section expand/collapse choice so it survives a restart.
  useEffect(() => {
    if (!chatStorageReady) {
      return;
    }

    writeSidebarCollapse({ direct: isDirectCollapsed, groups: isGroupsCollapsed });
  }, [chatStorageReady, isDirectCollapsed, isGroupsCollapsed]);

  useEffect(() => {
    const language = normalizeLanguage(displaySettings.language);

    document.documentElement.lang = language ?? 'en';

    // Surface the unread total in the tab/window title — the only passive
    // "new message" signal available today (Home's bridge has no notification
    // action). Polling pauses while hidden, so the count freezes at its last
    // value until the tab is next visible; still a real signal on return and
    // whenever a websocket frame lands before the tab goes fully idle.
    const unreadCount = unreadGroupIds.size + unreadQortalGroupIds.size + unreadDirectAddresses.size;

    document.title = unreadCount > 0 ? `(${unreadCount}) ${t('app.title')}` : t('app.title');
  }, [displaySettings.language, t, unreadGroupIds, unreadQortalGroupIds, unreadDirectAddresses]);

  useEffect(() => {
    function handlePopState() {
      // Back/Forward owns the current history entry already. Queue its target
      // through the normal async resolver, but never push or replace while
      // rehydrating it.
      pendingDeepLinkRef.current = {
        historyMode: 'none',
        isInitial: false,
        target: getInitialDeepLinkTarget(),
      };
      setDeepLinkRevision((current) => current + 1);
    }

    window.addEventListener('popstate', handlePopState);

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    function handleHostMessage(event: MessageEvent) {
      setDisplaySettings((current) => getDisplaySettingsUpdateFromMessage(event.data, current) ?? current);

      const target = parseOpenAppTargetMessage(event.data);

      if (target) {
        pendingDeepLinkRef.current = { historyMode: 'push', isInitial: false, target };
        setDeepLinkRevision((current) => current + 1);
      }

      if (isSelectedAccountChangedMessage(event.data)) {
        startupAccountRefreshCoordinatorRef.current?.notify();
      }
    }

    window.addEventListener('message', handleHostMessage);

    return () => window.removeEventListener('message', handleHostMessage);
  }, []);

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
    // Snapshot the outgoing chat's full view (live tail + paged history) before
    // leaving, so returning can restore it and the saved scroll bookmark resolves.
    const previousKey = loadedChatKeyRef.current;

    if (previousKey && previousKey !== selectedChatKey && messagesChatKey === previousKey) {
      const previousView =
        olderMessages.length === 0 ? messages.value : mergeMessages(olderMessages, messages.value, Infinity);

      if (previousView.length > 0) {
        chatViewCacheRef.current.set(previousKey, previousView);

        while (chatViewCacheRef.current.size > 12) {
          const oldest = chatViewCacheRef.current.keys().next().value;

          if (oldest === undefined) {
            break;
          }

          chatViewCacheRef.current.delete(oldest);
        }
      }
    }

    loadedChatKeyRef.current = selectedChatKey;

    // Seed paged history from the cache so a returning chat shows the same
    // content it had (incl. messages read back beyond the latest window); the
    // live tail still reloads below. A first visit starts with no paged history.
    const cachedView = selectedChat ? chatViewCacheRef.current.get(selectedChatKey) : undefined;

    setOlderMessages(cachedView ?? emptyMessages);
    setOlderMessagesState({ error: '', loading: false, reachedStart: true });
    loadingOlderRef.current = false;

    if (!selectedChat) {
      groupMembersRequestGuardRef.current.begin();
      setMessagesChatKey('');
      setMessages({ phase: 'ready', value: emptyMessages });
      setGroupMembers({ phase: 'ready', value: emptyMembers });
      return undefined;
    }

    if (selectedChat.kind === 'group') {
      const network = selectedChat.network ?? 'qortium';
      const actionList = network === 'qortal' ? qortalBridge.value.actions : actions;

      void loadGroupMembers(selectedChat.group, actionList, { network });
    } else {
      groupMembersRequestGuardRef.current.begin();
      setGroupMembers({ phase: 'ready', value: emptyMembers });
    }

    if (selectedChat.kind === 'group' && selectedChat.group.isOpen === false && !shouldDecryptSelectedGroupMessages) {
      void loadMessages(selectedChat);
      return undefined;
    }

    if (
      bridge.value.transport === 'gateway' ||
      selectedChat.kind !== 'group' ||
      selectedChat.group.isOpen === false ||
      selectedChat.network === 'qortal'
    ) {
      // GatewayService exposes REST only; direct and closed-group chats also
      // have no public websocket. A Qortal group has no websocket route at all
      // in this slice — buildGroupMessagesWebSocketUrl below connects to the
      // Qortium node's own /websockets endpoint (same-origin, no per-protocol
      // equivalent), which would be the wrong chain entirely for a Qortal
      // groupId. Poll quietly instead so newly received messages show up
      // without burning a doomed reconnect loop (or querying the wrong chain).
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
    let reconnectDelay = WS_RECONNECT_BASE_MS;
    let visibilityReconnect: (() => void) | null = null;
    let isDisposed = false;
    let receivedInitialMessages = false;
    let usedRestFallback = false;

    setMessagesChatKey('');
    setMessages({ phase: 'loading', value: messages.value });

    function connect() {
      if (isDisposed) {
        return;
      }

      // Hidden tab: hold the reconnect (and its REST fallback) until the tab
      // is visible again, then connect immediately.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        if (!visibilityReconnect) {
          visibilityReconnect = () => {
            if (document.visibilityState !== 'hidden' && visibilityReconnect) {
              document.removeEventListener('visibilitychange', visibilityReconnect);
              visibilityReconnect = null;
              connect();
            }
          };
          document.addEventListener('visibilitychange', visibilityReconnect);
        }

        return;
      }

      socket = new WebSocket(buildGroupMessagesWebSocketUrl(chat.group.groupId));

      socket.addEventListener('message', (event) => {
        try {
          const nextMessages = parseChatMessages(event.data);

          // A live frame proves the node is reachable; reset the backoff.
          reconnectDelay = WS_RECONNECT_BASE_MS;

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
          // Once the chat is live, a single malformed frame is a transient
          // blip: keep the working transcript and let the next frame (or the
          // 5s reconnect, which resends the initial batch) recover — the same
          // rule the quiet-poll path follows.
          if (receivedInitialMessages) {
            return;
          }

          // Functional update so the displayed value is the live state, never
          // a stale value captured by this closure at chat-selection time.
          setMessages((current) => ({
            error: getBridgeErrorMessage(error, t('status.loadingError.readLiveMessages'), t),
            phase: 'error',
            value: current.value,
          }));
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

        reconnectTimeout = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, WS_RECONNECT_MAX_MS);
      });
    }

    connect();

    return () => {
      isDisposed = true;
      window.clearTimeout(reconnectTimeout);

      if (visibilityReconnect) {
        document.removeEventListener('visibilitychange', visibilityReconnect);
        visibilityReconnect = null;
      }

      socket?.close();
    };
  }, [
    selectedChatKey,
    actionsKey,
    qortalBridge.value.actions.join('\n'),
    isAccountUnlocked,
    selectedClosedGroupReadKey,
    bridge.value.transport,
  ]);

  useEffect(() => {
    if (!account) {
      return undefined;
    }

    const address = account.address;
    let socket: WebSocket | null = null;
    let reconnectTimeout = 0;
    let reconnectDelay = WS_RECONNECT_BASE_MS;
    let visibilityReconnect: (() => void) | null = null;
    let isDisposed = false;

    function handleMessage(event: MessageEvent) {
      try {
        const nextActiveChats = parseActiveChats(event.data);

        // A live frame proves the node is reachable; reset the backoff.
        reconnectDelay = WS_RECONNECT_BASE_MS;

        setActiveChats((current) => {
          const nextGroups = nextActiveChats.groups;

          // Most frames repeat an unchanged list; keep the same state object
          // so the groups-derived memos (groupActivityById → sortedGroups →
          // unreadGroupIds) and the memoized GroupList bail out instead of
          // recomputing per frame — the same reference-stable rule the group
          // message socket applies via mergeMessages.
          if (
            current.phase === 'ready' &&
            (nextGroups === undefined || areActiveGroupChatsEqual(current.value.groups, nextGroups))
          ) {
            return current;
          }

          return {
            phase: 'ready',
            value: {
              ...current.value,
              groups: nextGroups ?? current.value.groups,
            },
          };
        });

        // The public stream's group entries carry live timestamps; fold them in
        // as an activity floor too so the sidebar indicator survives a stream
        // that later drops a group from its active list.
        const groupActivity = nextActiveChats.groups ?? [];

        if (groupActivity.length > 0) {
          setLoadedGroupActivityById((currentActivity) => {
            let next: Map<number, number | null> | null = null;

            for (const group of groupActivity) {
              if (typeof group.timestamp !== 'number' || isHiddenActiveChatEntry(group)) {
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
              if (typeof direct.timestamp !== 'number' || isHiddenActiveChatEntry(direct)) {
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

      // Hidden tab: hold the reconnect until visible, then connect at once.
      // An already-open socket is unaffected, so a healthy stream keeps
      // feeding unread state while the tab is hidden.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        if (!visibilityReconnect) {
          visibilityReconnect = () => {
            if (document.visibilityState !== 'hidden' && visibilityReconnect) {
              document.removeEventListener('visibilitychange', visibilityReconnect);
              visibilityReconnect = null;
              connect();
            }
          };
          document.addEventListener('visibilitychange', visibilityReconnect);
        }

        return;
      }

      socket = new WebSocket(buildActiveChatsWebSocketUrl(address));
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('close', () => {
        if (isDisposed) {
          return;
        }

        reconnectTimeout = window.setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, WS_RECONNECT_MAX_MS);
      });
    }

    connect();

    return () => {
      isDisposed = true;
      window.clearTimeout(reconnectTimeout);

      if (visibilityReconnect) {
        document.removeEventListener('visibilitychange', visibilityReconnect);
        visibilityReconnect = null;
      }

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
      void loadGroupInvites(account, { quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [account?.address, actionsKey]);

  useEffect(() => {
    if (!selectedGroup || isGeneralChatGroup(selectedGroup)) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const network = selectedChat?.network ?? 'qortium';
      const actionList = network === 'qortal' ? qortalBridge.value.actions : actions;

      void loadGroupMembers(selectedGroup, actionList, { network, quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [selectedChatKey, actionsKey, qortalBridge.value.actions.join('\n')]);

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
    // network !== 'qortal': see isJoinableGroup's comment — there is no
    // JOIN_GROUP bridge action for Qortal in this slice.
    if (!(
      selectedChat?.kind === 'group' &&
      selectedChat.network !== 'qortal' &&
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
    <main className={`app-shell${homeV2AppTab ? ' app-shell--home-v2' : ''}`}>
      <header className="topbar">
        <div className="topbar__title">
          {homeV2AppTab ? null : <BrandMark />}
          <h1>{homeV2AppTab ? 'Chat' : t('app.title')}</h1>
          {homeV2AppTab ? (
            <span className="topbar__host-context">Home</span>
          ) : (
            <span className="topbar__version">{APP_VERSION}</span>
          )}
        </div>
        <div className="topbar__account">
          {canManageNotifications ? (
            <div className="notification-settings" ref={chatNotificationSettingsRef}>
              <button
                aria-controls="chat-notification-settings"
                aria-expanded={isChatNotificationMenuOpen}
                aria-haspopup="dialog"
                aria-label={t('action.notifications.settings')}
                aria-pressed={chatNotificationsEnabled}
                className="icon-button topbar__notification-toggle"
                onClick={() => setChatNotificationMenuOpen((open) => !open)}
                ref={chatNotificationToggleRef}
                title={chatNotificationsError || t('action.notifications.settings')}
                type="button"
              >
                <BellIcon />
              </button>
              {isChatNotificationMenuOpen ? (
                <div
                  aria-label={t('action.notifications.settings')}
                  className="notification-settings__popover"
                  id="chat-notification-settings"
                  role="dialog"
                >
                  <strong className="notification-settings__title">
                    {t('action.notifications.settings')}
                  </strong>
                  <p className="notification-settings__scope">{t('notification.settings.scope')}</p>
                  <fieldset className="notification-settings__choices" disabled={chatNotificationsBusy}>
                    <legend className="sr-only">{t('action.notifications.settings')}</legend>
                    <label className="notification-settings__choice">
                      <input
                        checked={chatNotificationPreferences.direct}
                        onChange={(event) => void updateChatNotificationPreference('direct', event.target.checked)}
                        type="checkbox"
                      />
                      <span>{t('notification.direct.title')}</span>
                    </label>
                    <label className="notification-settings__choice">
                      <input
                        checked={chatNotificationPreferences.mentions}
                        disabled={!canShowNotifications}
                        onChange={(event) => void updateChatNotificationPreference('mentions', event.target.checked)}
                        type="checkbox"
                      />
                      <span>{t('notification.mention.title')}</span>
                    </label>
                    <label className="notification-settings__choice">
                      <input
                        checked={chatNotificationPreferences.replies}
                        disabled={!canShowNotifications}
                        onChange={(event) => void updateChatNotificationPreference('replies', event.target.checked)}
                        type="checkbox"
                      />
                      <span>{t('notification.reply.title')}</span>
                    </label>
                  </fieldset>
                  {chatNotificationsError ? (
                    <p className="notification-settings__error" role="alert">{chatNotificationsError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <AccountSummary
            account={account}
            error={accountError}
            isHomeBridge={bridge.value.isHomeBridge}
            isGateway={bridge.value.transport === 'gateway'}
            onConnect={requestSelectedAccountRefresh}
            onOpenAvatar={setAvatarLightboxImage}
            profile={account ? qortiumAvatarProfiles.get(account.address) : undefined}
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
          {/* Chat 2.0 slice 2: two-section dual-chain sidebar (owner UX decision,
              2026-08-13) — Qortium and Qortal side by side, both visible at once,
              never a network switcher. The Qortium section below is everything
              this app already rendered before slice 2 (Invites/Direct/Groups),
              now labelled and wrapped rather than changed. "Qortium"/"Qortal" are
              brand names, not translated. */}
          <div className={`network-section network-section--qortium${qortalAvailable ? '' : ' network-section--solo'}`}>
            {qortalAvailable ? (
              <div className="network-section__header">
                <h2 className="network-section__title">Qortium</h2>
                <span className="network-section__protocol">CHAT</span>
              </div>
            ) : null}
          {pendingGroupInvites.length > 0 || (!!account && groupInvites.phase === 'error') ? (
            <section className="panel">
              <div className="panel__header">
                <h2 className="panel__title">{t('label.invites')}</h2>
                <span className="panel__count">{pendingGroupInvites.length}</span>
              </div>
              {groupInvites.phase === 'error' ? <p className="error">{groupInvites.error}</p> : null}
              <ul className="invite-list">
                {pendingGroupInvites.map((invite) => {
                  const inviteGroup = groups.value.find((candidate) => candidate.groupId === invite.groupId);
                  const title = inviteGroup ? getGroupTitle(inviteGroup, t) : `id:${invite.groupId}`;

                  return (
                    <li className="invite-row" key={`${invite.groupId}:${invite.inviter ?? ''}`}>
                      <span className="invite-row__text">
                        <span className="invite-row__group">{title}</span>
                        {invite.inviter ? (
                          <span className="invite-row__inviter">
                            {t('label.invite.from', { name: getShortAddress(invite.inviter) })}
                          </span>
                        ) : null}
                      </span>
                      <button
                        className="button button--secondary"
                        disabled={!canUseSelectedAccount || !canJoinGroup || inviteActionGroupId !== null}
                        onClick={() => void handleAcceptInvite(invite)}
                        type="button"
                      >
                        {inviteActionGroupId === invite.groupId ? t('button.sending') : t('button.join')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <section className={`panel${isDirectCollapsed ? ' panel--collapsed' : ''}`}>
            <div className="panel__header">
              <button
                aria-expanded={!isDirectCollapsed}
                className="panel__toggle"
                onClick={() => setDirectCollapsed((collapsed) => !collapsed)}
                type="button"
              >
                <DownIcon />
                <h2>{t('label.common.direct')}</h2>
              </button>
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
            {!isDirectCollapsed && isDirectFormVisible ? (
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
            {!isDirectCollapsed && directLookupError ? <p className="error">{directLookupError}</p> : null}
            {!isDirectCollapsed && activeChats.phase === 'error' ? <p className="error">{activeChats.error}</p> : null}
            {!isDirectCollapsed && !canOpenDirectChat ? <p className="muted">{directAccessUnavailableLabel}</p> : null}
            {!isDirectCollapsed && canOpenDirectChat && !canLoadPrivateDirectChats ? (
              <p className="muted">{directListUnavailableLabel}</p>
            ) : null}
            {activeChats.phase === 'loading' && !isDirectCollapsed ? (
              <LoadingRows count={3} label={t('label.loading')} />
            ) : (
              <DirectList
                activityByAddress={directActivityByAddress}
                avatarProfiles={qortiumAvatarProfiles}
                canOpen={canOpenDirectChat}
                collapsed={isDirectCollapsed}
                directs={mergedDirects}
                onRemove={handleRemoveDirect}
                onSelect={handleSelectDirect}
                previewByAddress={directPreviewByAddress}
                removableAddresses={removableDirectAddresses}
                selectedAddress={selectedDirectAddress}
                t={t}
                unreadAddresses={unreadDirectAddresses}
                now={now}
              />
            )}
          </section>

          <section className={`panel${isGroupsCollapsed ? ' panel--collapsed' : ''}`}>
            <div className="panel__header">
              <button
                aria-expanded={!isGroupsCollapsed}
                className="panel__toggle"
                onClick={() => setGroupsCollapsed((collapsed) => !collapsed)}
                type="button"
              >
                <DownIcon />
                <h2>{t('label.group.joinedGroups')}</h2>
              </button>
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
            {!isGroupsCollapsed && isGroupSearchVisible ? (
              <form
                className="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadGroupDiscoveries(search);
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
            {!isGroupsCollapsed && isGroupSearchVisible && groupDiscoveries.phase !== 'idle' ? (
              <div className="group-discovery">
                <div className="group-discovery__header">
                  <h3>{t('label.group.discover')}</h3>
                  {groupDiscoveries.phase === 'ready' ? (
                    <span className="panel__count">{groupDiscoveryConversations.length}</span>
                  ) : null}
                </div>
                {groupDiscoveries.phase === 'error' ? <p className="error">{groupDiscoveries.error}</p> : null}
                {groupDiscoveries.phase === 'loading' ? (
                  <LoadingRows count={3} label={t('label.loading')} />
                ) : groupDiscoveries.phase === 'ready' ? (
                  <GroupList
                    conversations={groupDiscoveryConversations}
                    groupAvatarProfiles={groupAvatarProfiles}
                    onSelect={handleSelectGroup}
                    selectedConversationKey={selectedGroupConversationKey}
                    t={t}
                    now={now}
                  />
                ) : null}
              </div>
            ) : null}
            {!isGroupsCollapsed && showGroupOnboarding ? (
              <div className="panel__intro">
                <p>{t('hint.groupOnboarding')}</p>
                <button
                  aria-label={t('button.close')}
                  className="icon-button panel__intro-close"
                  onClick={() => setShowGroupOnboarding(false)}
                  title={t('button.close')}
                  type="button"
                >
                  <CloseIcon />
                </button>
              </div>
            ) : null}
            {!isGroupsCollapsed && groups.phase === 'error' ? <p className="error">{groups.error}</p> : null}
            {groups.phase === 'loading' && groups.value.length === 0 && !isGroupsCollapsed ? (
              <LoadingRows count={5} label={t('label.loading')} />
            ) : (
              <GroupList
                collapsed={isGroupsCollapsed}
                conversations={groupConversations}
                groupAvatarProfiles={groupAvatarProfiles}
                onSelect={handleSelectGroup}
                selectedConversationKey={selectedGroupConversationKey}
                t={t}
                now={now}
              />
            )}
          </section>
          </div>

          {qortalAvailable ? (
            <div className="network-section network-section--qortal">
              <div className="network-section__header">
                <h2 className="network-section__title">Qortal</h2>
                <span className="network-section__protocol">CHAT</span>
              </div>
              <section className={`panel${isQortalGroupsCollapsed ? ' panel--collapsed' : ''}`}>
                <div className="panel__header">
                  <button
                    aria-expanded={!isQortalGroupsCollapsed}
                    className="panel__toggle"
                    onClick={() => setQortalGroupsCollapsed((collapsed) => !collapsed)}
                    type="button"
                  >
                    <DownIcon />
                    <h2>{t('label.group.joinedGroups')}</h2>
                  </button>
                  <div className="panel__header-actions">
                    {hasUnreadQortalGroups ? (
                      <span
                        aria-label={t('aria.unreadGroups')}
                        className="panel__unread-dot"
                        role="img"
                        title={t('aria.unreadGroups')}
                      />
                    ) : null}
                    <span className="panel__count">{qortalGroups.value.length}</span>
                    <button
                      aria-expanded={isQortalGroupSearchOpen}
                      aria-label={t('label.searchGroups')}
                      className="icon-button"
                      onClick={toggleQortalGroupSearch}
                      title={t('label.searchGroups')}
                      type="button"
                    >
                      <SearchIcon />
                    </button>
                  </div>
                </div>
                {!isQortalGroupsCollapsed && isQortalGroupSearchOpen ? (
                  <form
                    className="search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void loadQortalGroupDiscoveries(qortalSearch);
                    }}
                  >
                    <input
                      aria-label={t('label.searchGroups')}
                      onChange={(event) => setQortalSearch(event.target.value)}
                      placeholder={t('placeholder.searchGroups')}
                      ref={qortalGroupSearchInputRef}
                      value={qortalSearch}
                    />
                    <button className="button" type="submit">
                      {t('button.search')}
                    </button>
                  </form>
                ) : null}
                {!isQortalGroupsCollapsed &&
                isQortalGroupSearchOpen &&
                qortalGroupDiscoveries.phase !== 'idle' ? (
                  <div className="group-discovery">
                    <div className="group-discovery__header">
                      <h3>{t('label.group.discover')}</h3>
                      {qortalGroupDiscoveries.phase === 'ready' ? (
                        <span className="panel__count">{qortalGroupDiscoveryConversations.length}</span>
                      ) : null}
                    </div>
                    {qortalGroupDiscoveries.phase === 'error' ? (
                      <p className="error">{qortalGroupDiscoveries.error}</p>
                    ) : null}
                    {qortalGroupDiscoveries.phase === 'loading' ? (
                      <LoadingRows count={3} label={t('label.loading')} />
                    ) : qortalGroupDiscoveries.phase === 'ready' ? (
                      <GroupList
                        conversations={qortalGroupDiscoveryConversations}
                        groupAvatarProfiles={groupAvatarProfiles}
                        onSelect={handleSelectQortalGroup}
                        selectedConversationKey={selectedGroupConversationKey}
                        t={t}
                        now={now}
                      />
                    ) : null}
                  </div>
                ) : null}
                {!isQortalGroupsCollapsed && qortalGroups.phase === 'error' ? (
                  <p className="error">{qortalGroups.error}</p>
                ) : null}
                {!isQortalGroupsCollapsed && qortalActiveChats.phase === 'error' ? (
                  <p className="error">{qortalActiveChats.error}</p>
                ) : null}
                {qortalGroups.phase === 'loading' && !isQortalGroupsCollapsed ? (
                  <LoadingRows count={5} label={t('label.loading')} />
                ) : (
                  <GroupList
                    collapsed={isQortalGroupsCollapsed}
                    conversations={qortalGroupConversations}
                    groupAvatarProfiles={groupAvatarProfiles}
                    onSelect={handleSelectQortalGroup}
                    selectedConversationKey={selectedGroupConversationKey}
                    t={t}
                    now={now}
                  />
                )}
              </section>
            </div>
          ) : null}
        </aside>

        <section
          aria-label={t('aria.selectedChat')}
          className="chat-pane"
          inert={isMembersOverlay || undefined}
          onDragEnter={handleAttachmentDragEnter}
          onDragLeave={handleAttachmentDragLeave}
          onDragOver={handleAttachmentDragOver}
          onDrop={handleAttachmentDrop}
        >
          {isDraggingAttachment ? (
            <div aria-hidden="true" className="chat-pane__drop-overlay">
              <span>{t('label.composer.dropFile')}</span>
            </div>
          ) : null}
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
            {selectedGroup ? (
              <UserAvatar
                className="chat-pane__group-avatar"
                fallback={getConversationInitials(getGroupTitle(selectedGroup, t))}
                name={getGroupTitle(selectedGroup, t)}
                src={selectedGroupAvatar?.avatarSrc ?? null}
              />
            ) : null}
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
              {selectedChat ? (
                <div className="chat-pane__context">
                  <span>{selectedChat.network === 'qortal' ? 'Qortal' : 'Qortium'}</span>
                  <span>CHAT</span>
                  {selectedChat.kind === 'group' ? (
                    <span>
                      {isGeneralChatGroup(selectedChat.group)
                        ? t('label.group.global')
                        : selectedChat.network === 'qortal'
                          ? qortalMemberGroups.phase === 'ready'
                            ? qortalJoinedIds.has(selectedChat.group.groupId)
                              ? t('label.group.joined')
                              : t('label.group.preview')
                            : t('label.loading')
                          : memberGroups.phase === 'ready'
                            ? isConfirmedJoinedGroup
                              ? t('label.group.joined')
                              : t('label.group.preview')
                            : t('label.loading')}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {selectedChat?.kind === 'group' && selectedChat.group.description?.trim() ? (
                <p>{selectedChat.group.description.trim()}</p>
              ) : null}
              {selectedChat?.kind === 'direct' ? (
                <p>{canReadPrivateDirectChat ? t('group.meta.directPrivateRead') : t('group.meta.direct')}</p>
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
            {topActionUnavailableLabel ? <p className="chat-pane__action-hint">{topActionUnavailableLabel}</p> : null}
          </div>

          {/* Owns the `1fr` row of the `.chat-pane` grid so the message feed
              always gets the remaining space regardless of how many notices
              above it are currently rendered. */}
          <div className="chat-pane__content">
            <div className="chat-pane__notices">
              {messages.phase === 'error' ? (
                <div className="chat-pane__load-error">
                  <p className="error">{messages.error}</p>
                  <button
                    className="button button--secondary"
                    onClick={() => void loadMessages(selectedChat)}
                    type="button"
                  >
                    {t('button.retry')}
                  </button>
                </div>
              ) : null}
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
            </div>
            <div aria-atomic="true" aria-live="polite" className="sr-only" role="log">
              {liveAnnouncement}
            </div>
            {!selectedChat ? (
              <div className="chat-empty-state">
                <p>{t('hint.noChatSelected')}</p>
                {groups.value.find((group) => isGeneralChatGroup(group)) ? (
                  <button
                    className="button"
                    onClick={() => {
                      const generalChat = groups.value.find((group) => isGeneralChatGroup(group));

                      if (generalChat) {
                        selectGroup(generalChat);
                      }
                    }}
                    type="button"
                  >
                    {t('button.startGeneralChat')}
                  </button>
                ) : null}
              </div>
            ) : messages.phase === 'loading' || (messages.phase === 'ready' && !hasSelectedMessages) ? (
              // The second arm covers the transient frame right after a chat
              // switch, before the load effect runs: `messages` still holds the
              // previous chat then, and must not flash under the new header.
              <LoadingRows count={4} label={t('label.loading')} />
            ) : (
              <MessageList
                avatarProfiles={selectedAvatarProfiles}
                canCompose={canComposeMessage}
                canRevise={canComposeMessage && selectedChat?.network !== 'qortal'}
                canOpenDocumentViewer={canOpenDocumentViewer}
                canOpenMediaPlayer={canOpenMediaPlayer}
                canSaveQdnResource={canSaveQdnResource}
                emptyHint={isSelectedGeneralChat ? t('hint.noMessages.general') : undefined}
                initialScrollPosition={scrollPositionsRef.current.get(selectedChatKey)}
                messages={displayMessages}
                olderMessagesError={olderMessagesState.error}
                olderMessagesReachedStart={olderMessagesState.reachedStart}
                olderMessagesLoading={olderMessagesState.loading}
                onDelete={setDeleteTarget}
                onDiscardMessage={handleDiscardMessage}
                onDiscardRevision={handleDiscardRevision}
                onEdit={handleStartEdit}
                onLoadOlder={handleLoadOlderMessages}
                onOpenAccount={(target) => setAccountInfoTarget({ ...target, network: selectedChat?.network ?? 'qortium' })}
                onOpenAvatar={setAvatarLightboxImage}
                onOpenImage={setAvatarLightboxImage}
                onReact={handleReactToMessage}
                onReply={handleStartReply}
                onRetryMessage={handleRetryMessage}
                onRetryRevision={handleRetryRevision}
                onScrollPositionChange={handleScrollPositionChange}
                now={now}
                pendingReactionKey={reactionPendingKey}
                pendingRevisionBySignature={pendingRevisionBySignature}
                scrollChatKey={selectedChatKey}
                selfAddress={selfAddress}
                selfName={selfName}
                sentMessageNonce={sentMessageNonce}
                systemMessages={selectedTransactions}
                t={t}
                unreadDividerCeiling={unreadDividerCeiling}
                unreadDividerTimestamp={unreadDividerTimestamp}
              />
            )}
          </div>
          {(isSelectedQortalGroup ? qortalBridge.value.transport : bridge.value.transport) === 'gateway' ? (
            <div aria-live="polite" className="composer composer--notice">
              <p>{t('status.gateway.readOnly')}</p>
            </div>
          ) : !selectedChat ? (
            <div aria-live="polite" className="composer composer--notice">
              <p>{t('hint.noChatSelected')}</p>
            </div>
          ) : publicNodeSendNotice ? (
            <div aria-live="polite" className="composer composer--notice">
              <p>{publicNodeSendNotice}</p>
            </div>
          ) : showGroupComposerNotice ? (
            <div aria-live="polite" className="composer composer--notice">
              <div>
                <p>{groupComposerNotice}</p>
                <p>{t('hint.groupApprovalDelay')}</p>
              </div>
              {isSelectedGroupMembershipConfirmed ? renderJoinGroupButton() : null}
            </div>
          ) : showQortalGroupComposerNotice ? (
            // No join affordance here (see showQortalGroupComposerNotice) —
            // there is no JOIN_GROUP bridge action for Qortal in this slice.
            <div aria-live="polite" className="composer composer--notice">
              <p>{qortalGroupComposerNotice}</p>
            </div>
          ) : !canComposeMessage ? (
            <div aria-live="polite" className="composer composer--notice">
              <p>
                {selectedChat.kind === 'direct'
                  ? directSendUnavailableLabel
                  : isSelectedQortalGroup
                    ? qortalGroupSendUnavailableLabel
                    : groupSendUnavailableLabel}
              </p>
            </div>
          ) : (
            <form className="composer" onSubmit={(event) => void handleSendMessage(event)}>
              {isComposerEmojiOpen ? (
                <div className="composer__emoji-panel">
                  <Suspense fallback={<p className="muted">{t('label.loading')}</p>}>
                    <ComposerEmojiPicker
                      autoFocusSearch={false}
                      emojiStyle={'native' as EmojiStyle}
                      height="min(320px, 50dvh)"
                      lazyLoadEmojis
                      onEmojiClick={(emoji: EmojiClickData) => insertComposerEmoji(emoji.emoji)}
                      previewConfig={{ showPreview: false }}
                      searchPlaceHolder={t('label.search')}
                      theme={'auto' as Theme}
                      width="100%"
                    />
                  </Suspense>
                </div>
              ) : null}
              {stagedAttachment ? (
                <div className="composer__attachment">
                  <span aria-hidden="true">📎</span>
                  <span className="composer__attachment-name">{stagedAttachment.filename}</span>
                  <span className="composer__attachment-size">
                    {stagedAttachment.phase === 'processing'
                      ? t('status.attachment.processing')
                      : formatAttachmentSize(stagedAttachment.size)}
                  </span>
                  <button
                    aria-label={t('label.attachment.remove')}
                    className="icon-button composer__attachment-remove"
                    onClick={clearStagedAttachment}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>
              ) : null}
              {attachmentError ? <p className="error composer__attachment-error">{attachmentError}</p> : null}
              {composeContext ? (
                <div className="composer__context">
                  <div className="composer__context-text">
                    <strong>
                      {composeContext.kind === 'edit'
                        ? t('label.composer.editing')
                        : t('label.composer.replyingTo', {
                            name: getMessageSenderLabel(
                              composeContext.message,
                              selectedAvatarProfiles.get(composeContext.message.sender),
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
                // Not disabled during a pending send: disabling the focused
                // element blurs it (forcing a re-click per message) and blocks
                // typing the next message while the bridge approval runs.
                // Double-sends are already guarded by canSubmitMessage.
                disabled={!canComposeMessage}
                maxLength={4000}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                onPaste={handleComposerPaste}
                placeholder={t('placeholder.message')}
                ref={composerRef}
                rows={1}
                value={draft}
              />
              {selectedChat?.kind === 'group' ? (
                <>
                  <input
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        stageAttachment(file);
                      }

                      // Selecting the same file twice must still re-fire.
                      event.target.value = '';
                    }}
                    ref={attachmentInputRef}
                    type="file"
                  />
                  <button
                    aria-label={t('label.composer.attach')}
                    className="icon-button composer__attach"
                    disabled={!canAttach || sendPending || stagedAttachment?.phase === 'processing'}
                    onClick={() => attachmentInputRef.current?.click()}
                    title={canAttach ? t('label.composer.attach') : t('action.attachUnavailable')}
                    type="button"
                  >
                    <span aria-hidden="true">📎</span>
                  </button>
                </>
              ) : null}
              <button
                aria-expanded={isComposerEmojiOpen}
                aria-label={t('label.composer.emoji')}
                className="icon-button composer__emoji-toggle"
                disabled={!canComposeMessage}
                onClick={() => setComposerEmojiOpen((current) => !current)}
                title={t('label.composer.emoji')}
                type="button"
              >
                <span aria-hidden="true">🙂</span>
              </button>
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
                avatarProfiles={selectedAvatarProfiles}
                group={isSelectedGeneralChat ? null : selectedGroup}
                members={selectedGroupMembers}
                onOpenAccount={(target) => setAccountInfoTarget({ ...target, network: selectedChat?.network ?? 'qortium' })}
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
          canOpenDirect={accountInfoTarget.network === 'qortium' && canOpenDirectChat}
          directUnavailableLabel={directAccessUnavailableLabel}
          onClose={() => setAccountInfoTarget(null)}
          onMention={() => mentionAccount(accountInfoTarget)}
          onOpenAvatar={(image) => {
            setAccountInfoTarget(null);
            setAvatarLightboxImage(image);
          }}
          onOpenDirect={openDirectFromAccount}
          profile={(accountInfoTarget.network === 'qortal' ? qortalAvatarProfiles : qortiumAvatarProfiles).get(accountInfoTarget.sender)}
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
      {deleteTarget ? (
        <ConfirmDeleteMessageDialog
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDeleteMessage(deleteTarget)}
          pending={deletePending}
          t={t}
        />
      ) : null}
      {approvalModalOpen ? (
        <GroupApprovalDialog
          actionSignature={approvalActionSignature}
          avatarProfiles={qortiumAvatarProfiles}
          canVote={canSubmitGroupApproval}
          currentHeight={currentBlockHeight}
          group={selectedGroup}
          knownNames={qortiumKnownAvatarNames}
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
