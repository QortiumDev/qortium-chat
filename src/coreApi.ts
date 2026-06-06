import { buildNodeWebSocketUrl, qdnRequest } from './qdnRequest';
import type {
  ActiveChats,
  ChatActionResult,
  ChatMessage,
  GroupData,
  GroupMember,
  GroupMembersResponse,
  NodeApiFetchResult,
  NodeStatus,
  QdnAction,
} from './types';

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_LIST_LIMIT = 100;

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

function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort((first, second) => first.timestamp - second.timestamp);
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

export function buildActiveChatsPath(address: string) {
  return `/chat/active/${encodeURIComponent(address)}?encoding=BASE64&haschatreference=false`;
}

export function buildGroupMessagesPath(groupId: number, limit = DEFAULT_LIST_LIMIT) {
  const query = new URLSearchParams({
    txGroupId: String(groupId),
    encoding: 'BASE64',
    haschatreference: 'false',
    limit: String(limit),
    reverse: 'true',
  });

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

export async function getGroupMessages(group: GroupData, actions?: QdnAction[]) {
  const groupId = group.groupId;
  const messageRequest = {
    encoding: 'BASE64',
    groupId,
    hasChatReference: false,
    limit: DEFAULT_LIST_LIMIT,
    reverse: true,
  };

  if (group.isOpen === false) {
    if (!hasBridgeAction(actions, 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES')) {
      throw new Error('Closed group chat reads require Qortium Home private group chat support.');
    }

    const messages = await qdnRequest<ChatMessage[]>({
      action: 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
      ...messageRequest,
    });

    return sortMessages(messages);
  }

  if (hasBridgeAction(actions, 'SEARCH_CHAT_MESSAGES')) {
    const messages = await qdnRequest<ChatMessage[]>({
      action: 'SEARCH_CHAT_MESSAGES',
      ...messageRequest,
    });

    return sortMessages(messages);
  }

  const messages = await fetchNodeApiData<ChatMessage[]>(buildGroupMessagesPath(groupId), 'Group messages');

  return sortMessages(messages);
}

export async function getDirectMessages(otherAddress: string, actions?: QdnAction[]) {
  if (hasBridgeAction(actions, 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES')) {
    const messages = await qdnRequest<ChatMessage[]>({
      action: 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
      encoding: 'BASE64',
      hasChatReference: false,
      limit: DEFAULT_LIST_LIMIT,
      otherAddress,
      reverse: true,
    });

    return sortMessages(messages);
  }

  throw new Error('Direct private chat reads require Qortium Home direct chat support.');
}

export async function joinGroup(groupId: number) {
  return qdnRequest<ChatActionResult>({
    action: 'JOIN_GROUP',
    groupId,
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
