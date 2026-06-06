import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildActiveChatsPath,
  buildGroupMessagesPath,
  buildGroupsPath,
  buildMemberGroupsPath,
  getActiveChats,
  getDirectMessages,
  getGroupMessages,
  getMemberGroups,
  getPrivateDirectActiveChats,
  joinGroup,
  searchGroups,
  sendChatMessage,
  sendDirectChatMessage,
} from './coreApi';

const qdnRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./qdnRequest', () => ({
  qdnRequest: qdnRequestMock,
}));

describe('Core API path builders', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
  });

  it('builds browse and search group paths', () => {
    expect(buildGroupsPath('')).toBe('/groups?limit=100&reverse=false');
    expect(buildGroupsPath('dev group')).toBe(
      '/groups/search?limit=100&reverse=false&query=dev+group&visibility=ALL',
    );
  });

  it('builds account scoped paths', () => {
    expect(buildMemberGroupsPath('Qabc')).toBe('/groups/member/Qabc');
    expect(buildActiveChatsPath('Qabc')).toBe('/chat/active/Qabc?encoding=BASE64&haschatreference=false');
  });

  it('builds chat message paths', () => {
    expect(buildGroupMessagesPath(7)).toBe(
      '/chat/messages?txGroupId=7&encoding=BASE64&haschatreference=false&limit=100&reverse=true',
    );
  });

  it('prefers native group bridge actions when available', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([{ groupId: 1, groupName: 'General' }])
      .mockResolvedValueOnce([{ groupId: 2, groupName: 'Dev' }]);

    await expect(searchGroups('', ['LIST_GROUPS'])).resolves.toEqual([{ groupId: 1, groupName: 'General' }]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'LIST_GROUPS',
      limit: 100,
      reverse: false,
    });

    await expect(searchGroups('dev', ['SEARCH_GROUPS'])).resolves.toEqual([{ groupId: 2, groupName: 'Dev' }]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'SEARCH_GROUPS',
      limit: 100,
      query: 'dev',
      reverse: false,
      visibility: 'ALL',
    });
  });

  it('falls back to FETCH_NODE_API when native group actions are unavailable', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      body: '[]',
      contentType: 'application/json',
      data: [{ groupId: 3, groupName: 'Fallback' }],
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(searchGroups('fallback', [])).resolves.toEqual([{ groupId: 3, groupName: 'Fallback' }]);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/groups/search?limit=100&reverse=false&query=fallback&visibility=ALL',
    });
  });

  it('uses account-aware bridge actions for member groups and active chats', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ groupId: 4, groupName: 'Member' }]).mockResolvedValueOnce({
      direct: [],
      groups: [],
    });

    await expect(getMemberGroups('Qabc', ['GET_ACCOUNT_GROUPS'])).resolves.toEqual([
      { groupId: 4, groupName: 'Member' },
    ]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GET_ACCOUNT_GROUPS',
      address: 'Qabc',
    });

    await expect(getActiveChats('Qabc', ['GET_ACTIVE_CHATS'])).resolves.toEqual({ direct: [], groups: [] });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'GET_ACTIVE_CHATS',
      address: 'Qabc',
      encoding: 'BASE64',
      hasChatReference: false,
    });
  });

  it('uses the private direct active chats bridge action when available', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ address: 'Qpeer', timestamp: 40 }]);

    await expect(getPrivateDirectActiveChats(['GET_PRIVATE_DIRECT_ACTIVE_CHATS'])).resolves.toEqual([
      { address: 'Qpeer', timestamp: 40 },
    ]);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'GET_PRIVATE_DIRECT_ACTIVE_CHATS',
      encoding: 'BASE64',
      hasChatReference: false,
    });
  });

  it('routes public and closed-group message reads through the matching bridge action', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([
        { sender: 'Qb', timestamp: 20, txGroupId: 7 },
        { sender: 'Qa', timestamp: 10, txGroupId: 7 },
      ])
      .mockResolvedValueOnce([{ sender: 'Qc', timestamp: 30, txGroupId: 8 }]);

    await expect(
      getGroupMessages({ groupId: 7, groupName: 'Open', isOpen: true }, ['SEARCH_CHAT_MESSAGES']),
    ).resolves.toEqual([
      { sender: 'Qa', timestamp: 10, txGroupId: 7 },
      { sender: 'Qb', timestamp: 20, txGroupId: 7 },
    ]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'SEARCH_CHAT_MESSAGES',
      encoding: 'BASE64',
      groupId: 7,
      hasChatReference: false,
      limit: 100,
      reverse: true,
    });

    await expect(
      getGroupMessages({ groupId: 8, groupName: 'Closed', isOpen: false }, [
        'SEARCH_CHAT_MESSAGES',
        'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
      ]),
    ).resolves.toEqual([{ sender: 'Qc', timestamp: 30, txGroupId: 8 }]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
      encoding: 'BASE64',
      groupId: 8,
      hasChatReference: false,
      limit: 100,
      reverse: true,
    });
  });

  it('fails closed for closed-group message reads when private bridge support is absent', async () => {
    await expect(
      getGroupMessages({ groupId: 8, groupName: 'Closed', isOpen: false }, ['SEARCH_CHAT_MESSAGES']),
    ).rejects.toThrow('Closed group chat reads require Qortium Home private group chat support.');
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('routes direct private message reads through the direct bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce([
      { sender: 'Qb', timestamp: 20, txGroupId: 0 },
      { sender: 'Qa', timestamp: 10, txGroupId: 0 },
    ]);

    await expect(getDirectMessages('Qpeer', ['SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES'])).resolves.toEqual([
      { sender: 'Qa', timestamp: 10, txGroupId: 0 },
      { sender: 'Qb', timestamp: 20, txGroupId: 0 },
    ]);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
      encoding: 'BASE64',
      hasChatReference: false,
      limit: 100,
      otherAddress: 'Qpeer',
      reverse: true,
    });
  });

  it('rejects direct private reads when direct bridge support is absent', async () => {
    await expect(getDirectMessages('Qpeer', ['FETCH_NODE_API'])).rejects.toThrow(
      'Direct private chat reads require Qortium Home direct chat support.',
    );
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('builds Home write bridge requests for group joins and sends', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ accepted: true, action: 'JOIN_GROUP', groupId: 9, result: true })
      .mockResolvedValueOnce({ accepted: true, action: 'SEND_CHAT_MESSAGE', groupId: 9, result: true })
      .mockResolvedValueOnce({
        accepted: true,
        action: 'SEND_CHAT_MESSAGE',
        direct: true,
        recipientAddress: 'Qpeer',
        result: true,
      });

    await expect(joinGroup(9)).resolves.toMatchObject({ accepted: true, action: 'JOIN_GROUP', groupId: 9 });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'JOIN_GROUP',
      groupId: 9,
    });

    await expect(sendChatMessage(9, 'hello')).resolves.toMatchObject({
      accepted: true,
      action: 'SEND_CHAT_MESSAGE',
      groupId: 9,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'SEND_CHAT_MESSAGE',
      groupId: 9,
      message: 'hello',
    });

    await expect(sendDirectChatMessage('Qpeer', 'hello direct')).resolves.toMatchObject({
      accepted: true,
      action: 'SEND_CHAT_MESSAGE',
      direct: true,
      recipientAddress: 'Qpeer',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(3, {
      action: 'SEND_CHAT_MESSAGE',
      message: 'hello direct',
      recipientAddress: 'Qpeer',
    });
  });
});
