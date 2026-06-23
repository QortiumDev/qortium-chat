import { buildNodeWebSocketUrl, qdnRequest } from './qdnRequest';
import { sortMessagesByTimestamp } from './messageThreads';
import type {
  ActiveChats,
  ChatActionResult,
  ChatMessage,
  GroupApprovalResult,
  GroupApprovalVote,
  GroupData,
  GroupJoinRequest,
  GroupMember,
  GroupMembersResponse,
  GroupWithJoinRequests,
  MintingStatus,
  NameSummary,
  NodeApiFetchResult,
  NodeMintingAccount,
  NodeStatus,
  PendingApprovalTransaction,
  PrivateGroupChatKeyRequest,
  PrivateGroupChatKeyRequestRecoveryResult,
  PrivateGroupChatKeyRequestResult,
  QdnAction,
  RewardShare,
  StartMintingResult,
  TransactionStatus,
} from './types';

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
export const DEFAULT_LIST_LIMIT = 100;

function appendQueryValue(query: URLSearchParams, key: string, value: string | number | boolean | undefined) {
  if (value === undefined || value === '') {
    return;
  }

  query.set(key, String(value));
}

function assertOk<T>(result: NodeApiFetchResult<T>, label: string) {
  if (!result.ok) {
    throw new Error(result.body || `${label} failed with HTTP ${result.status}.`);
  }

  return result.data;
}

function hasBridgeAction(actions: QdnAction[] | undefined, action: string) {
  return actions?.some((candidate) => candidate.toUpperCase() === action.toUpperCase()) ?? false;
}

function normalizeGroupMembers(response: GroupMember[] | GroupMembersResponse) {
  if (Array.isArray(response)) {
    return response;
  }

  return response.members ?? response.groupMembers ?? [];
}

export function buildGroupsPath(search: string, limit = DEFAULT_LIST_LIMIT) {
  const trimmedSearch = search.trim();
  const query = new URLSearchParams();

  appendQueryValue(query, 'limit', limit);
  appendQueryValue(query, 'reverse', false);

  if (!trimmedSearch) {
    return `/groups?${query.toString()}`;
  }

  appendQueryValue(query, 'query', trimmedSearch);
  appendQueryValue(query, 'visibility', 'ALL');

  return `/groups/search?${query.toString()}`;
}

export function buildMemberGroupsPath(address: string) {
  return `/groups/member/${encodeURIComponent(address)}`;
}

export function buildGroupMembersPath(groupId: number, limit = DEFAULT_LIST_LIMIT) {
  const query = new URLSearchParams({
    limit: String(limit),
    reverse: 'false',
  });

  return `/groups/members/${encodeURIComponent(String(groupId))}?${query.toString()}`;
}

export function buildAccountGroupJoinRequestsPath(address: string) {
  return `/groups/joinrequests/address/${encodeURIComponent(address)}`;
}

export function buildAdminGroupJoinRequestsPath(address: string) {
  return `/groups/joinrequests/admin/${encodeURIComponent(address)}`;
}

export function buildGroupJoinRequestsPath(groupId: number) {
  return `/groups/joinrequests/${encodeURIComponent(String(groupId))}`;
}

export function buildTransactionStatusPath(signature: string) {
  return `/transactions/signature/${encodeURIComponent(signature)}`;
}

export function buildPendingTransactionsPath(txGroupId: number, limit = DEFAULT_LIST_LIMIT) {
  const query = new URLSearchParams({
    txGroupId: String(txGroupId),
    limit: String(limit),
    reverse: 'false',
  });

  return `/transactions/pending?${query.toString()}`;
}

export function buildSelfRewardSharesPath(address: string) {
  const encodedAddress = encodeURIComponent(address);

  return `/addresses/rewardshares?minters=${encodedAddress}&recipients=${encodedAddress}`;
}

export function buildActiveChatsPath(address: string) {
  return `/chat/active/${encodeURIComponent(address)}?encoding=BASE64&haschatreference=false`;
}

export function buildAccountNamesPath(address: string) {
  return `/names/address/${encodeURIComponent(address)}`;
}

export function buildNameInfoPath(name: string) {
  return `/names/${encodeURIComponent(name)}`;
}

export function buildGroupMessagesPath(groupId: number, limit = DEFAULT_LIST_LIMIT, before?: number) {
  // No haschatreference filter: edit revisions (messages with a chatReference)
  // are needed to render edited messages.
  const query = new URLSearchParams({
    txGroupId: String(groupId),
    encoding: 'BASE64',
    limit: String(limit),
    reverse: 'true',
  });

  // `before` (ms timestamp) pages backward into history one window at a time so
  // the full group history can be loaded beyond the live tail's limit.
  if (typeof before === 'number') {
    query.set('before', String(before));
  }

  return `/chat/messages?${query.toString()}`;
}

export function buildGroupMessagesWebSocketUrl(groupId: number, limit = DEFAULT_LIST_LIMIT) {
  const query = new URLSearchParams({
    txGroupId: String(groupId),
    encoding: 'BASE64',
    limit: String(limit),
    reverse: 'true',
  });

  return buildNodeWebSocketUrl(`/websockets/chat/messages?${query.toString()}`);
}

export function buildActiveChatsWebSocketUrl(address: string) {
  const query = new URLSearchParams({
    encoding: 'BASE64',
    haschatreference: 'false',
  });

  return buildNodeWebSocketUrl(`/websockets/chat/active/${encodeURIComponent(address)}?${query.toString()}`);
}

export async function fetchNodeApiData<T>(path: string, label: string, maxBytes = DEFAULT_MAX_BYTES) {
  const result = await qdnRequest<NodeApiFetchResult<T>>({
    action: 'FETCH_NODE_API',
    maxBytes,
    path,
  });

  return assertOk(result, label);
}

export async function getNodeStatus() {
  return qdnRequest<NodeStatus>({ action: 'GET_NODE_STATUS' });
}

export async function searchGroups(search: string, actions?: QdnAction[]) {
  const trimmedSearch = search.trim();

  if (trimmedSearch && hasBridgeAction(actions, 'SEARCH_GROUPS')) {
    return qdnRequest<GroupData[]>({
      action: 'SEARCH_GROUPS',
      limit: DEFAULT_LIST_LIMIT,
      query: trimmedSearch,
      reverse: false,
      visibility: 'ALL',
    });
  }

  if (!trimmedSearch && hasBridgeAction(actions, 'LIST_GROUPS')) {
    return qdnRequest<GroupData[]>({
      action: 'LIST_GROUPS',
      limit: DEFAULT_LIST_LIMIT,
      reverse: false,
    });
  }

  return fetchNodeApiData<GroupData[]>(buildGroupsPath(search), 'Group search');
}

export async function getMemberGroups(address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACCOUNT_GROUPS')) {
    return qdnRequest<GroupData[]>({
      action: 'GET_ACCOUNT_GROUPS',
      address,
    });
  }

  return fetchNodeApiData<GroupData[]>(buildMemberGroupsPath(address), 'Member groups');
}

export async function getAccountNames(address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACCOUNT_NAMES')) {
    return qdnRequest<NameSummary[]>({
      action: 'GET_ACCOUNT_NAMES',
      address,
    });
  }

  return fetchNodeApiData<NameSummary[]>(buildAccountNamesPath(address), 'Account names');
}

// Resolve a registered name to its owner address so a direct chat can be opened
// by name. Returns null when the name is unregistered (Core answers 404). This is
// a keyless, CORS-open read that works through the Home bridge and in browser dev.
export async function getNameOwnerAddress(name: string): Promise<string | null> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return null;
  }

  const result = await qdnRequest<NodeApiFetchResult<NameSummary | null>>({
    action: 'FETCH_NODE_API',
    maxBytes: DEFAULT_MAX_BYTES,
    path: buildNameInfoPath(trimmedName),
  });

  if (result.status === 404) {
    return null;
  }

  const data = assertOk(result, 'Name lookup');

  return data && typeof data.owner === 'string' && data.owner ? data.owner : null;
}

// Home's RESOLVE_IDENTITIES resolves a batch of addresses to their registered
// name + avatar in a single read-only bridge call (deduped, capped at 500),
// replacing one GET_ACCOUNT_NAMES round-trip per address.
export type ResolvedIdentity = { address: string; name?: string | null; avatarSrc?: string | null };

export const RESOLVE_IDENTITIES_LIMIT = 500;

export async function resolveIdentities(addresses: string[], actions?: QdnAction[]): Promise<ResolvedIdentity[]> {
  if (!hasBridgeAction(actions, 'RESOLVE_IDENTITIES')) {
    throw new Error('RESOLVE_IDENTITIES is not available in this Home build.');
  }

  const unique = Array.from(new Set(addresses.filter((address) => address)));
  const resolved: ResolvedIdentity[] = [];

  for (let index = 0; index < unique.length; index += RESOLVE_IDENTITIES_LIMIT) {
    const chunk = unique.slice(index, index + RESOLVE_IDENTITIES_LIMIT);
    const batch = await qdnRequest<ResolvedIdentity[]>({
      action: 'RESOLVE_IDENTITIES',
      addresses: chunk,
    });

    if (Array.isArray(batch)) {
      resolved.push(...batch);
    }
  }

  return resolved;
}

export async function getGroupMembers(groupId: number, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_GROUP_MEMBERS')) {
    const response = await qdnRequest<GroupMember[] | GroupMembersResponse>({
      action: 'GET_GROUP_MEMBERS',
      groupId,
      limit: DEFAULT_LIST_LIMIT,
      reverse: false,
    });

    return normalizeGroupMembers(response);
  }

  return normalizeGroupMembers(
    await fetchNodeApiData<GroupMember[] | GroupMembersResponse>(buildGroupMembersPath(groupId), 'Group members'),
  );
}

export async function getAccountGroupJoinRequests(address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACCOUNT_GROUP_JOIN_REQUESTS')) {
    return qdnRequest<GroupJoinRequest[]>({
      action: 'GET_ACCOUNT_GROUP_JOIN_REQUESTS',
      address,
    });
  }

  return fetchNodeApiData<GroupJoinRequest[]>(buildAccountGroupJoinRequestsPath(address), 'Join requests');
}

export async function getAdminGroupJoinRequests(address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ADMIN_GROUP_JOIN_REQUESTS')) {
    return qdnRequest<GroupWithJoinRequests[]>({
      action: 'GET_ADMIN_GROUP_JOIN_REQUESTS',
      address,
    });
  }

  return fetchNodeApiData<GroupWithJoinRequests[]>(buildAdminGroupJoinRequestsPath(address), 'Admin join requests');
}

export async function getGroupJoinRequests(groupId: number, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_GROUP_JOIN_REQUESTS')) {
    return qdnRequest<GroupJoinRequest[]>({
      action: 'GET_GROUP_JOIN_REQUESTS',
      groupId,
    });
  }

  return fetchNodeApiData<GroupJoinRequest[]>(buildGroupJoinRequestsPath(groupId), 'Group join requests');
}

export async function getTransactionStatus(signature: string) {
  return fetchNodeApiData<TransactionStatus>(buildTransactionStatusPath(signature), 'Transaction status');
}

export async function getPendingGroupApprovals(txGroupId: number) {
  // Keyless, CORS-open read; works through the bridge and in browser read-only mode.
  return fetchNodeApiData<PendingApprovalTransaction[]>(
    buildPendingTransactionsPath(txGroupId),
    'Pending approvals',
  );
}

export function buildGroupApprovalVotesPath(limit = DEFAULT_LIST_LIMIT) {
  // GROUP_APPROVAL votes always ride the root group; there is no pendingSignature
  // query param, so the caller filters by pendingSignature client-side.
  const query = new URLSearchParams({
    txType: 'GROUP_APPROVAL',
    confirmationStatus: 'CONFIRMED',
    limit: String(limit),
    reverse: 'true',
  });

  return `/transactions/search?${query.toString()}`;
}

export async function getGroupApprovalVotes(limit = DEFAULT_LIST_LIMIT) {
  // Keyless read of recent confirmed approval votes; the tally for a given pending
  // transaction is computed client-side (see computeApprovalProgress).
  return fetchNodeApiData<GroupApprovalVote[]>(buildGroupApprovalVotesPath(limit), 'Approval votes');
}

export function buildBlockHeightPath() {
  return '/blocks/height';
}

export async function getCurrentBlockHeight() {
  // Keyless read returning the tip height as a bare number; used to compute the
  // approval window's relative ETA.
  return fetchNodeApiData<number>(buildBlockHeightPath(), 'Block height');
}

export async function submitGroupApproval(pendingSignature: string, approval: boolean, groupId?: number) {
  // Privileged write: Qortium Home builds POST /groups/approval, signs with the
  // user's wallet, and submits. approval=false records an opposition vote.
  // groupId is display-only context for Home's consent dialog (the vote always
  // rides in the root group); omit it when unknown.
  const request = {
    action: 'GROUP_APPROVAL',
    approval,
    pendingSignature,
  };

  return qdnRequest<GroupApprovalResult>(
    typeof groupId === 'number' ? { ...request, groupId } : request,
  );
}

export async function getMintingStatus(address: string, actions?: QdnAction[]): Promise<MintingStatus> {
  if (hasBridgeAction(actions, 'GET_MINTING_STATUS')) {
    return qdnRequest<MintingStatus>({
      action: 'GET_MINTING_STATUS',
      address,
    });
  }

  const rewardShares = await fetchNodeApiData<RewardShare[]>(buildSelfRewardSharesPath(address), 'Reward shares');
  const hasRewardShare = rewardShares.some(
    (rewardShare) => rewardShare.mintingAccount === address && rewardShare.recipient === address,
  );

  try {
    const mintingAccounts = await fetchNodeApiData<NodeMintingAccount[]>('/admin/mintingaccounts', 'Minting accounts');
    const keyOnNode = mintingAccounts.some(
      (mintingAccount) => mintingAccount.mintingAccount === address && mintingAccount.recipientAccount === address,
    );
    const nodeStatus = await fetchNodeApiData<NodeStatus>('/admin/status', 'Node status');

    return {
      address,
      hasRewardShare,
      isMinting: hasRewardShare && keyOnNode,
      keyOnNode,
      nodeMintingPossible: nodeStatus.isMintingPossible === true,
    };
  } catch {
    // The connected node does not expose its minting state (for example a public read-only node).
    return {
      address,
      hasRewardShare,
      isMinting: null,
      keyOnNode: null,
      nodeMintingPossible: null,
    };
  }
}

export async function startMinting() {
  return qdnRequest<StartMintingResult>({
    action: 'START_MINTING',
  });
}

export async function getActiveChats(address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACTIVE_CHATS')) {
    return qdnRequest<ActiveChats>({
      action: 'GET_ACTIVE_CHATS',
      address,
      encoding: 'BASE64',
      hasChatReference: false,
    });
  }

  return fetchNodeApiData<ActiveChats>(buildActiveChatsPath(address), 'Active chats');
}

export async function getPrivateDirectActiveChats(actions?: QdnAction[]) {
  if (!hasBridgeAction(actions, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS')) {
    return [];
  }

  return qdnRequest<NonNullable<ActiveChats['direct']>>({
    action: 'GET_PRIVATE_DIRECT_ACTIVE_CHATS',
    encoding: 'BASE64',
    hasChatReference: false,
  });
}

export async function getGroupMessages(
  group: GroupData,
  actions?: QdnAction[],
  options: { before?: number; decryptPrivate?: boolean } = {},
) {
  const groupId = group.groupId;
  const shouldDecryptPrivate = options.decryptPrivate !== false;
  const messageRequest = {
    encoding: 'BASE64',
    groupId,
    limit: DEFAULT_LIST_LIMIT,
    reverse: true,
    // When set, return the window of messages immediately older than this
    // timestamp so callers can page backward through the full history.
    ...(typeof options.before === 'number' ? { before: options.before } : {}),
  };

  if (group.isOpen === false && shouldDecryptPrivate) {
    if (!hasBridgeAction(actions, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES')) {
      throw new Error('Closed group chat reads require Qortium Home private group chat support.');
    }

    const messages = await qdnRequest<ChatMessage[]>({
      action: 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
      ...messageRequest,
    });

    return sortMessagesByTimestamp(messages);
  }

  if (hasBridgeAction(actions, 'SEARCH_CHAT_MESSAGES')) {
    const messages = await qdnRequest<ChatMessage[]>({
      action: 'SEARCH_CHAT_MESSAGES',
      ...messageRequest,
    });

    return sortMessagesByTimestamp(messages);
  }

  const messages = await fetchNodeApiData<ChatMessage[]>(
    buildGroupMessagesPath(groupId, DEFAULT_LIST_LIMIT, options.before),
    'Group messages',
  );

  return sortMessagesByTimestamp(messages);
}

function getOptionalKeyId(value: unknown) {
  return typeof value === 'string' && value ? value : undefined;
}

export function getMissingPrivateGroupKeyRequests(messages: ChatMessage[], groupId?: number) {
  const requests = new Map<string, PrivateGroupChatKeyRequest>();

  for (const message of messages) {
    if (message.status !== 'MISSING_KEY') {
      continue;
    }

    if (typeof groupId === 'number' && message.txGroupId !== groupId) {
      continue;
    }

    const epochId = getOptionalKeyId(message.epochId);
    const keyId = getOptionalKeyId(message.keyId);
    const key = `${message.txGroupId}:${epochId ?? ''}:${keyId ?? ''}`;

    if (!requests.has(key)) {
      requests.set(key, {
        ...(epochId ? { epochId } : {}),
        groupId: message.txGroupId,
        ...(keyId ? { keyId } : {}),
      });
    }
  }

  return Array.from(requests.values());
}

export async function requestPrivateGroupChatKey(
  request: PrivateGroupChatKeyRequest,
  actions?: QdnAction[],
) {
  if (!hasBridgeAction(actions, 'REQUEST_PRIVATE_GROUP_CHAT_KEY')) {
    throw new Error('Private group chat key requests require Qortium Home key recovery support.');
  }

  return qdnRequest<PrivateGroupChatKeyRequestResult>({
    action: 'REQUEST_PRIVATE_GROUP_CHAT_KEY',
    ...(request.epochId ? { epochId: request.epochId } : {}),
    groupId: request.groupId,
    ...(request.keyId ? { keyId: request.keyId } : {}),
  });
}

export async function resolvePrivateGroupChatKeyRequests(
  groupId: number,
  actions?: QdnAction[],
  limit = 20,
) {
  if (!hasBridgeAction(actions, 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS')) {
    throw new Error('Private group chat key request resolution requires Qortium Home key recovery support.');
  }

  return qdnRequest<PrivateGroupChatKeyRequestRecoveryResult>({
    action: 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS',
    groupId,
    limit,
  });
}

export async function getDirectMessages(
  otherAddress: string,
  actions?: QdnAction[],
  options: { before?: number } = {},
) {
  if (hasBridgeAction(actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES')) {
    const messages = await qdnRequest<ChatMessage[]>({
      action: 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
      encoding: 'BASE64',
      limit: DEFAULT_LIST_LIMIT,
      otherAddress,
      reverse: true,
      ...(typeof options.before === 'number' ? { before: options.before } : {}),
    });

    return sortMessagesByTimestamp(messages);
  }

  throw new Error('Direct private chat reads require Qortium Home direct chat support.');
}

export async function joinGroup(groupId: number) {
  return qdnRequest<ChatActionResult>({
    action: 'JOIN_GROUP',
    groupId,
  });
}

export async function leaveGroup(groupId: number) {
  return qdnRequest<ChatActionResult>({
    action: 'LEAVE_GROUP',
    groupId,
  });
}

export async function approveGroupJoinRequest(groupId: number, joiner: string) {
  return qdnRequest<ChatActionResult>({
    action: 'APPROVE_GROUP_JOIN_REQUEST',
    groupId,
    joiner,
  });
}

export async function sendChatMessage(groupId: number, message: string, chatReference?: string) {
  const request = {
    action: 'SEND_CHAT_MESSAGE',
    groupId,
    message,
  };

  return qdnRequest<ChatActionResult>(chatReference ? { ...request, chatReference } : request);
}

export async function sendDirectChatMessage(recipientAddress: string, message: string, chatReference?: string) {
  const request = {
    action: 'SEND_CHAT_MESSAGE',
    message,
    recipientAddress,
  };

  return qdnRequest<ChatActionResult>(chatReference ? { ...request, chatReference } : request);
}
