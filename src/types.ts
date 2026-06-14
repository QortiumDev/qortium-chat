export type QdnAction = string;

export type BridgeState = {
  actions: QdnAction[];
  isHomeBridge: boolean;
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
  memberCount?: number;
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
  groupId: number;
  groupName?: string;
  sender?: string;
  senderName?: string;
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
  signature?: string | null;
  status?: string;
  timestamp: number;
  txGroupId: number;
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

export type TransactionStatus = {
  approvalStatus?: string;
  blockHeight?: number | null;
  signature?: string;
  timestamp?: number;
  type?: string;
};
