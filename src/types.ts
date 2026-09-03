export type QdnAction = string;

// Chat 2.0 slice 2: which chain a group/chat/message belongs to. 'qortium' is
// the default everywhere an existing (slice 1) value omits this field, so
// every pre-dual-chain call site keeps behaving exactly as it did before.
export type ChatNetwork = 'qortal' | 'qortium';

export type BridgeTransport = 'browser-dev' | 'gateway' | 'home';

// Which concrete host injected the bridge, independent of transport. Transport
// answers "how do we reach the node" (home vs gateway vs local browser);
// host answers "which shell/UI is this" so callers can gate on Hub-specific
// action-catalogue gaps (e.g. hasQortalChatBridgeActions) without re-deriving
// it from `ui` at every call site.
export type BridgeHost = 'home2' | 'hub' | 'legacy-home' | 'gateway' | 'browser-dev';

// A loadable value with its fetch lifecycle: idle/loading keep the last value,
// error carries a message alongside the stale value, ready holds the fresh value.
export type AsyncState<T> =
  | { error?: string; phase: 'idle' | 'loading'; value: T }
  | { error: string; phase: 'error'; value: T }
  | { phase: 'ready'; value: T };

export type BridgeState = {
  actions: QdnAction[];
  host: BridgeHost;
  isHomeBridge: boolean;
  isUsingPublicNode: boolean;
  transport: BridgeTransport;
  ui: string;
};

export type QdnSelectedAccount = {
  address: string;
  avatarUrl: string | null;
  id?: string;
  isUnlocked: boolean;
  name: string | null;
  resourceUrl?: string;
};

export type NodeApiFetchResult<T = unknown> = {
  body: string;
  contentLength?: number;
  contentType: string;
  data: T;
  headers?: Record<string, string>;
  ok: boolean;
  status: number;
  statusText: string;
};

export type NodeStatus = {
  height?: number;
  isMintingPossible?: boolean;
  isSynchronizing?: boolean;
  numberOfConnections?: number;
  syncPercent?: number;
  syncPhase?: string;
  syncTargetHeight?: number;
  version?: string;
  [key: string]: unknown;
};

export type NameSummary = {
  name?: string | null;
  owner?: string | null;
};

export type GroupData = {
  approvalThreshold?: string;
  created?: number;
  description?: string;
  groupId: number;
  groupName: string;
  isAdmin?: boolean;
  isMintingGroup?: boolean;
  isOpen?: boolean;
  maximumBlockDelay?: number;
  memberCount?: number;
  minimumBlockDelay?: number;
  owner?: string;
  ownerPrimaryName?: string;
  updated?: number | null;
};

export type RewardShare = {
  mintingAccount?: string;
  recipient?: string;
  rewardSharePublicKey?: string;
  sharePercent?: number;
};

export type NodeMintingAccount = {
  mintingAccount?: string;
  publicKey?: string;
  recipientAccount?: string;
};

export type MintingStatus = {
  address: string;
  hasRewardShare: boolean;
  isMinting: boolean | null;
  keyOnNode: boolean | null;
  nodeMintingPossible: boolean | null;
};

export type StartMintingResult = {
  accepted: boolean;
  action: 'START_MINTING';
  address: string;
  keyAdded: boolean;
  rewardSharePending?: boolean;
  transactionSignature?: string;
};

export type GroupMember = {
  address?: string;
  isAdmin?: boolean;
  joined?: number;
  member?: string;
  name?: string | null;
  names?: unknown;
  online?: boolean;
  primaryName?: string | null;
};

export type GroupMembersResponse = {
  adminCount?: number;
  groupMembers?: GroupMember[];
  memberCount?: number;
  members?: GroupMember[];
};

export type GroupJoinRequest = {
  groupId: number;
  joiner: string;
};

export type GroupWithJoinRequests = {
  group: GroupData;
  joinRequests: GroupJoinRequest[];
};

export type ActiveGroupChat = {
  data?: string | null;
  encoding?: 'BASE58' | 'BASE64';
  groupId: number;
  groupName?: string;
  sender?: string;
  senderName?: string;
  signature?: string | null;
  timestamp?: number | null;
};

export type ActiveDirectChat = {
  address: string;
  chatReference?: string | null;
  data?: string | null;
  decryptionStatus?: string;
  encoding?: 'BASE58' | 'BASE64';
  isEncrypted?: boolean;
  isText?: boolean;
  name?: string;
  recipient?: string | null;
  recipientName?: string | null;
  sender?: string;
  senderName?: string;
  signature?: string | null;
  timestamp?: number | null;
};

export type ActiveChats = {
  direct?: ActiveDirectChat[];
  groups?: ActiveGroupChat[];
};

export type ChatMessage = {
  chatReference?: string | null;
  data?: string | null;
  decryptionStatus?: string;
  encoding?: 'BASE58' | 'BASE64';
  epochId?: string | null;
  isEncrypted?: boolean;
  isText?: boolean;
  keyId?: string | null;
  recipient?: string | null;
  recipientName?: string | null;
  sender: string;
  senderName?: string | null;
  // Set only on a local optimistic echo (see pendingSends.ts); absent on every
  // message the node has ever returned. `sendLocalId` is the temporary key used
  // to find/update/retry that echo before it has (or ever gets) a real signature.
  sendLocalId?: string;
  sendState?: 'failed' | 'sending';
  signature?: string | null;
  status?: string;
  timestamp: number;
  txGroupId: number;
};

// What SEND_CHAT_MESSAGE resolves with after a normal accepted broadcast, or
// after a legacy host returns a signed post-broadcast failure whose outcome can
// no longer be proven. This is distinct from the accepted/action/result
// envelope ChatActionResult models for the other chat actions.
export type ChatSendResult = {
  error?: string;
  errorType?: string;
  outcome?: 'accepted-unsigned' | 'ambiguous' | 'not-submitted';
  signature: string;
  stage?: 'key-announcement';
  timestamp: number;
};

export type GroupInvite = {
  expiry?: number | null;
  groupId: number;
  invitee?: string;
  inviter?: string;
};

// @deprecated Legacy inline-base64 PUBLISH_QDN_RESOURCE result shape. Home 2
// rejects the inline source fields this shape was built for (review/
// schemas-publish-attachments.md item 2) — kept only because nothing outside
// this file's history referenced it; new callers use QdnPublishOutcome.
export type QdnPublishResult = {
  accepted: boolean;
  action: 'PUBLISH_QDN_RESOURCE';
  resource?: {
    identifier: string | null;
    name: string;
    service: string;
  };
  result?: unknown;
  transactionSignature?: string;
};

// -------- P4a: publish source token flow --------
//
// review/schemas-publish-attachments.md §§ 1-2. Home's native file picker
// (SELECT_QDN_PUBLISH_SOURCE) hands the app a short-lived opaque token — the
// app never sees file bytes or the native path — which PUBLISH_QDN_RESOURCE
// then redeems. The legacy inline-base64 publish shape (`QdnPublishResult`
// above) is rejected by Home 2 entirely.
export type QdnPublishSourceSelection =
  | { canceled: true }
  | {
      canceled: false;
      fileName: string;
      kind: 'file';
      mimeType: string | null;
      size: number;
      sourceToken: string;
    };

export type QdnPublishRequest = {
  category?: string;
  description?: string;
  identifier?: string;
  name: string;
  service: string;
  sourceToken: string;
  tags?: string[];
  title?: string;
};

export type QdnPublishResourceDescriptor = {
  identifier: string | null;
  name: string;
  service: string;
};

export type QdnPublishImmutable = {
  algorithm: 'SHA-256';
  contentHash: string;
  transactionSignature: string;
};

export type QdnPublishSourceInfo = {
  fileName: string;
  size: number;
};

export type QdnPublishAcceptedResult = {
  accepted: true;
  immutable: QdnPublishImmutable;
  network: ChatNetwork;
  resource: QdnPublishResourceDescriptor;
  source: QdnPublishSourceInfo;
  transactionSignature: string;
};

// An uncertain signed/broadcast publish (review/schemas-publish-
// attachments.md § 2 "BROADCAST_UNKNOWN"). The caller must reconcile by
// `transactionSignature` rather than treat this as a failure.
export type QdnPublishUnknownOutcomeResult = {
  accepted: false;
  contentHash: string;
  error: string;
  errorType?: 'BROADCAST_UNKNOWN';
  outcome: 'unknown';
  retryable?: false;
  timestamp: number;
  transactionSignature: string;
  [key: string]: unknown;
};

export type QdnPublishOutcome = QdnPublishAcceptedResult | QdnPublishUnknownOutcomeResult;

// -------- P4a: private chat attachments --------
//
// review/schemas-publish-attachments.md §§ 3-4. `PrivateAttachmentConversation`
// is shared between the PUBLISH_CHAT_ATTACHMENT request and the resulting
// descriptor's `conversation` field — the same selector Home already
// validated when the descriptor was minted.
export type PrivateAttachmentConversation =
  | { kind: 'direct'; otherAddress: string }
  | { groupId: number; kind: 'group' };

export type PrivateAttachmentCodec =
  | 'qenc-v2-direct'
  | 'qenc-v2-group'
  | 'qortal-hub-group-image-v1'
  | 'qortal-qatt-direct-v1'
  | 'qortal-qatt-group-v1';

export type PrivateAttachmentService = 'IMAGE' | 'QCHAT_ATTACHMENT_PRIVATE';

// Immutable descriptor Home returns from PUBLISH_CHAT_ATTACHMENT and expects
// back unchanged for the access trio (GET_CHAT_ATTACHMENT_STREAM_URL /
// OPEN_CHAT_ATTACHMENT_VIEWER / SAVE_CHAT_ATTACHMENT). Not a plaintext
// filename/MIME/key container — validate with isPrivateAttachmentDescriptor
// before trusting one parsed out of message text.
export type PrivateAttachmentDescriptor = {
  ciphertext: {
    algorithm: 'SHA-256';
    hash: string;
    size: number;
    transactionSignature: string;
  };
  codec: PrivateAttachmentCodec;
  conversation: PrivateAttachmentConversation;
  encrypted: true;
  network: ChatNetwork;
  resource: {
    identifier: string;
    name: string;
    service: PrivateAttachmentService;
  };
  version: 1;
};

export type ChatAttachmentAcceptedResult = {
  accepted: true;
  descriptor: PrivateAttachmentDescriptor;
  transactionSignature: string;
};

// An uncertain signed/broadcast attachment publish, mirroring
// QdnPublishUnknownOutcomeResult but carrying the immutable descriptor
// instead of the public resource/immutable/source trio.
export type ChatAttachmentUnknownOutcomeResult = {
  accepted: false;
  descriptor: PrivateAttachmentDescriptor;
  error: string;
  errorType?: 'BROADCAST_UNKNOWN';
  outcome: 'unknown';
  retryable?: false;
  timestamp: number;
  transactionSignature: string;
  [key: string]: unknown;
};

export type ChatAttachmentOutcome = ChatAttachmentAcceptedResult | ChatAttachmentUnknownOutcomeResult;

// -------- P4a: public QDN resource viewer/stream/save/url quartet --------
//
// review/schemas-publish-attachments.md § 5. One coordinate shape covers all
// four actions; each wrapper forwards only the fields Home's normalizer
// accepts (service/name required, the rest optional hints).
export type QdnResourceCoordinate = {
  filename?: string;
  identifier?: string;
  mimeType?: string;
  name: string;
  path?: string;
  service: string;
};

export type ChatActionResult = {
  accepted: boolean;
  action: 'APPROVE_GROUP_JOIN_REQUEST' | 'JOIN_GROUP' | 'LEAVE_GROUP' | 'SEND_CHAT_MESSAGE';
  direct?: boolean;
  encrypted?: boolean;
  groupId?: number;
  groupName?: string | null;
  invitee?: string;
  recipientAddress?: string;
  result: unknown;
  transactionSignature?: string;
};

// Result of JOIN_GROUP/LEAVE_GROUP/APPROVE_GROUP_JOIN_REQUEST through
// bridgeRequest. Both the legacy qdnRequest-only shape (ChatActionResult
// above: `result`, `invitee`, no `network`/`changed`/`membership`) and Home
// 2's exact-action shape (review/schemas-home2-actions.md "Group membership"
// / "Approve group join request") are possible depending on the host that
// answers, so every Home-2-only field stays optional here.
export type GroupMembershipActionResult = {
  accepted: boolean;
  action: 'APPROVE_GROUP_JOIN_REQUEST' | 'JOIN_GROUP' | 'LEAVE_GROUP';
  changed?: boolean;
  direct?: boolean;
  encrypted?: boolean;
  groupId?: number;
  groupName?: string | null;
  invitee?: string;
  memberAddress?: string;
  membership?: 'joined' | 'left' | 'requested';
  network?: ChatNetwork;
  recipientAddress?: string;
  result?: unknown;
  signature?: string;
  timestamp?: number;
  transactionSignature?: string;
  wireAction?: 'GROUP_INVITE';
};

export type PrivateGroupChatKeyRequest = {
  epochId?: string;
  groupId: number;
  keyId?: string;
};

export type PrivateGroupChatKeyRequestResult = {
  accepted: boolean;
  action: 'REQUEST_PRIVATE_GROUP_CHAT_KEY';
  groupId: number;
  result: {
    epochId?: string | null;
    keyId?: string | null;
    requestSignature?: string;
    [key: string]: unknown;
  };
};

export type PrivateGroupChatKeyRequestRecoveryResult = {
  accepted: boolean;
  action: 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS';
  groupId: number;
  result: Array<{
    announcementSignature?: string | null;
    epochId?: string | null;
    relayedKeyId?: string | null;
    requestSignature?: string | null;
    requestedKeyId?: string | null;
    status?: string;
    [key: string]: unknown;
  }>;
};

// -------- Private group chat (P3a): state --------
//
// review/schemas-private-group-actions.md § "GET_PRIVATE_GROUP_CHAT_STATE".
// Key material (`epochId`, `memberPublicKeys`) is carried opaque — coreApi
// never decodes or interprets it, only routes it back to Home unchanged for
// the next action (send/rotate/resolve).
export type QortiumPrivateGroupChatState = {
  allPublicKeysKnown: true;
  available: true;
  epochId: unknown;
  exists?: true;
  groupId: number;
  isOpen: false;
  /** Account-relative Home 2 signal; absent on older hosts. */
  keyAvailable?: boolean;
  maxMessagePlaintextBytes: number;
  maxV1Members?: number;
  memberCount: number;
  memberPublicKeys: unknown[];
  qpgcVersion: 1;
};

export type QortalPrivateGroupChatState = {
  available: boolean;
  exists?: true;
  groupId: number;
  groupName: string;
  isMember: boolean;
  isOpen: false;
  memberCount: number;
  publisherName: string | null;
  qortalPrivateGroupVersion: 1;
  recipientCount: number | null;
  resourceSignature: string | null;
  rotationRequired: boolean;
};

// Discriminate with isQortiumPrivateGroupChatState/isQortalPrivateGroupChatState
// (coreApi.ts) rather than inspecting fields ad hoc at call sites.
export type PrivateGroupChatState = QortiumPrivateGroupChatState | QortalPrivateGroupChatState;

// -------- Private group chat (P3a): active-chats entries --------
//
// review/schemas-private-group-actions.md § "GET_PRIVATE_GROUP_ACTIVE_CHATS".
// A decrypted entry is the latest row for an eligible closed group, shaped
// like a ChatMessage plus the decrypt-envelope fields SEARCH_PRIVATE_GROUP_
// CHAT_MESSAGES adds (epochId/keyId on Qortium, keyVersion/payloadType on
// Qortal) — kept loose here since P3a does not decode these rows.
export type PrivateGroupActiveChatDecryptedEntry = ChatMessage & {
  data: string;
  encoding: 'BASE58' | 'BASE64';
  status: 'DECRYPTED';
};

export type PrivateGroupActiveChatMissingKeyEntry = { groupId: number; status: 'MISSING_KEY' };
export type PrivateGroupActiveChatNoMessagesEntry = { groupId: number; status: 'NO_MESSAGES' };

export type PrivateGroupActiveChatEntry =
  | PrivateGroupActiveChatDecryptedEntry
  | PrivateGroupActiveChatMissingKeyEntry
  | PrivateGroupActiveChatNoMessagesEntry;

// -------- Private group chat (P3a): key lifecycle --------
//
// Normalized REQUEST_PRIVATE_GROUP_CHAT_KEY outcome. QPGC broadcasts a
// key-request control envelope ({signature, timestamp}); Qortal instead
// attempts local/resource recovery with no transaction at all
// ({accepted, recovered, resourceSignature}). Every raw response field is
// kept alongside the added `kind` discriminant (via the Record<string,
// unknown> intersection) so the existing untyped legacy pass-through shape
// callers may already depend on keeps working unchanged.
export type PrivateGroupKeyRequestOutcome =
  | ({ kind: 'broadcast' } & Record<string, unknown>)
  | ({ kind: 'recovery' } & Record<string, unknown>);

// Normalized RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS / ROTATE_PRIVATE_GROUP_
// CHAT_KEY outcome. QPGC relays zero, one, or many key announcements; Qortal
// instead publishes/rotates an administrator key bundle. `signatures` always
// holds every relayed/published transaction signature found in the raw
// response (empty when none). Raw fields are kept alongside, same rationale
// as PrivateGroupKeyRequestOutcome above.
export type PrivateGroupKeyResolutionOutcome =
  | ({ kind: 'relay'; signatures: string[] } & Record<string, unknown>)
  | ({ kind: 'publication'; signatures: string[] } & Record<string, unknown>);

export type TransactionStatus = {
  approvalStatus?: string;
  blockHeight?: number | null;
  signature?: string;
  timestamp?: number;
  type?: string;
};

export type PendingApprovalTransaction = {
  approvalStatus?: string;
  blockHeight?: number | null;
  creatorAddress?: string;
  fee?: string;
  service?: number;
  signature: string;
  size?: number;
  timestamp?: number;
  txGroupId?: number;
  type?: string;
};

export type GroupApprovalResult = {
  accepted?: boolean;
  action?: string;
  approval?: boolean;
  pendingSignature?: string;
  result?: unknown;
  transactionSignature?: string;
};

// A confirmed GROUP_APPROVAL vote, as returned by /transactions/search. Votes
// ride the root group (txGroupId 0) and reference the pending tx they decide.
export type GroupApprovalVote = {
  approval?: boolean;
  blockHeight?: number | null;
  creatorAddress?: string;
  pendingSignature?: string;
  signature?: string;
  timestamp?: number;
};

// A chat-driven transaction the UI tracks to confirmation, surfaced inline in the
// transcript as a system message (joins, leaves, approvals, reward shares).
export type TrackedTransaction = {
  action: 'approve' | 'groupApproval' | 'join' | 'leave' | 'rewardshare';
  groupId: number;
  groupName: string;
  id: string;
  joiner?: string;
  message: string;
  /** Which chain this transaction rides. Absent means 'qortium' (every
   * pre-dual-chain tracked transaction predates this field) — read sites
   * must treat a missing network as 'qortium', never as "unknown", so a
   * same-numeric groupId on Qortal never reads as a pending Qortium tx. */
  network?: ChatNetwork;
  phase: 'confirmed' | 'failed' | 'pending';
  signature?: string;
};

// Derived client-side from the vote tally; not a Core response shape.
export type ApprovalProgress = {
  approvalsSoFar: number; // distinct eligible voters whose latest vote approves
  opposed: number; // distinct eligible voters whose latest vote opposes (informational)
  approvalsNeeded: number; // votes required to cross the group's approval threshold
  totalAuthorities: number; // eligible approvers (non-null members for a null-owner group)
  myVote: 'approve' | 'oppose' | null; // current account's latest confirmed vote
};

// GET_PENDING_TRANSACTIONS / FORGET_PENDING_TRANSACTION — the Home 2 pending
// journal (review/schemas-home2-actions.md "Pending transactions"). One entry
// per not-yet-reconciled bridge write; `target` distinguishes what kind of
// write it was so the UI can render/dedupe it against the right local state.
export type PendingBridgeTransactionTarget =
  | { kind: 'operation' }
  | { groupId: number; kind: 'group' }
  | { kind: 'direct'; otherAddress: string }
  | { identifier: string | null; kind: 'resource'; name: string; service: string };

export type PendingBridgeTransactionEntry = {
  action: string;
  createdAt: number;
  network: ChatNetwork;
  signature: string;
  stage?: 'key-announcement';
  target: PendingBridgeTransactionTarget;
  timestamp: number;
};

export type PendingBridgeTransactionsResult = {
  entries: PendingBridgeTransactionEntry[];
  network: ChatNetwork;
  version: 1;
};

// Per-chat saved reading position ("bookmark"). Anchored to a specific message
// by stable signature/key plus its pixel offset from the viewport top, so it
// survives height changes from async previews. `anchorTimestamp` lets the reader
// page backward to the bookmarked message when it is not in the freshly-loaded
// window (the user had read back beyond the live tail). `atBottom` is the special
// case: pin to the live bottom and keep sticking as new messages arrive.
export type ChatScrollPosition =
  | { atBottom: true }
  | { atBottom: false; anchorKey: string; anchorOffset: number; anchorTimestamp: number };
