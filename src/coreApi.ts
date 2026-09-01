import { buildNodeWebSocketUrl, qdnRequest } from './qdnRequest';
import { bridgeRequest } from './chatNetwork';
import { sortMessagesByTimestamp } from './messageThreads';
import { buildDeletedMessageText, buildReactionMessageText } from './chatText';
import {
  buildQortalDirectChatDeletePayload,
  buildQortalDirectChatEditPayload,
  buildQortalDirectChatPayload,
  buildQortalDirectChatReactionPayload,
  buildQortalHubGroupChatDeletePayload,
  buildQortalHubGroupChatEditPayload,
  buildQortalHubGroupChatReactionPayload,
  normalizeQortalOutgoingMessage,
} from './qortalChatPayload';
import {
  getQortalGeneralChatMessages,
  rememberQortalGeneralChatAccount,
  sendQortalGeneralChatDelete,
  sendQortalGeneralChatEdit,
  sendQortalGeneralChatMessage,
  sendQortalGeneralChatReaction,
} from './qortalGeneralChat';
import type {
  ActiveChats,
  ChatAttachmentOutcome,
  ChatMessage,
  ChatNetwork,
  ChatSendResult,
  GroupApprovalResult,
  GroupApprovalVote,
  GroupData,
  GroupInvite,
  GroupJoinRequest,
  GroupMember,
  GroupMembersResponse,
  GroupMembershipActionResult,
  GroupWithJoinRequests,
  MintingStatus,
  NameSummary,
  NodeApiFetchResult,
  NodeMintingAccount,
  NodeStatus,
  PendingApprovalTransaction,
  PendingBridgeTransactionsResult,
  PrivateAttachmentConversation,
  PrivateAttachmentDescriptor,
  PrivateGroupActiveChatEntry,
  PrivateGroupChatKeyRequest,
  PrivateGroupChatKeyRequestRecoveryResult,
  PrivateGroupChatKeyRequestResult,
  PrivateGroupChatState,
  PrivateGroupKeyRequestOutcome,
  PrivateGroupKeyResolutionOutcome,
  QdnAction,
  QdnPublishOutcome,
  QdnPublishRequest,
  QdnPublishSourceSelection,
  QdnResourceCoordinate,
  QortalPrivateGroupChatState,
  QortiumPrivateGroupChatState,
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

// Raw Core error bodies (JSON payloads, HTML error pages) must not surface
// verbatim in user-facing banners. Extract a JSON `message` when one exists;
// either way the thrown message leads with the ' failed with HTTP ' phrase
// that getBridgeErrorMessage maps to a localized banner, so the raw detail is
// only visible to developers inspecting the error.
function getNodeApiErrorMessage<T>(result: NodeApiFetchResult<T>, label: string) {
  const base = `${label} failed with HTTP ${result.status}.`;

  try {
    const parsed = JSON.parse(result.body) as unknown;
    const message =
      parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string'
        ? ((parsed as { message: string }).message)
        : '';

    return message ? `${base} ${message.slice(0, 200)}` : base;
  } catch {
    // Non-JSON body (HTML error page, plain text): omit it.
    return base;
  }
}

function assertOk<T>(result: NodeApiFetchResult<T>, label: string) {
  if (!result.ok) {
    throw new Error(getNodeApiErrorMessage(result, label));
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

async function fetchNodeApiDataFor<T>(
  network: ChatNetwork,
  path: string,
  label: string,
  maxBytes = DEFAULT_MAX_BYTES,
) {
  const result = await bridgeRequest<NodeApiFetchResult<T>>(network, {
    action: 'FETCH_NODE_API',
    maxBytes,
    path,
  });

  return assertOk(result, label);
}

export async function fetchNodeApiData<T>(path: string, label: string, maxBytes = DEFAULT_MAX_BYTES) {
  return fetchNodeApiDataFor<T>('qortium', path, label, maxBytes);
}

// attachments-matrix A3: search resources ANY account has published, via the
// Core REST API (/arbitrary/resources/search) rather than a bridge action —
// SEARCH_QDN_RESOURCES has no router case in Qortal Hub, while FETCH_NODE_API
// works on every host (Home advertises it; Chat's Qortal adapter falls back to
// a same-origin fetch on Hub and the gateway). Both chains' Cores accept
// query/service/limit/offset/reverse on this endpoint.
export type QdnResourceSearchResult = {
  created?: number;
  identifier?: string | null;
  name: string;
  service: string;
  size?: number;
  updated?: number;
};

// A7-2/A7-3: registered-name suggestions for autocomplete fields.
// /names/search?query=&prefix=true exists on BOTH cores (Qortium
// NamesResource.java:289, Qortal :244) and rides the same FETCH_NODE_API
// path as the resource search, so it works on every host.
export type NameSearchResult = { name: string; owner?: string };

export async function searchNames(
  network: ChatNetwork,
  query: string,
  limit = 10,
): Promise<NameSearchResult[]> {
  const params = new URLSearchParams({
    limit: String(Math.min(20, Math.max(1, Math.floor(limit)))),
    prefix: 'true',
    query,
  });
  const results = await fetchNodeApiDataFor<NameSearchResult[]>(
    network,
    `/names/search?${params.toString()}`,
    'Name search',
    65536,
  );

  return (Array.isArray(results) ? results : []).filter(
    (entry) => !!entry && typeof entry.name === 'string' && !!entry.name,
  );
}

export async function searchQdnResources(
  network: ChatNetwork,
  input: { limit?: number; name?: string; offset?: number; query: string; service?: string },
): Promise<QdnResourceSearchResult[]> {
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20)));
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    query: input.query,
    reverse: 'true',
  });

  if (input.service) {
    params.set('service', input.service);
  }

  // A7-2: optional publisher filter (Core matches it as a name substring).
  if (input.name) {
    params.set('name', input.name);
  }

  const results = await fetchNodeApiDataFor<QdnResourceSearchResult[]>(
    network,
    `/arbitrary/resources/search?${params.toString()}`,
    'QDN resource search',
    262144,
  );

  return (Array.isArray(results) ? results : []).filter(
    (entry) => !!entry && typeof entry.name === 'string' && !!entry.name && typeof entry.service === 'string',
  );
}

export async function getNodeStatus() {
  return qdnRequest<NodeStatus>({ action: 'GET_NODE_STATUS' });
}

export async function getQortalActiveGroupStats(limit = 50) {
  const normalizedLimit = Math.min(50, Math.max(1, Math.floor(limit)));

  return fetchNodeApiDataFor<Array<{ groupId: number; size?: number }>>(
    'qortal',
    `/chat/groupstats?limit=${normalizedLimit}`,
    'Active group chats',
    65536,
  );
}

export async function listGroups(
  network: ChatNetwork,
  actions?: QdnAction[],
  limit = DEFAULT_LIST_LIMIT,
) {
  if (hasBridgeAction(actions, 'LIST_GROUPS')) {
    return bridgeRequest<GroupData[]>(network, {
      action: 'LIST_GROUPS',
      limit,
      reverse: false,
    });
  }

  return fetchNodeApiDataFor<GroupData[]>(
    network,
    `/groups?limit=${Math.max(0, Math.floor(limit))}&reverse=false`,
    'Group catalogue',
  );
}

// `network` picks Qortium vs Qortal (default 'qortium' keeps every pre-dual-
// chain call site byte-identical). SEARCH_GROUPS is Qortium-only — Qortal Core
// has no /groups/search — so a Qortal search with a query term lists every
// group and filters client-side by name instead (see docs/
// HOME_V2_BRIDGE_COMPATIBILITY.md in qortium-home).
export async function searchGroups(network: ChatNetwork, search: string, actions?: QdnAction[]) {
  const trimmedSearch = search.trim();

  if (trimmedSearch && hasBridgeAction(actions, 'SEARCH_GROUPS')) {
    return bridgeRequest<GroupData[]>(network, {
      action: 'SEARCH_GROUPS',
      limit: DEFAULT_LIST_LIMIT,
      query: trimmedSearch,
      reverse: false,
      visibility: 'ALL',
    });
  }

  if (!trimmedSearch && hasBridgeAction(actions, 'LIST_GROUPS')) {
    return listGroups(network, actions);
  }

  if (trimmedSearch && network === 'qortal' && hasBridgeAction(actions, 'LIST_GROUPS')) {
    const allGroups = await listGroups(network, actions, 0);
    const needle = trimmedSearch.toLowerCase();

    return allGroups.filter((group) =>
      group.groupName?.toLowerCase().includes(needle) || String(group.groupId) === needle,
    );
  }

  return fetchNodeApiDataFor<GroupData[]>(network, buildGroupsPath(search), 'Group search');
}

export async function getGroup(network: ChatNetwork, groupId: number, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_GROUP')) {
    return bridgeRequest<GroupData>(network, {
      action: 'GET_GROUP',
      groupId,
    });
  }

  return fetchNodeApiDataFor<GroupData>(network, `/groups/${groupId}`, 'Group info');
}

export async function getMemberGroups(network: ChatNetwork, address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACCOUNT_GROUPS')) {
    return bridgeRequest<GroupData[]>(network, {
      action: 'GET_ACCOUNT_GROUPS',
      address,
    });
  }

  return fetchNodeApiDataFor<GroupData[]>(network, buildMemberGroupsPath(address), 'Member groups');
}

export async function getAccountNamesForNetwork(network: ChatNetwork, address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACCOUNT_NAMES')) {
    return bridgeRequest<NameSummary[]>(network, {
      action: 'GET_ACCOUNT_NAMES',
      address,
    });
  }

  return fetchNodeApiDataFor<NameSummary[]>(network, buildAccountNamesPath(address), 'Account names');
}

export async function getAccountNames(address: string, actions?: QdnAction[]) {
  return getAccountNamesForNetwork('qortium', address, actions);
}

// Resolve a registered name to its owner address so a direct chat can be opened
// by name. Returns null when the name is unregistered (Core answers 404, or a
// Qortal GET_NAME_DATA lookup throws — Home's Qortal bridge has no reserved
// "not found" shape of its own to check against). Qortium always reads through
// FETCH_NODE_API (its Home bridge never advertises a GET_NAME_DATA-equivalent
// exact action); Qortal prefers the exact GET_NAME_DATA action when Home
// advertises it, else falls back to the same FETCH_NODE_API path Qortium uses,
// against the Qortal node. Both paths are keyless, CORS-open reads that work
// through the Home bridge and in browser dev.
export async function getNameOwnerAddressForNetwork(
  network: ChatNetwork,
  name: string,
  actions?: QdnAction[],
): Promise<string | null> {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return null;
  }

  if (network === 'qortal' && hasBridgeAction(actions, 'GET_NAME_DATA')) {
    try {
      const data = await bridgeRequest<NameSummary | null>('qortal', {
        action: 'GET_NAME_DATA',
        name: trimmedName,
      });

      return data && typeof data.owner === 'string' && data.owner ? data.owner : null;
    } catch {
      return null;
    }
  }

  const result = await bridgeRequest<NodeApiFetchResult<NameSummary | null>>(network, {
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

export async function getNameOwnerAddress(name: string): Promise<string | null> {
  return getNameOwnerAddressForNetwork('qortium', name);
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

export async function getGroupMembers(network: ChatNetwork, groupId: number, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_GROUP_MEMBERS')) {
    const response = await bridgeRequest<GroupMember[] | GroupMembersResponse>(network, {
      action: 'GET_GROUP_MEMBERS',
      groupId,
      limit: DEFAULT_LIST_LIMIT,
      reverse: false,
    });

    return normalizeGroupMembers(response);
  }

  return normalizeGroupMembers(
    await fetchNodeApiDataFor<GroupMember[] | GroupMembersResponse>(
      network,
      buildGroupMembersPath(groupId),
      'Group members',
    ),
  );
}

// `network` picks Qortium vs Qortal (default 'qortium' keeps every
// pre-dual-chain call site byte-identical). Home 2 advertises
// GET_ACCOUNT_GROUP_JOIN_REQUESTS on both bridge globals (review/
// schemas-home2-actions.md "Group join requests"), so only the dispatch
// target and the FETCH_NODE_API fallback's node change with the network.
export async function getAccountGroupJoinRequests(
  address: string,
  actions?: QdnAction[],
  network: ChatNetwork = 'qortium',
) {
  if (hasBridgeAction(actions, 'GET_ACCOUNT_GROUP_JOIN_REQUESTS')) {
    return bridgeRequest<GroupJoinRequest[]>(network, {
      action: 'GET_ACCOUNT_GROUP_JOIN_REQUESTS',
      address,
    });
  }

  return fetchNodeApiDataFor<GroupJoinRequest[]>(
    network,
    buildAccountGroupJoinRequestsPath(address),
    'Join requests',
  );
}

export async function getAdminGroupJoinRequests(
  address: string,
  actions?: QdnAction[],
  network: ChatNetwork = 'qortium',
) {
  if (hasBridgeAction(actions, 'GET_ADMIN_GROUP_JOIN_REQUESTS')) {
    return bridgeRequest<GroupWithJoinRequests[]>(network, {
      action: 'GET_ADMIN_GROUP_JOIN_REQUESTS',
      address,
    });
  }

  return fetchNodeApiDataFor<GroupWithJoinRequests[]>(
    network,
    buildAdminGroupJoinRequestsPath(address),
    'Admin join requests',
  );
}

export async function getGroupJoinRequests(groupId: number, actions?: QdnAction[], network: ChatNetwork = 'qortium') {
  if (hasBridgeAction(actions, 'GET_GROUP_JOIN_REQUESTS')) {
    return bridgeRequest<GroupJoinRequest[]>(network, {
      action: 'GET_GROUP_JOIN_REQUESTS',
      groupId,
    });
  }

  return fetchNodeApiDataFor<GroupJoinRequest[]>(network, buildGroupJoinRequestsPath(groupId), 'Group join requests');
}

// `network` picks Qortium vs Qortal (default 'qortium' keeps every
// pre-dual-chain call site byte-identical). Group joins/leaves/approvals
// confirm into blocks on both chains (unlike CHAT transactions), so the same
// /transactions/signature read is meaningful on either node — only the
// FETCH_NODE_API dispatch target changes with the network.
export async function getTransactionStatus(signature: string, network: ChatNetwork = 'qortium') {
  return fetchNodeApiDataFor<TransactionStatus>(
    network,
    buildTransactionStatusPath(signature),
    'Transaction status',
  );
}

export async function getPendingGroupApprovals(txGroupId: number) {
  // Keyless, CORS-open read; works through the bridge and in browser read-only mode.
  return fetchNodeApiData<PendingApprovalTransaction[]>(
    buildPendingTransactionsPath(txGroupId),
    'Pending approvals',
  );
}

export function buildGroupApprovalVotesPath(limit = DEFAULT_LIST_LIMIT, offset = 0) {
  // GROUP_APPROVAL votes always ride the root group; there is no pendingSignature
  // query param, so the caller filters by pendingSignature client-side.
  const query = new URLSearchParams({
    txType: 'GROUP_APPROVAL',
    confirmationStatus: 'CONFIRMED',
    limit: String(limit),
    reverse: 'true',
  });

  if (offset > 0) {
    query.set('offset', String(offset));
  }

  return `/transactions/search?${query.toString()}`;
}

// A busy chain can push the votes relevant to a still-pending transaction past a
// single latest-100 page, undercounting the tally. Page backward until a short
// page (no more votes) or this safety cap, so the count stays correct without an
// unbounded scan.
const GROUP_APPROVAL_VOTES_MAX_PAGES = 20;

export async function getGroupApprovalVotes() {
  // Keyless read of recent confirmed approval votes; the tally for a given pending
  // transaction is computed client-side (see computeApprovalProgress).
  const votes: GroupApprovalVote[] = [];

  for (let page = 0; page < GROUP_APPROVAL_VOTES_MAX_PAGES; page += 1) {
    const pageVotes = await fetchNodeApiData<GroupApprovalVote[]>(
      buildGroupApprovalVotesPath(DEFAULT_LIST_LIMIT, page * DEFAULT_LIST_LIMIT),
      'Approval votes',
    );

    votes.push(...pageVotes);

    if (pageVotes.length < DEFAULT_LIST_LIMIT) {
      break;
    }
  }

  return votes;
}

export function buildGroupInvitesPath(address: string) {
  return `/groups/invites/${encodeURIComponent(address)}`;
}

export async function getGroupInvites(address: string) {
  // Keyless read: pending invitations sent TO this address. No dedicated
  // bridge action exists, so this always rides FETCH_NODE_API.
  return fetchNodeApiData<GroupInvite[]>(buildGroupInvitesPath(address), 'Group invites');
}

export function buildBlockHeightPath() {
  return '/blocks/height';
}

export async function getCurrentBlockHeight() {
  // Keyless read returning the tip height; used to compute the approval
  // window's relative ETA. Core serves /blocks/height as text/plain with a
  // bare-digit body, which neither the bridge nor the fallback parser treats
  // as JSON — the value arrives as a string and must be coerced here.
  const height = await fetchNodeApiData<number | string>(buildBlockHeightPath(), 'Block height');
  // Number('') is 0, so an empty body must fail rather than read as height 0.
  const parsed =
    typeof height === 'number' ? height : height.trim() === '' ? Number.NaN : Number(height);

  if (!Number.isFinite(parsed)) {
    throw new Error('Block height failed to parse as a number.');
  }

  return parsed;
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
    const [mintingAccounts, nodeStatus] = await Promise.all([
      fetchNodeApiData<NodeMintingAccount[]>('/admin/mintingaccounts', 'Minting accounts'),
      fetchNodeApiData<NodeStatus>('/admin/status', 'Node status'),
    ]);
    const keyOnNode = mintingAccounts.some(
      (mintingAccount) => mintingAccount.mintingAccount === address && mintingAccount.recipientAccount === address,
    );

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

export async function getActiveChats(network: ChatNetwork, address: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'GET_ACTIVE_CHATS')) {
    return bridgeRequest<ActiveChats>(network, {
      action: 'GET_ACTIVE_CHATS',
      address,
      encoding: 'BASE64',
      hasChatReference: false,
    });
  }

  return fetchNodeApiDataFor<ActiveChats>(network, buildActiveChatsPath(address), 'Active chats');
}

export async function getPrivateDirectActiveChats(actions?: QdnAction[], network: ChatNetwork = 'qortium') {
  if (!hasBridgeAction(actions, 'GET_PRIVATE_DIRECT_ACTIVE_CHATS')) {
    return [];
  }

  return bridgeRequest<NonNullable<ActiveChats['direct']>>(network, {
    action: 'GET_PRIVATE_DIRECT_ACTIVE_CHATS',
    encoding: 'BASE64',
    hasChatReference: false,
  });
}

export async function getGroupMessages(
  network: ChatNetwork,
  group: GroupData,
  actions?: QdnAction[],
  options: { before?: number; decryptPrivate?: boolean; limit?: number } = {},
) {
  const groupId = group.groupId;
  const shouldDecryptPrivate = options.decryptPrivate !== false;
  // `limit` lets cheap callers (the sidebar activity sweep) request a small
  // window instead of the full transcript page.
  const limit = options.limit ?? DEFAULT_LIST_LIMIT;

  // Qortal Core rejects/discards native groupless CHAT transactions. Community
  // Edition's General Chat protocol instead carries the signed group-0 CHAT
  // bytes inside an unconfirmable MESSAGE transaction. Read that wrapper feed
  // directly before considering Hub's ordinary SEARCH_CHAT_MESSAGES action.
  if (network === 'qortal' && groupId === 0) {
    return getQortalGeneralChatMessages({ before: options.before, limit });
  }

  const messageRequest = {
    encoding: 'BASE64',
    // Home 2's native chain-read gate requires the Core-canonical field name,
    // while older Home/private-group handlers still read `groupId`. Supplying
    // the same validated value under both names keeps the request compatible
    // across those hosts without leaving room for conflicting selectors.
    groupId,
    txGroupId: groupId,
    limit,
    reverse: true,
    // When set, return the window of messages immediately older than this
    // timestamp so callers can page backward through the full history.
    ...(typeof options.before === 'number' ? { before: options.before } : {}),
  };

  if (group.isOpen === false && shouldDecryptPrivate) {
    // Both protocols' Home 2 bridge can advertise SEARCH_PRIVATE_GROUP_CHAT_
    // MESSAGES (review/schemas-private-group-actions.md — Qortal's private-
    // bundle reads are network-routed the same as Qortium's QPGC reads); a
    // closed group on either chain hits this same gate only on an older/
    // legacy bridge that does not advertise it.
    if (!hasBridgeAction(actions, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES')) {
      throw new Error('Closed group chat reads require Qortium Home private group chat support.');
    }

    const messages = await bridgeRequest<ChatMessage[]>(network, {
      action: 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
      ...messageRequest,
    });

    return sortMessagesByTimestamp(messages);
  }

  if (hasBridgeAction(actions, 'SEARCH_CHAT_MESSAGES')) {
    const messages = await bridgeRequest<ChatMessage[]>(network, {
      action: 'SEARCH_CHAT_MESSAGES',
      ...messageRequest,
    });

    return sortMessagesByTimestamp(messages);
  }

  const messages = await fetchNodeApiDataFor<ChatMessage[]>(
    network,
    buildGroupMessagesPath(groupId, limit, options.before),
    'Group messages',
  );

  return sortMessagesByTimestamp(messages);
}

// Qortium/QPGC state discriminates on `qpgcVersion`; Qortal state discriminates
// on `qortalPrivateGroupVersion` — the two per-chain result shapes documented
// in review/schemas-private-group-actions.md "GET_PRIVATE_GROUP_CHAT_STATE"
// share no other reliably-present field to switch on.
export function isQortiumPrivateGroupChatState(
  state: PrivateGroupChatState,
): state is QortiumPrivateGroupChatState {
  return (state as QortiumPrivateGroupChatState).qpgcVersion === 1;
}

export function isQortalPrivateGroupChatState(
  state: PrivateGroupChatState,
): state is QortalPrivateGroupChatState {
  return (state as QortalPrivateGroupChatState).qortalPrivateGroupVersion === 1;
}

// GET_PRIVATE_GROUP_ACTIVE_CHATS — one entry per eligible closed group (latest
// decrypted row, or a MISSING_KEY/NO_MESSAGES marker). Returns [] rather than
// throwing when unadvertised, matching getPrivateDirectActiveChats: "no
// private-group activity support" and "no private-group activity yet" read
// the same to every caller of this function.
export async function getPrivateGroupActiveChats(
  network: ChatNetwork,
  actions?: QdnAction[],
): Promise<PrivateGroupActiveChatEntry[]> {
  if (!hasBridgeAction(actions, 'GET_PRIVATE_GROUP_ACTIVE_CHATS')) {
    return [];
  }

  return bridgeRequest<PrivateGroupActiveChatEntry[]>(network, {
    action: 'GET_PRIVATE_GROUP_ACTIVE_CHATS',
    encoding: 'BASE64',
    limit: DEFAULT_LIST_LIMIT,
  });
}

// GET_PRIVATE_GROUP_CHAT_STATE — unlike the active-chats read above, this
// throws when unadvertised: callers use it to drive composer gating/caps for
// one specific selected group, where silently returning "no state" would
// read as "this group has no state" rather than "this host cannot answer".
export async function getPrivateGroupChatState(
  network: ChatNetwork,
  groupId: number,
  actions?: QdnAction[],
): Promise<PrivateGroupChatState> {
  if (!hasBridgeAction(actions, 'GET_PRIVATE_GROUP_CHAT_STATE')) {
    throw new Error('Private group chat state requires Qortium Home private group chat support.');
  }

  return bridgeRequest<PrivateGroupChatState>(network, {
    action: 'GET_PRIVATE_GROUP_CHAT_STATE',
    encoding: 'BASE64',
    groupId,
  });
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

// Raw REQUEST_PRIVATE_GROUP_CHAT_KEY responses have no shared shape across
// chains (review/schemas-private-group-actions.md § 5): QPGC broadcasts a
// signed control envelope ({signature, timestamp}); Qortal instead attempts
// local/resource recovery with no transaction at all
// ({accepted, recovered, resourceSignature}). Every raw field is kept
// (spread) alongside the added `kind` so callers reading the pre-P3a
// pass-through shape (e.g. an existing legacy mock/response) are unaffected.
function normalizePrivateGroupKeyRequestResult(raw: unknown): PrivateGroupKeyRequestOutcome {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if (typeof record.recovered === 'boolean') {
    return { ...record, kind: 'recovery' };
  }

  // QPGC broadcast result, or an unrecognized/legacy shape — default to
  // 'broadcast' since that is this wrapper's Qortium-primary case.
  return { ...record, kind: 'broadcast' };
}

// Shared by RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS and
// ROTATE_PRIVATE_GROUP_CHAT_KEY — review/schemas-private-group-actions.md § 5
// documents the same result-shape family for both. QPGC relays zero, one
// ({signature, timestamp}, no `relayed`/`accepted` field at all), or many
// ({accepted, relayed, results[]}) announcements; Qortal instead publishes/
// rotates an administrator key bundle ({accepted, signature, timestamp}).
// `signatures` always holds every relayed/published signature found in the
// raw response (empty when none); raw fields are kept alongside, same
// rationale as normalizePrivateGroupKeyRequestResult above.
function normalizePrivateGroupKeyResolutionResult(raw: unknown): PrivateGroupKeyResolutionOutcome {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if ('relayed' in record) {
    const signatures = Array.isArray(record.results)
      ? (record.results as Array<Record<string, unknown>>)
          .map((entry) => (typeof entry.signature === 'string' ? entry.signature : null))
          .filter((signature): signature is string => signature !== null)
      : [];

    return { ...record, kind: 'relay', signatures };
  }

  if (typeof record.signature === 'string' && !('accepted' in record)) {
    // QPGC: exactly one relayed envelope.
    return { ...record, kind: 'relay', signatures: [record.signature] };
  }

  if (typeof record.signature === 'string' && 'accepted' in record) {
    // Qortal administrator publication/rotation.
    return { ...record, kind: 'publication', signatures: [record.signature] };
  }

  // Unrecognized/legacy shape (e.g. an existing pre-P3a mock) — no signature
  // to extract.
  return { ...record, kind: 'relay', signatures: [] };
}

// `network` is trailing and defaults to 'qortium' so every existing call site
// keeps dispatching through qdnRequest exactly as before (bridgeRequest routes
// 'qortium' to qdnRequest — see chatNetwork.ts). The raw legacy pass-through
// shape existing callers may already rely on is preserved via the spread
// inside normalizePrivateGroupKeyRequestResult.
export async function requestPrivateGroupChatKey(
  request: PrivateGroupChatKeyRequest,
  actions?: QdnAction[],
  network: ChatNetwork = 'qortium',
) {
  if (!hasBridgeAction(actions, 'REQUEST_PRIVATE_GROUP_CHAT_KEY')) {
    throw new Error('Private group chat key requests require Qortium Home key recovery support.');
  }

  const raw = await bridgeRequest<PrivateGroupChatKeyRequestResult>(network, {
    action: 'REQUEST_PRIVATE_GROUP_CHAT_KEY',
    ...(request.epochId ? { epochId: request.epochId } : {}),
    groupId: request.groupId,
    ...(request.keyId ? { keyId: request.keyId } : {}),
  });

  return normalizePrivateGroupKeyRequestResult(raw);
}

export async function resolvePrivateGroupChatKeyRequests(
  groupId: number,
  actions?: QdnAction[],
  limit = 20,
  network: ChatNetwork = 'qortium',
) {
  if (!hasBridgeAction(actions, 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS')) {
    throw new Error('Private group chat key request resolution requires Qortium Home key recovery support.');
  }

  const raw = await bridgeRequest<PrivateGroupChatKeyRequestRecoveryResult>(network, {
    action: 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS',
    groupId,
    limit,
  });

  return normalizePrivateGroupKeyResolutionResult(raw);
}

// ROTATE_PRIVATE_GROUP_CHAT_KEY has no pre-P3a call site (this action family
// did not exist before), so unlike the two functions above there is no
// legacy signature/shape to preserve — `network` leads like every other new
// (network, …, actions?) wrapper in this file.
export async function rotatePrivateGroupChatKey(
  network: ChatNetwork,
  groupId: number,
  actions?: QdnAction[],
) {
  if (!hasBridgeAction(actions, 'ROTATE_PRIVATE_GROUP_CHAT_KEY')) {
    throw new Error('Private group chat key rotation requires Qortium Home key recovery support.');
  }

  const raw = await bridgeRequest<Record<string, unknown>>(network, {
    action: 'ROTATE_PRIVATE_GROUP_CHAT_KEY',
    groupId,
  });

  return normalizePrivateGroupKeyResolutionResult(raw);
}

export async function getDirectMessages(
  otherAddress: string,
  actions?: QdnAction[],
  options: { before?: number; limit?: number } = {},
  network: ChatNetwork = 'qortium',
) {
  if (hasBridgeAction(actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES')) {
    const messages = await bridgeRequest<ChatMessage[]>(network, {
      action: 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
      encoding: 'BASE64',
      // `limit` lets cheap callers (the sidebar activity sweep) request a
      // small window instead of the full transcript page.
      limit: options.limit ?? DEFAULT_LIST_LIMIT,
      otherAddress,
      reverse: true,
      ...(typeof options.before === 'number' ? { before: options.before } : {}),
    });

    return sortMessagesByTimestamp(messages);
  }

  throw new Error('Direct private chat reads require Qortium Home direct chat support.');
}

// Bytes path (attachments-matrix A1): publishes an open-group attachment
// from base64 the app prepared itself (attachments.ts prepareLocalAttachment).
// `base64` + `filename` is the inline-source contract every Home 1.x reads
// (`data64` || `base64`), Home 2 Android still reads, and Qortal Hub reads
// (`data64` || `base64` || `file`). Home 2 desktop rejects every inline field
// outright — callers gate on attachmentCapabilities.hostAcceptsInlinePublishBytes
// and fall back to selectQdnPublishSource + publishQdnResource there.
//
// The host shows its own publish-approval prompt, builds the ARBITRARY
// transaction, and signs; the app never touches key material. Hosts differ in
// what they return (Home 1.x: `{accepted, resource, result}`; Hub: the node's
// transaction response), so the only contract relied on here is
// "resolved = published, rejected = not" — plus Home's explicit
// `accepted: false` shape, which is turned into an error.
export async function publishQdnResourceBytes(
  network: ChatNetwork,
  request: {
    dataBase64: string;
    fileName: string;
    identifier: string;
    name: string;
    service: 'ATTACHMENT' | 'IMAGE';
  },
  actions?: QdnAction[],
): Promise<void> {
  if (!hasBridgeAction(actions, 'PUBLISH_QDN_RESOURCE')) {
    throw new Error('Publishing a QDN resource requires a newer Qortium Home bridge.');
  }

  if (!request.dataBase64) {
    throw new Error('There is no file data to publish.');
  }

  if (!request.name) {
    throw new Error('A resource name is required.');
  }

  assertNotDotSegment('Resource name', request.name);
  assertNotDotSegment('Resource identifier', request.identifier);
  assertQdnPublishTextField('Resource identifier', request.identifier, QDN_PUBLISH_IDENTIFIER_MAX_BYTES);

  const raw = await bridgeRequest<unknown>(network, {
    action: 'PUBLISH_QDN_RESOURCE',
    base64: request.dataBase64,
    filename: request.fileName,
    identifier: request.identifier,
    name: request.name,
    service: request.service,
  });

  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;

  if (record && record.accepted === false) {
    throw new Error(typeof record.error === 'string' && record.error ? record.error : 'QDN resource publish was rejected.');
  }
}

// B3 (home#495): stage bytes the app already holds (paste/drop) as a normal
// publish source. Returns the same selection shape SELECT_QDN_PUBLISH_SOURCE
// does; the token is redeemed by publishQdnResource / publishChatAttachment
// unchanged, and the host still shows its full approval prompt at publish
// time. 25 MiB host-side cap.
export async function stageQdnPublishBlob(
  network: ChatNetwork,
  blob: { dataBase64: string; fileName: string; mimeType: string | null },
  actions?: QdnAction[],
): Promise<QdnPublishSourceSelection> {
  if (!hasBridgeAction(actions, 'STAGE_QDN_PUBLISH_SOURCE')) {
    throw new Error('Staging pasted or dropped bytes requires a newer Qortium Home bridge.');
  }

  const raw = await bridgeRequest<Record<string, unknown>>(network, {
    action: 'STAGE_QDN_PUBLISH_SOURCE',
    bytesBase64: blob.dataBase64,
    fileName: blob.fileName,
    ...(blob.mimeType ? { mimeType: blob.mimeType } : {}),
  });
  const fileName = typeof raw?.fileName === 'string' ? raw.fileName : '';
  const size = typeof raw?.size === 'number' ? raw.size : NaN;
  const sourceToken = typeof raw?.sourceToken === 'string' ? raw.sourceToken : '';
  const mimeType = typeof raw?.mimeType === 'string' ? raw.mimeType : null;

  if (!fileName || !sourceToken || !Number.isFinite(size)) {
    throw new Error('Staging the file returned an incomplete result.');
  }

  return { canceled: false, fileName, kind: 'file', mimeType, size, sourceToken };
}

// -------- P4a: publish source token flow --------
//
// review/schemas-publish-attachments.md §§ 1-2.

// Opens Home's native file picker and returns an opaque, Home-issued token
// bound to this app/account/network/route/tab. The app never receives the
// native path or file bytes — only fileName/mimeType/size for display, plus
// the sourceToken PUBLISH_QDN_RESOURCE / PUBLISH_CHAT_ATTACHMENT redeem. The
// token expires after 30 minutes; callers should re-select on
// isPublishSourceTokenError rather than retry the same token.
export async function selectQdnPublishSource(
  network: ChatNetwork,
  actions?: QdnAction[],
): Promise<QdnPublishSourceSelection> {
  if (!hasBridgeAction(actions, 'SELECT_QDN_PUBLISH_SOURCE')) {
    throw new Error('Selecting a file to publish requires a newer Qortium Home bridge.');
  }

  const raw = await bridgeRequest<Record<string, unknown>>(network, {
    action: 'SELECT_QDN_PUBLISH_SOURCE',
  });

  if (raw?.canceled === true) {
    return { canceled: true };
  }

  const fileName = typeof raw?.fileName === 'string' ? raw.fileName : '';
  const size = typeof raw?.size === 'number' ? raw.size : NaN;
  const sourceToken = typeof raw?.sourceToken === 'string' ? raw.sourceToken : '';
  const mimeType = typeof raw?.mimeType === 'string' ? raw.mimeType : null;

  if (!fileName || !sourceToken || !Number.isFinite(size)) {
    throw new Error('Publish source selection is missing required fields.');
  }

  return { canceled: false, fileName, kind: 'file', mimeType, size, sourceToken };
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function assertQdnPublishTextField(label: string, value: string, maxBytes: number) {
  if (utf8ByteLength(value) > maxBytes) {
    throw new Error(`${label} must be at most ${maxBytes} UTF-8 bytes.`);
  }
}

function assertNotDotSegment(label: string, value: string) {
  if (value === '.' || value === '..') {
    throw new Error(`${label} cannot be "." or "..".`);
  }
}

// review/schemas-publish-attachments.md § 2 "Constraints".
const QDN_PUBLISH_NAME_MAX_BYTES: Record<ChatNetwork, number> = { qortal: 400, qortium: 40 };
const QDN_PUBLISH_IDENTIFIER_MAX_BYTES = 64;
const QDN_PUBLISH_TITLE_MAX_BYTES = 80;
const QDN_PUBLISH_DESCRIPTION_MAX_BYTES = 500;
const QDN_PUBLISH_CATEGORY_MAX_BYTES = 40;
const QDN_PUBLISH_TAG_MAX_BYTES = 20;
const QDN_PUBLISH_TAGS_MAX_COUNT = 5;

function normalizeQdnPublishOutcome(raw: unknown): QdnPublishOutcome {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if (record.accepted === true) {
    return record as unknown as QdnPublishOutcome;
  }

  if (record.outcome === 'unknown') {
    return record as unknown as QdnPublishOutcome;
  }

  throw new Error('QDN resource publish returned an unrecognized result.');
}

// Publishes a resource from a Home-issued sourceToken (see
// selectQdnPublishSource above) — the only source PUBLISH_QDN_RESOURCE
// accepts. `fee` is never sent: Home derives it from the selected source and
// rejects a nonzero value (review/schemas-publish-attachments.md § 2
// "Constraints"). Validation here mirrors Home's own constraints so a bad
// request fails fast instead of round-tripping; Home still re-validates
// everything server-side.
export async function publishQdnResource(
  network: ChatNetwork,
  request: QdnPublishRequest,
  actions?: QdnAction[],
): Promise<QdnPublishOutcome> {
  if (!hasBridgeAction(actions, 'PUBLISH_QDN_RESOURCE')) {
    throw new Error('Publishing a QDN resource requires a newer Qortium Home bridge.');
  }

  if (!request.sourceToken) {
    throw new Error('A valid Home-issued publish source token is required.');
  }

  if (!request.name) {
    throw new Error('A resource name is required.');
  }

  assertNotDotSegment('Resource name', request.name);
  assertQdnPublishTextField('Resource name', request.name, QDN_PUBLISH_NAME_MAX_BYTES[network]);

  if (request.identifier) {
    assertNotDotSegment('Resource identifier', request.identifier);
    assertQdnPublishTextField('Resource identifier', request.identifier, QDN_PUBLISH_IDENTIFIER_MAX_BYTES);
  }

  const hasMetadata =
    !!request.title || !!request.description || !!request.category || (request.tags?.length ?? 0) > 0;

  // Qortal rejects any nonempty title/description/category/tags outright —
  // fail fast here rather than let a doomed request reach Home.
  if (network === 'qortal' && hasMetadata) {
    throw new Error('Qortal does not accept a title, description, category, or tags on a published resource.');
  }

  if (request.title) {
    assertQdnPublishTextField('Title', request.title, QDN_PUBLISH_TITLE_MAX_BYTES);
  }

  if (request.description) {
    assertQdnPublishTextField('Description', request.description, QDN_PUBLISH_DESCRIPTION_MAX_BYTES);
  }

  if (request.category) {
    assertQdnPublishTextField('Category', request.category, QDN_PUBLISH_CATEGORY_MAX_BYTES);
  }

  if (request.tags && request.tags.length > 0) {
    if (request.tags.length > QDN_PUBLISH_TAGS_MAX_COUNT) {
      throw new Error(`At most ${QDN_PUBLISH_TAGS_MAX_COUNT} tags are allowed.`);
    }

    for (const tag of request.tags) {
      assertQdnPublishTextField('Tag', tag, QDN_PUBLISH_TAG_MAX_BYTES);
    }
  }

  const wireRequest: { action: string; [key: string]: unknown } = {
    action: 'PUBLISH_QDN_RESOURCE',
    name: request.name,
    service: request.service,
    sourceToken: request.sourceToken,
  };

  if (request.identifier) wireRequest.identifier = request.identifier;
  if (request.title) wireRequest.title = request.title;
  if (request.description) wireRequest.description = request.description;
  if (request.category) wireRequest.category = request.category;
  if (request.tags) wireRequest.tags = request.tags;

  return normalizeQdnPublishOutcome(await bridgeRequest<Record<string, unknown>>(network, wireRequest));
}

// -------- P4a: private chat attachments --------
//
// review/schemas-publish-attachments.md §§ 3-4.

function assertPrivateAttachmentConversation(conversation: PrivateAttachmentConversation) {
  if (conversation.kind === 'direct') {
    if (!conversation.otherAddress) {
      throw new Error('A direct attachment requires the recipient address.');
    }

    return;
  }

  if (conversation.kind === 'group') {
    if (
      !Number.isInteger(conversation.groupId) ||
      conversation.groupId < 1 ||
      conversation.groupId > 2147483647
    ) {
      throw new Error('A group attachment requires a valid group id.');
    }

    return;
  }

  throw new Error('An attachment conversation selector is required.');
}

function normalizeChatAttachmentOutcome(raw: unknown): ChatAttachmentOutcome {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if (record.accepted === true || record.outcome === 'unknown') {
    return record as unknown as ChatAttachmentOutcome;
  }

  throw new Error('Chat attachment publish returned an unrecognized result.');
}

// Publishes an encrypted attachment into a private conversation (closed
// group or direct) from a Home-issued sourceToken, same source contract as
// publishQdnResource above. Home encrypts client-side with the conversation
// key and returns an immutable descriptor — this app never sees plaintext
// bytes or key material.
export async function publishChatAttachment(
  network: ChatNetwork,
  sourceToken: string,
  conversation: PrivateAttachmentConversation,
  actions?: QdnAction[],
): Promise<ChatAttachmentOutcome> {
  if (!hasBridgeAction(actions, 'PUBLISH_CHAT_ATTACHMENT')) {
    throw new Error('Private chat attachments require a newer Qortium Home bridge.');
  }

  if (!sourceToken) {
    throw new Error('A valid Home-issued publish source token is required.');
  }

  assertPrivateAttachmentConversation(conversation);

  return normalizeChatAttachmentOutcome(
    await bridgeRequest<Record<string, unknown>>(network, {
      action: 'PUBLISH_CHAT_ATTACHMENT',
      conversation,
      sourceToken,
    }),
  );
}

const PRIVATE_ATTACHMENT_CODECS = [
  'qenc-v2-direct',
  'qenc-v2-group',
  'qortal-hub-group-image-v1',
  'qortal-qatt-direct-v1',
  'qortal-qatt-group-v1',
] as const;

const PRIVATE_ATTACHMENT_SERVICES = ['IMAGE', 'QCHAT_ATTACHMENT_PRIVATE'] as const;

const PRIVATE_ATTACHMENT_HASH_RE = /^[0-9a-f]{64}$/;
const PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES = 1024 * 1024;

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Full structural validation of a PrivateAttachmentDescriptor — used to
// safely parse a descriptor out of an incoming message payload (untrusted
// input), so this must be strict about every field and must never throw.
// Extra keys beyond the schema are tolerated (forward compatibility); a
// missing/malformed required field or an unrecognized codec/service/network
// fails closed.
export function isPrivateAttachmentDescriptor(value: unknown): value is PrivateAttachmentDescriptor {
  if (!isRecordValue(value)) {
    return false;
  }

  if (value.version !== 1 || value.encrypted !== true) {
    return false;
  }

  if (value.network !== 'qortal' && value.network !== 'qortium') {
    return false;
  }

  if (
    typeof value.codec !== 'string' ||
    !(PRIVATE_ATTACHMENT_CODECS as readonly string[]).includes(value.codec)
  ) {
    return false;
  }

  const conversation = value.conversation;

  if (!isRecordValue(conversation)) {
    return false;
  }

  if (conversation.kind === 'direct') {
    if (typeof conversation.otherAddress !== 'string' || !conversation.otherAddress) {
      return false;
    }
  } else if (conversation.kind === 'group') {
    if (
      typeof conversation.groupId !== 'number' ||
      !Number.isInteger(conversation.groupId) ||
      conversation.groupId < 1 ||
      conversation.groupId > 2147483647
    ) {
      return false;
    }
  } else {
    return false;
  }

  const resource = value.resource;

  if (!isRecordValue(resource)) {
    return false;
  }

  if (
    typeof resource.service !== 'string' ||
    !(PRIVATE_ATTACHMENT_SERVICES as readonly string[]).includes(resource.service)
  ) {
    return false;
  }

  if (typeof resource.name !== 'string' || !resource.name) {
    return false;
  }

  if (typeof resource.identifier !== 'string' || !resource.identifier) {
    return false;
  }

  const ciphertext = value.ciphertext;

  if (!isRecordValue(ciphertext)) {
    return false;
  }

  if (ciphertext.algorithm !== 'SHA-256') {
    return false;
  }

  if (typeof ciphertext.hash !== 'string' || !PRIVATE_ATTACHMENT_HASH_RE.test(ciphertext.hash)) {
    return false;
  }

  if (
    typeof ciphertext.size !== 'number' ||
    !Number.isInteger(ciphertext.size) ||
    ciphertext.size < 1 ||
    ciphertext.size > PRIVATE_ATTACHMENT_MAX_CIPHERTEXT_BYTES
  ) {
    return false;
  }

  if (typeof ciphertext.transactionSignature !== 'string' || !ciphertext.transactionSignature) {
    return false;
  }

  return true;
}

// Access trio (review/schemas-publish-attachments.md § 4). All three send
// `{ descriptor }`; Home fully re-validates the descriptor server-side.

// The returned URL is an opaque, one-shot capability that expires after 10
// minutes and supports one forward byte range (desktop:
// qortium-home-resource://stream/<uuid>; Android: an authorized HTTPS proxy
// URL). Never cache this value — fetch a fresh one each time bytes are
// actually needed.
export async function getChatAttachmentStreamUrl(
  network: ChatNetwork,
  descriptor: PrivateAttachmentDescriptor,
  actions?: QdnAction[],
): Promise<string> {
  if (!hasBridgeAction(actions, 'GET_CHAT_ATTACHMENT_STREAM_URL')) {
    throw new Error('Streaming a chat attachment requires a newer Qortium Home bridge.');
  }

  return bridgeRequest<string>(network, {
    action: 'GET_CHAT_ATTACHMENT_STREAM_URL',
    descriptor,
  });
}

export async function openChatAttachmentViewer(
  network: ChatNetwork,
  descriptor: PrivateAttachmentDescriptor,
  actions?: QdnAction[],
): Promise<true> {
  if (!hasBridgeAction(actions, 'OPEN_CHAT_ATTACHMENT_VIEWER')) {
    throw new Error('Opening the chat attachment viewer requires a newer Qortium Home bridge.');
  }

  return bridgeRequest<true>(network, {
    action: 'OPEN_CHAT_ATTACHMENT_VIEWER',
    descriptor,
  });
}

export async function saveChatAttachment(
  network: ChatNetwork,
  descriptor: PrivateAttachmentDescriptor,
  actions?: QdnAction[],
): Promise<{ canceled: boolean }> {
  if (!hasBridgeAction(actions, 'SAVE_CHAT_ATTACHMENT')) {
    throw new Error('Saving a chat attachment requires a newer Qortium Home bridge.');
  }

  const raw = await bridgeRequest<{ canceled?: boolean }>(network, {
    action: 'SAVE_CHAT_ATTACHMENT',
    descriptor,
  });

  return { canceled: raw?.canceled === true };
}

// -------- P4a: public QDN resource viewer/stream/save/url quartet --------
//
// review/schemas-publish-attachments.md § 5. messageLinks.tsx already calls
// some of these raw (e.g. SAVE_QDN_RESOURCE) against its own resource types;
// these wrappers are additive here and are not yet wired into messageLinks —
// that rewiring is chunk P4b's job.

function buildQdnResourceCoordinateRequest(coordinate: QdnResourceCoordinate) {
  const request: Record<string, unknown> = {
    name: coordinate.name,
    service: coordinate.service,
  };

  if (coordinate.identifier) request.identifier = coordinate.identifier;
  if (coordinate.path) request.path = coordinate.path;
  if (coordinate.filename) request.filename = coordinate.filename;
  if (coordinate.mimeType) request.mimeType = coordinate.mimeType;

  return request;
}

export async function openQdnResourceViewer(
  network: ChatNetwork,
  coordinate: QdnResourceCoordinate,
  actions?: QdnAction[],
): Promise<true> {
  if (!hasBridgeAction(actions, 'OPEN_QDN_RESOURCE_VIEWER')) {
    throw new Error('Opening the QDN resource viewer requires a newer Qortium Home bridge.');
  }

  return bridgeRequest<true>(network, {
    action: 'OPEN_QDN_RESOURCE_VIEWER',
    ...buildQdnResourceCoordinateRequest(coordinate),
  });
}

// GET_QDN_RESOURCE_STREAM_URL accepts only media/document services
// (review/schemas-publish-attachments.md § 5 "Supported streaming
// services"); APP/WEBSITE/GAME resources must be opened with a navigation
// action instead (openQdnResourceViewer's OPEN_NEW_TAB sibling, or
// OPEN_QDN_RESOURCE_VIEWER's own rejection for those services).
const QDN_STREAM_SERVICES = [
  'IMAGE',
  'THUMBNAIL',
  'QCHAT_IMAGE',
  'AUDIO',
  'VOICE',
  'PODCAST',
  'VIDEO',
  'DOCUMENT',
  'FILE',
  'FILES',
  'ATTACHMENT',
] as const;

function assertStreamableQdnService(service: string) {
  if (!(QDN_STREAM_SERVICES as readonly string[]).includes(service)) {
    throw new Error(
      `${service} resources cannot be streamed inline; open them with a navigation action instead (APP/WEBSITE/GAME are not streamable).`,
    );
  }
}

// The returned URL is the same opaque, 10-minute, one-forward-range
// capability as getChatAttachmentStreamUrl above — never cache it here.
export async function getQdnResourceStreamUrl(
  network: ChatNetwork,
  coordinate: QdnResourceCoordinate,
  actions?: QdnAction[],
): Promise<string> {
  if (!hasBridgeAction(actions, 'GET_QDN_RESOURCE_STREAM_URL')) {
    throw new Error('Streaming a QDN resource requires a newer Qortium Home bridge.');
  }

  assertStreamableQdnService(coordinate.service);

  return bridgeRequest<string>(network, {
    action: 'GET_QDN_RESOURCE_STREAM_URL',
    ...buildQdnResourceCoordinateRequest(coordinate),
  });
}

export async function saveQdnResource(
  network: ChatNetwork,
  coordinate: QdnResourceCoordinate,
  actions?: QdnAction[],
): Promise<{ canceled: boolean }> {
  if (!hasBridgeAction(actions, 'SAVE_QDN_RESOURCE')) {
    throw new Error('Saving a QDN resource requires a newer Qortium Home bridge.');
  }

  const raw = await bridgeRequest<{ canceled?: boolean }>(network, {
    action: 'SAVE_QDN_RESOURCE',
    ...buildQdnResourceCoordinateRequest(coordinate),
  });

  return { canceled: raw?.canceled === true };
}

// Distinct from getQdnResourceStreamUrl: this is the resolved node render
// URL (including Home's display-setting query params where applicable), not
// an expiring capability — safe to keep around, unlike the stream URL.
export async function getQdnResourceUrl(
  network: ChatNetwork,
  coordinate: QdnResourceCoordinate,
  actions?: QdnAction[],
): Promise<string> {
  if (!hasBridgeAction(actions, 'GET_QDN_RESOURCE_URL')) {
    throw new Error('Resolving a QDN resource URL requires a newer Qortium Home bridge.');
  }

  return bridgeRequest<string>(network, {
    action: 'GET_QDN_RESOURCE_URL',
    ...buildQdnResourceCoordinateRequest(coordinate),
  });
}

// -------- P4a: source-token error recognition --------
//
// review/schemas-publish-attachments.md § 6 "Source-token errors" — these are
// ordinary validation errors matched by exact message, not a coded bridge
// result. The same three messages are also what this file's own client-side
// checks throw (see publishQdnResource/publishChatAttachment above), so this
// helper recognizes both a preflight rejection and a round-tripped Home
// rejection identically. Callers use this to offer "select the file again"
// UX rather than a generic failure banner.
const PUBLISH_SOURCE_TOKEN_ERROR_MESSAGES = [
  'A valid Home-issued publish source token is required.',
  'Selected publish source expired. Select the file again.',
  'Selected publish source is not available to this app, account, network, or route.',
] as const;

export function isPublishSourceTokenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  return (PUBLISH_SOURCE_TOKEN_ERROR_MESSAGES as readonly string[]).includes(message);
}

// `network` picks Qortium vs Qortal (default 'qortium' keeps every
// pre-dual-chain call site byte-identical). Home 2 advertises JOIN_GROUP/
// LEAVE_GROUP on both bridge globals with the same request shape (review/
// schemas-home2-actions.md "Group membership"), so no action gating is
// needed here — only the dispatch target changes.
export async function joinGroup(groupId: number, network: ChatNetwork = 'qortium') {
  return bridgeRequest<GroupMembershipActionResult>(network, {
    action: 'JOIN_GROUP',
    groupId,
  });
}

export async function leaveGroup(groupId: number, network: ChatNetwork = 'qortium') {
  return bridgeRequest<GroupMembershipActionResult>(network, {
    action: 'LEAVE_GROUP',
    groupId,
  });
}

// `joiner` is an accepted alias for `memberAddress` in Home 2's validator, so
// the existing field name keeps working unchanged. `timeToLive` is required
// by Home 2 (schema doc "Approve group join request"); 0 means no expiry.
export async function approveGroupJoinRequest(groupId: number, joiner: string, network: ChatNetwork = 'qortium') {
  return bridgeRequest<GroupMembershipActionResult>(network, {
    action: 'APPROVE_GROUP_JOIN_REQUEST',
    groupId,
    joiner,
    timeToLive: 0,
  });
}

// The Home v2 bridge normally resolves SEND_CHAT_MESSAGE with the bare
// `{ signature, timestamp }` broadcast result, rather than the envelope used
// by other chat actions. Read defensively for legacy envelopes too. A signed
// failure is outcome-unknown: legacy Home can catch a timeout after the node
// accepted the transaction, so retain its signature for reconciliation.
export class ChatSendRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatSendRejectedError';
  }
}

export function isChatSendRejectedError(error: unknown): error is ChatSendRejectedError {
  return error instanceof ChatSendRejectedError;
}

function normalizeChatSendResult(value: unknown): ChatSendResult {
  const record = (value ?? {}) as Record<string, unknown>;
  const nestedResult = (record.result ?? {}) as Record<string, unknown>;
  const errorType =
    (typeof record.errorType === 'string' && record.errorType) ||
    (typeof nestedResult.errorType === 'string' && nestedResult.errorType) ||
    '';

  const signature =
    (typeof record.signature === 'string' && record.signature) ||
    (typeof record.transactionSignature === 'string' && record.transactionSignature) ||
    (typeof nestedResult.signature === 'string' && nestedResult.signature) ||
    '';
  const timestamp =
    (typeof record.timestamp === 'number' && record.timestamp) ||
    (typeof nestedResult.timestamp === 'number' && nestedResult.timestamp) ||
    Date.now();
  const detail =
    (typeof record.error === 'string' && record.error) ||
    (typeof nestedResult.error === 'string' && nestedResult.error) ||
    errorType ||
    'Chat send outcome is unknown.';
  const canceled = record.canceled === true || nestedResult.canceled === true;
  const reason =
    (typeof record.reason === 'string' && record.reason) ||
    (typeof nestedResult.reason === 'string' && nestedResult.reason) ||
    '';
  const isExplicitFailure = record.accepted === false || nestedResult.accepted === false || !!errorType;
  const isDefinitelyPreBroadcast =
    errorType === 'VALIDATION_FAILED' || (canceled && reason === 'USER_CANCELLED');
  const isAutomaticKeySetupOnly =
    (record.stage === 'key-announcement' || nestedResult.stage === 'key-announcement') &&
    (record.messageSubmitted === false || nestedResult.messageSubmitted === false);

  if (isExplicitFailure && isDefinitelyPreBroadcast) {
    throw new ChatSendRejectedError(detail.slice(0, 200));
  }

  if (!signature) {
    throw new Error(isExplicitFailure ? detail.slice(0, 200) : 'Chat send did not return a transaction signature.');
  }

  if (isExplicitFailure) {
    return {
      error: detail.slice(0, 200),
      errorType: errorType || undefined,
      outcome: isAutomaticKeySetupOnly ? 'not-submitted' : 'ambiguous',
      signature,
      ...(isAutomaticKeySetupOnly ? { stage: 'key-announcement' as const } : {}),
      timestamp,
    };
  }

  return { signature, timestamp };
}

function normalizeChatGroupId(value: number | string) {
  const normalized = typeof value === 'number' ? value : /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;

  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error('Chat group id must be a non-negative safe integer.');
  }

  return normalized;
}

export async function sendChatMessage(
  network: ChatNetwork,
  groupId: number | string,
  message: string,
  chatReference?: string,
) {
  const txGroupId = normalizeChatGroupId(groupId);

  if (network === 'qortal' && txGroupId === 0) {
    return sendQortalGeneralChatMessage(message, chatReference);
  }

  const request = {
    action: 'SEND_CHAT_MESSAGE',
    // Home 2 requires the Core-canonical name. Keep the legacy alias with the
    // exact same normalized number for older Home/q-apps hosts that still read
    // `groupId`; never forward an unvalidated runtime value under either name.
    groupId: txGroupId,
    message,
    txGroupId,
  };

  return normalizeChatSendResult(
    await bridgeRequest<unknown>(network, chatReference ? { ...request, chatReference } : request),
  );
}

// Public group message revisions (edit/delete/reaction) all ride the same
// SEND_CHAT_MESSAGE + chatReference envelope as today's behavior when the
// exact Home 2 action is not advertised — see review/schemas-home2-
// actions.md "Public group chat". `message`/`content` here are the same
// already-composed values the existing send path expects (Chat's own
// {message, repliedTo} reply envelope, when present, is composed by the
// caller before this — see docs on dispatchChatSend in App.tsx); only the
// exact-action path needs a protocol-specific envelope built here.
//
// `message` is the edited body exactly as the fallback SEND_CHAT_MESSAGE
// path expects it (plain text, or Chat's own JSON {message, repliedTo} reply
// envelope) — item C passes it pre-composed the same way App.tsx already
// builds it today (buildChatMessageText), so this wrapper's fallback bytes
// stay byte-identical to the current dispatchChatSend path.
export async function sendChatEdit(
  network: ChatNetwork,
  groupId: number | string,
  message: string,
  chatReference: string,
  actions?: QdnAction[],
) {
  const txGroupId = normalizeChatGroupId(groupId);

  if (network === 'qortal' && txGroupId === 0) {
    return sendQortalGeneralChatEdit(message, chatReference);
  }

  if (hasBridgeAction(actions, 'SEND_CHAT_EDIT')) {
    const wireMessage =
      network === 'qortal' ? buildQortalHubGroupChatEditPayload(normalizeQortalOutgoingMessage(message)) : message;

    return normalizeChatSendResult(
      await bridgeRequest<unknown>(network, {
        action: 'SEND_CHAT_EDIT',
        chatReference,
        message: wireMessage,
        txGroupId,
      }),
    );
  }

  return sendChatMessage(network, txGroupId, message, chatReference);
}

// `repliedTo` (the reply-thread target the deleted message itself was
// replying to, if any) is optional and trailing here because sendChatDelete
// is a new wrapper with no existing call sites to stay compatible with —
// item C supplies it from the same `decodeChatMessage(original).repliedTo`
// App.tsx already reads today, so the tombstone stays threaded exactly as it
// does now.
export async function sendChatDelete(
  network: ChatNetwork,
  groupId: number | string,
  chatReference: string,
  actions?: QdnAction[],
  repliedTo?: string | null,
) {
  const txGroupId = normalizeChatGroupId(groupId);

  if (network === 'qortal' && txGroupId === 0) {
    return sendQortalGeneralChatDelete(chatReference);
  }

  if (hasBridgeAction(actions, 'SEND_CHAT_DELETE')) {
    const wireMessage =
      network === 'qortal' ? buildQortalHubGroupChatDeletePayload() : buildDeletedMessageText(repliedTo);

    return normalizeChatSendResult(
      await bridgeRequest<unknown>(network, {
        action: 'SEND_CHAT_DELETE',
        chatReference,
        message: wireMessage,
        txGroupId,
      }),
    );
  }

  return sendChatMessage(network, txGroupId, buildDeletedMessageText(repliedTo), chatReference);
}

export async function sendChatReaction(
  network: ChatNetwork,
  groupId: number | string,
  chatReference: string,
  content: string,
  contentState: boolean,
  actions?: QdnAction[],
) {
  const txGroupId = normalizeChatGroupId(groupId);

  // Throws for empty/>32-char content before any bridge call, on both paths.
  const qortiumReactionMessage = buildReactionMessageText(content, contentState);

  if (network === 'qortal' && txGroupId === 0) {
    return sendQortalGeneralChatReaction(chatReference, content, contentState);
  }

  if (hasBridgeAction(actions, 'SEND_CHAT_REACTION')) {
    const wireMessage =
      network === 'qortal' ? buildQortalHubGroupChatReactionPayload(content, contentState) : qortiumReactionMessage;

    return normalizeChatSendResult(
      await bridgeRequest<unknown>(network, {
        action: 'SEND_CHAT_REACTION',
        chatReference,
        message: wireMessage,
        txGroupId,
      }),
    );
  }

  return sendChatMessage(network, txGroupId, qortiumReactionMessage, chatReference);
}

// Qortal private-group plaintext cap (review/schemas-private-group-actions.md
// § "Message, edit, delete, reaction actions"); the Qortium/QPGC cap has no
// fixed constant — it comes from GET_PRIVATE_GROUP_CHAT_STATE's
// maxMessagePlaintextBytes and is enforced here only when a caller supplies
// it (P3-design.md: "Qortium cap accepted as an optional param"). Exported so
// the composer (App.tsx, via privateGroupComposer.ts) can show/enforce the
// same fixed cap client-side for a closed Qortal group without duplicating
// the literal.
export const QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES = 2225;

function assertPrivateGroupPlaintextByteLimit(network: ChatNetwork, wireMessage: string, maxPlaintextBytes?: number) {
  const byteLength = new TextEncoder().encode(wireMessage).byteLength;

  if (network === 'qortal') {
    if (byteLength > QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES) {
      throw new Error(
        `Private group messages must be at most ${QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES} UTF-8 bytes on Qortal.`,
      );
    }
    return;
  }

  if (typeof maxPlaintextBytes === 'number' && byteLength > maxPlaintextBytes) {
    throw new Error(`Private group messages must be at most ${maxPlaintextBytes} UTF-8 bytes.`);
  }
}

// Private-group sends have NO generic fallback on either chain — unlike the
// public/direct wrappers above, which fall back to a plain SEND_CHAT_MESSAGE
// envelope when the exact action is unadvertised, a closed group's plaintext
// must never reach the wire through a path that would broadcast it outside
// the group (P3-design.md safety invariant). Every wrapper below throws
// instead of falling back when its exact action is not advertised.
//
// The `message` sent to Home is plain text for SEND_PRIVATE_GROUP_CHAT_MESSAGE
// on both chains (Home performs the encryption/enveloping for the initial
// send — same as the existing sendChatMessage above, which never builds a
// Qortal envelope either). Edit/delete/reaction instead validate `message` as
// the SAME per-chain envelope the public family uses (Home's private-group
// write-request normalizer delegates directly to the public chat validator —
// home-v2-app-bridge.ts:225-249, 2933-2960, 3330-3357), so those three reuse
// this file's existing public-group envelope builders unchanged.
export async function sendPrivateGroupChatMessage(
  network: ChatNetwork,
  groupId: number,
  message: string,
  actions?: QdnAction[],
  maxPlaintextBytes?: number,
) {
  if (!hasBridgeAction(actions, 'SEND_PRIVATE_GROUP_CHAT_MESSAGE')) {
    throw new Error('Private group chat sends require Qortium Home private group chat support.');
  }

  assertPrivateGroupPlaintextByteLimit(network, message, maxPlaintextBytes);

  return normalizeChatSendResult(
    await bridgeRequest<unknown>(network, {
      action: 'SEND_PRIVATE_GROUP_CHAT_MESSAGE',
      groupId,
      message,
    }),
  );
}

export async function sendPrivateGroupChatEdit(
  network: ChatNetwork,
  groupId: number,
  message: string,
  chatReference: string,
  actions?: QdnAction[],
  maxPlaintextBytes?: number,
) {
  if (!hasBridgeAction(actions, 'SEND_PRIVATE_GROUP_CHAT_EDIT')) {
    throw new Error('Private group chat edits require Qortium Home private group chat support.');
  }

  const wireMessage =
    network === 'qortal' ? buildQortalHubGroupChatEditPayload(normalizeQortalOutgoingMessage(message)) : message;

  assertPrivateGroupPlaintextByteLimit(network, wireMessage, maxPlaintextBytes);

  return normalizeChatSendResult(
    await bridgeRequest<unknown>(network, {
      action: 'SEND_PRIVATE_GROUP_CHAT_EDIT',
      chatReference,
      groupId,
      message: wireMessage,
    }),
  );
}

// `repliedTo` (the reply-thread target the deleted message itself was
// replying to, if any) is optional and trailing, same rationale as the public
// sendChatDelete above.
export async function sendPrivateGroupChatDelete(
  network: ChatNetwork,
  groupId: number,
  chatReference: string,
  actions?: QdnAction[],
  repliedTo?: string | null,
) {
  if (!hasBridgeAction(actions, 'SEND_PRIVATE_GROUP_CHAT_DELETE')) {
    throw new Error('Private group chat deletes require Qortium Home private group chat support.');
  }

  const wireMessage =
    network === 'qortal' ? buildQortalHubGroupChatDeletePayload() : buildDeletedMessageText(repliedTo);

  return normalizeChatSendResult(
    await bridgeRequest<unknown>(network, {
      action: 'SEND_PRIVATE_GROUP_CHAT_DELETE',
      chatReference,
      groupId,
      message: wireMessage,
    }),
  );
}

export async function sendPrivateGroupChatReaction(
  network: ChatNetwork,
  groupId: number,
  chatReference: string,
  content: string,
  contentState: boolean,
  actions?: QdnAction[],
) {
  if (!hasBridgeAction(actions, 'SEND_PRIVATE_GROUP_CHAT_REACTION')) {
    throw new Error('Private group chat reactions require Qortium Home private group chat support.');
  }

  // Throws for empty/>32-char content before any bridge call, on both paths.
  const qortiumReactionMessage = buildReactionMessageText(content, contentState);
  const wireMessage =
    network === 'qortal' ? buildQortalHubGroupChatReactionPayload(content, contentState) : qortiumReactionMessage;

  return normalizeChatSendResult(
    await bridgeRequest<unknown>(network, {
      action: 'SEND_PRIVATE_GROUP_CHAT_REACTION',
      chatReference,
      groupId,
      message: wireMessage,
    }),
  );
}

// Qortal's identity shape (docs/HOME_V2_BRIDGE_COMPATIBILITY.md in
// qortium-home): GET_USER_ACCOUNT returns address + publicKey only, with no
// name or lock state (unlike Qortium's GET_SELECTED_ACCOUNT) — the display
// name is a separate GET_PRIMARY_NAME lookup. Same underlying wallet as the
// Qortium identity, but a distinct address/name pair.
export type QortalUserIdentity = {
  address: string;
  name: string | null;
  publicKey: string | null;
};

function getPrimaryNameFromResult(result: unknown): string | null {
  if (typeof result === 'string') {
    return result || null;
  }

  if (result && typeof result === 'object' && typeof (result as { name?: unknown }).name === 'string') {
    const name = (result as { name: string }).name;

    return name || null;
  }

  return null;
}

export async function getQortalUserAccount(actions?: QdnAction[]): Promise<QortalUserIdentity> {
  const account = await bridgeRequest<{ address: string; publicKey?: string | null }>('qortal', {
    action: 'GET_USER_ACCOUNT',
  });
  rememberQortalGeneralChatAccount({ address: account.address, publicKey: account.publicKey ?? null });
  let name: string | null = null;

  if (hasBridgeAction(actions, 'GET_PRIMARY_NAME')) {
    try {
      const primary = await bridgeRequest<unknown>('qortal', {
        action: 'GET_PRIMARY_NAME',
        address: account.address,
      });

      name = getPrimaryNameFromResult(primary);
    } catch {
      // No primary name registered (or the lookup failed) — display by address.
      name = null;
    }
  }

  return { address: account.address, name, publicKey: account.publicKey ?? null };
}

// Direct messages cap at 3984 UTF-8 bytes (review/schemas-home2-actions.md
// "Direct chat" DirectChatRequest.message) — enforced client-side before any
// bridge round trip so an oversized draft fails with a clear message instead
// of a bridge-side rejection.
const DIRECT_MESSAGE_MAX_BYTES = 3984;

function assertDirectMessageByteLimit(message: string) {
  const byteLength = new TextEncoder().encode(message).byteLength;

  if (byteLength > DIRECT_MESSAGE_MAX_BYTES) {
    throw new Error(`Direct chat messages must be at most ${DIRECT_MESSAGE_MAX_BYTES} UTF-8 bytes.`);
  }
}

// `network` is trailing and defaults to 'qortium' so every existing call site
// (all of which predate Qortal direct chat) keeps dispatching through
// qdnRequest exactly as before. When SEND_DIRECT_CHAT_MESSAGE is advertised,
// `chatReference` must not be sent on an initial message (schema doc "Direct
// chat"); the generic qdnRequest fallback (`legacy-home` hosts only, per the
// design brief) is unchanged.
//
// On qortal, the exact-action path builds the v2 envelope (paragraph HTML,
// see qortalChatPayload.ts) before sending, and the 3984-byte cap is
// measured on that built envelope — not the raw text — since the envelope is
// what actually rides the wire and the schema's limit applies to the final
// `message` field. The qortium path is unchanged: cap on the raw text, same
// as before this envelope wiring existed.
export async function sendDirectChatMessage(
  recipientAddress: string,
  message: string,
  chatReference?: string,
  network: ChatNetwork = 'qortium',
  actions?: QdnAction[],
) {
  if (hasBridgeAction(actions, 'SEND_DIRECT_CHAT_MESSAGE')) {
    const wireMessage =
      network === 'qortal' ? buildQortalDirectChatPayload(normalizeQortalOutgoingMessage(message)) : message;

    assertDirectMessageByteLimit(wireMessage);

    return normalizeChatSendResult(
      await bridgeRequest<unknown>(network, {
        action: 'SEND_DIRECT_CHAT_MESSAGE',
        message: wireMessage,
        otherAddress: recipientAddress,
      }),
    );
  }

  assertDirectMessageByteLimit(message);

  const request = {
    action: 'SEND_CHAT_MESSAGE',
    message,
    recipientAddress,
  };

  return normalizeChatSendResult(await qdnRequest<unknown>(chatReference ? { ...request, chatReference } : request));
}

// Direct-chat revisions have no legacy/generic fallback — they require the
// fine-grained Home 2 action family (review/schemas-home2-actions.md
// "Direct chat"); a host that does not advertise the exact action cannot
// revise a direct message at all, so these throw rather than silently
// falling back to a plain SEND_CHAT_MESSAGE (which would create a new
// unrelated message instead of a revision).
export async function sendDirectChatEdit(
  network: ChatNetwork,
  otherAddress: string,
  message: string,
  chatReference: string,
  actions?: QdnAction[],
) {
  if (!hasBridgeAction(actions, 'SEND_DIRECT_CHAT_EDIT')) {
    throw new Error('Direct chat edits require Qortium Home direct chat revision support.');
  }

  const wireMessage =
    network === 'qortal'
      ? buildQortalDirectChatEditPayload(normalizeQortalOutgoingMessage(message))
      : JSON.stringify({ message });

  // Cap on the envelope for qortal (it inflates size) and on the raw text for
  // qortium (unchanged from before this envelope wiring existed) — same
  // rationale as sendDirectChatMessage above.
  assertDirectMessageByteLimit(network === 'qortal' ? wireMessage : message);

  return normalizeChatSendResult(
    await bridgeRequest<unknown>(network, {
      action: 'SEND_DIRECT_CHAT_EDIT',
      chatReference,
      message: wireMessage,
      otherAddress,
    }),
  );
}

export async function sendDirectChatDelete(
  network: ChatNetwork,
  otherAddress: string,
  chatReference: string,
  actions?: QdnAction[],
) {
  if (!hasBridgeAction(actions, 'SEND_DIRECT_CHAT_DELETE')) {
    throw new Error('Direct chat deletes require Qortium Home direct chat revision support.');
  }

  const wireMessage =
    network === 'qortal' ? buildQortalDirectChatDeletePayload() : JSON.stringify({ message: '' });

  return normalizeChatSendResult(
    await bridgeRequest<unknown>(network, {
      action: 'SEND_DIRECT_CHAT_DELETE',
      chatReference,
      message: wireMessage,
      otherAddress,
    }),
  );
}

export async function sendDirectChatReaction(
  network: ChatNetwork,
  otherAddress: string,
  chatReference: string,
  content: string,
  contentState: boolean,
  actions?: QdnAction[],
) {
  if (!hasBridgeAction(actions, 'SEND_DIRECT_CHAT_REACTION')) {
    throw new Error('Direct chat reactions require Qortium Home direct chat revision support.');
  }

  // Throws for empty/>32-char content before any bridge call.
  const qortiumReactionMessage = buildReactionMessageText(content, contentState);
  const wireMessage =
    network === 'qortal' ? buildQortalDirectChatReactionPayload(content, contentState) : qortiumReactionMessage;

  return normalizeChatSendResult(
    await bridgeRequest<unknown>(network, {
      action: 'SEND_DIRECT_CHAT_REACTION',
      chatReference,
      message: wireMessage,
      otherAddress,
    }),
  );
}

// GET_PENDING_TRANSACTIONS / FORGET_PENDING_TRANSACTION — the Home 2 pending
// journal (review/schemas-home2-actions.md "Pending transactions"). Reads
// return the empty/default shape (never throw) when the host does not
// advertise the action, since every caller treats "no journal support" the
// same as "no pending entries" rather than a hard error.
export async function getPendingBridgeTransactions(
  network: ChatNetwork,
  actions?: QdnAction[],
): Promise<PendingBridgeTransactionsResult> {
  if (!hasBridgeAction(actions, 'GET_PENDING_TRANSACTIONS')) {
    return { entries: [], network, version: 1 };
  }

  return bridgeRequest<PendingBridgeTransactionsResult>(network, {
    action: 'GET_PENDING_TRANSACTIONS',
  });
}

export async function forgetPendingBridgeTransaction(
  network: ChatNetwork,
  signature: string,
  actions?: QdnAction[],
): Promise<{ forgotten: boolean; network: ChatNetwork; signature: string }> {
  if (!hasBridgeAction(actions, 'FORGET_PENDING_TRANSACTION')) {
    throw new Error('Pending transaction journal support requires a newer Qortium Home bridge.');
  }

  return bridgeRequest<{ forgotten: boolean; network: ChatNetwork; signature: string }>(network, {
    action: 'FORGET_PENDING_TRANSACTION',
    signature,
  });
}
