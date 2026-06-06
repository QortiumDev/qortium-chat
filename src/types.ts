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
  isSynchronizing?: boolean;
  numberOfConnections?: number;
  syncPercent?: number;
  syncPhase?: string;
  syncTargetHeight?: number;
  version?: string;
  [key: string]: unknown;
};

export type GroupData = {
  approvalThreshold?: string;
  created?: number;
  description?: string;
  groupId: number;
  groupName: string;
  isAdmin?: boolean;
  isOpen?: boolean;
  memberCount?: number;
  owner?: string;
  ownerPrimaryName?: string;
  updated?: number | null;
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
  encoding?: 'BASE58' | 'BASE64';
  isEncrypted?: boolean;
  isText?: boolean;
  recipient?: string | null;
  recipientName?: string | null;
  sender: string;
  senderName?: string | null;
  signature?: string | null;
  timestamp: number;
  txGroupId: number;
};

export type ChatActionResult = {
  accepted: boolean;
  action: 'JOIN_GROUP' | 'SEND_CHAT_MESSAGE';
  direct?: boolean;
  encrypted?: boolean;
  groupId?: number;
  groupName?: string | null;
  recipientAddress?: string;
  result: unknown;
};
