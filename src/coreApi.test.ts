import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildActiveChatsPath,
  buildActiveChatsWebSocketUrl,
  buildAccountNamesPath,
  buildAccountGroupJoinRequestsPath,
  buildAdminGroupJoinRequestsPath,
  buildGroupMessagesPath,
  buildGroupMessagesWebSocketUrl,
  buildGroupsPath,
  buildGroupJoinRequestsPath,
  buildGroupMembersPath,
  buildMemberGroupsPath,
  buildSelfRewardSharesPath,
  buildTransactionStatusPath,
  approveGroupJoinRequest,
  getActiveChats,
  getAccountNames,
  getAccountGroupJoinRequests,
  getAdminGroupJoinRequests,
  getDirectMessages,
  getGroupJoinRequests,
  getGroupMembers,
  getGroupMessages,
  getMemberGroups,
  getMissingPrivateGroupKeyRequests,
  getMintingStatus,
  getTransactionStatus,
  getPrivateDirectActiveChats,
  joinGroup,
  leaveGroup,
  requestPrivateGroupChatKey,
  resolvePrivateGroupChatKeyRequests,
  searchGroups,
  sendChatMessage,
  sendDirectChatMessage,
  startMinting,
} from './coreApi';

const qdnRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./qdnRequest', () => ({
  buildNodeWebSocketUrl: (path: string) => `ws://127.0.0.1:24891${path}`,
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
    expect(buildGroupMembersPath(7)).toBe('/groups/members/7?limit=100&reverse=false');
    expect(buildAccountGroupJoinRequestsPath('Qabc')).toBe('/groups/joinrequests/address/Qabc');
    expect(buildAdminGroupJoinRequestsPath('Qabc')).toBe('/groups/joinrequests/admin/Qabc');
    expect(buildGroupJoinRequestsPath(7)).toBe('/groups/joinrequests/7');
    expect(buildActiveChatsPath('Qabc')).toBe('/chat/active/Qabc?encoding=BASE64&haschatreference=false');
    expect(buildAccountNamesPath('Qabc')).toBe('/names/address/Qabc');
  });

  it('builds chat message paths', () => {
    expect(buildGroupMessagesPath(7)).toBe(
      '/chat/messages?txGroupId=7&encoding=BASE64&limit=100&reverse=true',
    );
    expect(buildGroupMessagesWebSocketUrl(7)).toBe(
      'ws://127.0.0.1:24891/websockets/chat/messages?txGroupId=7&encoding=BASE64&limit=100&reverse=true',
    );
    expect(buildActiveChatsWebSocketUrl('Qabc')).toBe(
      'ws://127.0.0.1:24891/websockets/chat/active/Qabc?encoding=BASE64&haschatreference=false',
    );
    expect(buildTransactionStatusPath('sig/with+chars')).toBe('/transactions/signature/sig%2Fwith%2Bchars');
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

  it('uses the account names bridge action when available', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ name: 'alice', owner: 'Qabc' }]);

    await expect(getAccountNames('Qabc', ['GET_ACCOUNT_NAMES'])).resolves.toEqual([
      { name: 'alice', owner: 'Qabc' },
    ]);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'GET_ACCOUNT_NAMES',
      address: 'Qabc',
    });
  });

  it('falls back to FETCH_NODE_API for account names', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      body: '[]',
      contentType: 'application/json',
      data: [{ name: 'alice', owner: 'Qabc' }],
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getAccountNames('Qabc', [])).resolves.toEqual([{ name: 'alice', owner: 'Qabc' }]);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/names/address/Qabc',
    });
  });

  it('uses the group members bridge action when available', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      memberCount: 1,
      members: [{ member: 'Qmember', primaryName: 'Member Name' }],
    });

    await expect(getGroupMembers(9, ['GET_GROUP_MEMBERS'])).resolves.toEqual([
      { member: 'Qmember', primaryName: 'Member Name' },
    ]);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'GET_GROUP_MEMBERS',
      groupId: 9,
      limit: 100,
      reverse: false,
    });
  });

  it('uses group join-request bridge actions when available', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([{ groupId: 12, joiner: 'Qjoiner' }])
      .mockResolvedValueOnce([{ group: { groupId: 12, groupName: 'Private' }, joinRequests: [] }])
      .mockResolvedValueOnce([{ groupId: 12, joiner: 'Qjoiner' }]);

    await expect(getAccountGroupJoinRequests('Qabc', ['GET_ACCOUNT_GROUP_JOIN_REQUESTS'])).resolves.toEqual([
      { groupId: 12, joiner: 'Qjoiner' },
    ]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GET_ACCOUNT_GROUP_JOIN_REQUESTS',
      address: 'Qabc',
    });

    await expect(getAdminGroupJoinRequests('Qadmin', ['GET_ADMIN_GROUP_JOIN_REQUESTS'])).resolves.toEqual([
      { group: { groupId: 12, groupName: 'Private' }, joinRequests: [] },
    ]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'GET_ADMIN_GROUP_JOIN_REQUESTS',
      address: 'Qadmin',
    });

    await expect(getGroupJoinRequests(12, ['GET_GROUP_JOIN_REQUESTS'])).resolves.toEqual([
      { groupId: 12, joiner: 'Qjoiner' },
    ]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(3, {
      action: 'GET_GROUP_JOIN_REQUESTS',
      groupId: 12,
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

  it('collects unique missing private group key requests from messages', () => {
    expect(
      getMissingPrivateGroupKeyRequests(
        [
          { epochId: 'epoch-a', keyId: 'key-a', sender: 'Qa', status: 'MISSING_KEY', timestamp: 10, txGroupId: 8 },
          { epochId: 'epoch-a', keyId: 'key-a', sender: 'Qb', status: 'MISSING_KEY', timestamp: 20, txGroupId: 8 },
          { epochId: 'epoch-b', keyId: 'key-b', sender: 'Qc', status: 'MISSING_KEY', timestamp: 30, txGroupId: 9 },
          { epochId: 'epoch-c', keyId: 'key-c', sender: 'Qd', status: 'DECRYPTED', timestamp: 40, txGroupId: 8 },
        ],
        8,
      ),
    ).toEqual([{ epochId: 'epoch-a', groupId: 8, keyId: 'key-a' }]);
  });

  it('routes private group key recovery through Home bridge actions', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({
        accepted: true,
        action: 'REQUEST_PRIVATE_GROUP_CHAT_KEY',
        groupId: 8,
        result: { requestSignature: 'request-sig' },
      })
      .mockResolvedValueOnce({
        accepted: true,
        action: 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS',
        groupId: 8,
        result: [{ status: 'RELAYED' }],
      });

    await expect(
      requestPrivateGroupChatKey(
        { epochId: 'epoch-a', groupId: 8, keyId: 'key-a' },
        ['REQUEST_PRIVATE_GROUP_CHAT_KEY'],
      ),
    ).resolves.toMatchObject({
      accepted: true,
      action: 'REQUEST_PRIVATE_GROUP_CHAT_KEY',
      groupId: 8,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'REQUEST_PRIVATE_GROUP_CHAT_KEY',
      epochId: 'epoch-a',
      groupId: 8,
      keyId: 'key-a',
    });

    await expect(resolvePrivateGroupChatKeyRequests(8, ['RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS'])).resolves.toMatchObject({
      accepted: true,
      action: 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS',
      groupId: 8,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS',
      groupId: 8,
      limit: 20,
    });
  });

  it('fails closed when private group key recovery bridge actions are unavailable', async () => {
    await expect(requestPrivateGroupChatKey({ groupId: 8 }, [])).rejects.toThrow(
      'Private group chat key requests require Qortium Home key recovery support.',
    );
    await expect(resolvePrivateGroupChatKeyRequests(8, [])).rejects.toThrow(
      'Private group chat key request resolution requires Qortium Home key recovery support.',
    );
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('builds Home write bridge requests for group joins and sends', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({
        accepted: true,
        action: 'JOIN_GROUP',
        groupId: 9,
        result: true,
        transactionSignature: 'sig',
      })
      .mockResolvedValueOnce({
        accepted: true,
        action: 'APPROVE_GROUP_JOIN_REQUEST',
        groupId: 9,
        invitee: 'Qjoiner',
        result: true,
        transactionSignature: 'sig2',
      })
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

    await expect(approveGroupJoinRequest(9, 'Qjoiner')).resolves.toMatchObject({
      accepted: true,
      action: 'APPROVE_GROUP_JOIN_REQUEST',
      groupId: 9,
      invitee: 'Qjoiner',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'APPROVE_GROUP_JOIN_REQUEST',
      groupId: 9,
      joiner: 'Qjoiner',
    });

    await expect(sendChatMessage(9, 'hello')).resolves.toMatchObject({
      accepted: true,
      action: 'SEND_CHAT_MESSAGE',
      groupId: 9,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(3, {
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
    expect(qdnRequestMock).toHaveBeenNthCalledWith(4, {
      action: 'SEND_CHAT_MESSAGE',
      message: 'hello direct',
      recipientAddress: 'Qpeer',
    });
  });

  it('passes the edited message reference through to the bridge', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ accepted: true, action: 'SEND_CHAT_MESSAGE', groupId: 9, result: true })
      .mockResolvedValueOnce({ accepted: true, action: 'SEND_CHAT_MESSAGE', direct: true, result: true });

    await sendChatMessage(9, 'fixed typo', 'original-sig');
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'SEND_CHAT_MESSAGE',
      chatReference: 'original-sig',
      groupId: 9,
      message: 'fixed typo',
    });

    await sendDirectChatMessage('Qpeer', 'fixed direct typo', 'direct-sig');
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'SEND_CHAT_MESSAGE',
      chatReference: 'direct-sig',
      message: 'fixed direct typo',
      recipientAddress: 'Qpeer',
    });
  });

  it('fetches transaction status through FETCH_NODE_API', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      body: '{"blockHeight":123}',
      contentType: 'application/json',
      data: { blockHeight: 123, signature: 'sig' },
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getTransactionStatus('sig')).resolves.toEqual({ blockHeight: 123, signature: 'sig' });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/transactions/signature/sig',
    });
  });

  it('leaves groups through the bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      accepted: true,
      action: 'LEAVE_GROUP',
      groupId: 7,
      result: { signature: 'leave-sig' },
    });

    await expect(leaveGroup(7)).resolves.toMatchObject({
      accepted: true,
      action: 'LEAVE_GROUP',
      groupId: 7,
    });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'LEAVE_GROUP',
      groupId: 7,
    });
  });

  it('builds the self reward-share path', () => {
    expect(buildSelfRewardSharesPath('Qabc')).toBe('/addresses/rewardshares?minters=Qabc&recipients=Qabc');
  });

  it('uses the minting status bridge action when available', async () => {
    const status = {
      address: 'Qabc',
      hasRewardShare: true,
      isMinting: false,
      keyOnNode: false,
      nodeMintingPossible: true,
    };

    qdnRequestMock.mockResolvedValueOnce(status);

    await expect(getMintingStatus('Qabc', ['GET_MINTING_STATUS'])).resolves.toEqual(status);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'GET_MINTING_STATUS',
      address: 'Qabc',
    });
  });

  it('assembles minting status through FETCH_NODE_API when the action is unavailable', async () => {
    const nodeApiResult = (data: unknown) => ({
      body: JSON.stringify(data),
      contentType: 'application/json',
      data,
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    qdnRequestMock
      .mockResolvedValueOnce(nodeApiResult([{ mintingAccount: 'Qabc', recipient: 'Qabc', rewardSharePublicKey: 'pub' }]))
      .mockResolvedValueOnce(nodeApiResult([{ mintingAccount: 'Qother', recipientAccount: 'Qother' }]))
      .mockResolvedValueOnce(nodeApiResult({ isMintingPossible: true }));

    await expect(getMintingStatus('Qabc', [])).resolves.toEqual({
      address: 'Qabc',
      hasRewardShare: true,
      isMinting: false,
      keyOnNode: false,
      nodeMintingPossible: true,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/addresses/rewardshares?minters=Qabc&recipients=Qabc',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/admin/mintingaccounts',
    });
  });

  it('reports unknown node-side minting state when the node hides admin endpoints', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({
        body: '[]',
        contentType: 'application/json',
        data: [],
        ok: true,
        status: 200,
        statusText: 'OK',
      })
      .mockRejectedValueOnce(new Error('Forbidden'));

    await expect(getMintingStatus('Qabc', [])).resolves.toEqual({
      address: 'Qabc',
      hasRewardShare: false,
      isMinting: null,
      keyOnNode: null,
      nodeMintingPossible: null,
    });
  });

  it('starts minting through the bridge action', async () => {
    const result = { accepted: true, action: 'START_MINTING', address: 'Qabc', keyAdded: true };

    qdnRequestMock.mockResolvedValueOnce(result);

    await expect(startMinting()).resolves.toEqual(result);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'START_MINTING',
    });
  });
});
