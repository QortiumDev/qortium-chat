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
import type {
  ActiveChats,
  ChatNetwork,
  ChatSendResult,
  QdnPublishResult,
  ChatMessage,
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
  PrivateGroupActiveChatEntry,
  PrivateGroupChatKeyRequest,
  PrivateGroupChatKeyRequestRecoveryResult,
  PrivateGroupChatKeyRequestResult,
  PrivateGroupChatState,
  PrivateGroupKeyRequestOutcome,
  PrivateGroupKeyResolutionOutcome,
  QdnAction,
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

export async function getNodeStatus() {
  return qdnRequest<NodeStatus>({ action: 'GET_NODE_STATUS' });
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
    return bridgeRequest<GroupData[]>(network, {
      action: 'LIST_GROUPS',
      limit: DEFAULT_LIST_LIMIT,
      reverse: false,
    });
  }

  if (trimmedSearch && network === 'qortal' && hasBridgeAction(actions, 'LIST_GROUPS')) {
    const allGroups = await bridgeRequest<GroupData[]>(network, {
      action: 'LIST_GROUPS',
      limit: DEFAULT_LIST_LIMIT,
      reverse: false,
    });
    const needle = trimmedSearch.toLowerCase();

    return allGroups.filter((group) => group.groupName?.toLowerCase().includes(needle));
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
    // Neither protocol's Home 2.0 v2 bridge advertises
    // SEARCH_PRIVATE_GROUP_CHAT_MESSAGES for qortalRequest (no private-group
    // decryption on Qortal in this slice), so a closed Qortal group hits this
    // same gate a closed Qortium group hits on an older/legacy bridge.
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

export async function publishQdnAttachment({
  dataBase64,
  filename,
  identifier,
  name,
  service,
}: {
  dataBase64: string;
  filename: string;
  identifier: string;
  name: string;
  service: 'ATTACHMENT' | 'IMAGE';
}) {
  // Privileged write: Qortium Home shows its publish-approval prompt (target
  // resource, size, fee), builds the ARBITRARY transaction from the inline
  // base64, and signs — the app never touches key material. `base64` +
  // `filename` is Home's inline-source contract.
  return qdnRequest<QdnPublishResult>({
    action: 'PUBLISH_QDN_RESOURCE',
    base64: dataBase64,
    filename,
    identifier,
    name,
    service,
  });
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
      outcome: 'ambiguous',
      signature,
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

  // Qortal has no general chat (txGroupId 0 is Qortium-only — Home's bridge
  // rejects it on qortalRequest); catch it here too so a caller mistake fails
  // fast instead of round-tripping to Home first.
  if (network === 'qortal' && txGroupId === 0) {
    throw new Error('Qortal has no general chat group.');
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

function assertQortalGeneralChatAllowed(network: ChatNetwork, txGroupId: number) {
  // Same guard as sendChatMessage: fail fast on a caller mistake instead of
  // round-tripping to Home first (Qortal has no general/txGroupId-0 chat).
  if (network === 'qortal' && txGroupId === 0) {
    throw new Error('Qortal has no general chat group.');
  }
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

  assertQortalGeneralChatAllowed(network, txGroupId);

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

  assertQortalGeneralChatAllowed(network, txGroupId);

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

  assertQortalGeneralChatAllowed(network, txGroupId);

  // Throws for empty/>32-char content before any bridge call, on both paths.
  const qortiumReactionMessage = buildReactionMessageText(content, contentState);

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
// it (P3-design.md: "Qortium cap accepted as an optional param").
const QORTAL_PRIVATE_GROUP_MAX_PLAINTEXT_BYTES = 2225;

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
