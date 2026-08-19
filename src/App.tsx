import {
  type ClipboardEvent,
  type DragEvent,
  type SubmitEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  buildAttachmentIdentifier,
  buildAttachmentLink,
  getAttachmentMaxBytes,
  getAttachmentServiceFromMime,
  getFirstTransferFile,
  isSourceAttachmentExpired,
  QDN_PUBLISH_SOURCE_MAX_BYTES,
  shouldClearStagedAttachmentOnAccountLock,
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
  getNameOwnerAddressForNetwork,
  getPendingBridgeTransactions,
  getPendingGroupApprovals,
  getTransactionStatus,
  getPrivateDirectActiveChats,
  getPrivateGroupActiveChats,
  getPrivateGroupChatState,
  forgetPendingBridgeTransaction,
  isChatSendRejectedError,
  isPrivateAttachmentDescriptor,
  isPublishSourceTokenError,
  isQortalPrivateGroupChatState,
  leaveGroup,
  joinGroup,
  publishChatAttachment,
  publishQdnResource,
  requestPrivateGroupChatKey,
  resolvePrivateGroupChatKeyRequests,
  searchGroups,
  selectQdnPublishSource,
  startMinting,
  submitGroupApproval,
} from './coreApi';
import { dispatchChatSendEntry, dispatchChatRevisionEntry } from './chatDispatch';
import { getPrivateGroupComposerMaxPlaintextBytes, getUtf8ByteLength } from './privateGroupComposer';
import { mergePrivateGroupActiveChats } from './privateGroupActiveChats';
import { getMessageNetworkIdentity, getNetworkBridgeState, hasNetworkBridge } from './chatNetwork';
import { getBridgeErrorCode, isPendingReconciliationRequired } from './bridgeErrors';
import {
  clearNetworkKeyedEntries,
  filterChatJournalEntries,
  getForgettableJournalSignatures,
  getJournalConversationKey,
  shouldFetchPendingJournal,
} from './bridgeJournal';
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
  canReviseMessageThread,
  getLatestActivityMessageTimestamp,
  getMessageKey,
  sortMessagesByTimestamp,
  type MessageThread,
} from './messageThreads';
import { chatReadRequiresAccount, isChatReadSessionStale } from './chatReadSession';
import { retainChatMessagesWhenEqual } from './messageUpdates';
import {
  canRetryPendingDelivery,
  createLocalSendId,
  createPendingRevision,
  createPendingSend,
  expirePendingRevisions,
  expirePendingSends,
  failPendingRevision,
  failPendingRevisionAmbiguously,
  failPendingSend,
  failPendingSendAmbiguously,
  getPendingSignatureIdentity,
  hasActiveDuplicateSend,
  indexPendingRevisionsByTarget,
  mergeOptimisticMessages,
  prunePendingRevisions,
  prunePendingSends,
  retainPendingForNetworkAccount,
  resolvePendingRevision,
  resolvePendingRevisionAmbiguously,
  resolvePendingSend,
  resolvePendingSendAmbiguously,
  retryPendingRevision,
  retryPendingSend,
  type PendingRevision,
  type PendingSend,
  type PendingSendTarget,
} from './pendingSends';
import { updatePendingStateRef } from './pendingState';
import { isPrivateGroupRecoveryContextCurrent } from './privateGroupRecovery';
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
import { AppShell } from './AppShell';
import { DirectList, GroupList } from './chatLists';
import { ChatComposer, type ComposerAttachment } from './ChatComposer';
import { ChatPaneHeader } from './ChatPaneHeader';
import { ConversationNetworkSection } from './ConversationRail';
import { LoadingRows } from './LoadingRows';
import { MembersDrawer } from './MembersDrawer';
import { SidebarPane } from './SidebarPane';
import { Topbar } from './Topbar';
import {
  createGroupConversationSummary,
  getConversationKey,
  qualifyPublicGroupDiscoveries,
  type GroupConversationSummary,
  type PublicGroupDiscovery,
} from './conversationModel';
import { getConversationInitials } from './conversationPresentation';
import { MessageList } from './MessageList';
import {
  getAvatarView,
  getDirectCounterpartName,
  getDirectTitle,
  getMessageSenderLabel,
  getShortAddress,
  type AccountInfoTarget,
  type AvatarProfilesByIdentity,
  type CachedAvatarProfile,
  selectAvatarProfilesForNetwork,
} from './accountDisplay';
import {
  CloseIcon,
  DownIcon,
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
  hasNotificationPermission,
  isIncomingChatMessage,
  readChatNotificationPreferences,
  reconcileChatNotifications,
  selectDirectActivityNotification,
  showChatNotification,
  writeChatNotificationPreferences,
  type ChatNotificationPreferences,
  type ShowChatNotificationResult,
} from './notifications';
import { LatestRequestGuard } from './latestRequest';
import { loadQortalAccountSnapshot } from './qortalAccountSession';
import { getLegacyQortiumMigrationHint } from './qortalUiMigration';
import { StartupAccountRefreshCoordinator } from './startupAccountRefresh';
import {
  mergePersistedDirect,
  initializeQortalUiStorage,
  readLastChat,
  readLastChatNetwork,
  readPersistedDirectsForNetwork,
  readQortalDirectReadWatermarks,
  readQortalLastChat,
  readReadWatermarks,
  readScrollBookmarks,
  readSidebarCollapse,
  setChatStorageMode,
  toStoredSelectedChat,
  writeLastChat,
  writeLastChatNetwork,
  writePersistedDirectsForNetwork,
  writeQortalDirectReadWatermarks,
  writeQortalLastChat,
  writeQortalReadWatermarks,
  writeQortalScrollBookmarks,
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
import { shouldDecryptGroupMessages } from './groupAccess';
import { isAlreadyGroupMemberError } from './groupJoin';
import {
  fetchAccountAvatar,
  fetchGroupAvatar,
  AVATAR_CACHE_MAX_BYTES,
  AVATAR_CACHE_MAX_PIXELS,
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
import { buildQortalHubGroupChatPayload } from './qortalChatPayload';
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
  PendingBridgeTransactionEntry,
  PrivateAttachmentConversation,
  PrivateAttachmentDescriptor,
  PrivateGroupChatState,
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
const emptyJournalEntries: PendingBridgeTransactionEntry[] = [];
// The 30s sidebar activity sweeps only need the latest real (non-reaction)
// message timestamp per chat, not a full transcript page — a small window cuts
// each probe's payload ~10x. Deep enough that a burst of reactions rarely
// fills it; when one does, the merge skips rather than guessing (see
// mergeActivityTimestamp's allowTombstone).
const ACTIVITY_SWEEP_MESSAGE_LIMIT = 10;

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
// Both arms can now carry network: 'qortal' — Qortal direct chat (P2) mirrors
// the qortium 'direct' arm the same way selectQortalGroup mirrors selectGroup.
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

// Key for the per-chat GET_PRIVATE_GROUP_CHAT_STATE store — same
// network-then-id convention as getSelectedChatKey above.
function getPrivateGroupChatStateKey(network: ChatNetwork, groupId: number) {
  return `${network}:${groupId}`;
}

// Coded bridge errors (Home 2's structured `code` — see bridgeErrors.ts) take
// precedence over message-string matching below, which stays as the fallback
// for legacy hosts that only ever throw a plain Error. USER_CANCELLED returns
// '' (quiet, no banner): the user deliberately dismissed Home's prompt, so
// showing an error for their own choice is not useful feedback.
function getCodedBridgeErrorMessage(code: string, t: TranslateFunction): string | null {
  switch (code) {
    case 'NODE_CAPABILITY_MISSING':
      return t('status.bridge.nodeCapabilityMissing');
    case 'ROUTE_UNAVAILABLE':
      return t('status.bridge.routeUnavailable');
    case 'ACCOUNT_LOCKED':
      return t('status.bridge.accountLocked');
    case 'NOT_GROUP_MEMBER':
      return t('status.bridge.notGroupMember');
    case 'MISSING_RECIPIENT_PUBLIC_KEY':
      return t('status.bridge.missingRecipientPublicKey');
    case 'MISSING_GROUP_KEY':
      return t('status.bridge.missingGroupKey');
    case 'PENDING_TRANSACTION_RECONCILIATION_REQUIRED':
      return t('status.bridge.pendingReconciliationRequired');
    case 'VALIDATION_FAILED':
      return t('status.bridge.validationFailed');
    case 'STALE_CONTEXT':
      return t('status.bridge.staleContext');
    case 'HOME_BRIDGE_ERROR':
      return t('status.bridge.generic');
    case 'USER_CANCELLED':
      return '';
    default:
      return null;
  }
}

function getBridgeErrorMessage(error: unknown, fallback: string, t: TranslateFunction) {
  const code = getBridgeErrorCode(error);

  if (code) {
    const coded = getCodedBridgeErrorMessage(code, t);

    if (coded !== null) {
      return coded;
    }
  }

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

function createState<T>(value: T): AsyncState<T> {
  return { phase: 'idle', value };
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
  const avatarFootprintsRef = useRef(new Map<string, { byteLength: number; pixelCount: number }>());
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
      avatarFootprintsRef.current.delete(objectUrl);
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

    const commit = (profile: AvatarProfile, footprint?: { byteLength: number; pixelCount: number }) => {
      const profileKey = getAvatarProfileKey(profile.network, profile.address);
      settlePending(profileKey);
      clearRetry(profileKey);

      if (!isCurrent(profileKey)) {
        revokeAvatarObjectUrl(profile.avatarSrc);
        return;
      }

      const previousObjectUrl = profileAvatarObjectUrlsRef.current.get(profileKey);

      let nextAvatarSrc = profile.avatarSrc;
      if (nextAvatarSrc && nextAvatarSrc !== previousObjectUrl && footprint) {
        let cachedBytes = 0;
        let cachedPixels = 0;
        for (const [src, cached] of avatarFootprintsRef.current) {
          if (src === previousObjectUrl) continue;
          cachedBytes += cached.byteLength;
          cachedPixels += cached.pixelCount;
        }
        if (
          cachedBytes + footprint.byteLength > AVATAR_CACHE_MAX_BYTES ||
          cachedPixels + footprint.pixelCount > AVATAR_CACHE_MAX_PIXELS
        ) {
          revokeAvatarObjectUrl(nextAvatarSrc);
          nextAvatarSrc = previousObjectUrl ?? null;
        }
      }

      if (previousObjectUrl && previousObjectUrl !== nextAvatarSrc) {
        profileAvatarObjectUrlsRef.current.delete(profileKey);
        releaseObjectUrl(previousObjectUrl);
      }

      if (nextAvatarSrc) {
        profileAvatarObjectUrlsRef.current.set(profileKey, nextAvatarSrc);
        avatarObjectUrlsRef.current.add(nextAvatarSrc);
        if (footprint && nextAvatarSrc === profile.avatarSrc) avatarFootprintsRef.current.set(nextAvatarSrc, footprint);
      }

      setProfiles((current) => {
        const next = new Map(current);
        next.set(profileKey, { ...profile, avatarSrc: nextAvatarSrc, requestKey: requestKeyByAddress.get(profileKey) as string });
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
          commit(
            { ...profile, avatarSrc: avatar.src },
            { byteLength: avatar.byteLength, pixelCount: avatar.pixelCount },
          );
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
  const avatarFootprintsRef = useRef(new Map<string, { byteLength: number; pixelCount: number }>());
  const deferredObjectUrlsRef = useRef(new Set<string>());
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
    for (const src of deferredObjectUrlsRef.current) revokeAvatarObjectUrl(src);
  }, []);

  useEffect(() => {
    const releaseObjectUrl = (src: string) => {
      if (src === protectedObjectUrl) {
        deferredObjectUrlsRef.current.add(src);
        return;
      }
      deferredObjectUrlsRef.current.delete(src);
      avatarFootprintsRef.current.delete(src);
      revokeAvatarObjectUrl(src);
    };

    for (const src of deferredObjectUrlsRef.current) {
      if (src !== protectedObjectUrl) releaseObjectUrl(src);
    }

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
      if (src) {
        objectUrlsRef.current.delete(key);
        releaseObjectUrl(src);
      }
    }
    for (const [key, src] of objectUrlsRef.current) {
      if (!wanted.has(key)) {
        objectUrlsRef.current.delete(key);
        releaseObjectUrl(src);
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
        let nextSrc = result.kind === 'ready' ? result.src : null;
        if (result.kind === 'ready' && nextSrc !== previous) {
          let cachedBytes = 0;
          let cachedPixels = 0;
          for (const [src, cached] of avatarFootprintsRef.current) {
            if (src === previous) continue;
            cachedBytes += cached.byteLength;
            cachedPixels += cached.pixelCount;
          }
          if (
            cachedBytes + result.byteLength > AVATAR_CACHE_MAX_BYTES ||
            cachedPixels + result.pixelCount > AVATAR_CACHE_MAX_PIXELS
          ) {
            revokeAvatarObjectUrl(nextSrc);
            nextSrc = previous ?? null;
          }
        }
        if (previous && previous !== nextSrc) {
          objectUrlsRef.current.delete(key);
          releaseObjectUrl(previous);
        }
        if (nextSrc) {
          objectUrlsRef.current.set(key, nextSrc);
          if (result.kind === 'ready' && nextSrc === result.src) {
            avatarFootprintsRef.current.set(nextSrc, {
              byteLength: result.byteLength,
              pixelCount: result.pixelCount,
            });
          }
        }
        setProfiles((current) => {
          const next = new Map(current);
          next.set(key, {
            avatarSrc: nextSrc,
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
    host: 'browser-dev',
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
  // Home 2's restart-safe pending-transaction journal (item D — see
  // bridgeJournal.ts). Raw fetch results, one array per network, mirroring
  // every other per-network state in this file (bridge/qortalBridge,
  // account/qortalAccount, ...) rather than a single network-keyed map.
  const [journalEntries, setJournalEntries] = useState<PendingBridgeTransactionEntry[]>(emptyJournalEntries);
  // Qortal keeps its chain-specific bridge/account state separate, while the
  // rendered group rows are normalized later into the same source-qualified
  // conversation model as Qortium. Home 2 supplies window.qortalRequest;
  // Home 1.7 is admitted only after its Qortal-prefixed qdnRequest catalogue
  // proves the required read contract (see qortalAvailable below).
  const [qortalAvailable, setQortalAvailable] = useState(false);
  const qortalAvailableRef = useRef(false);
  const [qortalBridge, setQortalBridge] = useState<AsyncState<BridgeState>>(createState({
    actions: [],
    host: 'browser-dev',
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
  // below). Also backs the Qortal join/leave affordance's membership check
  // (isConfirmedJoinedQortalGroup / isJoinableQortalGroup).
  const [qortalMemberGroups, setQortalMemberGroups] = useState<AsyncState<GroupData[]>>(createState(emptyGroups));
  // D6: qortal mirror of accountJoinRequests/adminJoinRequests — the
  // connected Qortal account's own pending join requests (requester side)
  // and, for groups it administers, the requests waiting on it (admin
  // side). Separate state, not merged into the Qortium ones above, so a
  // same-numeric groupId can never cross-fire between chains (see
  // pendingTrackedQortalJoinGroupIds' comment for the same rule applied to
  // locally tracked transactions).
  const [qortalAccountJoinRequests, setQortalAccountJoinRequests] =
    useState<AsyncState<GroupJoinRequest[]>>(createState(emptyJoinRequests));
  const [qortalAdminJoinRequests, setQortalAdminJoinRequests] =
    useState<AsyncState<GroupWithJoinRequests[]>>(createState(emptyAdminJoinRequests));
  const [qortalActiveChats, setQortalActiveChats] = useState<AsyncState<ActiveChats>>(createState(emptyActiveChats));
  const [qortalJournalEntries, setQortalJournalEntries] = useState<PendingBridgeTransactionEntry[]>(emptyJournalEntries);
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
  const messagesChatKeyRef = useRef(messagesChatKey);
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
  const qortiumAccountRefreshGuardRef = useRef(new LatestRequestGuard());
  const qortiumActiveChatsRequestGuardRef = useRef(new LatestRequestGuard());
  const qortalAccountRefreshGuardRef = useRef(new LatestRequestGuard());
  const qortalAccountRefreshPendingRef = useRef(false);
  const refreshingQortalAccountAddressRef = useRef<string | null>(null);
  const qortalActiveChatsRequestGuardRef = useRef(new LatestRequestGuard());
  // Item D / P6b: fetchPendingJournal has no per-network in-flight tracking
  // of its own — a slow response from the account that was selected when the
  // fetch started must never land after a switch to a different account (or
  // network availability being pulled), overwriting that account's own
  // journal snapshot. One guard per network, invalidated whenever the owning
  // account changes (see the Qortium account-reset effect and
  // clearQortalAccountSessionState below).
  const journalRequestGuardRef = useRef(new LatestRequestGuard());
  const qortalJournalRequestGuardRef = useRef(new LatestRequestGuard());
  const groupDiscoveryRequestRef = useRef(0);
  const qortalGroupDiscoveryRequestRef = useRef(0);
  const startupAccountRefreshCoordinatorRef = useRef<StartupAccountRefreshCoordinator | null>(null);
  const selectedAccountRefreshCallbackRef = useRef<() => void>(() => undefined);
  const [directAddress, setDirectAddress] = useState('');
  const [isDirectSearchOpen, setDirectSearchOpen] = useState(false);
  const [directLookupPending, setDirectLookupPending] = useState(false);
  const [directLookupError, setDirectLookupError] = useState('');
  const directSearchInputRef = useRef<HTMLInputElement>(null);
  // Qortal counterparts of the direct-open form state above. A separate
  // section-scoped form (mirrors qortalSearch/isQortalGroupSearchOpen), not a
  // shared one with a network selector — the Qortal Direct panel renders its
  // own open-by-name form, same as the Qortal Groups panel already does.
  const [qortalDirectAddress, setQortalDirectAddress] = useState('');
  const [isQortalDirectSearchOpen, setQortalDirectSearchOpen] = useState(false);
  const [qortalDirectLookupPending, setQortalDirectLookupPending] = useState(false);
  const [qortalDirectLookupError, setQortalDirectLookupError] = useState('');
  const qortalDirectSearchInputRef = useRef<HTMLInputElement>(null);
  const [isQortalDirectCollapsed, setQortalDirectCollapsed] = useState(false);
  // Qortal counterpart of persistedDirects — kept in the sidebar after their
  // messages expire off the active-chats list, persisted per Qortal account.
  const [qortalPersistedDirects, setQortalPersistedDirects] = useState<PersistedDirect[]>([]);
  const [qortalLoadedDirectActivityByAddress, setQortalLoadedDirectActivityByAddress] =
    useState<ReadonlyMap<string, number | null>>(() => new Map());
  const loadedQortalDirectActivityRef = useRef<ReadonlyMap<string, number | null>>(new Map());
  // Per-chat read watermark (latest activity timestamp the user has seen). Held in
  // memory for the session: baselined to current activity when a chat is first
  // discovered so existing history is not flagged, then advanced as chats are read.
  const [lastReadByGroupId, setLastReadByGroupId] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [lastReadByQortalGroupId, setLastReadByQortalGroupId] =
    useState<ReadonlyMap<number, number>>(() => new Map());
  const [lastReadByAddress, setLastReadByAddress] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [lastReadByQortalAddress, setLastReadByQortalAddress] =
    useState<ReadonlyMap<string, number>>(() => new Map());
  // Mirrors of the read watermarks, read synchronously when a chat opens to
  // snapshot the divider position before the "mark read" effect advances them.
  const lastReadByGroupIdRef = useRef(lastReadByGroupId);
  const lastReadByQortalGroupIdRef = useRef(lastReadByQortalGroupId);
  const lastReadByAddressRef = useRef(lastReadByAddress);
  const lastReadByQortalAddressRef = useRef(lastReadByQortalAddress);
  // Skip the one render right after an account switch, where the watermark maps
  // still hold the previous account's values, so we never persist them under the
  // new account's key. The load effect raises this; the persist effect clears it.
  const skipQortiumWatermarkPersistRef = useRef(true);
  const skipQortalWatermarkPersistRef = useRef(true);
  const skipQortalDirectWatermarkPersistRef = useRef(true);
  // Qortal can resolve before the parallel initial Qortium account lookup.
  // Track the unfinished migration independently from the shorter write block:
  // a denied Qortium share releases new Qortal persistence while retaining the
  // pending marker for a later safe legacy merge.
  const qortalUiMigrationPendingAddressRef = useRef<string | null>(null);
  const qortalUiPersistenceBlockedAddressRef = useRef<string | null>(null);
  // Saved scroll position per chat key so the reading position is restored when
  // the user returns to a conversation after visiting another.
  const scrollPositionsRef = useRef(new Map<string, ChatScrollPosition>());
  // Trailing-debounce state for persisting the bookmarks: the map above is
  // updated per scroll event; localStorage catches up on a pause or a flush
  // (hide/unmount/account switch). The address is captured at schedule time so
  // a flush can never write one account's bookmarks under another's key.
  const scrollPersistTimerRef = useRef(0);
  const scrollPersistTargetRef = useRef<{ address: string; network: ChatNetwork } | null>(null);
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
  const [accountRefreshPending, setAccountRefreshPending] = useState(false);
  const accountRefreshPendingRef = useRef(false);
  const accountRefreshGenerationRef = useRef(0);
  const [isComposerEmojiOpen, setComposerEmojiOpen] = useState(false);
  // One attachment per message: staged via Home's native picker
  // (SELECT_QDN_PUBLISH_SOURCE) as an opaque source token, then redeemed on
  // Send by publishQdnResource (open groups) or publishChatAttachment
  // (private conversations) — see attachFile/handleSendMessage.
  const [stagedAttachment, setStagedAttachment] = useState<ComposerAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [isDraggingAttachment, setDraggingAttachment] = useState(false);
  // dragenter/dragleave fire per child element; a counter tells actual exits
  // from nested re-entries so the drop overlay does not flicker.
  const attachmentDragDepthRef = useRef(0);
  // More than one message may have a reaction in flight. Scope each guard to
  // its chat as well as signature+emoji so same-signature values on Qortium
  // and Qortal cannot clear or disable one another.
  const [reactionPendingOperations, setReactionPendingOperations] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const reactionPendingOperationsRef = useRef<ReadonlySet<string>>(reactionPendingOperations);
  // Optimistic pending -> confirmed -> failed send state (Chat 2.0 slice 1).
  // New messages and reactions live in `pendingSends` and are merged straight
  // into the rendered feed (see displayMessages below); edits/deletes target
  // an already-confirmed message and are tracked separately in
  // `pendingRevisions`, driving a lightweight inline status instead of an
  // injected bubble (see pendingSends.ts's module doc for why). Both are
  // mirrored into refs so the detached async send/retry runners below always
  // see the current value, not one captured at dispatch time.
  // Intentionally session-only: persisting these envelopes would store unsent
  // plaintext. Close/reopen durability remains deferred until an encrypted
  // persistence design exists.
  const [pendingSends, setPendingSends] = useState<PendingSend[]>([]);
  const pendingSendsRef = useRef<PendingSend[]>(pendingSends);
  const [pendingRevisions, setPendingRevisions] = useState<PendingRevision[]>([]);
  const pendingRevisionsRef = useRef<PendingRevision[]>(pendingRevisions);
  const [writeError, setWriteError] = useState('');
  const [privateGroupKeyStatus, setPrivateGroupKeyStatus] = useState('');
  const [privateGroupKeyError, setPrivateGroupKeyError] = useState('');
  // P3: GET_PRIVATE_GROUP_CHAT_STATE for the currently selected closed group,
  // keyed by `${network}:${groupId}` (see the fetch effect and
  // getPrivateGroupChatStateKey below) — drives the composer byte cap
  // (Qortium), membership confirmation and the rotation-required notice
  // (Qortal), following the same AsyncState + ref-mirror pattern used
  // throughout this file for per-selection async data. A fetch failure never
  // blocks message reads (P3-design.md) — it just leaves the composer/notice
  // without that extra signal, degrading to the always-available generic
  // membership/join gates.
  const [privateGroupChatStateByKey, setPrivateGroupChatStateByKey] = useState<
    Map<string, AsyncState<PrivateGroupChatState | null>>
  >(() => new Map());
  const privateGroupChatStateByKeyRef = useRef(privateGroupChatStateByKey);
  privateGroupChatStateByKeyRef.current = privateGroupChatStateByKey;
  const privateGroupChatStateRequestGuardRef = useRef(new LatestRequestGuard());
  // Manual Qortal admin "publish group key" affordance (RESOLVE_PRIVATE_GROUP_
  // CHAT_KEY_REQUESTS) — unlike Qortium's automatic background resolve (which
  // only relays announcements a member is already entitled to), Qortal's
  // RESOLVE is administrator bundle publication: a signed, staged QDN write
  // that must never fire automatically for every member's background
  // recovery poll (see recoverMissingPrivateGroupKeys below).
  const [qortalPrivateGroupResolvePending, setQortalPrivateGroupResolvePending] = useState(false);
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
    const timeoutError = t('message.delivery.expired');

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
  const joinedIdsRef = useRef<ReadonlySet<number>>(joinedIds);
  joinedIdsRef.current = joinedIds;
  const qortalJoinedIds = useMemo(
    () => new Set(qortalMemberGroups.value.map((group) => group.groupId)),
    [qortalMemberGroups.value],
  );
  // Mirrors joinedIdsRef above, for the qortal counterpart of
  // recoverMissingPrivateGroupKeys' isPrivateGroupRecoveryContextCurrent check.
  const qortalJoinedIdsRef = useRef<ReadonlySet<number>>(qortalJoinedIds);
  qortalJoinedIdsRef.current = qortalJoinedIds;
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
  // Network-qualified: Qortium and Qortal addresses can collide (the same
  // wallet often has the same address on both chains), so an open Qortal
  // direct chat must never read as the open Qortium one (or vice versa) in
  // sidebar exclusion/highlight logic below.
  const selectedDirectAddress =
    selectedChat?.kind === 'direct' && selectedChat.network !== 'qortal' ? selectedChat.direct.address : null;
  const selectedQortalDirectAddress =
    selectedChat?.kind === 'direct' && selectedChat.network === 'qortal' ? selectedChat.direct.address : null;
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
  const selectedQortalDirectAddressRef = useRef<string | null>(selectedQortalDirectAddress);
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
  const currentQortalAccountAddressRef = useRef<string | null>(qortalAccount?.address ?? null);
  // Set once the user explicitly picks a chat, so a late-arriving account does not
  // restore over their choice. Reset per account so each account restores once.
  const userSelectedChatRef = useRef(false);

  selectedGroupIdRef.current = selectedGroupId;
  selectedDirectAddressRef.current = selectedDirectAddress;
  selectedQortalDirectAddressRef.current = selectedQortalDirectAddress;
  selectedChatKeyRef.current = selectedChatKey;
  messagesChatKeyRef.current = messagesChatKey;
  hasSelectedChatRef.current = selectedChat !== null;
  currentAccountAddressRef.current = account?.address ?? null;
  currentQortalAccountAddressRef.current = qortalAccount?.address ?? null;
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
  // Qortal counterparts of directActivityByAddress/mergedDirects/
  // removableDirectAddresses above — mirrored, not merged, same as every other
  // qortal* derivation in this file (see canJoinQortalGroup's comment).
  const qortalDirectActivityByAddress = useMemo(() => {
    const activity = new Map<string, number>();

    for (const direct of qortalActiveChats.value.direct ?? []) {
      if (typeof direct.timestamp === 'number' && !isHiddenActiveChatEntry(direct)) {
        activity.set(direct.address, direct.timestamp);
      }
    }

    for (const [address, timestamp] of qortalLoadedDirectActivityByAddress) {
      if (timestamp === null) {
        activity.delete(address);
      } else {
        activity.set(address, Math.max(activity.get(address) ?? Number.NEGATIVE_INFINITY, timestamp));
      }
    }

    return activity;
  }, [qortalActiveChats.value.direct, qortalLoadedDirectActivityByAddress]);
  const qortalActiveDirectAddresses = useMemo(
    () => new Set((qortalActiveChats.value.direct ?? []).map((direct) => direct.address)),
    [qortalActiveChats.value.direct],
  );
  const qortalMergedDirects = useMemo(() => {
    const active = qortalActiveChats.value.direct ?? [];
    const extras = qortalPersistedDirects
      .filter((direct) => !qortalActiveDirectAddresses.has(direct.address))
      .map((direct): ActiveDirectChat => (direct.name ? { address: direct.address, name: direct.name } : { address: direct.address }));

    return [...active, ...extras];
  }, [qortalActiveChats.value.direct, qortalActiveDirectAddresses, qortalPersistedDirects]);
  const qortalRemovableDirectAddresses = useMemo(
    () =>
      new Set(
        qortalMergedDirects.map((direct) => direct.address).filter((address) => !qortalActiveDirectAddresses.has(address)),
      ),
    [qortalMergedDirects, qortalActiveDirectAddresses],
  );
  const sortedGroups = useMemo(() => sortGroups(groups.value, t, groupActivityById), [groupActivityById, groups.value, t]);
  const isGroupSearchVisible = isGroupSearchOpen || search.trim().length > 0;
  const isDirectFormVisible = isDirectSearchOpen || directAddress.trim().length > 0;
  const isQortalDirectFormVisible = isQortalDirectSearchOpen || qortalDirectAddress.trim().length > 0;
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
  const unreadQortalDirectAddresses = useMemo(() => {
    const addresses = new Set<string>();

    for (const [address, timestamp] of qortalDirectActivityByAddress) {
      if (address === selectedQortalDirectAddress) {
        continue;
      }

      const lastRead = lastReadByQortalAddress.get(address);

      if (lastRead !== undefined && timestamp > lastRead) {
        addresses.add(address);
      }
    }

    return addresses;
  }, [qortalDirectActivityByAddress, lastReadByQortalAddress, selectedQortalDirectAddress]);
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
  const hasUnreadQortalDirect = unreadQortalDirectAddresses.size > 0;
  const canManageNotifications = !!account && canManageChatNotifications(actions);
  const canShowNotifications = canShowChatNotifications(actions);
  // Home 2 advertises SHOW_NOTIFICATION/NOTIFICATION_HAS_PERMISSION but never
  // NOTIFICATION_ADD/REMOVE, so canManageNotifications alone would hide the
  // whole bell UI there. Either tier is enough to let the user control the
  // stored preferences: legacy hosts drive a durable rule from them, Home 2
  // drives foreground SHOW_NOTIFICATION triggers from them instead.
  const canControlChatNotifications = canManageNotifications || (!!account && canShowNotifications);
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
  // Scoped to (transaction.network ?? 'qortium') === 'qortium' — a same-
  // numeric-id Qortal join/leave tracked below must never make a Qortium
  // group read as pending here, and vice versa (pendingTrackedQortalJoin/
  // LeaveGroupIds below).
  const pendingTrackedJoinGroupIds = useMemo(
    () =>
      new Set(
        Object.values(trackedTransactions)
          .filter(
            (transaction) =>
              transaction.action === 'join' &&
              transaction.phase === 'pending' &&
              (transaction.network ?? 'qortium') === 'qortium',
          )
          .map((transaction) => transaction.groupId),
      ),
    [trackedTransactions],
  );
  const pendingTrackedLeaveGroupIds = useMemo(
    () =>
      new Set(
        Object.values(trackedTransactions)
          .filter(
            (transaction) =>
              transaction.action === 'leave' &&
              transaction.phase === 'pending' &&
              (transaction.network ?? 'qortium') === 'qortium',
          )
          .map((transaction) => transaction.groupId),
      ),
    [trackedTransactions],
  );
  const pendingTrackedQortalJoinGroupIds = useMemo(
    () =>
      new Set(
        Object.values(trackedTransactions)
          .filter(
            (transaction) => transaction.action === 'join' && transaction.phase === 'pending' && transaction.network === 'qortal',
          )
          .map((transaction) => transaction.groupId),
      ),
    [trackedTransactions],
  );
  const pendingTrackedQortalLeaveGroupIds = useMemo(
    () =>
      new Set(
        Object.values(trackedTransactions)
          .filter(
            (transaction) => transaction.action === 'leave' && transaction.phase === 'pending' && transaction.network === 'qortal',
          )
          .map((transaction) => transaction.groupId),
      ),
    [trackedTransactions],
  );
  const adminJoinRequestGroups = useMemo(
    () => new Map(adminJoinRequests.value.map((entry) => [entry.group.groupId, entry])),
    [adminJoinRequests.value],
  );
  // D6: qortal mirror of adminJoinRequestGroups above — kept as a separate
  // map (not merged) for the same same-numeric-groupId collision reason as
  // qortalPendingJoinGroupIds/pendingJoinGroupIds.
  const qortalAdminJoinRequestGroups = useMemo(
    () => new Map(qortalAdminJoinRequests.value.map((entry) => [entry.group.groupId, entry])),
    [qortalAdminJoinRequests.value],
  );
  const isSelectedQortiumGroup =
    selectedChat?.kind === 'group' && selectedChat.network !== 'qortal';
  const isSelectedQortalGroupForAdminRequests =
    selectedChat?.kind === 'group' && selectedChat.network === 'qortal';
  const selectedAdminJoinRequests =
    selectedGroupId === null || isSelectedGeneralChat
      ? []
      : isSelectedQortalGroupForAdminRequests
        ? qortalAdminJoinRequestGroups.get(selectedGroupId)?.joinRequests ?? []
        : !isSelectedQortiumGroup
          ? []
          : adminJoinRequestGroups.get(selectedGroupId)?.joinRequests ?? [];
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
  // Qortal counterpart of directPreviewByAddress.
  const qortalDirectPreviewByAddress = useMemo(() => {
    const previews = new Map<string, string>();

    for (const direct of qortalActiveChats.value.direct ?? []) {
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
  }, [qortalActiveChats.value.direct, t]);
  // Memoized: this array feeds the memoized MessageList as `systemMessages`,
  // and a fresh identity per render would defeat its memo bailout.
  const selectedTransactions = useMemo(
    () =>
      isSelectedQortiumGroup
        ? Object.values(trackedTransactions).filter(
            (transaction) => selectedGroupId !== null && transaction.groupId === selectedGroupId,
          )
        : [],
    [isSelectedQortiumGroup, trackedTransactions, selectedGroupId],
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
  const selectedPendingAccountAddress =
    selectedChat?.network === 'qortal' ? qortalAccount?.address : account?.address;
  const pendingSendsForSelectedChat = useMemo(
    () =>
      selectedChatKey && selectedPendingAccountAddress
        ? pendingSends.filter(
            (entry) =>
              entry.accountAddress === selectedPendingAccountAddress && entry.chatKey === selectedChatKey,
          )
        : emptyPendingSends,
    [pendingSends, selectedChatKey, selectedPendingAccountAddress],
  );
  const pendingSendByLocalId = useMemo(
    () => new Map(pendingSendsForSelectedChat.map((entry) => [entry.localId, entry])),
    [pendingSendsForSelectedChat],
  );
  const selectedReactionPendingKeys = useMemo(() => {
    const prefix = `${selectedChatKey}\0`;
    const keys = new Set<string>();

    for (const operationKey of reactionPendingOperations) {
      if (operationKey.startsWith(prefix)) {
        keys.add(operationKey.slice(prefix.length));
      }
    }

    return keys;
  }, [reactionPendingOperations, selectedChatKey]);
  const displayMessages = useMemo(
    () => mergeOptimisticMessages(combinedMessages, pendingSendsForSelectedChat),
    [combinedMessages, pendingSendsForSelectedChat],
  );
  const pendingRevisionBySignature = useMemo(
    () =>
      indexPendingRevisionsByTarget(
        selectedPendingAccountAddress
          ? pendingRevisions.filter((entry) => entry.accountAddress === selectedPendingAccountAddress)
          : [],
        selectedChatKey,
      ),
    [pendingRevisions, selectedChatKey, selectedPendingAccountAddress],
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
    // During a switch, React can render the new selectedChat one frame before
    // the previous transcript is replaced. Never label that old transcript as
    // belonging to the new chat/network when pruning the global pending lists.
    if (!selectedChat || !selectedChatKey || messagesChatKey !== selectedChatKey) {
      return;
    }

    const confirmedNetwork = selectedChat.network ?? 'qortium';
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
  }, [messages.value, messagesChatKey, selectedChat, selectedChatKey]);
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
  const handleSelectQortalDirect = useStableCallback((direct: ActiveDirectChat) => selectDirect(direct, 'qortal'));
  const handleRemoveDirect = useStableCallback(removeDirect);
  const handleRemoveQortalDirect = useStableCallback(removeQortalDirect);
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

    const target = scrollPersistTargetRef.current;

    scrollPersistTargetRef.current = null;

    if (target?.network === 'qortal') {
      writeQortalScrollBookmarks(target.address, scrollPositionsRef.current);
    } else if (target) {
      writeScrollBookmarks(target.address, scrollPositionsRef.current);
    }
  });
  const handleScrollPositionChange = useStableCallback((chatKey: string, position: ChatScrollPosition) => {
    scrollPositionsRef.current.set(chatKey, position);

    const network: ChatNetwork = chatKey.startsWith('qortal:') ? 'qortal' : 'qortium';
    const address = network === 'qortal'
      ? currentQortalAccountAddressRef.current
      : currentAccountAddressRef.current;

    if (!address) {
      return;
    }

    if (network === 'qortal' && qortalUiPersistenceBlockedAddressRef.current === address) {
      return;
    }

    const pendingTarget = scrollPersistTargetRef.current;

    // One debounce timer serves both chains. Land the prior chain/account's
    // pending write before changing ownership of that timer, otherwise a quick
    // cross-network switch could leave its newest bookmark unwritten.
    if (
      pendingTarget &&
      (pendingTarget.address !== address || pendingTarget.network !== network)
    ) {
      flushScrollBookmarks();
    }

    // Persist the bookmark so the reading position survives a restart — on a
    // trailing debounce: scroll events fire at frame rate during flings, and a
    // synchronous localStorage JSON write per event janks the feed. The map
    // above is always current; the write catches up on a pause and is flushed
    // on hide/unmount/account switch.
    scrollPersistTargetRef.current = { address, network };
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

    for (const direct of qortalMergedDirects) {
      const directName = normalizeRegisteredName(getDirectCounterpartName(direct));
      const key = getAvatarProfileKey('qortal', direct.address);

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
    qortalMergedDirects,
    messages.value,
    selectedChat?.network,
    selectedGroup?.owner,
    selectedGroup?.ownerPrimaryName,
    selectedGroupMembers,
  ]);
  const avatarTargets = useMemo(() => {
    const targets = new Map<string, AvatarTarget>();
    const add = (network: ChatNetwork, address: string | null | undefined) => {
      if (address && targets.size < 48) targets.set(getAvatarProfileKey(network, address), { address, network });
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

    for (const direct of qortalMergedDirects) {
      if (
        !isQortalDirectCollapsed ||
        unreadQortalDirectAddresses.has(direct.address) ||
        direct.address === selectedQortalDirectAddress
      ) {
        add('qortal', direct.address);
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
    isQortalDirectCollapsed,
    membersOpen,
    mergedDirects,
    qortalMergedDirects,
    pendingApprovals.value,
    selectedDirectAddress,
    selectedQortalDirectAddress,
    selectedChat?.network,
    selectedGroupMembers,
    showGroupMembers,
    unreadDirectAddresses,
    unreadQortalDirectAddresses,
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
      if (targets.has(key) || counts[target.network] >= 24) return;
      targets.set(key, target);
      counts[target.network] += 1;
    };

    if (selectedGroup && selectedChat) {
      add({ group: selectedGroup, network: selectedChat.network ?? 'qortium' });
    }
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
  const selectedGroupAvatar = selectedGroup && selectedChat
    ? groupAvatarProfiles.get(getGroupAvatarProfileKey(selectedChat.network ?? 'qortium', selectedGroup.groupId))
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
  // P3 safety routing: a closed group's send must go through this exact
  // action (never the generic SEND_CHAT_MESSAGE canSendGroupChat above
  // checks) — see chatDispatch.ts and canPostInSelectedGroup/
  // canPostInSelectedQortalGroup below, which gate the composer on this
  // instead of canSendGroupChat whenever the selected group is closed.
  const canSendPrivateGroupChat = hasAction(actions, 'SEND_PRIVATE_GROUP_CHAT_MESSAGE');
  const canReadPrivateDirectChat = hasAction(actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES');
  const canLoadPrivateDirectChats = hasAction(actions, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS');
  const canRequestUnlock = hasAction(actions, 'UNLOCK_SELECTED_ACCOUNT');
  const canSendDirectChat = hasAction(actions, 'SEND_DIRECT_CHAT_MESSAGE');
  const isAccountUnlocked = account?.isUnlocked === true;
  const canUseSelectedAccount =
    !!account && !accountRefreshPending && (isAccountUnlocked || canRequestUnlock);
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
  // P3 item 5: Qortal closed groups are no longer read-unsupported — Home 2
  // can advertise SEARCH_PRIVATE_GROUP_CHAT_MESSAGES on qortalRequest the
  // same way it does on qdnRequest (review/schemas-private-group-actions.md),
  // so this branches on network rather than always reading off the Qortium-
  // only canReadPrivateGroupChat/isConfirmedJoinedGroup pair.
  const canReadQortalPrivateGroupChat = hasAction(qortalBridge.value.actions, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES');
  // Moved above the Qortal composer-gating block below (which now needs
  // isConfirmedJoinedQortalGroup earlier, for shouldDecryptSelectedGroupMessages).
  const isSelectedQortalGroup = selectedChat?.kind === 'group' && selectedChat.network === 'qortal';
  const isConfirmedJoinedQortalGroup =
    isSelectedQortalGroup &&
    qortalMemberGroups.phase === 'ready' &&
    qortalMemberGroups.value.some((candidate) => candidate.groupId === selectedGroupId);
  // P3 item 2: the current GET_PRIVATE_GROUP_CHAT_STATE snapshot for the
  // selected closed group (fetched by the effect further down this
  // component). `selectedPrivateGroupChatStateAsync` degrades to `undefined`
  // for anything other than a currently-selected closed group so a stale map
  // entry from a previously-selected group never leaks into gating for the
  // newly-selected one.
  const selectedPrivateGroupChatStateKey =
    selectedChat?.kind === 'group' && selectedChat.group.isOpen === false
      ? getPrivateGroupChatStateKey(selectedChat.network ?? 'qortium', selectedChat.group.groupId)
      : null;
  const selectedPrivateGroupChatStateAsync = selectedPrivateGroupChatStateKey
    ? privateGroupChatStateByKey.get(selectedPrivateGroupChatStateKey)
    : undefined;
  const selectedPrivateGroupChatState = selectedPrivateGroupChatStateAsync?.value ?? null;
  // No separate `selectedQortiumPrivateGroupChatState` narrowing is kept here
  // (unlike the Qortal one below): the one Qortium consumer,
  // getPrivateGroupComposerMaxPlaintextBytes, takes the union type directly
  // and narrows internally (isQortiumPrivateGroupChatState). Member counts
  // are deliberately NOT sourced from this state either (see P3 report): the
  // private-layer memberCount (key-bundle recipients) and the existing
  // group-membership roster count (selectedGroupMembers.length, real chain
  // membership) answer different questions, and conflating them risks a
  // misleading UI when they diverge (e.g. a joined member not yet keyed in).
  const selectedQortalPrivateGroupChatState =
    selectedPrivateGroupChatState && isQortalPrivateGroupChatState(selectedPrivateGroupChatState)
      ? selectedPrivateGroupChatState
      : null;
  const shouldDecryptSelectedGroupMessages =
    selectedChat?.kind === 'group' &&
    (selectedChat.network === 'qortal'
      ? shouldDecryptGroupMessages(selectedChat.group, {
          canReadPrivateGroupChat: canReadQortalPrivateGroupChat,
          isAccountUnlocked,
          isGroupMembershipConfirmed: qortalMemberGroups.phase === 'ready',
          isJoinedGroup: isConfirmedJoinedQortalGroup,
        })
      : shouldDecryptGroupMessages(selectedChat.group, {
          canReadPrivateGroupChat,
          isAccountUnlocked,
          isGroupMembershipConfirmed: isSelectedGroupMembershipConfirmed,
          isJoinedGroup: isConfirmedJoinedGroup,
        }));
  const selectedClosedGroupReadKey =
    selectedChat?.kind === 'group' && selectedChat.group.isOpen === false
      ? selectedChat.network === 'qortal'
        ? `qortal:${qortalMemberGroups.phase}:${isConfirmedJoinedQortalGroup ? 'joined' : 'not-joined'}`
        : `${memberGroups.phase}:${isConfirmedJoinedGroup ? 'joined' : 'not-joined'}`
      : '';
  // P3 item 3: a closed group additionally requires the exact private-send
  // action — canSendGroupChat (generic) is irrelevant for a closed group,
  // since dispatchChatSendEntry never routes a closed-group target through
  // it (chatDispatch.ts).
  const canPostInSelectedGroup =
    selectedChat?.kind === 'group' &&
    (isSelectedGeneralChat ||
      (selectedChat.group.isOpen === false
        ? isConfirmedJoinedGroup && canSendPrivateGroupChat
        : isConfirmedJoinedGroup));
  const hasPendingJoinRequest = selectedGroupId !== null && pendingJoinGroupIds.has(selectedGroupId);
  const hasPendingJoinTransaction = selectedGroupId !== null && pendingTrackedJoinGroupIds.has(selectedGroupId);
  const hasPendingLeaveTransaction = selectedGroupId !== null && pendingTrackedLeaveGroupIds.has(selectedGroupId);
  // network !== 'qortal': this is the Qortium-only derivation (mirrored, not
  // merged, by isJoinableQortalGroup below) — isSelectedGroupMembershipConfirmed's
  // !isRegularSelectedGroup shortcut is itself Qortium-scoped, so without this
  // guard a Qortal group could read as "joinable" here and a Join click would
  // fire a Qortium JOIN_GROUP request against a Qortal groupId. Home 2 does
  // advertise JOIN_GROUP/LEAVE_GROUP on the Qortal bridge now — that path is
  // handled separately, never by relaxing this guard.
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
  // sender has not joined on Qortal too, so this gates the composer; the join
  // affordance itself is derived separately below (isJoinableQortalGroup /
  // canSubmitQortalJoin) now that Home 2 advertises JOIN_GROUP/LEAVE_GROUP on
  // the Qortal bridge too.
  const canSendQortalGroupChat = hasAction(qortalBridge.value.actions, 'SEND_CHAT_MESSAGE');
  // P3 safety routing counterpart of canSendPrivateGroupChat above.
  const canSendQortalPrivateGroupChat = hasAction(qortalBridge.value.actions, 'SEND_PRIVATE_GROUP_CHAT_MESSAGE');
  // P3 item 3: for a closed Qortal group, membership is confirmed off the
  // private-layer GET_PRIVATE_GROUP_CHAT_STATE `isMember` signal rather than
  // isConfirmedJoinedQortalGroup (general on-chain group membership) — the
  // two can diverge (a just-joined member may not yet be in the encrypted
  // key-ring bundle). selectedQortalPrivateGroupChatState is derived below,
  // after the private-group state store.
  const canPostInSelectedQortalGroup =
    isSelectedQortalGroup &&
    isConfirmedJoinedQortalGroup &&
    (selectedChat.group.isOpen === true
      ? true
      : canSendQortalPrivateGroupChat && selectedQortalPrivateGroupChatState?.isMember === true);
  // Qortal has no UNLOCK_SELECTED_ACCOUNT shortcut of its own — a pure-Qortal
  // send depends on the shared Home wallet already being unlocked via
  // Qortium's canUseSelectedAccount gate (see handleSendMessage's reuse of
  // ensureSelectedAccountUnlocked), plus having actually resolved a Qortal
  // identity to send as.
  const canUseQortalAccount = canUseSelectedAccount && !!qortalAccount;
  // Qortal direct-chat gates, mirroring canReadPrivateDirectChat/
  // canLoadPrivateDirectChats/canSendDirectChat/canOpenDirectChat above
  // against qortalBridge.value.actions instead of the Qortium `actions` list.
  // Qortal Hub advertises none of the SEND_DIRECT_CHAT_*/GET_PRIVATE_DIRECT_*
  // family, so these come out false there with no special-casing — the same
  // gating-alone mechanism that already hides Qortal DM on Hub for groups.
  const canReadQortalPrivateDirectChat = hasAction(qortalBridge.value.actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES');
  const canLoadQortalPrivateDirectChats = hasAction(qortalBridge.value.actions, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS');
  const canSendQortalDirectChat = hasAction(qortalBridge.value.actions, 'SEND_DIRECT_CHAT_MESSAGE');
  const canOpenQortalDirectChat =
    canUseQortalAccount && (canReadQortalPrivateDirectChat || canSendQortalDirectChat);
  // Mirrors isJoinableGroup/canSubmitJoin/canSubmitLeave above against the
  // Qortal bridge/membership rather than merging into them — a Qortium
  // membership must never make a Qortal group read as joined (or vice
  // versa), which isConfirmedJoinedQortalGroup (qortalMemberGroups, already
  // network-scoped) and the pendingTrackedQortal*GroupIds memos both keep
  // separate from the Qortium equivalents above.
  const canJoinQortalGroup = hasAction(qortalBridge.value.actions, 'JOIN_GROUP');
  const canLeaveQortalGroup = hasAction(qortalBridge.value.actions, 'LEAVE_GROUP');
  // D6: mirrors canApproveGroupJoinRequests above for the Qortal bridge — the
  // join-request approval (GROUP_INVITE wire) admin surface, not the
  // Qortium-only GROUP_APPROVAL chain-governance vote machinery.
  const canReadQortalAccountJoinRequests = hasAction(qortalBridge.value.actions, 'GET_ACCOUNT_GROUP_JOIN_REQUESTS');
  const canReadQortalAdminJoinRequests = hasAction(qortalBridge.value.actions, 'GET_ADMIN_GROUP_JOIN_REQUESTS');
  const canApproveQortalGroupJoinRequests = hasAction(qortalBridge.value.actions, 'APPROVE_GROUP_JOIN_REQUEST');
  const hasPendingQortalJoinTransaction =
    selectedGroupId !== null && pendingTrackedQortalJoinGroupIds.has(selectedGroupId);
  const hasPendingQortalLeaveTransaction =
    selectedGroupId !== null && pendingTrackedQortalLeaveGroupIds.has(selectedGroupId);
  // D6: server-side truth that a join request is already pending for the
  // selected Qortal group (mirrors hasPendingJoinRequest/pendingJoinGroupIds
  // above) — distinct from hasPendingQortalJoinTransaction, which is only the
  // locally tracked in-flight JOIN_GROUP tx.
  const qortalPendingJoinGroupIds = useMemo(
    () => new Set(qortalAccountJoinRequests.value.map((request) => request.groupId)),
    [qortalAccountJoinRequests.value],
  );
  const hasPendingQortalJoinRequest = selectedGroupId !== null && qortalPendingJoinGroupIds.has(selectedGroupId);
  const isJoinableQortalGroup =
    isSelectedQortalGroup &&
    selectedGroupId !== null &&
    selectedGroupId > 0 &&
    qortalMemberGroups.phase === 'ready' &&
    !isConfirmedJoinedQortalGroup &&
    !hasPendingQortalJoinTransaction &&
    !hasPendingQortalJoinRequest;
  const canSubmitQortalJoin =
    canUseQortalAccount && !!selectedGroup && canJoinQortalGroup && isJoinableQortalGroup && !joinPending;
  const canSubmitQortalLeave =
    canUseQortalAccount &&
    !!selectedGroup &&
    isSelectedQortalGroup &&
    selectedGroupId !== null &&
    selectedGroupId > 0 &&
    canLeaveQortalGroup &&
    isConfirmedJoinedQortalGroup &&
    !leavePending &&
    !hasPendingQortalLeaveTransaction;
  // Sends are attempted unconditionally now (no isPublicNodeSendUnsupported
  // pre-check): a route that rejects the broadcast surfaces through the
  // structured error mapping (ROUTE_UNAVAILABLE / NODE_CAPABILITY_MISSING —
  // see getBridgeErrorMessage) instead of a client-side guess about which
  // node the bridge happens to be using.
  const canComposeMessage =
    !!selectedChat &&
    (selectedChat.network === 'qortal'
      ? selectedChat.kind === 'group'
        ? canUseQortalAccount &&
          (selectedChat.group.isOpen === false ? canSendQortalPrivateGroupChat : canSendQortalGroupChat) &&
          canPostInSelectedQortalGroup
        : canUseQortalAccount && canSendQortalDirectChat
      : canUseSelectedAccount &&
        (selectedChat.kind === 'group'
          ? (selectedChat.group.isOpen === false ? canSendPrivateGroupChat : canSendGroupChat) &&
            canPostInSelectedGroup
          : canSendDirectChat));
  // P3 item 2a: the composer's visible cap for a closed group reflects the
  // per-chain plaintext byte cap — Qortal's fixed 2225, or Qortium's
  // maxMessagePlaintextBytes once GET_PRIVATE_GROUP_CHAT_STATE has loaded
  // (undefined until then: never block the composer on that fetch, and
  // canSubmitMessage below imposes no client-side cap either — Home/Core
  // still enforce it authoritatively).
  const selectedGroupPrivatePlaintextMaxBytes =
    selectedChat?.kind === 'group' && selectedChat.group.isOpen === false
      ? getPrivateGroupComposerMaxPlaintextBytes(selectedChat.network ?? 'qortium', selectedPrivateGroupChatState)
      : undefined;
  const draftByteLength =
    typeof selectedGroupPrivatePlaintextMaxBytes === 'number' ? getUtf8ByteLength(draft) : 0;
  const canSubmitMessage =
    canComposeMessage &&
    (draft.trim().length > 0 || stagedAttachment?.phase === 'ready') &&
    !sendPending &&
    (typeof selectedGroupPrivatePlaintextMaxBytes !== 'number' || draftByteLength <= selectedGroupPrivatePlaintextMaxBytes);
  // Direct edit/delete/react have no generic-envelope fallback (item B's
  // sendDirectChatEdit/Delete/Reaction throw when unadvertised — a fallback
  // would create a new unrelated message instead of a revision), so the
  // affordance itself must require the full exact-action family rather than
  // any one of them individually.
  const canReviseDirectChat =
    hasAction(actions, 'SEND_DIRECT_CHAT_EDIT') &&
    hasAction(actions, 'SEND_DIRECT_CHAT_DELETE') &&
    hasAction(actions, 'SEND_DIRECT_CHAT_REACTION');
  // Qortal counterpart of canReviseDirectChat, same full-family requirement.
  const canReviseQortalDirectChat =
    hasAction(qortalBridge.value.actions, 'SEND_DIRECT_CHAT_EDIT') &&
    hasAction(qortalBridge.value.actions, 'SEND_DIRECT_CHAT_DELETE') &&
    hasAction(qortalBridge.value.actions, 'SEND_DIRECT_CHAT_REACTION');
  // P4b: attachments now publish via a Home-issued source token on BOTH
  // networks (review/schemas-publish-attachments.md §§ 1-3) — open groups
  // get a public PUBLISH_QDN_RESOURCE link exactly as before; closed groups
  // and direct chats get an encrypted PUBLISH_CHAT_ATTACHMENT descriptor
  // (docs/CHAT_ATTACHMENTS.md). Edits keep the original message's media, so
  // no attaching mid-edit either way.
  const selectedChatAttachNetwork: ChatNetwork = selectedChat?.network === 'qortal' ? 'qortal' : 'qortium';
  const selectedChatAttachActions = selectedChatAttachNetwork === 'qortal' ? qortalBridge.value.actions : actions;
  const selectedChatAttachAccountName =
    selectedChatAttachNetwork === 'qortal'
      ? normalizeRegisteredName(qortalAccount?.name)
      : normalizeRegisteredName(account?.name);
  const isSelectedChatOpenGroup = selectedChat?.kind === 'group' && selectedChat.group.isOpen !== false;
  const isSelectedChatPrivate =
    selectedChat?.kind === 'direct' || (selectedChat?.kind === 'group' && selectedChat.group.isOpen === false);
  const canAttachPublicResource =
    isSelectedChatOpenGroup &&
    !!selectedChatAttachAccountName &&
    hasAction(selectedChatAttachActions, 'PUBLISH_QDN_RESOURCE') &&
    hasAction(selectedChatAttachActions, 'SELECT_QDN_PUBLISH_SOURCE');
  const canAttachPrivateResource =
    isSelectedChatPrivate &&
    hasAction(selectedChatAttachActions, 'PUBLISH_CHAT_ATTACHMENT') &&
    hasAction(selectedChatAttachActions, 'SELECT_QDN_PUBLISH_SOURCE');
  const canAttach =
    canComposeMessage &&
    composeContext?.kind !== 'edit' &&
    (canAttachPublicResource || canAttachPrivateResource);
  // P3 item 3: for a closed group, the notice must still show when the
  // private family is entirely unadvertised (canSendGroupChat, the generic
  // action, is irrelevant there) — only an OPEN group's notice still gates on
  // canSendGroupChat.
  const showGroupComposerNotice =
    canUseSelectedAccount &&
    isRegularSelectedGroup &&
    !canPostInSelectedGroup &&
    (selectedGroup?.isOpen === false || canSendGroupChat);
  const groupComposerNotice =
    isRegularSelectedGroup && selectedGroup?.isOpen === false && !canSendPrivateGroupChat
      ? t('action.closedGroupSendUnsupported')
      : memberGroups.phase === 'error'
        ? t('hint.groupMembershipUnavailable')
        : !isSelectedGroupMembershipConfirmed
          ? t('hint.groupMembershipChecking')
          : t('hint.groupJoinToPost');
  // renderJoinGroupButton() renders a join affordance alongside this notice
  // when Home 2 advertises JOIN_GROUP on the Qortal bridge (see its call site).
  const showQortalGroupComposerNotice =
    canUseQortalAccount &&
    isSelectedQortalGroup &&
    !canPostInSelectedQortalGroup &&
    (selectedChat.group.isOpen === true ? canSendQortalGroupChat : true);
  // P3 item 5: a closed Qortal group is no longer unconditionally
  // unsupported — distinguish "private family unavailable" (a real gap),
  // "not yet joined" (general membership), and "not yet a confirmed private
  // member" (state.isMember false even though the general join succeeded).
  const qortalGroupComposerNotice =
    isSelectedQortalGroup && selectedChat.group.isOpen !== true
      ? !canSendQortalPrivateGroupChat
        ? t('action.closedGroupSendUnsupported')
        : qortalMemberGroups.phase === 'error'
          ? t('hint.groupMembershipUnavailable')
          : qortalMemberGroups.phase !== 'ready'
            ? t('hint.groupMembershipChecking')
            : !isConfirmedJoinedQortalGroup
              ? t('hint.groupJoinToPost')
              : t('hint.privateGroupNotMember')
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
  // Qortal counterparts of the direct-chat notice labels above, reusing the
  // same network-neutral wording ("Open in Qortium Home to...") — text stays
  // shared, only the gating (qortalAccount, qortalBridge) is chain-specific.
  const qortalDirectAccessUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : !qortalAccount
      ? qortalAccountError || accountRequiredLabel
    : qortalBridge.value.isHomeBridge
      ? t('action.directReadOnly')
      : t('action.privateChatUnavailable');
  const qortalDirectReadUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : !qortalAccount
      ? qortalAccountError || accountRequiredLabel
    : qortalBridge.value.isHomeBridge
      ? t('action.directReadOnly')
      : t('action.directReadUnavailableBrowser');
  const qortalDirectSendUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
    : !qortalAccount
      ? qortalAccountError || accountRequiredLabel
    : qortalBridge.value.isHomeBridge
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
  // Item D: journal entries (chat-send targets only) attributed to the
  // selected conversation, keyed the same way selectedChatKey is built (see
  // getJournalConversationKey). A conversation with at least one entry here
  // shows the reused ambiguous-send notice below — Home already blocks a
  // same-target retry until this reconciles, so the notice matters most
  // right when the composer's own optimistic state has nothing to show
  // (e.g. right after a restart, before this app ever sent the message
  // itself).
  const selectedChatJournalEntries = selectedChat
    ? filterChatJournalEntries(
        selectedChat.network === 'qortal' ? qortalJournalEntries : journalEntries,
      ).filter((entry) => getJournalConversationKey(selectedChat.network ?? 'qortium', entry) === selectedChatKey)
    : [];
  const hasSelectedChatJournalNotice = selectedChatJournalEntries.length > 0;
  const selectedDirectHistoryUnavailable =
    selectedChat?.kind === 'direct' &&
    (selectedChat.network === 'qortal'
      ? !isAccountUnlocked || !canReadQortalPrivateDirectChat
      : !isAccountUnlocked || !canReadPrivateDirectChat);
  const selectedClosedGroupHistoryUnavailable =
    selectedChat?.kind === 'group' && selectedChat.group.isOpen === false && !shouldDecryptSelectedGroupMessages;
  // P3 item 5: network-routed — a closed Qortal group now has its own read
  // path (canReadQortalPrivateGroupChat/qortalMemberGroups/
  // isConfirmedJoinedQortalGroup), no longer the blanket "unsupported"
  // message every closed Qortal group showed before P3.
  const closedGroupHistoryUnavailableLabel = !account
    ? accountRequiredLabel
    : !isAccountUnlocked
      ? accountLockedLabel
      : selectedChat?.network === 'qortal'
        ? !canReadQortalPrivateGroupChat
          ? t('action.closedGroupHistoryUnsupported')
          : qortalMemberGroups.phase === 'error'
            ? t('hint.groupMembershipUnavailable')
            : qortalMemberGroups.phase !== 'ready'
              ? t('hint.groupMembershipChecking')
              : !isConfirmedJoinedQortalGroup
                ? t('hint.groupJoinToRead')
                : t('hint.privateGroupNotMember')
        : !canReadPrivateGroupChat
          ? t('action.closedGroupHistoryUnsupported')
          : memberGroups.phase === 'error'
            ? t('hint.groupMembershipUnavailable')
          : !isSelectedGroupMembershipConfirmed
            ? t('hint.groupMembershipChecking')
            : t('hint.groupJoinToRead');
  // P3 item 2c: Qortal rotationRequired notice, reusing the same
  // conversation-notice slot pattern as selectedClosedGroupHistoryUnavailable
  // above (a <p className="muted"> line in the notices stack).
  const selectedQortalPrivateGroupRotationNotice =
    selectedChat?.kind === 'group' &&
    selectedChat.network === 'qortal' &&
    selectedChat.group.isOpen === false &&
    selectedQortalPrivateGroupChatState?.rotationRequired === true;
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
        : isSelectedQortalGroup &&
            selectedGroupId !== null &&
            selectedGroupId > 0 &&
            qortalMemberGroups.phase === 'ready' &&
            !isConfirmedJoinedQortalGroup &&
            canJoinQortalGroup &&
            !canSubmitQortalJoin
          ? hasPendingQortalJoinTransaction
            ? t('button.join.transaction.pending')
            : hasPendingQortalJoinRequest
              ? t('button.join.request.pending')
              : groupJoinUnavailableLabel
          : isSelectedQortalGroup &&
              selectedGroupId !== null &&
              selectedGroupId > 0 &&
              isConfirmedJoinedQortalGroup &&
              canLeaveQortalGroup &&
              !canSubmitQortalLeave
            ? hasPendingQortalLeaveTransaction
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
      // Mirrors loadActiveChats' GET_PRIVATE_DIRECT_ACTIVE_CHATS override above:
      // prefer the decrypted private-direct list when Home advertises it, else
      // fall back to whatever GET_ACTIVE_CHATS already returned for `direct`.
      const direct = isAccountUnlocked && hasAction(actionList, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS')
        ? await getPrivateDirectActiveChats(actionList, 'qortal')
        : nextActiveChats.direct;
      // P3 item 6: fold decrypted closed-group activity into the same
      // `groups` array GET_ACTIVE_CHATS returns — groupActivityById and
      // qortalGroupPreviewByGroupId both already read straight off this
      // array, so this is the only wiring a closed group's unread/preview
      // needs (see privateGroupActiveChats.ts's module doc).
      const privateGroupEntries = isAccountUnlocked && hasAction(actionList, 'GET_PRIVATE_GROUP_ACTIVE_CHATS')
        ? await getPrivateGroupActiveChats('qortal', actionList)
        : [];
      const groups = mergePrivateGroupActiveChats(nextActiveChats.groups ?? [], privateGroupEntries);

      if (qortalActiveChatsRequestGuardRef.current.isLatest(requestId)) {
        setQortalActiveChats({ phase: 'ready', value: { ...nextActiveChats, direct, groups } });
        persistDirects('qortal', address, direct ?? []);
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

  // A lightweight, targeted refresh of just the Qortal account's group
  // membership — used after a Qortal join/leave, mirroring how the Qortium
  // handlers call loadAccountData. Deliberately narrower than
  // refreshQortalSelectedAccount (which resets the whole Qortal session:
  // account, groups, active chats, discoveries) — a join/leave click must not
  // flash the entire Qortal-network UI back to a loading state.
  async function loadQortalMemberGroups(
    address: string,
    actionList = qortalBridge.value.actions,
    options: { isCurrent?: () => boolean } = {},
  ) {
    const isCurrent = options.isCurrent ?? (() => true);

    setQortalMemberGroups((current) => ({ phase: 'loading', value: current.value }));

    try {
      const nextMemberGroups = await getMemberGroups('qortal', address, actionList);

      if (!isCurrent()) {
        return;
      }

      setQortalMemberGroups({ phase: 'ready', value: nextMemberGroups });
    } catch (error) {
      if (!isCurrent()) {
        return;
      }

      setQortalMemberGroups((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.joinedGroups'), t),
        phase: 'error',
        value: current.value,
      }));
    }
  }

  function clearQortalAccountSessionState(nextAccountAddress: string | null) {
    updatePendingSends((current) =>
      retainPendingForNetworkAccount(current, 'qortal', nextAccountAddress),
    );
    updatePendingRevisions((current) =>
      retainPendingForNetworkAccount(current, 'qortal', nextAccountAddress),
    );
    updateReactionPendingOperations((current) => {
      const next = new Set([...current].filter((key) => !key.startsWith('qortal:')));

      return next.size === current.size ? current : next;
    });
    const currentQortiumAddress = currentAccountAddressRef.current;
    const legacyMigrationHint = getLegacyQortiumMigrationHint(
      currentQortiumAddress,
      accountRefreshPendingRef.current,
    );
    const restoredQortalUi = nextAccountAddress
      ? initializeQortalUiStorage(nextAccountAddress, {
          ...legacyMigrationHint,
        })
      : null;
    const restoredQortalWatermarks = restoredQortalUi?.watermarks ?? new Map<number, number>();

    qortalUiMigrationPendingAddressRef.current = restoredQortalUi?.legacyMigrationPending
      ? nextAccountAddress
      : null;
    qortalUiPersistenceBlockedAddressRef.current =
      restoredQortalUi?.legacyMigrationPending && accountRefreshPendingRef.current
        ? nextAccountAddress
        : null;

    skipQortalWatermarkPersistRef.current = true;
    lastReadByQortalGroupIdRef.current = restoredQortalWatermarks;
    setLastReadByQortalGroupId(restoredQortalWatermarks);
    setQortalGroupActivityById(new Map());

    // D6: the previous Qortal account's join-request state (its own pending
    // requests, and any it administers) must never survive an identity
    // switch — refreshQortalSelectedAccount re-fetches for the new address
    // right after this call returns (loadQortalJoinRequestState), but this
    // reset makes the switch synchronous so a stale request can never render
    // under the new identity even for the one tick before that fetch lands.
    setQortalAccountJoinRequests({ phase: 'loading', value: emptyJoinRequests });
    setQortalAdminJoinRequests({ phase: 'loading', value: emptyAdminJoinRequests });

    // Qortal direct watermarks have no legacy migration to coordinate with
    // (see the persist effect's comment), so this is a plain per-account read.
    const restoredQortalDirectWatermarks = nextAccountAddress
      ? readQortalDirectReadWatermarks(nextAccountAddress)
      : new Map<string, number>();

    skipQortalDirectWatermarkPersistRef.current = true;
    lastReadByQortalAddressRef.current = restoredQortalDirectWatermarks;
    setLastReadByQortalAddress(restoredQortalDirectWatermarks);
    setQortalLoadedDirectActivityByAddress(new Map());

    // Item D / P6b: the Qortal pending-transaction journal is account-scoped
    // (see journalRequestGuardRef's declaration) — drop the previous
    // account's snapshot and invalidate any fetch still in flight for it so
    // a late response cannot land under the new account.
    qortalJournalRequestGuardRef.current.begin();
    setQortalJournalEntries(emptyJournalEntries);

    // P6b target 3: GET_PRIVATE_GROUP_CHAT_STATE snapshots (isMember, keys,
    // rotationRequired) are account-relative. Drop every Qortal-network entry
    // so a stale membership/key snapshot from the previous account can never
    // render — even transiently while the fetch effect's own request guard
    // reloads the currently-selected group's state — under the new one.
    setPrivateGroupChatStateByKey((current) => clearNetworkKeyedEntries(current, 'qortal'));

    for (const key of draftsByChatKeyRef.current.keys()) {
      if (key.startsWith('qortal:')) {
        draftsByChatKeyRef.current.delete(key);
      }
    }

    for (const key of chatViewCacheRef.current.keys()) {
      if (key.startsWith('qortal:')) {
        chatViewCacheRef.current.delete(key);
      }
    }

    flushScrollBookmarks();
    for (const key of scrollPositionsRef.current.keys()) {
      if (key.startsWith('qortal:')) {
        scrollPositionsRef.current.delete(key);
      }
    }
    if (restoredQortalUi) {
      for (const [key, position] of restoredQortalUi.scrollBookmarks) {
        scrollPositionsRef.current.set(key, position);
      }
    }

    if (messagesChatKeyRef.current.startsWith('qortal:')) {
      messagesChatKeyRef.current = '';
      setMessagesChatKey('');
      setMessages({ phase: 'ready', value: emptyMessages });
      setOlderMessages(emptyMessages);
      setOlderMessagesState({ error: '', loading: false, reachedStart: true });
      loadingOlderRef.current = false;
    }

    if (selectedChatKeyRef.current.startsWith('qortal:')) {
      draftChatKeyRef.current = selectedChatKeyRef.current;
      setDraft('');
      setComposeContext(null);
      // P6b target 2: a staged attachment's Home-issued source token is
      // bound to the account that requested it — the Qortium counterpart of
      // this reset (below, keyed on account?.address) already drops the
      // stage the same way; this mirrors it for a Qortal identity change so
      // a stale token cannot survive to fail confusingly at publish time.
      setStagedAttachment(null);
      setAttachmentError('');
      setLiveAnnouncement('');
      lastAnnouncedRef.current = { chatKey: '', signature: '' };
      setUnreadDividerTimestamp(null);
      setUnreadDividerCeiling(null);
      setWriteError('');
      userSelectedChatRef.current = false;
    }

    if (loadedChatKeyRef.current.startsWith('qortal:')) {
      loadedChatKeyRef.current = '';
    }
  }

  function completeDeferredQortalUiStorage(legacyQortiumAccountAddress: string | null) {
    const qortalAccountAddress = qortalUiMigrationPendingAddressRef.current;

    if (!qortalAccountAddress || currentQortalAccountAddressRef.current !== qortalAccountAddress) {
      return;
    }

    const currentQortalScrollBookmarks = new Map(
      [...scrollPositionsRef.current].filter(([chatKey]) => chatKey.startsWith('qortal:')),
    );
    const restored = initializeQortalUiStorage(qortalAccountAddress, {
      currentScrollBookmarks: currentQortalScrollBookmarks,
      currentWatermarks: lastReadByQortalGroupIdRef.current,
      legacyLookupComplete: true,
      legacyQortiumAccountAddress,
    });

    if (restored.legacyMigrationPending) {
      return;
    }

    qortalUiMigrationPendingAddressRef.current = null;
    qortalUiPersistenceBlockedAddressRef.current = null;
    skipQortalWatermarkPersistRef.current = true;
    lastReadByQortalGroupIdRef.current = restored.watermarks;
    setLastReadByQortalGroupId(restored.watermarks);

    for (const chatKey of scrollPositionsRef.current.keys()) {
      if (chatKey.startsWith('qortal:')) {
        scrollPositionsRef.current.delete(chatKey);
      }
    }
    for (const [chatKey, position] of restored.scrollBookmarks) {
      scrollPositionsRef.current.set(chatKey, position);
    }
  }

  function releaseDeferredQortalUiPersistence() {
    const qortalAccountAddress = qortalUiPersistenceBlockedAddressRef.current;

    if (!qortalAccountAddress || currentQortalAccountAddressRef.current !== qortalAccountAddress) {
      return;
    }

    qortalUiPersistenceBlockedAddressRef.current = null;
    writeQortalReadWatermarks(qortalAccountAddress, lastReadByQortalGroupIdRef.current);
    writeQortalScrollBookmarks(qortalAccountAddress, scrollPositionsRef.current);
  }

  async function refreshQortalSelectedAccount(actionList = qortalBridge.value.actions) {
    const requestId = qortalAccountRefreshGuardRef.current.begin();
    const previousAccountAddress = qortalAccountRefreshPendingRef.current
      ? refreshingQortalAccountAddressRef.current
      : currentQortalAccountAddressRef.current;

    qortalAccountRefreshPendingRef.current = true;
    refreshingQortalAccountAddressRef.current = previousAccountAddress;
    qortalActiveChatsRequestGuardRef.current.begin();
    currentQortalAccountAddressRef.current = null;

    // A selected-account event means the old chain identity is no longer safe
    // to use. Clear it synchronously so the composer cannot send with the old
    // sender while Home resolves the new Qortal wallet account.
    setQortalAccount(null);
    setQortalAccountError('');
    setQortalMemberGroups({ phase: 'loading', value: emptyGroups });
    setQortalGroups({ phase: 'loading', value: emptyGroups });
    setQortalActiveChats({ phase: 'loading', value: emptyActiveChats });
    setQortalAccountJoinRequests({ phase: 'loading', value: emptyJoinRequests });
    setQortalAdminJoinRequests({ phase: 'loading', value: emptyAdminJoinRequests });
    qortalGroupDiscoveryRequestRef.current += 1;
    setQortalGroupDiscoveries(createState([]));

    // D6: fetch the connected Qortal account's own pending join requests and,
    // for groups it administers, the requests waiting on it — gated on the
    // qortal bridge advertising each action (same "advertisement + account
    // present" rule as every other new D6 fetch). Neither action changes
    // membership, so both can be requested from every snapshot outcome below
    // that resolves an account, independent of whether memberGroups itself
    // succeeded.
    function loadQortalJoinRequestState(address: string) {
      if (hasAction(actionList, 'GET_ACCOUNT_GROUP_JOIN_REQUESTS')) {
        void loadQortalAccountJoinRequests(address, actionList);
      } else {
        setQortalAccountJoinRequests({ phase: 'ready', value: emptyJoinRequests });
      }

      if (hasAction(actionList, 'GET_ADMIN_GROUP_JOIN_REQUESTS')) {
        void loadQortalAdminJoinRequests(address, actionList);
      } else {
        setQortalAdminJoinRequests({ phase: 'ready', value: emptyAdminJoinRequests });
      }
    }

    try {
      const snapshot = await loadQortalAccountSnapshot(actionList);

      if (!qortalAccountRefreshGuardRef.current.isLatest(requestId)) {
        return;
      }

      const nextAccountAddress = snapshot.account.address;

      currentQortalAccountAddressRef.current = nextAccountAddress;
      if (previousAccountAddress !== nextAccountAddress) {
        clearQortalAccountSessionState(nextAccountAddress);
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
        loadQortalJoinRequestState(snapshot.account.address);
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
      loadQortalJoinRequestState(nextAccountAddress);
    } catch (error) {
      if (!qortalAccountRefreshGuardRef.current.isLatest(requestId)) {
        return;
      }

      currentQortalAccountAddressRef.current = null;
      clearQortalAccountSessionState(null);
      setQortalAccount(null);
      setQortalAccountError(getBridgeErrorMessage(error, t('status.loadingError.selectedAccount'), t));
      setQortalMemberGroups({ phase: 'ready', value: emptyGroups });
      setQortalGroups({ phase: 'ready', value: emptyGroups });
      setQortalActiveChats({ phase: 'ready', value: emptyActiveChats });
      setQortalAccountJoinRequests({ phase: 'ready', value: emptyJoinRequests });
      setQortalAdminJoinRequests({ phase: 'ready', value: emptyAdminJoinRequests });
    } finally {
      if (qortalAccountRefreshGuardRef.current.isLatest(requestId)) {
        qortalAccountRefreshPendingRef.current = false;
        refreshingQortalAccountAddressRef.current = null;
      }
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
    options: { isCurrent?: () => boolean; quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setAccountJoinRequests({ phase: 'loading', value: accountJoinRequests.value });
    }

    try {
      const value = await getAccountGroupJoinRequests(selectedAccount.address, actionList);

      if (options.isCurrent && !options.isCurrent()) {
        return;
      }

      setAccountJoinRequests({ phase: 'ready', value });
    } catch (error) {
      // Quiet 30s refreshes keep the last good value on a transient blip;
      // this error renders as a persistent banner over every chat otherwise.
      if (options.quiet || (options.isCurrent && !options.isCurrent())) {
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
    options: { isCurrent?: () => boolean; quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setAdminJoinRequests({ phase: 'loading', value: adminJoinRequests.value });
    }

    try {
      const value = await getAdminGroupJoinRequests(selectedAccount.address, actionList);

      if (options.isCurrent && !options.isCurrent()) {
        return;
      }

      setAdminJoinRequests({ phase: 'ready', value });
    } catch (error) {
      // Quiet 30s refreshes keep the last good value on a transient blip;
      // this error renders as a persistent banner over every chat otherwise.
      if (options.quiet || (options.isCurrent && !options.isCurrent())) {
        return;
      }

      setAdminJoinRequests((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.groupApprovals'), t),
        phase: 'error',
        value: current.value,
      }));
    }
  }

  // D6: mirrors loadAccountJoinRequests for the Qortal bridge/identity — a
  // separate loader (not a merged network-aware one), consistent with
  // loadQortalMemberGroups above and handleJoinQortalGroup below.
  async function loadQortalAccountJoinRequests(
    address: string,
    actionList = qortalBridge.value.actions,
    options: { isCurrent?: () => boolean; quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setQortalAccountJoinRequests({ phase: 'loading', value: qortalAccountJoinRequests.value });
    }

    try {
      const value = await getAccountGroupJoinRequests(address, actionList, 'qortal');

      if (options.isCurrent && !options.isCurrent()) {
        return;
      }

      setQortalAccountJoinRequests({ phase: 'ready', value });
    } catch (error) {
      // Quiet 30s refreshes keep the last good value on a transient blip;
      // this error renders as a persistent banner over every chat otherwise.
      if (options.quiet || (options.isCurrent && !options.isCurrent())) {
        return;
      }

      setQortalAccountJoinRequests((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.joinRequests'), t),
        phase: 'error',
        value: current.value,
      }));
    }
  }

  // Mirrors loadAdminJoinRequests for the Qortal bridge/identity — see
  // loadQortalAccountJoinRequests' comment above.
  async function loadQortalAdminJoinRequests(
    address: string,
    actionList = qortalBridge.value.actions,
    options: { isCurrent?: () => boolean; quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setQortalAdminJoinRequests({ phase: 'loading', value: qortalAdminJoinRequests.value });
    }

    try {
      const value = await getAdminGroupJoinRequests(address, actionList, 'qortal');

      if (options.isCurrent && !options.isCurrent()) {
        return;
      }

      setQortalAdminJoinRequests({ phase: 'ready', value });
    } catch (error) {
      // Quiet 30s refreshes keep the last good value on a transient blip;
      // this error renders as a persistent banner over every chat otherwise.
      if (options.quiet || (options.isCurrent && !options.isCurrent())) {
        return;
      }

      setQortalAdminJoinRequests((current) => ({
        error: getBridgeErrorMessage(error, t('status.loadingError.groupApprovals'), t),
        phase: 'error',
        value: current.value,
      }));
    }
  }

  async function loadGroupInvites(
    selectedAccount: QdnSelectedAccount,
    options: { isCurrent?: () => boolean; quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setGroupInvites({ phase: 'loading', value: groupInvites.value });
    }

    try {
      const value = await getGroupInvites(selectedAccount.address);

      if (options.isCurrent && !options.isCurrent()) {
        return;
      }

      setGroupInvites({ phase: 'ready', value });
    } catch (error) {
      // Quiet 30s refreshes keep the last good value on a transient blip.
      if (options.quiet || (options.isCurrent && !options.isCurrent())) {
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
    options: { isCurrent?: () => boolean; quiet?: boolean } = {},
  ) {
    if (!options.quiet) {
      setMintingStatus({ phase: 'loading', value: mintingStatus.value });
    }

    try {
      const value = await getMintingStatus(selectedAccount.address, actionList);

      if (options.isCurrent && !options.isCurrent()) {
        return;
      }

      setMintingStatus({ phase: 'ready', value });
    } catch (error) {
      // Quiet refreshes keep the last good value on a transient blip.
      if (options.quiet || (options.isCurrent && !options.isCurrent())) {
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
    const requestId = qortiumActiveChatsRequestGuardRef.current.begin();

    if (!options.quiet) {
      setActiveChats({ phase: 'loading', value: activeChats.value });
    }

    try {
      const nextActiveChats = await getActiveChats('qortium', selectedAccount.address, actionList);
      const direct = selectedAccount.isUnlocked && hasAction(actionList, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS')
        ? await getPrivateDirectActiveChats(actionList)
        : nextActiveChats.direct;
      // P3 item 6: same fold as loadQortalActiveChats above.
      const privateGroupEntries = selectedAccount.isUnlocked && hasAction(actionList, 'GET_PRIVATE_GROUP_ACTIVE_CHATS')
        ? await getPrivateGroupActiveChats('qortium', actionList)
        : [];
      const groups = mergePrivateGroupActiveChats(nextActiveChats.groups ?? [], privateGroupEntries);

      if (!qortiumActiveChatsRequestGuardRef.current.isLatest(requestId)) {
        return;
      }

      setActiveChats({ phase: 'ready', value: { ...nextActiveChats, direct, groups } });
      // Keep these directs listed after their messages later expire. Done here
      // (not in an effect) so the write is tied to the account just loaded.
      persistDirects('qortium', selectedAccount.address, direct ?? []);
    } catch (error) {
      if (!options.quiet && qortiumActiveChatsRequestGuardRef.current.isLatest(requestId)) {
        setActiveChats({
          error: getBridgeErrorMessage(error, t('status.loadingError.activeChats'), t),
          phase: 'error',
          value: activeChats.value,
        });
      }
    }
  }

  async function loadAccountData(
    selectedAccount: QdnSelectedAccount,
    actionList = actions,
    options: { isCurrent?: () => boolean } = {},
  ) {
    const generalOnly = withGeneralChatGroup(emptyGroups, '', t);
    const isCurrent = options.isCurrent ?? (() => true);

    setMemberGroups((current) => ({ phase: 'loading', value: current.value }));
    setGroups((current) => ({
      phase: 'loading',
      value: current.value.length > 0 ? current.value : generalOnly,
    }));

    try {
      const nextMemberGroups = await getMemberGroups('qortium', selectedAccount.address, actionList);

      if (!isCurrent()) {
        return;
      }

      setMemberGroups({ phase: 'ready', value: nextMemberGroups });
      setGroups({ phase: 'ready', value: withGeneralChatGroup(nextMemberGroups, '', t) });
    } catch (error) {
      if (!isCurrent()) {
        return;
      }

      const message = getBridgeErrorMessage(error, t('status.loadingError.joinedGroups'), t);

      setMemberGroups((current) => ({
        error: message,
        phase: 'error',
        value: current.value,
      }));
      setGroups((current) => ({ error: message, phase: 'error', value: current.value }));
    }

    await loadActiveChats(selectedAccount, actionList);

    if (!isCurrent()) {
      return;
    }

    void loadAccountJoinRequests(selectedAccount, actionList, { isCurrent });
    void loadAdminJoinRequests(selectedAccount, actionList, { isCurrent });
    void loadGroupInvites(selectedAccount, { isCurrent });
    void loadMintingStatus(selectedAccount, actionList, { isCurrent });
  }

  async function loadMessages(
    chat: SelectedChat | null,
    actionList = actions,
    options: { accountUnlocked?: boolean; quiet?: boolean; skipKeyRecovery?: boolean } = {},
  ) {
    if (!chat) {
      return;
    }

    const sessionAccountAddress = chat.network === 'qortal'
      ? currentQortalAccountAddressRef.current
      : currentAccountAddressRef.current;
    const accountRequired = chatReadRequiresAccount(
      chat.kind === 'direct'
        ? { kind: 'direct' }
        : { groupIsOpen: chat.group.isOpen, kind: 'group' },
    );

    if (accountRequired && !sessionAccountAddress) {
      return;
    }

    // Qortal groups take a small, self-contained path (below), including
    // their own private-group decrypt/key-recovery (P3 item 5 — Qortal can
    // advertise the private-group family too now) and their own activity
    // map, so nothing here needs to change for Qortium.
    if (chat.network === 'qortal' && chat.kind === 'group') {
      return loadQortalGroupMessages(chat, {
        quiet: options.quiet,
        sessionAccountAddress,
        skipKeyRecovery: options.skipKeyRecovery,
      });
    }

    // Qortal direct chats similarly take their own small path (own gates,
    // own activity map, own action list) rather than sharing the Qortium
    // branch below.
    if (chat.network === 'qortal' && chat.kind === 'direct') {
      return loadQortalDirectMessages(chat, {
        quiet: options.quiet,
        sessionAccountAddress,
      });
    }

    const canReadUnlockedMessages = options.accountUnlocked ?? isAccountUnlocked;
    const chatKey = getSelectedChatKey(chat);
    // A load can outlive its chat: the switch effect clears timers/sockets but
    // cannot cancel an in-flight promise, and quiet callers (post-send refresh,
    // key recovery, the websocket REST fallback) capture the chat at call time.
    // Drop any result that resolves after the user has moved on, so one chat's
    // messages are never committed into another chat's pane (mirrors the
    // request guard loadPendingApprovals already uses).
    const isStale = () =>
      isChatReadSessionStale(
        { accountAddress: sessionAccountAddress, chatKey },
        {
          accountAddress: currentAccountAddressRef.current,
          chatKey: selectedChatKeyRef.current,
        },
      );

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

      // A direct transcript and its activity belong to one selected account;
      // never let an old account's late decrypt/search result repopulate state
      // after the account reset effect cleared it. Group activity can be
      // re-learned by its normal stream/sweep after a chat switch.
      if (isStale()) {
        return;
      }

      if (chat.kind === 'group') {
        setLoadedGroupActivityById((current) => mergeActivityTimestamp(current, chat.group.groupId, nextMessages));
      } else {
        setLoadedDirectActivityByAddress((current) => mergeActivityTimestamp(current, chat.direct.address, nextMessages));
      }

      reconcileJournalWithMessages(chat.network ?? 'qortium', nextMessages);

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
        void recoverMissingPrivateGroupKeys('qortium', chat.group, nextMessages, account, actionList, {
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

  // Qortal counterpart of the group-open branch of loadMessages above:
  // Qortal can now advertise the private-group family too (P3 item 5), so
  // this attempts the same decrypt + key-recovery Qortium does — own gates,
  // own activity map, own action list/network passed through to
  // getGroupMessages/recoverMissingPrivateGroupKeys. Shares the same
  // `messages`/`messagesChatKey`/`olderMessagesState` — only one chat
  // (either network) is ever open in the single chat pane at a time.
  async function loadQortalGroupMessages(
    chat: Extract<SelectedChat, { kind: 'group' }>,
    options: { quiet?: boolean; sessionAccountAddress?: string | null; skipKeyRecovery?: boolean } = {},
  ) {
    const chatKey = getSelectedChatKey(chat);
    const sessionAccountAddress = options.sessionAccountAddress === undefined
      ? currentQortalAccountAddressRef.current
      : options.sessionAccountAddress;
    const isStale = () =>
      isChatReadSessionStale(
        { accountAddress: sessionAccountAddress, chatKey },
        {
          accountAddress: currentQortalAccountAddressRef.current,
          chatKey: selectedChatKeyRef.current,
        },
      );

    if ((chat.group.isOpen === false && !sessionAccountAddress) || isStale()) {
      return;
    }

    if (!options.quiet) {
      setMessagesChatKey('');
      setMessages({ phase: 'loading', value: messages.value });
    }

    const qortalActionList = qortalBridge.value.actions;
    const shouldDecryptPrivateGroup =
      chat.group.isOpen === false &&
      shouldDecryptGroupMessages(chat.group, {
        canReadPrivateGroupChat: hasAction(qortalActionList, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES'),
        isAccountUnlocked,
        isGroupMembershipConfirmed: qortalMemberGroups.phase === 'ready',
        isJoinedGroup: qortalMemberGroups.value.some((candidate) => candidate.groupId === chat.group.groupId),
      });

    try {
      if (chat.group.isOpen === false && !shouldDecryptPrivateGroup) {
        // Same gate getGroupMessages applies server-side — fail the same way
        // here so the notice matches a closed group whose host/network does
        // not (yet, or at all) advertise private-group read support.
        throw new Error('Closed group chat reads require Qortium Home private group chat support.');
      }

      const nextMessages = await getGroupMessages('qortal', chat.group, qortalActionList, {
        decryptPrivate: shouldDecryptPrivateGroup,
      });

      if (isStale()) {
        return;
      }

      setQortalGroupActivityById((current) => mergeActivityTimestamp(current, chat.group.groupId, nextMessages));

      reconcileJournalWithMessages('qortal', nextMessages);

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

      if (
        chat.group.isOpen === false &&
        !options.skipKeyRecovery &&
        isAccountUnlocked &&
        shouldDecryptPrivateGroup &&
        qortalAccount
      ) {
        void recoverMissingPrivateGroupKeys(
          'qortal',
          chat.group,
          nextMessages,
          { address: qortalAccount.address, isUnlocked: isAccountUnlocked },
          qortalActionList,
          { quiet: options.quiet },
        );
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

  // Qortal counterpart of the direct-chat branch loadMessages runs for
  // Qortium (below the qortal-group early return above): own gates
  // (canReadQortalPrivateDirectChat's SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES),
  // own activity map (qortalLoadedDirectActivityByAddress), and the Qortal
  // action list/network passed through to getDirectMessages.
  async function loadQortalDirectMessages(
    chat: Extract<SelectedChat, { kind: 'direct' }>,
    options: { quiet?: boolean; sessionAccountAddress?: string | null } = {},
  ) {
    const chatKey = getSelectedChatKey(chat);
    const sessionAccountAddress = options.sessionAccountAddress === undefined
      ? currentQortalAccountAddressRef.current
      : options.sessionAccountAddress;
    const isStale = () =>
      isChatReadSessionStale(
        { accountAddress: sessionAccountAddress, chatKey },
        {
          accountAddress: currentQortalAccountAddressRef.current,
          chatKey: selectedChatKeyRef.current,
        },
      );

    if (!sessionAccountAddress || isStale()) {
      return;
    }

    if (!options.quiet) {
      setMessagesChatKey('');
      setMessages({ phase: 'loading', value: messages.value });
    }

    const qortalActionList = qortalBridge.value.actions;

    try {
      if (!isAccountUnlocked || !hasAction(qortalActionList, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES')) {
        setMessagesChatKey(chatKey);
        setMessages({ phase: 'ready', value: emptyMessages });
        return;
      }

      const nextMessages = await getDirectMessages(chat.direct.address, qortalActionList, {}, 'qortal');

      if (isStale()) {
        return;
      }

      setQortalLoadedDirectActivityByAddress((current) =>
        mergeActivityTimestamp(current, chat.direct.address, nextMessages),
      );

      reconcileJournalWithMessages('qortal', nextMessages);

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
    const sessionAccountAddress = chat.network === 'qortal'
      ? currentQortalAccountAddressRef.current
      : currentAccountAddressRef.current;
    const accountRequired = chatReadRequiresAccount(
      chat.kind === 'direct'
        ? { kind: 'direct' }
        : { groupIsOpen: chat.group.isOpen, kind: 'group' },
    );
    const isStale = () =>
      isChatReadSessionStale(
        { accountAddress: sessionAccountAddress, chatKey },
        {
          accountAddress:
            chat.network === 'qortal'
              ? currentQortalAccountAddressRef.current
              : currentAccountAddressRef.current,
          chatKey: selectedChatKeyRef.current,
        },
      );

    if ((accountRequired && !sessionAccountAddress) || isStale()) {
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
          : await getDirectMessages(
              chat.direct.address,
              chat.network === 'qortal' ? qortalBridge.value.actions : actions,
              { before: olderBefore },
              chat.network ?? 'qortium',
            );

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

  // P3 item 4: network-routed. Qortium semantics are unchanged (broadcast
  // REQUEST, then an automatic RESOLVE relays whatever retained announcements
  // this member is already entitled to — safe for every member's background
  // poll). Qortal's REQUEST is instead a local/resource *recovery attempt*
  // with no transaction (review/schemas-private-group-actions.md § 5) — also
  // safe to run automatically — but Qortal's RESOLVE is administrator BUNDLE
  // PUBLICATION: a signed, staged QDN write that must never fire
  // automatically here (it would either fail loudly for a non-admin, or pop
  // an unwanted signing prompt). Qortal resolve is instead the explicit
  // handleQortalPublishGroupKey admin button below; this function never calls
  // it automatically for network === 'qortal'.
  async function recoverMissingPrivateGroupKeys(
    network: ChatNetwork,
    group: GroupData,
    nextMessages: ChatMessage[],
    selectedAccount: { address: string; isUnlocked: boolean },
    actionList: QdnAction[],
    options: { quiet?: boolean } = {},
  ) {
    const isQortal = network === 'qortal';
    const recoveryContext = {
      accountAddress: selectedAccount.address,
      // Qortal has no wallet-refresh-generation concept of its own (unlike
      // Qortium's accountRefreshGenerationRef) — a constant 0 on both sides
      // of the comparison below makes that one check a no-op for Qortal,
      // while accountRefreshPending/accountAddress still gate on the
      // Qortal-specific refs.
      accountRefreshGeneration: isQortal ? 0 : accountRefreshGenerationRef.current,
      chatKey: getSelectedChatKey({ group, kind: 'group', network }),
      groupId: group.groupId,
    };
    const isCurrentRecovery = () =>
      isPrivateGroupRecoveryContextCurrent(recoveryContext, {
        accountAddress: isQortal ? currentQortalAccountAddressRef.current : currentAccountAddressRef.current,
        accountRefreshGeneration: isQortal ? 0 : accountRefreshGenerationRef.current,
        accountRefreshPending: isQortal ? qortalAccountRefreshPendingRef.current : accountRefreshPendingRef.current,
        joinedGroupIds: isQortal ? qortalJoinedIdsRef.current : joinedIdsRef.current,
        selectedChatKey: selectedChatKeyRef.current,
        selectedGroupId: selectedGroupIdRef.current,
      });

    // Belt-and-suspenders membership gate: key recovery publishes a request as
    // this account, so never fire it for a group the account hasn't joined even
    // if a caller's gate ever regresses. Callers already require membership, but
    // keeping the precondition local to the side-effecting function prevents a
    // future caller from prompting a non-member.
    if (!isCurrentRecovery()) {
      return;
    }

    const missingKeyRequests = getMissingPrivateGroupKeyRequests(nextMessages, group.groupId);

    if (missingKeyRequests.length === 0) {
      if (!isCurrentRecovery()) {
        return;
      }
      setPrivateGroupKeyStatus('');
      setPrivateGroupKeyError('');
      return;
    }

    const canRequestPrivateGroupChatKey = hasAction(actionList, 'REQUEST_PRIVATE_GROUP_CHAT_KEY');
    // Qortal's RESOLVE is admin-only bundle publication — never automatic
    // here (see the function doc above); `canResolvePrivateGroupChatKeyRequests`
    // therefore stays false for Qortal regardless of advertisement, which
    // also keeps shouldResolveKeyRequests (and the automatic resolve call
    // below) Qortium-only.
    const canResolvePrivateGroupChatKeyRequests =
      !isQortal && hasAction(actionList, 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS');
    const newKeyRequests = canRequestPrivateGroupChatKey
      ? missingKeyRequests.filter((request) => {
          const key = getPrivateGroupKeyRecoveryKey(selectedAccount.address, request);

          return !requestedPrivateGroupKeysRef.current.has(key);
        })
      : [];
    const resolveKey = `${network}:${selectedAccount.address}:${group.groupId}`;
    const shouldResolveKeyRequests =
      canResolvePrivateGroupChatKeyRequests &&
      (newKeyRequests.length > 0 || !resolvedPrivateGroupKeyRequestsRef.current.has(resolveKey));

    if (newKeyRequests.length === 0 && !shouldResolveKeyRequests) {
      return;
    }

    if (!isCurrentRecovery()) {
      return;
    }
    if (!options.quiet) {
      setPrivateGroupKeyStatus(t('status.privateGroupKey.requesting'));
    }

    setPrivateGroupKeyError('');

    try {
      // Qortal's REQUEST_PRIVATE_GROUP_CHAT_KEY resolves with
      // {kind:'recovery', recovered}; a `recovered: true` outcome means the
      // key was recovered locally with no admin action required, so the
      // status line and refresh below can report success immediately rather
      // than the generic "requested" wording.
      let recoveredOnQortal = false;

      for (const request of newKeyRequests) {
        if (!isCurrentRecovery()) {
          return;
        }
        requestedPrivateGroupKeysRef.current.add(
          getPrivateGroupKeyRecoveryKey(selectedAccount.address, request),
        );

        const outcome = await requestPrivateGroupChatKey(request, actionList, network);

        if (!isCurrentRecovery()) {
          return;
        }
        if (outcome.kind === 'recovery' && outcome.recovered === true) {
          recoveredOnQortal = true;
        }
      }

      if (shouldResolveKeyRequests) {
        if (!isCurrentRecovery()) {
          return;
        }
        resolvedPrivateGroupKeyRequestsRef.current.add(resolveKey);
        await resolvePrivateGroupChatKeyRequests(group.groupId, actionList, 20, network);
        if (!isCurrentRecovery()) {
          return;
        }
      }

      if (!isCurrentRecovery()) {
        return;
      }
      if (isQortal && recoveredOnQortal) {
        setPrivateGroupKeyStatus(t('status.privateGroupKey.recoveredQortal'));
      } else if (isQortal && newKeyRequests.length > 0) {
        // Recovery was attempted but the key is still missing: hint that an
        // admin must publish it, but only when the per-chat private state
        // (fetched separately — see the state effect above) confirms this
        // account is actually a relevant member; otherwise fall back to the
        // generic "requested" wording rather than asserting a membership
        // fact that has not loaded yet.
        const stateKey = getPrivateGroupChatStateKey(network, group.groupId);
        const state = privateGroupChatStateByKeyRef.current.get(stateKey)?.value ?? null;
        const isRelevantMember = state && isQortalPrivateGroupChatState(state) ? state.isMember : false;

        setPrivateGroupKeyStatus(
          isRelevantMember ? t('status.privateGroupKey.missingAskAdmin') : t('status.privateGroupKey.requested'),
        );
      } else if (newKeyRequests.length > 0) {
        setPrivateGroupKeyStatus(t('status.privateGroupKey.requested'));
      } else if (shouldResolveKeyRequests) {
        setPrivateGroupKeyStatus(t('status.privateGroupKey.recoveryChecked'));
      }

      if (!isCurrentRecovery()) {
        return;
      }
      await loadMessages({ group, kind: 'group', network }, actionList, {
        accountUnlocked: selectedAccount.isUnlocked,
        quiet: true,
        skipKeyRecovery: true,
      });
      if (!isCurrentRecovery()) {
        return;
      }
    } catch (error) {
      if (!isCurrentRecovery()) {
        return;
      }
      setPrivateGroupKeyError(
        getBridgeErrorMessage(error, t('status.loadingError.privateGroupKeyRecovery'), t),
      );
    }
  }

  // P3 item 4: explicit Qortal admin affordance for RESOLVE_PRIVATE_GROUP_
  // CHAT_KEY_REQUESTS — administrator bundle publication (a signed, staged
  // QDN write) — so unlike Qortium's automatic background resolve, this only
  // ever runs from a deliberate click (see recoverMissingPrivateGroupKeys'
  // doc for why it is never automatic). NODE_CAPABILITY_MISSING (QDN staging
  // denied/unavailable) surfaces through the same getBridgeErrorMessage/
  // getCodedBridgeErrorMessage mapping every other bridge error already uses.
  async function handleQortalPublishGroupKey(group: GroupData) {
    if (qortalPrivateGroupResolvePending) {
      return;
    }

    const chatKey = getSelectedChatKey({ group, kind: 'group', network: 'qortal' });

    setQortalPrivateGroupResolvePending(true);
    setPrivateGroupKeyError('');
    setPrivateGroupKeyStatus(t('status.privateGroupKey.publishing'));

    try {
      await resolvePrivateGroupChatKeyRequests(group.groupId, qortalBridge.value.actions, 20, 'qortal');

      if (selectedChatKeyRef.current !== chatKey) {
        return;
      }

      setPrivateGroupKeyStatus(t('status.privateGroupKey.published'));

      void loadMessages({ group, kind: 'group', network: 'qortal' }, qortalBridge.value.actions, {
        accountUnlocked: isAccountUnlocked,
        quiet: true,
        skipKeyRecovery: true,
      });
    } catch (error) {
      if (selectedChatKeyRef.current !== chatKey) {
        return;
      }

      setPrivateGroupKeyStatus('');
      setPrivateGroupKeyError(getBridgeErrorMessage(error, t('status.loadingError.privateGroupKeyRecovery'), t));
    } finally {
      setQortalPrivateGroupResolvePending(false);
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
    const requestedAccountAddress = account.address;
    const refreshGeneration = accountRefreshGenerationRef.current;

    try {
      const selectedAccount = normalizeSelectedAccount(
        await qdnRequest<QdnSelectedAccount>({ action: 'UNLOCK_SELECTED_ACCOUNT' }),
      );

      if (
        accountRefreshGenerationRef.current !== refreshGeneration ||
        accountRefreshPendingRef.current ||
        currentAccountAddressRef.current !== requestedAccountAddress ||
        selectedAccount.address !== requestedAccountAddress
      ) {
        return null;
      }

      setAccount(selectedAccount);
      setAccountError('');

      return selectedAccount.isUnlocked ? selectedAccount : null;
    } catch (error) {
      if (
        accountRefreshGenerationRef.current === refreshGeneration &&
        !accountRefreshPendingRef.current &&
        currentAccountAddressRef.current === requestedAccountAddress
      ) {
        setWriteError(getBridgeErrorMessage(error, t('status.loadingError.selectedAccount'), t));
      }
      return null;
    }
  }

  async function handleJoinGroup() {
    if (!selectedGroup || !canSubmitJoin) {
      return;
    }

    const requestedChatKey = selectedChatKey;
    const requestedGroup = selectedGroup;
    let selectedAccount: QdnSelectedAccount | null = null;

    setJoinPending(true);
    setWriteError('');

    try {
      selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount || !isCurrentWritableAccount(selectedAccount.address)) {
        return;
      }

      const result = await joinGroup(requestedGroup.groupId, 'qortium');

      trackTransaction({
        action: 'join',
        group: requestedGroup,
        message: requestedGroup.isOpen === false ? t('status.join.request.submitted') : t('status.join.submitted'),
        result,
      });

      await loadAccountData(selectedAccount);
      await loadGroupMembers(requestedGroup);
    } catch (error) {
      const isCurrentRequest = () =>
        !!selectedAccount &&
        isCurrentWritableAccount(selectedAccount.address) &&
        selectedChatKeyRef.current === requestedChatKey;

      if (selectedAccount && isAlreadyGroupMemberError(error) && isCurrentRequest()) {
        await loadAccountData(selectedAccount, actions, { isCurrent: isCurrentRequest });

        if (isCurrentRequest()) {
          await loadGroupMembers(requestedGroup);
        }
        return;
      }

      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.join'), t));
    } finally {
      setJoinPending(false);
    }
  }

  // Mirrors handleJoinGroup for the Qortal bridge/identity — a separate
  // handler (not a merged network-aware one) so the tracked transaction, the
  // membership refresh, and the staleness check all stay on the Qortal side
  // (isCurrentQortalGroupActionContext, loadQortalMemberGroups) with no risk
  // of touching the Qortium account/member-groups state.
  async function handleJoinQortalGroup() {
    if (!selectedGroup || !canSubmitQortalJoin || !qortalAccount) {
      return;
    }

    const requestedChatKey = selectedChatKey;
    const requestedGroup = selectedGroup;
    const qortalAddress = qortalAccount.address;

    setJoinPending(true);
    setWriteError('');

    try {
      // Qortal has no unlock shortcut of its own — reuses the shared Home
      // wallet's Qortium unlock gate (see canComposeMessage's comment).
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount || !isCurrentQortalGroupActionContext(qortalAddress, requestedChatKey, requestedGroup.groupId)) {
        return;
      }

      const result = await joinGroup(requestedGroup.groupId, 'qortal');

      if (!isCurrentQortalGroupActionContext(qortalAddress, requestedChatKey, requestedGroup.groupId)) {
        return;
      }

      trackTransaction({
        action: 'join',
        group: requestedGroup,
        message: requestedGroup.isOpen === false ? t('status.join.request.submitted') : t('status.join.submitted'),
        network: 'qortal',
        result,
      });

      await loadQortalMemberGroups(qortalAddress);
      // D6: a closed group's JOIN_GROUP reports membership 'requested' rather
      // than 'joined' — refresh the account's own join-request list right
      // away (mirrors handleJoinGroup calling loadAccountData, which
      // includes loadAccountJoinRequests) so hasPendingQortalJoinRequest
      // flips to the request-pending button/hint state immediately, without
      // waiting for the 30s quiet refresh.
      if (canReadQortalAccountJoinRequests) {
        await loadQortalAccountJoinRequests(qortalAddress);
      }
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

      if (!selectedAccount || !isCurrentWritableAccount(selectedAccount.address)) {
        return;
      }

      const result = await joinGroup(invite.groupId, 'qortium');

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

  function updateReactionPendingOperations(
    updater: (current: ReadonlySet<string>) => ReadonlySet<string>,
  ) {
    const next = updater(reactionPendingOperationsRef.current);

    reactionPendingOperationsRef.current = next;
    setReactionPendingOperations(next);
  }

  function getReactionOperationKey(chatKey: string, pendingKey: string) {
    return `${chatKey}\0${pendingKey}`;
  }

  function clearReactionPendingOperation(operationKey: string) {
    updateReactionPendingOperations((current) => {
      if (!current.has(operationKey)) {
        return current;
      }

      const next = new Set(current);

      next.delete(operationKey);
      return next;
    });
  }

  // `isPrivate` is captured HERE, once, from the selected group's `isOpen`
  // field — this is the P3 safety-routing flag (pendingSends.ts). It is never
  // re-derived from live group state later at dispatch time, which would be
  // a stale-lookup hazard (the group could open/close between queueing and
  // the actual bridge call).
  function pendingSendTargetFor(chat: SelectedChat): PendingSendTarget {
    return chat.kind === 'group'
      ? { groupId: chat.group.groupId, isPrivate: chat.group.isOpen === false, kind: 'group', network: chat.network }
      : { address: chat.direct.address, kind: 'direct', network: chat.network };
  }

  // The selected chat's own network's advertised action list — every typed
  // wrapper below picks its exact-action vs generic-envelope path off this,
  // never off the other network's actions.
  function getNetworkActions(network: ChatNetwork) {
    return network === 'qortal' ? qortalBridge.value.actions : actions;
  }

  // Current per-chat GET_PRIVATE_GROUP_CHAT_STATE snapshot for a closed
  // group, keyed by (network, groupId) — see the fetch effect below. Read via
  // a ref (not the state value directly) because dispatchChatSend/Revision
  // run from inside runPendingSend/runPendingRevision, which can fire well
  // after the composer that queued them last re-rendered; this is a soft,
  // best-effort cap (unlike `isPrivate` above, staleness here is not a safety
  // hazard — an over/under-estimated cap is still enforced authoritatively by
  // Home/Core server-side).
  function getPrivateGroupMaxPlaintextBytesFor(network: ChatNetwork, target: PendingSendTarget) {
    if (target.kind !== 'group' || !target.isPrivate || network !== 'qortium') {
      // Qortal's cap is fixed and enforced by coreApi regardless of what is
      // passed here (assertPrivateGroupPlaintextByteLimit) — no lookup needed.
      return undefined;
    }

    const key = getPrivateGroupChatStateKey(network, target.groupId);
    const state = privateGroupChatStateByKeyRef.current.get(key)?.value ?? null;

    return getPrivateGroupComposerMaxPlaintextBytes(network, state);
  }

  function setNetworkJournalEntries(network: ChatNetwork, entries: PendingBridgeTransactionEntry[]) {
    if (network === 'qortal') {
      setQortalJournalEntries(entries);
    } else {
      setJournalEntries(entries);
    }
  }

  function getNetworkJournalEntries(network: ChatNetwork) {
    return network === 'qortal' ? qortalJournalEntries : journalEntries;
  }

  // One-shot fetch of a network's pending journal (item D). Best-effort: a
  // failed fetch just leaves the previous snapshot in place — the next
  // trigger (bridge/account ready, a send resolving ambiguous, a blocked
  // duplicate-mutation error) retries. Never throws.
  async function fetchPendingJournal(network: ChatNetwork) {
    const networkActions = getNetworkActions(network);

    if (!hasAction(networkActions, 'GET_PENDING_TRANSACTIONS')) {
      return;
    }

    // Guard against a response arriving after the owning account has already
    // changed (see journalRequestGuardRef's declaration) — an in-flight fetch
    // started for account A must never commit its result once B is current.
    const guard = network === 'qortal' ? qortalJournalRequestGuardRef.current : journalRequestGuardRef.current;
    const requestId = guard.begin();

    try {
      const result = await getPendingBridgeTransactions(network, networkActions);

      if (!guard.isLatest(requestId)) {
        return;
      }

      setNetworkJournalEntries(network, result.entries);
    } catch {
      // Best-effort read; keep whatever snapshot is already in state.
    }
  }

  // Drops a forgotten entry from state regardless of whether Home's own
  // FORGET_PENDING_TRANSACTION call succeeded — a failed forget is retried on
  // the next reconcile pass off the still-fresh next fetch, not by keeping a
  // stale local copy around.
  async function forgetJournalEntry(network: ChatNetwork, signature: string) {
    const networkActions = getNetworkActions(network);

    try {
      await forgetPendingBridgeTransaction(network, signature, networkActions);
    } catch {
      // Non-fatal (see item D scope): keep trying on the next reconcile pass
      // rather than surfacing a banner for a housekeeping call.
    }

    setNetworkJournalEntries(
      network,
      getNetworkJournalEntries(network).filter((entry) => entry.signature !== signature),
    );
  }

  // Reconciles a network's journal against a freshly loaded/refreshed message
  // list (item D step: "when message lists load/refresh for a conversation").
  // Only entries whose signature actually showed up in `messages` are
  // forgotten — never merely because the journal was fetched.
  function reconcileJournalWithMessages(network: ChatNetwork, messages: readonly ChatMessage[]) {
    const chatEntries = filterChatJournalEntries(getNetworkJournalEntries(network));

    if (chatEntries.length === 0) {
      return;
    }

    const observedSignatures = new Set<string>();

    for (const message of messages) {
      if (message.signature) {
        observedSignatures.add(getMessageNetworkIdentity(network, message));
      }
    }

    const forgettable = getForgettableJournalSignatures(chatEntries, observedSignatures);

    for (const entry of forgettable) {
      void forgetJournalEntry(network, entry.signature);
    }
  }

  // Routing (open vs closed group) lives in chatDispatch.ts, tested there
  // against the real coreApi wrappers with only the transport mocked (see
  // chatDispatch.test.ts's safety-invariant coverage) — these two thin
  // wrappers just supply this chat's network action list and (for a closed
  // Qortium group) the currently-known plaintext cap from the per-chat
  // private-group state store below.
  function dispatchChatSend(entry: Pick<PendingSend, 'chatReference' | 'content' | 'contentState' | 'kind' | 'target' | 'text'>) {
    const network = entry.target.network ?? 'qortium';

    return dispatchChatSendEntry(entry, getNetworkActions(network), {
      privateGroupMaxPlaintextBytes: getPrivateGroupMaxPlaintextBytesFor(network, entry.target),
    });
  }

  function dispatchChatRevision(entry: Pick<PendingRevision, 'chatReference' | 'kind' | 'repliedTo' | 'target' | 'text'>) {
    const network = entry.target.network ?? 'qortium';

    return dispatchChatRevisionEntry(entry, getNetworkActions(network), {
      privateGroupMaxPlaintextBytes: getPrivateGroupMaxPlaintextBytesFor(network, entry.target),
    });
  }

  function isCurrentWritableAccount(address: string) {
    return (
      !accountRefreshPendingRef.current &&
      currentAccountAddressRef.current === address
    );
  }

  function isCurrentQortiumGroupActionContext(accountAddress: string, chatKey: string, groupId: number) {
    return (
      !chatKey.startsWith('qortal:') &&
      selectedChatKeyRef.current === chatKey &&
      selectedGroupIdRef.current === groupId &&
      isCurrentWritableAccount(accountAddress)
    );
  }

  // Mirrors isCurrentQortiumGroupActionContext for the Qortal identity/chat —
  // a separate function (not a merged network-aware one) so a Qortal action's
  // staleness check never accidentally reads the Qortium refs or vice versa.
  function isCurrentQortalGroupActionContext(accountAddress: string, chatKey: string, groupId: number) {
    return (
      chatKey.startsWith('qortal:') &&
      selectedChatKeyRef.current === chatKey &&
      selectedGroupIdRef.current === groupId &&
      !qortalAccountRefreshPendingRef.current &&
      currentQortalAccountAddressRef.current === accountAddress
    );
  }

  function getCurrentPendingOwnerAddress(target: PendingSendTarget) {
    return (target.network ?? 'qortium') === 'qortal'
      ? currentQortalAccountAddressRef.current
      : currentAccountAddressRef.current;
  }

  function isCurrentWritablePendingTarget(target: PendingSendTarget, accountAddress: string) {
    return (target.network ?? 'qortium') === 'qortal'
      ? !qortalAccountRefreshPendingRef.current &&
          currentQortalAccountAddressRef.current === accountAddress
      : isCurrentWritableAccount(accountAddress);
  }

  function isCurrentOrRefreshingPendingOwner(target: PendingSendTarget, accountAddress: string) {
    if ((target.network ?? 'qortium') !== 'qortal') {
      return currentAccountAddressRef.current === accountAddress;
    }

    return (
      currentQortalAccountAddressRef.current === accountAddress ||
      (qortalAccountRefreshPendingRef.current &&
        refreshingQortalAccountAddressRef.current === accountAddress)
    );
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

    if (!isCurrentWritablePendingTarget(entry.target, entry.accountAddress)) {
      updatePendingSends((current) =>
        current.filter((candidate) => candidate.localId !== localId),
      );
      options.onSettled?.();
      return;
    }
    const attemptUpdatedAt = entry.delivery.updatedAt;

    try {
      const result = await dispatchChatSend(entry);

      if (!isCurrentOrRefreshingPendingOwner(entry.target, entry.accountAddress)) {
        return;
      }

      updatePendingSends((current) =>
        current.map((candidate) =>
          candidate.localId === localId &&
          candidate.delivery.phase === 'pending' &&
          candidate.delivery.updatedAt === attemptUpdatedAt
            ? result.outcome === 'ambiguous'
              ? resolvePendingSendAmbiguously(
                  candidate,
                  result,
                  result.error ?? t('message.delivery.ambiguous'),
                )
              : resolvePendingSend(candidate, result)
            : candidate,
        ),
      );

      if (entry.kind === 'reaction' && result.outcome === 'ambiguous') {
        setWriteError(t('message.delivery.ambiguous'));
      }

      // Item D: an ambiguous outcome is exactly the moment Home records a new
      // pending-journal entry (a signed mutation with an unknown broadcast
      // result) — refresh the journal so the conversation notice appears
      // without waiting for the next unrelated bridge/account-ready trigger.
      if (result.outcome === 'ambiguous') {
        void fetchPendingJournal(entry.target.network ?? 'qortium');
      }

      if (chat.kind === 'direct' && isCurrentWritablePendingTarget(entry.target, entry.accountAddress)) {
        void loadActiveChats(selectedAccount, actions, { quiet: true });
      }

      // Only refresh the chat the send actually targets, and only while the
      // user is still on it — a stale-chat quiet refresh is a no-op at best
      // (loadMessages already guards on isStale()) and unnecessary work at
      // worst. If the user has moved on, the normal poll/websocket for that
      // chat picks up the confirmed message whenever they return to it.
      if (
        selectedChatKeyRef.current === entry.chatKey &&
        isCurrentWritablePendingTarget(entry.target, entry.accountAddress)
      ) {
        void loadMessages(chat, actions, { accountUnlocked: selectedAccount.isUnlocked, quiet: true });
      }
    } catch (error) {
      if (!isCurrentOrRefreshingPendingOwner(entry.target, entry.accountAddress)) {
        return;
      }

      const fallback = entry.kind === 'reaction' ? t('status.loadingError.sendReaction') : t('status.loadingError.sendMessage');
      const message = getBridgeErrorMessage(error, fallback, t);

      // Item D: Home blocked this attempt because a pending entry for the same
      // action+target already exists — refresh the journal immediately so the
      // conversation-level notice (see selectedChatJournalNotice) shows up
      // alongside the banner this error's code already produces.
      if (isPendingReconciliationRequired(error)) {
        void fetchPendingJournal(entry.target.network ?? 'qortium');
      }

      updatePendingSends((current) =>
        current.map((candidate) =>
          candidate.localId === localId &&
          candidate.delivery.phase === 'pending' &&
          candidate.delivery.updatedAt === attemptUpdatedAt
            ? isChatSendRejectedError(error)
              ? failPendingSend(candidate, message)
              : failPendingSendAmbiguously(candidate, message)
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

    if (!isCurrentWritablePendingTarget(entry.target, entry.accountAddress)) {
      updatePendingRevisions((current) =>
        current.filter((candidate) => candidate.localId !== localId),
      );
      return;
    }
    const attemptUpdatedAt = entry.delivery.updatedAt;

    try {
      const result = await dispatchChatRevision(entry);

      if (!isCurrentOrRefreshingPendingOwner(entry.target, entry.accountAddress)) {
        return;
      }

      updatePendingRevisions((current) =>
        current.map((candidate) =>
          candidate.localId === localId &&
          candidate.delivery.phase === 'pending' &&
          candidate.delivery.updatedAt === attemptUpdatedAt
            ? result.outcome === 'ambiguous'
              ? resolvePendingRevisionAmbiguously(
                  candidate,
                  result,
                  result.error ?? t('message.delivery.ambiguous'),
                )
              : resolvePendingRevision(candidate, result)
            : candidate,
        ),
      );

      // Item D: same as runPendingSend — an ambiguous revision outcome is
      // exactly when Home records a new journal entry.
      if (result.outcome === 'ambiguous') {
        void fetchPendingJournal(entry.target.network ?? 'qortium');
      }

      if (chat.kind === 'direct' && isCurrentWritablePendingTarget(entry.target, entry.accountAddress)) {
        void loadActiveChats(selectedAccount, actions, { quiet: true });
      }

      if (
        selectedChatKeyRef.current === entry.chatKey &&
        isCurrentWritablePendingTarget(entry.target, entry.accountAddress)
      ) {
        void loadMessages(chat, actions, { accountUnlocked: selectedAccount.isUnlocked, quiet: true });
      }
    } catch (error) {
      if (!isCurrentOrRefreshingPendingOwner(entry.target, entry.accountAddress)) {
        return;
      }

      const message = getBridgeErrorMessage(error, t('status.loadingError.sendMessage'), t);

      // Item D: same as runPendingSend's catch — surface the journal notice
      // immediately when Home blocks a duplicate same-target mutation.
      if (isPendingReconciliationRequired(error)) {
        void fetchPendingJournal(entry.target.network ?? 'qortium');
      }

      updatePendingRevisions((current) =>
        current.map((candidate) =>
          candidate.localId === localId &&
          candidate.delivery.phase === 'pending' &&
          candidate.delivery.updatedAt === attemptUpdatedAt
            ? isChatSendRejectedError(error)
              ? failPendingRevision(candidate, message)
              : failPendingRevisionAmbiguously(candidate, message)
            : candidate,
        ),
      );
    }
  }

  function handleRetryPendingSend(localId: string) {
    const chat = selectedChat;
    const entry = pendingSendsRef.current.find((candidate) => candidate.localId === localId);

    if (
      !chat ||
      !entry ||
      entry.chatKey !== getSelectedChatKey(chat) ||
      !isCurrentWritablePendingTarget(entry.target, entry.accountAddress) ||
      !canRetryPendingDelivery(entry.delivery)
    ) {
      return;
    }

    void (async () => {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      if (!isCurrentWritablePendingTarget(entry.target, entry.accountAddress)) {
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
    const entry = pendingRevisionsRef.current.find((candidate) => candidate.localId === localId);

    if (
      !chat ||
      !entry ||
      entry.chatKey !== getSelectedChatKey(chat) ||
      !isCurrentWritablePendingTarget(entry.target, entry.accountAddress) ||
      !canRetryPendingDelivery(entry.delivery)
    ) {
      return;
    }

    void (async () => {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount) {
        return;
      }

      if (!isCurrentWritablePendingTarget(entry.target, entry.accountAddress)) {
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
      const target = pendingSendTargetFor(chat);
      const pendingOwnerAddress = getCurrentPendingOwnerAddress(target);

      if (
        !selectedAccount ||
        !pendingOwnerAddress ||
        !isCurrentWritablePendingTarget(target, pendingOwnerAddress)
      ) {
        return;
      }

      if (!canReviseMessageThread(thread, pendingOwnerAddress)) {
        setDeleteTarget(null);
        setWriteError(t('status.loadingError.selectedAccount'));
        return;
      }

      // Same shape as an edit: a revision over the original's signature —
      // just with an empty body (the reply target is preserved so the
      // tombstone stays threaded).
      const repliedTo = decodeChatMessage(thread.original).repliedTo;
      const message = buildDeletedMessageText(repliedTo);
      const chatKey = getSelectedChatKey(chat);
      const localId = createLocalSendId();

      updatePendingRevisions((current) => [
        ...current.filter(
          (candidate) =>
            !(
              candidate.accountAddress === pendingOwnerAddress &&
              candidate.chatKey === chatKey &&
              candidate.chatReference === chatReference
            ),
        ),
        createPendingRevision({
          accountAddress: pendingOwnerAddress,
          chatKey,
          chatReference,
          kind: 'delete',
          localId,
          repliedTo,
          target,
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

    const group = selectedGroup;
    const chatKey = selectedChatKey;

    setLeavePending(true);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount || !isCurrentQortiumGroupActionContext(selectedAccount.address, chatKey, group.groupId)) {
        return;
      }

      const result = await leaveGroup(group.groupId, 'qortium');

      if (!isCurrentQortiumGroupActionContext(selectedAccount.address, chatKey, group.groupId)) {
        return;
      }

      trackTransaction({
        action: 'leave',
        group,
        message: t('status.leave.submitted'),
        result,
      });

      await loadAccountData(selectedAccount);
      await loadGroupMembers(group);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.leave'), t));
    } finally {
      setLeavePending(false);
    }
  }

  // Mirrors handleLeaveGroup for the Qortal bridge/identity — see
  // handleJoinQortalGroup's comment.
  async function handleLeaveQortalGroup() {
    if (!selectedGroup || !canSubmitQortalLeave || !qortalAccount) {
      return;
    }

    const group = selectedGroup;
    const chatKey = selectedChatKey;
    const qortalAddress = qortalAccount.address;

    setLeavePending(true);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount || !isCurrentQortalGroupActionContext(qortalAddress, chatKey, group.groupId)) {
        return;
      }

      const result = await leaveGroup(group.groupId, 'qortal');

      if (!isCurrentQortalGroupActionContext(qortalAddress, chatKey, group.groupId)) {
        return;
      }

      trackTransaction({
        action: 'leave',
        group,
        message: t('status.leave.submitted'),
        network: 'qortal',
        result,
      });

      await loadQortalMemberGroups(qortalAddress);
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

    const group = selectedGroup;
    const chatKey = selectedChatKey;

    setStartMintingPending(true);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount || !isCurrentQortiumGroupActionContext(selectedAccount.address, chatKey, group.groupId)) {
        return;
      }

      const result = await startMinting();

      if (!isCurrentQortiumGroupActionContext(selectedAccount.address, chatKey, group.groupId)) {
        return;
      }

      if (result.rewardSharePending) {
        trackTransaction({
          action: 'rewardshare',
          group,
          message: t('status.minting.authorization.submitted'),
          result,
        });
      }

      await loadMintingStatus(selectedAccount);
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.startMinting'), t));
      if (isCurrentWritableAccount(account.address)) {
        void loadMintingStatus(account, actions, { quiet: true });
      }
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

    const group = selectedGroup;
    const chatKey = selectedChatKey;

    setApprovalActionSignature(pendingSignature);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount || !isCurrentQortiumGroupActionContext(selectedAccount.address, chatKey, group.groupId)) {
        return;
      }

      const result = await submitGroupApproval(pendingSignature, approval, group.groupId);

      if (!isCurrentQortiumGroupActionContext(selectedAccount.address, chatKey, group.groupId)) {
        return;
      }

      // Optimistic: reflect the just-cast vote until the next reload sees it
      // confirmed on-chain (the tx stays pending until the threshold is met).
      setVotedSignatures((previous) => ({ ...previous, [pendingSignature]: { approval } }));

      trackTransaction({
        action: 'groupApproval',
        group,
        message: approval ? t('status.approval.vote.submitted') : t('status.approval.oppose.submitted'),
        result,
      });

      await loadPendingApprovals(group.groupId);
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

    const group = selectedGroup;
    const chatKey = selectedChatKey;

    if (request.groupId !== group.groupId) {
      return;
    }

    setApprovePendingJoiner(request.joiner);
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount || !isCurrentQortiumGroupActionContext(selectedAccount.address, chatKey, group.groupId)) {
        return;
      }

      const result = await approveGroupJoinRequest(request.groupId, request.joiner, 'qortium');

      if (!isCurrentQortiumGroupActionContext(selectedAccount.address, chatKey, group.groupId)) {
        return;
      }

      trackTransaction({
        action: 'approve',
        group,
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

  // D6: mirrors handleApproveJoinRequest for the Qortal bridge/identity — a
  // separate handler (not a merged network-aware one), consistent with
  // handleJoinQortalGroup/handleJoinGroup above. This is the join-request
  // approval (GROUP_INVITE wire) admin surface only — the Qortium-only
  // GROUP_APPROVAL chain-governance vote machinery (submitGroupApproval) is
  // never extended to Qortal.
  async function handleApproveQortalJoinRequest(request: GroupJoinRequest) {
    if (
      !selectedGroup ||
      !canApproveQortalGroupJoinRequests ||
      !canUseQortalAccount ||
      approvePendingJoiner ||
      !qortalAccount
    ) {
      return;
    }

    const group = selectedGroup;
    const chatKey = selectedChatKey;
    const qortalAddress = qortalAccount.address;

    if (request.groupId !== group.groupId) {
      return;
    }

    setApprovePendingJoiner(request.joiner);
    setWriteError('');

    try {
      // Qortal has no unlock shortcut of its own — reuses the shared Home
      // wallet's Qortium unlock gate (see handleJoinQortalGroup's comment).
      const selectedAccount = await ensureSelectedAccountUnlocked();

      if (!selectedAccount || !isCurrentQortalGroupActionContext(qortalAddress, chatKey, group.groupId)) {
        return;
      }

      const result = await approveGroupJoinRequest(request.groupId, request.joiner, 'qortal');

      if (!isCurrentQortalGroupActionContext(qortalAddress, chatKey, group.groupId)) {
        return;
      }

      trackTransaction({
        action: 'approve',
        group,
        joiner: request.joiner,
        message: t('status.approval.submitted'),
        network: 'qortal',
        result,
      });

      await loadQortalAdminJoinRequests(qortalAddress);
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
    network = 'qortium',
    result,
  }: {
    action: TrackedTransaction['action'];
    group: GroupData;
    joiner?: string;
    message: string;
    network?: ChatNetwork;
    result: { transactionSignature?: string };
  }) {
    // `network` prefixes the fallback (no-signature) id too, so a Qortium and
    // a Qortal transaction against the same numeric groupId in the same
    // millisecond can never collide on tracker key.
    const id = result.transactionSignature || `${network}:${action}:${group.groupId}:${Date.now()}`;

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
        network,
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
    if (!canReviseMessageThread(thread, selfAddress)) {
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
    // Edits keep the original message's media (canAttach already excludes
    // edit context), so a staged file only ever applies to a new message.
    const staged = context?.kind !== 'edit' && stagedAttachment?.phase === 'ready' ? stagedAttachment : null;
    const attachNetwork: ChatNetwork = chat.network === 'qortal' ? 'qortal' : 'qortium';
    const attachActions = attachNetwork === 'qortal' ? qortalBridge.value.actions : actions;
    let publishedLink = '';
    let attachmentDescriptor: PrivateAttachmentDescriptor | null = null;

    setSendPending(true);
    setWriteError('');

    try {
      // Qortal has no unlock shortcut of its own (a pure-Qortal app cannot
      // drive UNLOCK_SELECTED_ACCOUNT — see docs/HOME_V2_BRIDGE_COMPATIBILITY.md
      // in qortium-home); reusing this Qortium unlock is exactly what the doc
      // says a dual-chain app should do, since both chains sign from the same
      // underlying Home wallet.
      const selectedAccount = await ensureSelectedAccountUnlocked();
      const target = pendingSendTargetFor(chat);
      const pendingOwnerAddress = getCurrentPendingOwnerAddress(target);

      if (
        !selectedAccount ||
        !pendingOwnerAddress ||
        !isCurrentWritablePendingTarget(target, pendingOwnerAddress)
      ) {
        return;
      }

      if (context?.kind === 'edit' && !canReviseMessageThread(context.thread, pendingOwnerAddress)) {
        setWriteError(t('status.loadingError.selectedAccount'));
        return;
      }

      // review/schemas-publish-attachments.md § 1: a source token expires 30
      // minutes after selection. Check before spending a round trip on a
      // token Home will reject anyway.
      if (staged && isSourceAttachmentExpired(staged, Date.now())) {
        setStagedAttachment(null);
        setAttachmentError(t('status.attachment.reselect'));
        return;
      }

      if (staged) {
        const isOpenGroup = chat.kind === 'group' && chat.group.isOpen !== false;
        const isPrivateConversation =
          chat.kind === 'direct' || (chat.kind === 'group' && chat.group.isOpen === false);

        try {
          if (isOpenGroup && chat.kind === 'group') {
            // Publish the attachment first (Home shows its approval prompt);
            // only a successful publish gets linked into the message.
            const publisherName =
              attachNetwork === 'qortal'
                ? normalizeRegisteredName(qortalAccount?.name)
                : normalizeRegisteredName(selectedAccount.name);

            if (!publisherName) {
              setWriteError(t('status.attachment.nameRequired'));
              return;
            }

            const service = getAttachmentServiceFromMime(staged.mimeType);
            const identifier = buildAttachmentIdentifier(chat.group.groupId, Date.now());

            const outcome = await publishQdnResource(
              attachNetwork,
              { identifier, name: publisherName, service, sourceToken: staged.sourceToken },
              attachActions,
            );

            if (!isCurrentWritablePendingTarget(target, pendingOwnerAddress)) {
              return;
            }

            if (outcome.accepted !== true) {
              // BROADCAST_UNKNOWN: Home's own pending-transaction journal
              // already records the signature: reconciliation is the
              // existing P1 GET_PENDING_BRIDGE_TRANSACTIONS wiring's job, not
              // this call's. Do not send the chat message referencing a link
              // that may not exist.
              setWriteError(t('status.attachment.publishAmbiguous'));
              return;
            }

            publishedLink = buildAttachmentLink(service, publisherName, identifier);
          } else if (isPrivateConversation) {
            const conversation: PrivateAttachmentConversation =
              chat.kind === 'direct'
                ? { kind: 'direct', otherAddress: chat.direct.address }
                : { groupId: chat.group.groupId, kind: 'group' };

            const outcome = await publishChatAttachment(attachNetwork, staged.sourceToken, conversation, attachActions);

            if (!isCurrentWritablePendingTarget(target, pendingOwnerAddress)) {
              return;
            }

            if (outcome.accepted !== true) {
              setWriteError(t('status.attachment.publishAmbiguous'));
              return;
            }

            attachmentDescriptor = outcome.descriptor;
          }
        } catch (error) {
          if (isPublishSourceTokenError(error)) {
            setStagedAttachment(null);
            setAttachmentError(t('status.attachment.reselect'));
            return;
          }

          throw error;
        }
      }

      const bodyText = publishedLink ? (text ? `${text}\n${publishedLink}` : publishedLink) : text;
      let message = bodyText;
      let chatReference: string | undefined;

      if (context?.kind === 'edit') {
        // An edit is a new transaction replacing the original via chatReference;
        // keep the original's reply target so the reply preview survives edits.
        chatReference = context.thread.original.signature ?? undefined;
        message = buildChatMessageText(bodyText, decodeChatMessage(context.thread.original).repliedTo);
      } else if (attachmentDescriptor) {
        // docs/CHAT_ATTACHMENTS.md: a Qortal private-group IMAGE attachment
        // rides Hub's images[] v3 envelope for interop; every other private
        // attachment rides Chat's own `attachments` envelope field.
        const replyTarget = context?.kind === 'reply' ? context.message.signature ?? null : null;

        message =
          attachNetwork === 'qortal' && chat.kind === 'group' && attachmentDescriptor.resource.service === 'IMAGE'
            ? buildQortalHubGroupChatPayload({ repliedTo: replyTarget, text: bodyText }, undefined, [
                {
                  ...attachmentDescriptor,
                  identifier: attachmentDescriptor.resource.identifier,
                  name: attachmentDescriptor.resource.name,
                  service: attachmentDescriptor.resource.service,
                },
              ])
            : buildChatMessageText(bodyText, replyTarget, [attachmentDescriptor]);
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
      const localId = createLocalSendId();
      // The optimistic echo's sender must be THIS chat's chain identity — the
      // real confirmed message that eventually replaces it will carry the
      // Qortal sender address, and self/"own message" styling compares
      // against that same identity (see selfAddress below) — using the
      // Qortium account.address here would make a Qortal message never read
      // as "own" even after it confirms.
      const senderAddress = pendingOwnerAddress;
      const senderName = chat.network === 'qortal' ? (qortalAccount?.name ?? null) : selectedAccount.name;

      if (context?.kind === 'edit' && chatReference) {
        updatePendingRevisions((current) => [
          ...current.filter(
            (candidate) =>
              !(
                candidate.accountAddress === pendingOwnerAddress &&
                candidate.chatKey === chatKey &&
                candidate.chatReference === chatReference
              ),
          ),
          createPendingRevision({
            accountAddress: pendingOwnerAddress,
            chatKey,
            chatReference,
            kind: 'edit',
            localId,
            target,
            text: message,
          }),
        ]);
        void runPendingRevision(localId, chat, selectedAccount);
      } else {
        const pendingSend = createPendingSend({
          accountAddress: pendingOwnerAddress,
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
      } else if (attachmentDescriptor && selectedChatKeyRef.current === getSelectedChatKey(chat)) {
        // A private descriptor is not human-composable text, so there is no
        // equivalent draft-refill — the encrypted resource still exists;
        // only the notice can tell the user their message did not send.
        setStagedAttachment(null);
        setAttachmentError('');
        setWriteError(t('status.attachment.publishAmbiguous'));
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
    const chatKey = getSelectedChatKey(chat);
    const targetSignature = message.signature;
    const pendingKey = getReactionPendingKey(targetSignature, reaction);
    const operationKey = getReactionOperationKey(chatKey, pendingKey);

    if (reactionPendingOperationsRef.current.has(operationKey)) {
      return;
    }

    updateReactionPendingOperations((current) => new Set(current).add(operationKey));
    setWriteError('');

    try {
      const selectedAccount = await ensureSelectedAccountUnlocked();
      const target = pendingSendTargetFor(chat);
      const pendingOwnerAddress = getCurrentPendingOwnerAddress(target);

      if (
        !selectedAccount ||
        !pendingOwnerAddress ||
        !isCurrentWritablePendingTarget(target, pendingOwnerAddress)
      ) {
        clearReactionPendingOperation(operationKey);
        return;
      }

      const reactionMessage = buildReactionMessageText(reaction, contentState);
      const localId = createLocalSendId();
      const senderAddress = pendingOwnerAddress;
      const senderName = chat.network === 'qortal' ? (qortalAccount?.name ?? null) : selectedAccount.name;

      const pendingSend = createPendingSend({
        accountAddress: pendingOwnerAddress,
        chatKey,
        chatReference: targetSignature,
        content: reaction,
        contentState,
        kind: 'reaction',
        localId,
        recipient: chat.kind === 'direct' ? chat.direct.address : null,
        recipientName: chat.kind === 'direct' ? (chat.direct.name ?? null) : null,
        sender: senderAddress,
        senderName,
        target,
        text: reactionMessage,
        timestamp: Date.now(),
        txGroupId: chat.kind === 'group' ? chat.group.groupId : 0,
      });

      if (hasActiveDuplicateSend(pendingSendsRef.current, pendingSend)) {
        clearReactionPendingOperation(operationKey);
        return;
      }

      // Merged straight into the feed (see mergeOptimisticMessages): the
      // reaction chip flips the instant this is dispatched, well before the
      // broadcast round trip completes.
      updatePendingSends((current) => [...current, pendingSend]);

      void runPendingSend(localId, chat, selectedAccount, {
        onSettled: () => clearReactionPendingOperation(operationKey),
      });
    } catch (error) {
      setWriteError(getBridgeErrorMessage(error, t('status.loadingError.sendReaction'), t));
      clearReactionPendingOperation(operationKey);
    }
  }

  // Persist the user's last explicit selection so the app reopens on it next time
  // under the selected chain identity. A tiny app-wide network preference says
  // which identity-specific record to restore; it contains no chat content.
  function rememberLastChat(chat: SelectedChat) {
    const stored = toStoredSelectedChat(chat);

    if (stored.network === 'qortal') {
      const qortalAccountAddress = currentQortalAccountAddressRef.current;

      if (qortalAccountAddress) {
        writeQortalLastChat(qortalAccountAddress, stored);
        writeLastChatNetwork('qortal');
      }
    } else if (account) {
      writeLastChat(account.address, stored);
      writeLastChatNetwork('qortium');
    }
  }

  // Keep directs in the sidebar after their messages expire off the active list.
  // Storage is the source of truth (keyed by account+network — see
  // readPersistedDirectsForNetwork), so a write always targets the right
  // account even when activeChats/state for a prior account lag behind; the
  // visible state updates only while that account is still selected.
  function persistDirects(network: ChatNetwork, accountAddress: string, directs: ActiveDirectChat[]) {
    if (directs.length === 0) {
      return;
    }

    const stored = readPersistedDirectsForNetwork(network, accountAddress);
    let next = stored;

    for (const direct of directs) {
      next = mergePersistedDirect(next, direct.address, direct.name);
    }

    if (next === stored) {
      return;
    }

    writePersistedDirectsForNetwork(network, accountAddress, next);

    const currentAddress =
      network === 'qortal' ? currentQortalAccountAddressRef.current : currentAccountAddressRef.current;

    if (currentAddress === accountAddress) {
      if (network === 'qortal') {
        setQortalPersistedDirects(next);
      } else {
        setPersistedDirects(next);
      }
    }
  }

  function rememberDirect(direct: ActiveDirectChat, network: ChatNetwork = 'qortium') {
    const accountAddress = network === 'qortal' ? qortalAccount?.address : account?.address;

    if (accountAddress) {
      persistDirects(network, accountAddress, [direct]);
    }
  }

  // Opens Home's native file picker (SELECT_QDN_PUBLISH_SOURCE) and stages
  // the returned source token for the next send. The app never sees file
  // bytes — only fileName/size/mimeType for display — so there is nothing
  // left to compress, encode, or read locally; Home enforces the 1 byte–100
  // MiB source cap itself. Replaces any previously staged file (one
  // attachment per message).
  function attachFile() {
    if (!canAttach || stagedAttachment?.phase === 'selecting') {
      return;
    }

    setAttachmentError('');
    setStagedAttachment({ phase: 'selecting' });

    const chatKey = selectedChatKeyRef.current;
    const network = selectedChatAttachNetwork;
    const attachActions = selectedChatAttachActions;

    void selectQdnPublishSource(network, attachActions)
      .then((selection) => {
        // Attachments are per-conversation; drop a result that resolves
        // after the user moved to another chat.
        if (selectedChatKeyRef.current !== chatKey) {
          return;
        }

        if (selection.canceled) {
          setStagedAttachment(null);
          return;
        }

        // Home already enforces its own 1 byte–100 MiB source cap during
        // selection; this narrower per-service cap is a courtesy to QDN
        // hosting the app has offered since before P4 (see attachments.ts's
        // module doc). It only applies when the mimeType is known — Home's
        // desktop picker never reports one, and guessing IMAGE for an
        // unknown type risks rejecting a perfectly fine non-image file.
        const maxBytes = selection.mimeType
          ? getAttachmentMaxBytes(getAttachmentServiceFromMime(selection.mimeType))
          : QDN_PUBLISH_SOURCE_MAX_BYTES;

        if (selection.size > maxBytes) {
          setAttachmentError(t('status.attachment.tooLarge', { max: String(Math.round(maxBytes / 1024 / 1024)) }));
          setStagedAttachment(null);
          return;
        }

        setStagedAttachment({
          fileName: selection.fileName,
          mimeType: selection.mimeType,
          phase: 'ready',
          selectedAt: Date.now(),
          size: selection.size,
          sourceToken: selection.sourceToken,
        });
      })
      .catch((error) => {
        if (selectedChatKeyRef.current !== chatKey) {
          return;
        }

        setAttachmentError(getBridgeErrorMessage(error, t('status.attachment.error'), t));
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

  // Home's picker is now the only source of publishable bytes (review/
  // schemas-publish-attachments.md § 2 "Rejected source fields" — inline
  // base64 is rejected outright), so a browser drag-drop can no longer stage
  // anything; point the user at the attach button instead of silently
  // ignoring the drop.
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

    setAttachmentError(t('status.attachment.usePicker'));
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = getFirstTransferFile(event.clipboardData);

    // Only intercept when the clipboard carries a file (e.g. a screenshot or
    // file copied from the desktop); plain text pastes flow through
    // untouched. Same rationale as handleAttachmentDrop above: there is no
    // bytes-to-Home path any more, so this can only point at the picker.
    if (file && canAttach) {
      event.preventDefault();
      setAttachmentError(t('status.attachment.usePicker'));
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

  function selectDirect(direct: ActiveDirectChat, network: ChatNetwork = 'qortium', options: ChatSelectionOptions = {}) {
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
    switchDraftTo(getSelectedChatKey({ direct, kind: 'direct', network }));
    setComposeContext(null);
    if (userInitiated) {
      userSelectedChatRef.current = true;
    }
    setSelectedChat({ direct, kind: 'direct', network });
    if (remember) {
      rememberLastChat({ direct, kind: 'direct', network });
      rememberDirect(direct, network);
    }
    if (showConversation) {
      setMobileChatView(true);
    }
    writeChatRoute({ address: direct.address, network }, historyMode);
  }

  // Remove a persisted direct from the sidebar. If it is the open chat, fall back
  // to General Chat and return to the list on narrow screens so the user is not
  // left on a chat that no longer exists; also repoint a saved last-chat that
  // pointed at the removed direct so it does not dangle on the next open.
  function removeDirect(address: string) {
    const accountAddress = account?.address ?? null;
    const generalChat = groups.value.find((group) => isGeneralChatGroup(group)) ?? null;

    if (accountAddress) {
      const stored = readPersistedDirectsForNetwork('qortium', accountAddress);
      const next = stored.filter((direct) => direct.address !== address);

      if (next.length !== stored.length) {
        writePersistedDirectsForNetwork('qortium', accountAddress, next);
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

    if (selectedChat?.kind === 'direct' && selectedChat.network !== 'qortal' && selectedChat.direct.address === address) {
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

  // Qortal counterpart of removeDirect — mirrors it against the Qortal
  // persisted-directs key/account/selection instead of the Qortium ones.
  function removeQortalDirect(address: string) {
    const accountAddress = qortalAccount?.address ?? null;
    const generalChat = groups.value.find((group) => isGeneralChatGroup(group)) ?? null;

    if (accountAddress) {
      const stored = readPersistedDirectsForNetwork('qortal', accountAddress);
      const next = stored.filter((direct) => direct.address !== address);

      if (next.length !== stored.length) {
        writePersistedDirectsForNetwork('qortal', accountAddress, next);
      }

      if (currentQortalAccountAddressRef.current === accountAddress) {
        setQortalPersistedDirects(next);
      }
      // No repoint-the-dangling-saved-chat step here (unlike removeDirect):
      // Qortal has no General Chat equivalent to repoint a stale saved
      // selection to. Worst case, the next restore resolves to this now-gone
      // direct, which simply renders empty until removed again — harmless.
    } else {
      setQortalPersistedDirects((current) => current.filter((direct) => direct.address !== address));
    }

    if (selectedChat?.kind === 'direct' && selectedChat.network === 'qortal' && selectedChat.direct.address === address) {
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

  function toggleQortalDirectSearch() {
    if (isQortalDirectFormVisible) {
      setQortalDirectSearchOpen(false);
      setQortalDirectAddress('');
      return;
    }

    setQortalDirectCollapsed(false);
    setQortalDirectSearchOpen(true);
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

  async function openDirectFromAccount(address: string, name: string | null, network: ChatNetwork = 'qortium') {
    const canOpen = network === 'qortal' ? canOpenQortalDirectChat : canOpenDirectChat;

    if (!canOpen) {
      return;
    }

    if (!(await ensureSelectedAccountUnlocked())) {
      return;
    }

    setAccountInfoTarget(null);
    selectDirect({ address, name: name ?? undefined }, network);
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
        const ownerAddress = await getNameOwnerAddressForNetwork('qortium', value, actions);

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
    selectDirect(direct, 'qortium');
  }

  // Qortal counterpart of handleOpenDirectChat, scoped to the Qortal Direct
  // panel's own open-by-name form/state (qortalDirectAddress etc.). Name
  // resolution goes through the Qortal bridge (GET_NAME_DATA when advertised,
  // else FETCH_NODE_API against the Qortal node — see
  // getNameOwnerAddressForNetwork).
  async function handleOpenQortalDirectChat(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = qortalDirectAddress.trim();

    if (!value || !canOpenQortalDirectChat || qortalDirectLookupPending) {
      return;
    }

    if (!(await ensureSelectedAccountUnlocked())) {
      return;
    }

    setWriteError('');
    setQortalDirectLookupError('');

    let address = value;
    let name: string | undefined;

    if (!isPlausibleQortiumAddress(value)) {
      setQortalDirectLookupPending(true);

      try {
        const ownerAddress = await getNameOwnerAddressForNetwork('qortal', value, qortalBridge.value.actions);

        if (!ownerAddress) {
          setQortalDirectLookupError(t('status.direct.nameNotFound'));
          return;
        }

        address = ownerAddress;
        name = value;
      } catch (error) {
        setQortalDirectLookupError(getBridgeErrorMessage(error, t('status.loadingError.nameLookup'), t));
        return;
      } finally {
        setQortalDirectLookupPending(false);
      }
    }

    setQortalDirectAddress('');
    setQortalDirectSearchOpen(false);
    const direct: ActiveDirectChat = name ? { address, name } : { address };
    selectDirect(direct, 'qortal');
  }

  async function connectSelectedAccount(actionList = actions) {
    const requestId = qortiumAccountRefreshGuardRef.current.begin();
    const generalOnly = withGeneralChatGroup(emptyGroups, '', t);

    // Selected-account notifications are a write boundary. Disable composers
    // immediately while Home resolves the new tab account, and invalidate any
    // active-chat request that still belongs to the previous account.
    accountRefreshGenerationRef.current += 1;
    accountRefreshPendingRef.current = true;
    setAccountRefreshPending(true);
    qortiumActiveChatsRequestGuardRef.current.begin();
    groupDiscoveryRequestRef.current += 1;
    setGroupDiscoveries(createState([]));
    setMemberGroups({ phase: 'loading', value: emptyGroups });
    setGroups({ phase: 'loading', value: generalOnly });

    try {
      const selectedAccount = normalizeSelectedAccount(
        await qdnRequest<QdnSelectedAccount>({ action: 'GET_SELECTED_ACCOUNT' }),
      );

      if (!qortiumAccountRefreshGuardRef.current.isLatest(requestId)) {
        return null;
      }

      currentAccountAddressRef.current = selectedAccount.address;
      completeDeferredQortalUiStorage(selectedAccount.address);
      setAccount(selectedAccount);
      setAccountError('');
      void loadAccountData(selectedAccount, actionList, {
        isCurrent: () => qortiumAccountRefreshGuardRef.current.isLatest(requestId),
      });
      return selectedAccount;
    } catch (error) {
      if (!qortiumAccountRefreshGuardRef.current.isLatest(requestId)) {
        return null;
      }

      currentAccountAddressRef.current = null;
      // A failed/denied Qortium lookup supplies no safe legacy owner hint. Let
      // the independent Qortal identity persist new UI state, but keep its
      // migration marker pending so a later successful Qortium share can merge
      // legacy state rather than treating these interim records as authoritative.
      releaseDeferredQortalUiPersistence();
      setAccount(null);
      setAccountError(getBridgeErrorMessage(error, t('status.loadingError.selectedAccount'), t));
      setMemberGroups({ phase: 'ready', value: emptyGroups });
      setGroups({ phase: 'ready', value: generalOnly });
      setAccountJoinRequests({ phase: 'ready', value: emptyJoinRequests });
      setAdminJoinRequests({ phase: 'ready', value: emptyAdminJoinRequests });
      setActiveChats({ phase: 'ready', value: emptyActiveChats });
      setMintingStatus({ phase: 'ready', value: null });
      return null;
    } finally {
      if (qortiumAccountRefreshGuardRef.current.isLatest(requestId)) {
        accountRefreshPendingRef.current = false;
        setAccountRefreshPending(false);
      }
    }
  }

  // A live foreground SHOW_NOTIFICATION call is best-effort and never throws
  // (see notifications.ts), but a `revoked`/`disabled` result is a signal
  // worth reflecting: Home is telling Chat its one durable app permission is
  // gone, so re-registering forever would just keep silently failing. This
  // mirrors the exact reaction the legacy reconcileChatNotifications effect
  // already has to a denied permission — turn every preference off locally so
  // the bell UI stops claiming notifications are on.
  function reflectRevokedChatNotificationPermission(result: ShowChatNotificationResult) {
    if (result.shown || (result.reason !== 'revoked' && result.reason !== 'disabled')) {
      return;
    }

    const disabledPreferences: ChatNotificationPreferences = { ...DISABLED_CHAT_NOTIFICATION_PREFERENCES };

    chatNotificationsDesiredRef.current = disabledPreferences;
    writeChatNotificationPreferences(disabledPreferences);
    setChatNotificationPreferences(disabledPreferences);
  }

  async function updateChatNotificationPreference(
    key: Exclude<keyof ChatNotificationPreferences, 'version'>,
    enabled: boolean,
  ) {
    if (!account || !canControlChatNotifications || chatNotificationsBusy) {
      return;
    }

    setChatNotificationsBusy(true);
    setChatNotificationsError('');
    const previousPreferences = chatNotificationPreferences;
    const nextPreferences = { ...previousPreferences, [key]: enabled };
    chatNotificationsDesiredRef.current = nextPreferences;

    try {
      const operation = chatNotificationOperationRef.current.then(async () => {
        // Legacy hosts (NOTIFICATION_ADD/REMOVE advertised) keep registering
        // the durable background rule exactly as before. Home 2 has no such
        // rule — the stored preference alone is what the foreground sweeps
        // below read, so there is nothing to register here beyond priming the
        // one shared permission from this focused click.
        if (!canManageNotifications) {
          if (hasAnyChatNotificationsEnabled(nextPreferences)) {
            const granted = await hasNotificationPermission('qortium', actions);

            if (!granted) {
              await showChatNotification('qortium', {
                text: t('action.notifications.settings'),
                title: t('action.notifications.enable'),
              }, actions);
            }
          }
          return;
        }

        let directRuleRegistered = false;

        if (hasAnyChatNotificationsEnabled(nextPreferences)) {
          const granted = await hasNotificationPermission('qortium', actions);

          if (!granted) {
            if (nextPreferences.direct) {
              await enableDirectMessageNotifications(account.address, t('notification.direct.title'));
              directRuleRegistered = true;
            } else {
              // SHOW_NOTIFICATION uses the same durable Home grant. Because this
              // click occurs in the focused app, Home grants permission and then
              // suppresses the setup notification as already focused.
              await showChatNotification('qortium', {
                text: t('action.notifications.settings'),
                title: t('action.notifications.enable'),
              }, actions);
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

    if (
      selectedChat?.kind === 'group' &&
      selectedChat.network !== 'qortal' &&
      selectedChat.group.groupId === transaction.groupId
    ) {
      await loadGroupMembers(selectedChat.group);
    }

    if (
      selectedChat?.network !== 'qortal' &&
      transaction.action === 'groupApproval' &&
      selectedGroupId === transaction.groupId
    ) {
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
      selectDirect(
        { address: pending.target.address },
        targetNetwork,
        { historyMode: pending.historyMode },
      );
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

  useEffect(() => {
    if (isQortalDirectFormVisible) {
      qortalDirectSearchInputRef.current?.focus();
    }
  }, [isQortalDirectFormVisible]);

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

      const result = next ?? current;

      lastReadByQortalGroupIdRef.current = result;
      return result;
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

      if (selectedChat?.kind === 'group' && selfAddress) {
        const attentionNetwork = selectedChat.network ?? 'qortium';
        const attentionActions = getNetworkActions(attentionNetwork);

        if (canShowChatNotifications(attentionActions)) {
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
            void showChatNotification(attentionNetwork, {
              source: { conversation: { groupId: selectedChat.group.groupId, kind: 'group' }, kind: 'chat' },
              text: getMessageSnippet(newest, t),
              title,
            }, attentionActions)
              .then(reflectRevokedChatNotificationPermission)
              .catch(() => {
                // A transient live notification failure should not interrupt
                // the chat stream — showChatNotification already resolves
                // quietly for everything it can predict.
              });
          }
        }
      }
    }

    lastAnnouncedRef.current = { chatKey: messagesChatKey, signature };
  }, [
    actionsKey,
    chatNotificationPreferences.mentions,
    chatNotificationPreferences.replies,
    messages,
    messagesChatKey,
    olderMessages,
    qortalActionsKey,
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

  useEffect(() => {
    setLastReadByQortalAddress((current) => {
      let next: Map<string, number> | null = null;

      for (const [address, timestamp] of qortalDirectActivityByAddress) {
        if (!current.has(address)) {
          next ??= new Map(current);
          next.set(address, timestamp);
        }
      }

      const result = next ?? current;

      lastReadByQortalAddressRef.current = result;
      return result;
    });
  }, [qortalDirectActivityByAddress]);

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
        if (isQortal) {
          setLastReadByQortalGroupId((current) => {
            const next = (current.get(groupId) ?? -1) >= timestamp
              ? current
              : new Map(current).set(groupId, timestamp);

            lastReadByQortalGroupIdRef.current = next;
            return next;
          });
        } else {
          setLastReadByGroupId((current) =>
            (current.get(groupId) ?? -1) >= timestamp ? current : new Map(current).set(groupId, timestamp),
          );
        }
      }
    } else {
      const address = selectedChat.direct.address;
      const isQortal = selectedChat.network === 'qortal';
      const timestamp = isQortal
        ? qortalDirectActivityByAddress.get(address)
        : directActivityByAddress.get(address);

      if (typeof timestamp === 'number') {
        if (isQortal) {
          setLastReadByQortalAddress((current) => {
            const next = (current.get(address) ?? -1) >= timestamp
              ? current
              : new Map(current).set(address, timestamp);

            lastReadByQortalAddressRef.current = next;
            return next;
          });
        } else {
          setLastReadByAddress((current) =>
            (current.get(address) ?? -1) >= timestamp ? current : new Map(current).set(address, timestamp),
          );
        }
      }
    }
  }, [
    selectedChat,
    hasSelectedMessages,
    messages.value,
    groupActivityById,
    qortalGroupActivityByIdDisplay,
    directActivityByAddress,
    qortalDirectActivityByAddress,
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

  useEffect(() => {
    lastReadByQortalAddressRef.current = lastReadByQortalAddress;
  }, [lastReadByQortalAddress]);

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
        : selectedChat.network === 'qortal'
          ? lastReadByQortalAddressRef.current.get(selectedChat.direct.address)
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

  useEffect(() => {
    loadedQortalDirectActivityRef.current = qortalLoadedDirectActivityByAddress;
  }, [qortalLoadedDirectActivityByAddress]);

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
    // Qortium and Qortal identities can refresh independently. Reset only the
    // Qortium side here; refreshQortalSelectedAccount compares and owns the
    // Qortal reset. That lets an unchanged Qortal session survive a Qortium-
    // only identity change without exposing either account's Qortium data.
    const selectedChatIsQortal = selectedChatKeyRef.current.startsWith('qortal:');
    const accountAddress = account?.address ?? null;

    if (!selectedChatIsQortal) {
      messagesChatKeyRef.current = '';
      setMessagesChatKey('');
      setMessages({ phase: 'ready', value: emptyMessages });
      setOlderMessages(emptyMessages);
      setOlderMessagesState({ error: '', loading: false, reachedStart: true });
      loadingOlderRef.current = false;
      setLiveAnnouncement('');
      lastAnnouncedRef.current = { chatKey: '', signature: '' };
      setUnreadDividerTimestamp(null);
      setUnreadDividerCeiling(null);
      setWriteError('');
    }

    updatePendingSends((current) =>
      retainPendingForNetworkAccount(current, 'qortium', accountAddress),
    );
    updatePendingRevisions((current) =>
      retainPendingForNetworkAccount(current, 'qortium', accountAddress),
    );
    updateReactionPendingOperations((current) => {
      const next = new Set([...current].filter((key) => key.startsWith('qortal:')));

      return next.size === current.size ? current : next;
    });
    setActiveChats(createState(emptyActiveChats));
    setAccountJoinRequests(createState(emptyJoinRequests));
    setAdminJoinRequests(createState(emptyAdminJoinRequests));
    setGroupInvites(createState(emptyInvites));
    setPendingApprovals(createState(emptyPendingApprovals));
    setApprovalVotes(createState(emptyApprovalVotes));
    setTrackedTransactions({});
    setLoadedDirectActivityByAddress(new Map());
    // Item D / P6b: mirrors clearQortalAccountSessionState's Qortal-side
    // reset — the Qortium pending-transaction journal is account-scoped too.
    journalRequestGuardRef.current.begin();
    setJournalEntries(emptyJournalEntries);
    // P6b target 3: drop every Qortium-network GET_PRIVATE_GROUP_CHAT_STATE
    // snapshot (isMember, keys, rotationRequired are account-relative) so a
    // stale membership/key snapshot from the previous account can never
    // render for the new one, even transiently.
    setPrivateGroupChatStateByKey((current) => clearNetworkKeyedEntries(current, 'qortium'));
    // Restore this account's read watermarks so unread state survives reloads;
    // unseen groups/directs still get baselined to "read" by the effects below.
    const watermarks = account ? readReadWatermarks(account.address) : null;
    skipQortiumWatermarkPersistRef.current = true;
    setLastReadByGroupId(watermarks?.groups ?? new Map());
    setLastReadByAddress(watermarks?.directs ?? new Map());
    // Land any debounced bookmark write for the previous account before its map
    // is replaced below (the flush writes under the address captured when the
    // scroll happened, so this cannot leak across accounts).
    flushScrollBookmarks();
    // Restore this account's saved scroll bookmarks so reading positions survive
    // restarts; the in-memory view cache is per-session and starts empty.
    const nextScrollPositions = account ? readScrollBookmarks(account.address) : new Map<string, ChatScrollPosition>();

    for (const [key, position] of scrollPositionsRef.current) {
      if (key.startsWith('qortal:')) {
        nextScrollPositions.set(key, position);
      }
    }

    scrollPositionsRef.current = nextScrollPositions;
    for (const key of chatViewCacheRef.current.keys()) {
      if (!key.startsWith('qortal:')) {
        chatViewCacheRef.current.delete(key);
      }
    }
    if (!loadedChatKeyRef.current.startsWith('qortal:')) {
      loadedChatKeyRef.current = '';
    }
    requestedPrivateGroupKeysRef.current.clear();
    resolvedPrivateGroupKeyRequestsRef.current.clear();
    for (const key of draftsByChatKeyRef.current.keys()) {
      if (!key.startsWith('qortal:')) {
        draftsByChatKeyRef.current.delete(key);
      }
    }
    if (!selectedChatIsQortal) {
      draftChatKeyRef.current = selectedChatKeyRef.current;
      setDraft('');
      setComposeContext(null);
      setStagedAttachment(null);
      setAttachmentError('');
    }
    setPrivateGroupKeyStatus('');
    setPrivateGroupKeyError('');
    setDirectLookupError('');
    // Preserve an active Qortal selection; otherwise restore the new Qortium
    // account's saved chat in the normal effect below.
    userSelectedChatRef.current = selectedChatIsQortal;
  }, [account?.address]);

  // P6b target 2: the reset effect above clears a staged attachment on a
  // Qortium account SWITCH (address change), and clearQortalAccountSessionState
  // mirrors that for Qortal — but LOCKING the very same account (address
  // unchanged, only account.isUnlocked flipping) fires neither, so a token
  // staged before the lock would otherwise survive and fail confusingly at
  // publish time. Reuse the same "expired, reselect" notice the reactive
  // publish-time expiry check already shows for the equivalent stale-token
  // case. Qortal accounts carry no lock state in this app (qortalAccount has
  // no isUnlocked field — see types.ts), so this only needs to watch the
  // Qortium side.
  useEffect(() => {
    if (
      !shouldClearStagedAttachmentOnAccountLock({
        hasStagedAttachment: !!stagedAttachment,
        isAccountUnlocked,
        selectedChatIsQortal: selectedChatKeyRef.current.startsWith('qortal:'),
      })
    ) {
      return;
    }

    setStagedAttachment(null);
    setAttachmentError(t('status.attachment.reselect'));
  }, [isAccountUnlocked]);

  // Persist each chain's read state under that chain's selected identity. The
  // skip refs protect the transitional render after an identity-specific load.
  useEffect(() => {
    if (!account) {
      return;
    }

    if (skipQortiumWatermarkPersistRef.current) {
      skipQortiumWatermarkPersistRef.current = false;
      return;
    }

    writeReadWatermarks(account.address, {
      directs: lastReadByAddress,
      groups: lastReadByGroupId,
    });
  }, [account, lastReadByGroupId, lastReadByAddress]);

  useEffect(() => {
    if (!qortalAccount) {
      return;
    }

    if (skipQortalWatermarkPersistRef.current) {
      skipQortalWatermarkPersistRef.current = false;
      return;
    }

    if (qortalUiPersistenceBlockedAddressRef.current === qortalAccount.address) {
      return;
    }

    writeQortalReadWatermarks(qortalAccount.address, lastReadByQortalGroupId);
  }, [qortalAccount, lastReadByQortalGroupId]);

  // Qortal direct read watermarks have no legacy record to protect (brand new
  // key — see qortalDirectReadWatermarksStorageKey), so this skips the
  // qortalUiPersistenceBlockedAddressRef check the group effect above needs.
  useEffect(() => {
    if (!qortalAccount) {
      return;
    }

    if (skipQortalDirectWatermarkPersistRef.current) {
      skipQortalDirectWatermarkPersistRef.current = false;
      return;
    }

    writeQortalDirectReadWatermarks(qortalAccount.address, lastReadByQortalAddress);
  }, [qortalAccount, lastReadByQortalAddress]);

  // Load this account's persisted direct chats from storage.
  useEffect(() => {
    setPersistedDirects(account ? readPersistedDirectsForNetwork('qortium', account.address) : []);
  }, [account?.address]);

  // Qortal counterpart. Restored on the Qortal account itself (mirrors
  // qortalMemberGroups etc.) rather than the account-change effect above,
  // since Qortal DM has no legacy migration to coordinate with.
  useEffect(() => {
    setQortalPersistedDirects(qortalAccount ? readPersistedDirectsForNetwork('qortal', qortalAccount.address) : []);
  }, [qortalAccount?.address]);

  // Reopen from the preferred chain's identity-specific record. Wait for the
  // Qortal identity when that chain was last used; never derive its saved group
  // from whichever Qortium identity happened to load first.
  useEffect(() => {
    if (!account) {
      return;
    }

    const restoreKey = `${account.address}\0${qortalAccount?.address ?? ''}`;

    if (restoredForAccountRef.current === restoreKey) {
      return;
    }

    if (userSelectedChatRef.current) {
      restoredForAccountRef.current = restoreKey;
      return;
    }

    const preferredNetwork = readLastChatNetwork(account.address) ?? 'qortium';

    if (preferredNetwork === 'qortal') {
      if (qortalBridge.phase === 'idle' || qortalBridge.phase === 'loading' || !qortalAccount) {
        return;
      }
    }

    const saved = preferredNetwork === 'qortal'
      ? readQortalLastChat(qortalAccount!.address, account.address)
      : readLastChat(account.address);

    restoredForAccountRef.current = restoreKey;

    if (saved?.kind === 'direct') {
      selectDirect(saved.direct, saved.network, {
        historyMode: 'replace',
        remember: false,
        showConversation: false,
        userInitiated: false,
      });
      return;
    }

    if (saved?.kind === 'group') {
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
  }, [account?.address, qortalAccount?.address, qortalAvailable, qortalBridge.phase]);

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

      // The open Qortium group has its own live socket; a Qortal group with the
      // same numeric id is a different conversation and must not suppress this
      // chain's activity refresh.
      const openChatKey = selectedChatKeyRef.current;

      try {
        for (const group of groups.value) {
          if (isDisposed) {
            return;
          }

          if (openChatKey === getSelectedChatKey({ group, kind: 'group' })) {
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

          // Captured before the skip check below can short-circuit this
          // iteration: "never hydrated before" (isInitialHydration) is
          // exactly the negation of the same has-check the skip-logic uses,
          // so the two can never disagree. Reusing it here is the
          // correctness point for foreground direct-activity notifications —
          // pre-existing history hydrated for the first time must never
          // notify, only activity strictly newer than what was already known.
          const isInitialHydration = !loadedDirectActivityRef.current.has(direct.address);
          const sinceTimestamp = loadedDirectActivityRef.current.get(direct.address) ?? null;

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

            // Home 2 only: legacy hosts already get direct notifications from
            // their own durable NOTIFICATION_ADD rule (Core-evaluated,
            // independent of this sweep) — firing here too would double them
            // up. On Home 2 there is no such rule, so this bounded foreground
            // sweep is direct activity's only notification source.
            if (canShowNotifications && !canManageNotifications && account?.address) {
              const notifiable = selectDirectActivityNotification({
                isInitialHydration,
                messages: nextMessages,
                preferences: chatNotificationPreferences,
                selfAddress: account.address,
                sinceTimestamp,
              });

              if (notifiable) {
                void showChatNotification('qortium', {
                  source: { conversation: { kind: 'direct', otherAddress: direct.address }, kind: 'chat' },
                  text: getMessageSnippet(notifiable, t),
                  title: t('notification.direct.title'),
                }, actions)
                  .then(reflectRevokedChatNotificationPermission)
                  .catch(() => {
                    // Best-effort: a transient failure here should not disrupt
                    // the activity sweep itself.
                  });
              }
            }
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
  }, [
    account?.address,
    actionsKey,
    activeChats.value.direct,
    canManageNotifications,
    canReadPrivateDirectChat,
    canShowNotifications,
    chatNotificationPreferences.direct,
    isAccountUnlocked,
    t,
  ]);

  // Qortal counterpart of the direct activity sweep above — same rationale
  // (Qortal has no protocol-specific websocket route, so a direct chat not
  // currently open has no other live signal), gated on the Qortal direct
  // read gate/actions instead of the Qortium ones.
  useEffect(() => {
    const directs = qortalActiveChats.value.direct ?? [];

    if (!isAccountUnlocked || !canReadQortalPrivateDirectChat || directs.length === 0) {
      return undefined;
    }

    let isDisposed = false;
    let isHydrating = false;

    async function hydrateQortalDirectActivity(refresh: boolean) {
      if (isHydrating) {
        return;
      }

      isHydrating = true;

      const openDirectAddress = selectedQortalDirectAddressRef.current;
      const qortalActionList = qortalBridge.value.actions;

      try {
        for (const direct of directs) {
          if (isDisposed) {
            return;
          }

          if (direct.address === openDirectAddress) {
            continue;
          }

          if (!refresh && loadedQortalDirectActivityRef.current.has(direct.address)) {
            continue;
          }

          // See the Qortium sweep above for why this is captured before the
          // fetch: it is the exact same "never hydrated before" check the
          // skip-logic just used, and is what keeps pre-existing history from
          // ever being reported as new activity.
          const isInitialHydration = !loadedQortalDirectActivityRef.current.has(direct.address);
          const sinceTimestamp = loadedQortalDirectActivityRef.current.get(direct.address) ?? null;

          try {
            const nextMessages = await getDirectMessages(
              direct.address,
              qortalActionList,
              { limit: ACTIVITY_SWEEP_MESSAGE_LIMIT },
              'qortal',
            );

            if (isDisposed) {
              return;
            }

            setQortalLoadedDirectActivityByAddress((current) =>
              mergeActivityTimestamp(current, direct.address, nextMessages, {
                allowTombstone: nextMessages.length < ACTIVITY_SWEEP_MESSAGE_LIMIT,
              }),
            );

            // Qortal never had a legacy background rule at all (notifications.ts:
            // NOTIFICATION_ADD is a Qortium-only qdn action) — this bounded
            // foreground sweep is the only direct-activity notification source
            // Qortal chat has ever had, on any host tier.
            if (qortalAccount?.address && canShowChatNotifications(qortalActionList)) {
              const notifiable = selectDirectActivityNotification({
                isInitialHydration,
                messages: nextMessages,
                preferences: chatNotificationPreferences,
                selfAddress: qortalAccount.address,
                sinceTimestamp,
              });

              if (notifiable) {
                void showChatNotification('qortal', {
                  source: { conversation: { kind: 'direct', otherAddress: direct.address }, kind: 'chat' },
                  text: getMessageSnippet(notifiable, t),
                  title: t('notification.direct.title'),
                }, qortalActionList)
                  .then(reflectRevokedChatNotificationPermission)
                  .catch(() => {
                    // Best-effort: a transient failure here should not disrupt
                    // the activity sweep itself.
                  });
              }
            }
          } catch {
            // Direct history is optional in older Home/Core bridge contexts.
          }
        }
      } finally {
        isHydrating = false;
      }
    }

    void hydrateQortalDirectActivity(false);

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }

      void hydrateQortalDirectActivity(true);
    }, 30000);

    return () => {
      isDisposed = true;
      window.clearInterval(interval);
    };
  }, [
    qortalBridge.value.actions.join('\n'),
    qortalAccount?.address,
    qortalActiveChats.value.direct,
    canReadQortalPrivateDirectChat,
    chatNotificationPreferences.direct,
    isAccountUnlocked,
    t,
  ]);

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

  // Item D: once Qortium's bridge is ready and an account is connected, fetch
  // its pending-transaction journal once (gated on GET_PENDING_TRANSACTIONS
  // being advertised — see shouldFetchPendingJournal). Re-runs whenever the
  // advertised action set or the connected account changes, matching every
  // other per-network "bridge ready" effect in this file.
  useEffect(() => {
    if (
      !shouldFetchPendingJournal({
        accountAddress: account?.address ?? null,
        actions,
        bridgeReady: bridge.phase === 'ready',
      })
    ) {
      return;
    }

    void fetchPendingJournal('qortium');
  }, [account?.address, actionsKey, bridge.phase]);

  // Qortal counterpart — additionally gated on qortalAvailable (Home 1.7's
  // Qortal-prefixed catalogue never advertises the journal actions, so this
  // is effectively a no-op there; kept for symmetry with the other qortal*
  // gates in this file).
  useEffect(() => {
    if (
      !shouldFetchPendingJournal({
        accountAddress: qortalAccount?.address ?? null,
        actions: qortalBridge.value.actions,
        bridgeReady: qortalBridge.phase === 'ready',
        networkAvailable: qortalAvailable,
      })
    ) {
      return;
    }

    void fetchPendingJournal('qortal');
  }, [qortalAccount?.address, qortalAvailable, qortalBridge.phase, qortalBridge.value.actions.join('\n')]);

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
    const unreadCount =
      unreadGroupIds.size + unreadQortalGroupIds.size + unreadDirectAddresses.size + unreadQortalDirectAddresses.size;

    document.title = unreadCount > 0 ? `(${unreadCount}) ${t('app.title')}` : t('app.title');
  }, [
    displaySettings.language,
    t,
    unreadGroupIds,
    unreadQortalGroupIds,
    unreadDirectAddresses,
    unreadQortalDirectAddresses,
  ]);

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
    const sessionAccountAddress = account?.address ?? null;
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
      if (
        isDisposed ||
        selectedChatKeyRef.current !== chatKey ||
        currentAccountAddressRef.current !== sessionAccountAddress
      ) {
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
        if (
          isDisposed ||
          selectedChatKeyRef.current !== chatKey ||
          currentAccountAddressRef.current !== sessionAccountAddress
        ) {
          return;
        }

        try {
          const nextMessages = parseChatMessages(event.data);

          // A live frame proves the node is reachable; reset the backoff.
          reconnectDelay = WS_RECONNECT_BASE_MS;

          setLoadedGroupActivityById((current) => mergeActivityTimestamp(current, chat.group.groupId, nextMessages));

          reconcileJournalWithMessages('qortium', nextMessages);

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
    account?.address,
    qortalAccount?.address,
    actionsKey,
    qortalBridge.value.actions.join('\n'),
    isAccountUnlocked,
    selectedClosedGroupReadKey,
    bridge.value.transport,
  ]);

  // P3 item 2: GET_PRIVATE_GROUP_CHAT_STATE for the selected closed group.
  // Fetched alongside (not blocking) message reads, and refetched on
  // group/account/bridge change via the dependency list below. A fetch
  // failure degrades to "no extra signal" rather than an error banner — the
  // composer/notices that read this state already have their own fallback
  // (generic membership gates, no client-side cap) when it is null.
  useEffect(() => {
    if (!(selectedChat?.kind === 'group' && selectedChat.group.isOpen === false)) {
      return undefined;
    }

    const network = selectedChat.network ?? 'qortium';
    const groupId = selectedChat.group.groupId;
    const key = getPrivateGroupChatStateKey(network, groupId);
    const networkActions = getNetworkActions(network);

    if (!hasAction(networkActions, 'GET_PRIVATE_GROUP_CHAT_STATE')) {
      setPrivateGroupChatStateByKey((current) => {
        if (!current.has(key)) {
          return current;
        }

        const next = new Map(current);

        next.delete(key);
        return next;
      });
      return undefined;
    }

    const requestId = privateGroupChatStateRequestGuardRef.current.begin();

    setPrivateGroupChatStateByKey((current) => {
      const next = new Map(current);

      next.set(key, { phase: 'loading', value: current.get(key)?.value ?? null });
      return next;
    });

    let cancelled = false;

    void (async () => {
      try {
        const state = await getPrivateGroupChatState(network, groupId, networkActions);

        if (cancelled || !privateGroupChatStateRequestGuardRef.current.isLatest(requestId)) {
          return;
        }

        setPrivateGroupChatStateByKey((current) => {
          const next = new Map(current);

          next.set(key, { phase: 'ready', value: state });
          return next;
        });
      } catch (error) {
        if (cancelled || !privateGroupChatStateRequestGuardRef.current.isLatest(requestId)) {
          return;
        }

        setPrivateGroupChatStateByKey((current) => {
          const next = new Map(current);

          next.set(key, {
            error: getBridgeErrorMessage(error, t('status.loadingError.privateGroupState'), t),
            phase: 'error',
            value: current.get(key)?.value ?? null,
          });
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedChatKey,
    selectedChat?.kind === 'group' ? selectedChat.group.isOpen : undefined,
    account?.address,
    qortalAccount?.address,
    actionsKey,
    qortalBridge.value.actions.join('\n'),
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

    const accountAddress = account.address;
    const isCurrent = () => currentAccountAddressRef.current === accountAddress;
    const interval = window.setInterval(() => {
      void loadAccountJoinRequests(account, actions, { isCurrent, quiet: true });
      void loadAdminJoinRequests(account, actions, { isCurrent, quiet: true });
      void loadGroupInvites(account, { isCurrent, quiet: true });
    }, 30000);

    return () => window.clearInterval(interval);
  }, [account?.address, actionsKey]);

  // D6: mirrors the Qortium join-request/admin-request refresh interval
  // above, gated per-action on the Qortal bridge (see
  // canReadQortalAccountJoinRequests/canReadQortalAdminJoinRequests).
  useEffect(() => {
    if (!qortalAccount) {
      return undefined;
    }

    const qortalAddress = qortalAccount.address;
    const isCurrent = () => currentQortalAccountAddressRef.current === qortalAddress;
    const interval = window.setInterval(() => {
      if (canReadQortalAccountJoinRequests) {
        void loadQortalAccountJoinRequests(qortalAddress, qortalBridge.value.actions, { isCurrent, quiet: true });
      }

      if (canReadQortalAdminJoinRequests) {
        void loadQortalAdminJoinRequests(qortalAddress, qortalBridge.value.actions, { isCurrent, quiet: true });
      }
    }, 30000);

    return () => window.clearInterval(interval);
  }, [
    qortalAccount?.address,
    canReadQortalAccountJoinRequests,
    canReadQortalAdminJoinRequests,
    qortalBridge.value.actions.join('\n'),
  ]);

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
    if (isSelectedQortalGroup) {
      if (!(
        selectedGroupId !== null &&
        selectedGroupId > 0 &&
        qortalMemberGroups.phase === 'ready' &&
        !isConfirmedJoinedQortalGroup &&
        canJoinQortalGroup
      )) {
        return null;
      }

      return (
        <button
          className="button button--secondary"
          disabled={!canSubmitQortalJoin}
          onClick={() => void handleJoinQortalGroup()}
          title={
            hasPendingQortalJoinTransaction
              ? t('button.join.transaction.pending')
              : hasPendingQortalJoinRequest
                ? t('button.join.request.pending')
                : canUseQortalAccount && canJoinQortalGroup
                  ? t('button.join')
                  : groupJoinUnavailableLabel
          }
          type="button"
        >
          {joinPending
            ? t('button.joining')
            : hasPendingQortalJoinTransaction
              ? t('button.join.pending')
              : hasPendingQortalJoinRequest
                ? t('button.join.request.pending')
                : t('button.join')}
        </button>
      );
    }

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

  const selectedChatTitle = selectedChat
    ? selectedChat.kind === 'group'
      ? getGroupTitle(selectedChat.group, t)
      : getDirectTitle(selectedChat.direct)
    : t('label.chat.select');
  const selectedChatContextLabel =
    selectedChat?.kind === 'group'
      ? isGeneralChatGroup(selectedChat.group)
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
            : t('label.loading')
      : null;
  const selectedChatDescription =
    selectedChat?.kind === 'group'
      ? selectedChat.group.description?.trim() || null
      : selectedChat?.kind === 'direct'
        ? (selectedChat.network === 'qortal' ? canReadQortalPrivateDirectChat : canReadPrivateDirectChat)
          ? t('group.meta.directPrivateRead')
          : t('group.meta.direct')
        : null;
  const selectedDirectAvatar = selectedDirect
    ? getAvatarView(selectedAvatarProfiles.get(selectedDirect.address), selectedDirect.name)
    : null;
  const selectedChatAvatar = selectedGroup
    ? {
        fallback: getConversationInitials(selectedChatTitle),
        name: selectedChatTitle,
        src: selectedGroupAvatar?.avatarSrc ?? null,
      }
    : selectedDirect
      ? {
          fallback: getConversationInitials(selectedDirectAvatar?.name ?? selectedChatTitle),
          name: selectedDirectAvatar?.name ?? selectedChatTitle,
          src: selectedDirectAvatar?.avatarSrc ?? null,
        }
      : null;

  const layoutClassName = `layout${showGroupMembers && membersOpen ? ' layout--members-open' : ''}${
    mobileChatView ? ' layout--mobile-chat' : ''
  }`;

  const topbar = (
    <Topbar
      account={account}
      accountError={accountError}
      appVersion={APP_VERSION}
      canControlChatNotifications={canControlChatNotifications}
      canManageNotifications={canManageNotifications}
      canShowNotifications={canShowNotifications}
      chatNotificationPreferences={chatNotificationPreferences}
      chatNotificationSettingsRef={chatNotificationSettingsRef}
      chatNotificationsBusy={chatNotificationsBusy}
      chatNotificationsEnabled={chatNotificationsEnabled}
      chatNotificationsError={chatNotificationsError}
      chatNotificationToggleRef={chatNotificationToggleRef}
      isChatNotificationMenuOpen={isChatNotificationMenuOpen}
      isGateway={bridge.value.transport === 'gateway'}
      isHomeBridge={bridge.value.isHomeBridge}
      isHomeV2AppTab={homeV2AppTab}
      onOpenAvatar={setAvatarLightboxImage}
      onRequestAccountRefresh={requestSelectedAccountRefresh}
      qortiumAvatarProfiles={qortiumAvatarProfiles}
      setChatNotificationMenuOpen={setChatNotificationMenuOpen}
      t={t}
      updateChatNotificationPreference={updateChatNotificationPreference}
    />
  );

  const dialogs = (
    <>
      {accountInfoTarget ? (
        <AccountInfoDialog
          canMention={canComposeMessage}
          canOpenDirect={accountInfoTarget.network === 'qortal' ? canOpenQortalDirectChat : canOpenDirectChat}
          directUnavailableLabel={
            accountInfoTarget.network === 'qortal' ? qortalDirectAccessUnavailableLabel : directAccessUnavailableLabel
          }
          onClose={() => setAccountInfoTarget(null)}
          onMention={() => mentionAccount(accountInfoTarget)}
          onOpenAvatar={(image) => {
            setAccountInfoTarget(null);
            setAvatarLightboxImage(image);
          }}
          onOpenDirect={(address, name) => void openDirectFromAccount(address, name, accountInfoTarget.network)}
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
    </>
  );

  return (
    <AppShell dialogs={dialogs} isHomeV2AppTab={homeV2AppTab} layoutClassName={layoutClassName} topbar={topbar}>
        <SidebarPane ariaLabel={t('aria.navigation')} inert={isMembersOverlay}>
          <ConversationNetworkSection network="qortium" showHeader={qortalAvailable}>
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
          </ConversationNetworkSection>

          {qortalAvailable ? (
            <ConversationNetworkSection network="qortal">
              <section className={`panel${isQortalDirectCollapsed ? ' panel--collapsed' : ''}`}>
                <div className="panel__header">
                  <button
                    aria-expanded={!isQortalDirectCollapsed}
                    className="panel__toggle"
                    onClick={() => setQortalDirectCollapsed((collapsed) => !collapsed)}
                    type="button"
                  >
                    <DownIcon />
                    <h2>{t('label.common.direct')}</h2>
                  </button>
                  <div className="panel__header-actions">
                    {hasUnreadQortalDirect ? (
                      <span
                        aria-label={t('aria.unreadDirect')}
                        className="panel__unread-dot"
                        role="img"
                        title={t('aria.unreadDirect')}
                      />
                    ) : null}
                    <span className="panel__count">{qortalMergedDirects.length}</span>
                    <button
                      aria-expanded={isQortalDirectFormVisible}
                      aria-label={t('label.newDirectChat')}
                      className="icon-button"
                      onClick={toggleQortalDirectSearch}
                      title={t('label.newDirectChat')}
                      type="button"
                    >
                      <PlusIcon />
                    </button>
                  </div>
                </div>
                {!isQortalDirectCollapsed && isQortalDirectFormVisible ? (
                  <form className="search" onSubmit={handleOpenQortalDirectChat}>
                    <input
                      aria-label={t('placeholder.directNameOrAddress')}
                      disabled={!canOpenQortalDirectChat || qortalDirectLookupPending}
                      onChange={(event) => {
                        setQortalDirectAddress(event.target.value);
                        setQortalDirectLookupError('');
                      }}
                      placeholder={t('placeholder.directNameOrAddress')}
                      ref={qortalDirectSearchInputRef}
                      value={qortalDirectAddress}
                    />
                    <button
                      className="button"
                      disabled={!canOpenQortalDirectChat || !qortalDirectAddress.trim() || qortalDirectLookupPending}
                      title={canOpenQortalDirectChat ? t('action.directTooltip') : qortalDirectAccessUnavailableLabel}
                      type="submit"
                    >
                      {qortalDirectLookupPending ? t('button.opening') : t('button.open')}
                    </button>
                  </form>
                ) : null}
                {!isQortalDirectCollapsed && qortalDirectLookupError ? (
                  <p className="error">{qortalDirectLookupError}</p>
                ) : null}
                {!isQortalDirectCollapsed && qortalActiveChats.phase === 'error' ? (
                  <p className="error">{qortalActiveChats.error}</p>
                ) : null}
                {!isQortalDirectCollapsed && !canOpenQortalDirectChat ? (
                  <p className="muted">{qortalDirectAccessUnavailableLabel}</p>
                ) : null}
                {!isQortalDirectCollapsed && canOpenQortalDirectChat && !canLoadQortalPrivateDirectChats ? (
                  <p className="muted">{directListUnavailableLabel}</p>
                ) : null}
                {qortalActiveChats.phase === 'loading' && !isQortalDirectCollapsed ? (
                  <LoadingRows count={3} label={t('label.loading')} />
                ) : (
                  <DirectList
                    activityByAddress={qortalDirectActivityByAddress}
                    avatarProfiles={qortalAvatarProfiles}
                    canOpen={canOpenQortalDirectChat}
                    collapsed={isQortalDirectCollapsed}
                    directs={qortalMergedDirects}
                    onRemove={handleRemoveQortalDirect}
                    onSelect={handleSelectQortalDirect}
                    previewByAddress={qortalDirectPreviewByAddress}
                    removableAddresses={qortalRemovableDirectAddresses}
                    selectedAddress={selectedQortalDirectAddress}
                    t={t}
                    unreadAddresses={unreadQortalDirectAddresses}
                    now={now}
                  />
                )}
              </section>
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
            </ConversationNetworkSection>
          ) : null}
        </SidebarPane>

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
          <ChatPaneHeader
            actionHint={topActionUnavailableLabel}
            actions={
              <>
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
              {selectedChat?.kind === 'direct' &&
              selectedQortalDirectAddress !== null &&
              qortalRemovableDirectAddresses.has(selectedQortalDirectAddress) ? (
                <button
                  className="button button--secondary"
                  onClick={() => removeQortalDirect(selectedQortalDirectAddress)}
                  title={t('action.removeDirectChat', { name: getDirectTitle(selectedChat.direct) })}
                  type="button"
                >
                  {t('button.removeChat')}
                </button>
              ) : null}
              {renderJoinGroupButton()}
              {selectedChat?.kind === 'group' &&
              selectedGroupId !== null &&
              selectedGroupId > 0 &&
              (isSelectedQortalGroup
                ? isConfirmedJoinedQortalGroup && canLeaveQortalGroup
                : isConfirmedJoinedGroup && canLeaveGroup) ? (
                <button
                  className="button button--secondary"
                  disabled={isSelectedQortalGroup ? !canSubmitQortalLeave : !canSubmitLeave}
                  onClick={() => void (isSelectedQortalGroup ? handleLeaveQortalGroup() : handleLeaveGroup())}
                  title={
                    isSelectedQortalGroup
                      ? hasPendingQortalLeaveTransaction
                        ? t('button.leave.transaction.pending')
                        : canUseQortalAccount && canLeaveQortalGroup
                          ? t('button.leave')
                          : groupLeaveUnavailableLabel
                      : hasPendingLeaveTransaction
                        ? t('button.leave.transaction.pending')
                        : canUseSelectedAccount && canLeaveGroup
                          ? t('button.leave')
                          : groupLeaveUnavailableLabel
                  }
                  type="button"
                >
                  {leavePending
                    ? t('button.leaving')
                    : (isSelectedQortalGroup ? hasPendingQortalLeaveTransaction : hasPendingLeaveTransaction)
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
              </>
            }
            avatar={selectedChatAvatar}
            backLabel={t('button.back')}
            closedLabel={t('label.group.closed')}
            contextLabel={selectedChatContextLabel}
            description={selectedChatDescription}
            isClosed={
              selectedChat?.kind === 'group' &&
              !isGeneralChatGroup(selectedChat.group) &&
              selectedChat.group.isOpen === false
            }
            network={selectedChat?.network ?? (selectedChat ? 'qortium' : undefined)}
            onBack={showChatList}
            onOpenAvatar={setAvatarLightboxImage}
            openAvatarLabel={t('action.openAvatarImage')}
            title={selectedChatTitle}
          />

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
              {selectedQortalPrivateGroupRotationNotice ? (
                <p className="muted">{t('hint.privateGroupRotationRequired')}</p>
              ) : null}
              {isSelectedQortalGroup &&
              selectedChat.group.isOpen === false &&
              canUseQortalAccount &&
              hasAction(qortalBridge.value.actions, 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS') ? (
                <button
                  className="button button--secondary"
                  disabled={qortalPrivateGroupResolvePending}
                  onClick={() => void handleQortalPublishGroupKey(selectedChat.group)}
                  type="button"
                >
                  {qortalPrivateGroupResolvePending
                    ? t('status.privateGroupKey.publishing')
                    : t('button.privateGroup.publishKey')}
                </button>
              ) : null}
              {accountJoinRequests.phase === 'error' ? <p className="error">{accountJoinRequests.error}</p> : null}
              {adminJoinRequests.phase === 'error' ? <p className="error">{adminJoinRequests.error}</p> : null}
              {qortalAccountJoinRequests.phase === 'error' ? (
                <p className="error">{qortalAccountJoinRequests.error}</p>
              ) : null}
              {qortalAdminJoinRequests.phase === 'error' ? (
                <p className="error">{qortalAdminJoinRequests.error}</p>
              ) : null}
              {showMintingControls && mintingStatus.phase === 'error' ? <p className="error">{mintingStatus.error}</p> : null}
              {showApprovalControls && pendingApprovals.phase === 'error' ? (
                <p className="error">{pendingApprovals.error}</p>
              ) : null}
              {selectedDirectHistoryUnavailable ? (
                <p className="muted">
                  {selectedChat?.network === 'qortal' ? qortalDirectReadUnavailableLabel : directReadUnavailableLabel}
                </p>
              ) : null}
              {selectedClosedGroupHistoryUnavailable ? (
                <p className="muted">{closedGroupHistoryUnavailableLabel}</p>
              ) : null}
              {hasSelectedChatJournalNotice ? <p className="muted">{t('status.bridge.pendingJournalNotice')}</p> : null}
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
                canRevise={
                  canComposeMessage &&
                  (selectedChat?.kind === 'direct'
                    ? selectedChat.network === 'qortal'
                      ? canReviseQortalDirectChat
                      : canReviseDirectChat
                    : true)
                }
                emptyHint={isSelectedGeneralChat ? t('hint.noMessages.general') : undefined}
                initialScrollPosition={scrollPositionsRef.current.get(selectedChatKey)}
                messages={displayMessages}
                network={selectedChat?.network ?? 'qortium'}
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
                pendingReactionKeys={selectedReactionPendingKeys}
                pendingRevisionBySignature={pendingRevisionBySignature}
                pendingSendByLocalId={pendingSendByLocalId}
                qortalResourceActions={qortalBridge.value.actions}
                qortiumResourceActions={actions}
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
          ) : showGroupComposerNotice ? (
            <div aria-live="polite" className="composer composer--notice">
              <div>
                <p>{groupComposerNotice}</p>
                <p>{t('hint.groupApprovalDelay')}</p>
              </div>
              {isSelectedGroupMembershipConfirmed ? renderJoinGroupButton() : null}
            </div>
          ) : showQortalGroupComposerNotice ? (
            <div aria-live="polite" className="composer composer--notice">
              <div>
                <p>{qortalGroupComposerNotice}</p>
                <p>{t('hint.groupApprovalDelay')}</p>
              </div>
              {qortalMemberGroups.phase === 'ready' ? renderJoinGroupButton() : null}
            </div>
          ) : !canComposeMessage ? (
            <div aria-live="polite" className="composer composer--notice">
              <p>
                {selectedChat.kind === 'direct'
                  ? selectedChat.network === 'qortal'
                    ? qortalDirectSendUnavailableLabel
                    : directSendUnavailableLabel
                  : isSelectedQortalGroup
                    ? qortalGroupSendUnavailableLabel
                    : groupSendUnavailableLabel}
              </p>
            </div>
          ) : (
            <ChatComposer
              attachLabel={t('label.composer.attach')}
              attachTitle={canAttach ? t('label.composer.attach') : t('action.attachUnavailable')}
              attachment={stagedAttachment}
              attachmentError={attachmentError}
              canAttach={canAttach}
              canCompose={canComposeMessage}
              canSubmit={canSubmitMessage}
              cancelLabel={t('button.cancel')}
              context={
                composeContext
                  ? {
                      label:
                        composeContext.kind === 'edit'
                          ? t('label.composer.editing')
                          : t('label.composer.replyingTo', {
                              name: getMessageSenderLabel(
                                composeContext.message,
                                selectedAvatarProfiles.get(composeContext.message.sender),
                              ),
                            }),
                      snippet: getMessageSnippet(
                        composeContext.kind === 'edit' ? composeContext.thread.latest : composeContext.message,
                        t,
                      ),
                    }
                  : null
              }
              draft={draft}
              emojiLabel={t('label.composer.emoji')}
              emojiOpen={isComposerEmojiOpen}
              loadingLabel={t('label.loading')}
              messageLabel={t('label.common.message')}
              messagePlaceholder={t('placeholder.message')}
              onAttachClick={attachFile}
              onCancelContext={cancelComposeContext}
              onClearAttachment={clearStagedAttachment}
              onDraftChange={setDraft}
              onEmojiSelected={insertComposerEmoji}
              onPaste={handleComposerPaste}
              onSubmit={(event) => void handleSendMessage(event)}
              onToggleEmoji={() => setComposerEmojiOpen((current) => !current)}
              selectingLabel={t('status.attachment.processing')}
              // P3 item 2a: a closed group's visible byte counter, reflecting
              // the per-chain plaintext cap; null for every other chat (open
              // group/direct), same as before this cap existed.
              remainingBytesLabel={
                typeof selectedGroupPrivatePlaintextMaxBytes === 'number'
                  ? t('label.composer.privateGroupBytesRemaining', {
                      max: String(selectedGroupPrivatePlaintextMaxBytes),
                      remaining: String(Math.max(0, selectedGroupPrivatePlaintextMaxBytes - draftByteLength)),
                    })
                  : null
              }
              remainingBytesOverLimit={
                typeof selectedGroupPrivatePlaintextMaxBytes === 'number' &&
                draftByteLength > selectedGroupPrivatePlaintextMaxBytes
              }
              removeAttachmentLabel={t('label.attachment.remove')}
              searchLabel={t('label.search')}
              sendLabel={t('button.send')}
              sendPending={sendPending}
              sendPendingLabel={t('button.sending')}
              sendTitle={
                selectedChat?.kind === 'direct'
                  ? canComposeMessage
                    ? t('button.sendDirectMessage')
                    : selectedChat.network === 'qortal'
                      ? qortalDirectSendUnavailableLabel
                      : directSendUnavailableLabel
                  : canComposeMessage
                    ? t('button.sendMessage')
                    : groupSendUnavailableLabel
              }
              showAttachment={!!selectedChat}
              textareaRef={composerRef}
            />
          )}
        </section>

        {showGroupMembers && membersOpen ? (
          <MembersDrawer
            accountLockedLabel={accountLockedLabel}
            accountRequiredLabel={accountRequiredLabel}
            approvePendingJoiner={approvePendingJoiner}
            avatarProfiles={selectedAvatarProfiles}
            canApproveGroupJoinRequests={
              isSelectedQortalGroupForAdminRequests ? canApproveQortalGroupJoinRequests : canApproveGroupJoinRequests
            }
            canUseSelectedAccount={isSelectedQortalGroupForAdminRequests ? canUseQortalAccount : canUseSelectedAccount}
            group={isSelectedGeneralChat ? null : selectedGroup}
            groupTitle={getGroupTitle(selectedGroup, t)}
            hasAccount={isSelectedQortalGroupForAdminRequests ? !!qortalAccount : !!account}
            isOverlay={isMembersOverlay}
            members={selectedGroupMembers}
            membersCloseRef={membersCloseRef}
            membersError={selectedGroupMembersError}
            membersLabel={selectedGroupMembersLabel}
            membersPhase={selectedGroupMembersPhase}
            onApproveJoinRequest={(request) =>
              void (isSelectedQortalGroupForAdminRequests
                ? handleApproveQortalJoinRequest(request)
                : handleApproveJoinRequest(request))
            }
            onClose={() => setMembersOpen(false)}
            onOpenAccount={(target) => setAccountInfoTarget({ ...target, network: selectedChat?.network ?? 'qortium' })}
            onOpenAvatar={setAvatarLightboxImage}
            pendingJoinRequests={selectedAdminJoinRequests}
            t={t}
          />
        ) : null}
    </AppShell>
  );
}
