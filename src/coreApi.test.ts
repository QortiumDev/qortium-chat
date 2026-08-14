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
  buildNameInfoPath,
  buildBlockHeightPath,
  buildGroupInvitesPath,
  getGroupInvites,
  buildGroupApprovalVotesPath,
  buildPendingTransactionsPath,
  buildSelfRewardSharesPath,
  buildTransactionStatusPath,
  approveGroupJoinRequest,
  getPendingGroupApprovals,
  submitGroupApproval,
  getActiveChats,
  getAccountNames,
  getCurrentBlockHeight,
  getAccountGroupJoinRequests,
  getAdminGroupJoinRequests,
  getDirectMessages,
  getGroupJoinRequests,
  getGroup,
  getGroupMembers,
  getGroupMessages,
  getMemberGroups,
  getMissingPrivateGroupKeyRequests,
  getGroupApprovalVotes,
  getMintingStatus,
  getNameOwnerAddress,
  getQortalUserAccount,
  getTransactionStatus,
  getPrivateDirectActiveChats,
  joinGroup,
  leaveGroup,
  requestPrivateGroupChatKey,
  RESOLVE_IDENTITIES_LIMIT,
  resolveIdentities,
  resolvePrivateGroupChatKeyRequests,
  searchGroups,
  sendChatMessage,
  sendDirectChatMessage,
  startMinting,
} from './coreApi';

const qdnRequestMock = vi.hoisted(() => vi.fn());
// Chat 2.0 slice 2: coreApi's network-aware functions dispatch through
// chatNetwork.ts's bridgeRequest, which calls qortalRequest for network
// 'qortal' — mocked here the same way qdnRequest already is above, so the
// qortal-specific tests below never touch the real window.qortalRequest.
const qortalRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./qdnRequest', () => ({
  buildNodeWebSocketUrl: (path: string) => `ws://127.0.0.1:24891${path}`,
  qdnRequest: qdnRequestMock,
}));

vi.mock('./qortalRequest', () => ({
  qortalRequest: qortalRequestMock,
}));

describe('Core API path builders', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
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
    expect(buildNameInfoPath('alice')).toBe('/names/alice');
    expect(buildNameInfoPath('a/b c')).toBe('/names/a%2Fb%20c');
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
    expect(buildPendingTransactionsPath(1)).toBe('/transactions/pending?txGroupId=1&limit=100&reverse=false');
    expect(buildGroupApprovalVotesPath()).toBe(
      '/transactions/search?txType=GROUP_APPROVAL&confirmationStatus=CONFIRMED&limit=100&reverse=true',
    );
    expect(buildBlockHeightPath()).toBe('/blocks/height');
  });

  it('reads pending group approvals over the keyless FETCH_NODE_API fallback', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      body: '[]',
      contentType: 'application/json',
      data: [{ signature: 'sig1', type: 'ARBITRARY' }],
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getPendingGroupApprovals(1)).resolves.toEqual([{ signature: 'sig1', type: 'ARBITRARY' }]);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/transactions/pending?txGroupId=1&limit=100&reverse=false',
    });
  });

  it('pages confirmed approval votes until a short page is returned', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({ signature: `vote-${index}` }));
    const tailPage = [{ signature: 'vote-100' }];

    qdnRequestMock
      .mockResolvedValueOnce({ data: fullPage, ok: true, status: 200, statusText: 'OK' })
      .mockResolvedValueOnce({ data: tailPage, ok: true, status: 200, statusText: 'OK' });

    await expect(getGroupApprovalVotes()).resolves.toHaveLength(101);
    expect(qdnRequestMock).toHaveBeenCalledTimes(2);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/transactions/search?txType=GROUP_APPROVAL&confirmationStatus=CONFIRMED&limit=100&reverse=true',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/transactions/search?txType=GROUP_APPROVAL&confirmationStatus=CONFIRMED&limit=100&reverse=true&offset=100',
    });
  });

  it('reads pending group invites over the keyless FETCH_NODE_API fallback', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      data: [{ expiry: null, groupId: 5, invitee: 'Qme', inviter: 'Qadmin' }],
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getGroupInvites('Qme')).resolves.toEqual([
      { expiry: null, groupId: 5, invitee: 'Qme', inviter: 'Qadmin' },
    ]);
    expect(buildGroupInvitesPath('Q/odd address')).toBe('/groups/invites/Q%2Fodd%20address');
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/groups/invites/Qme',
    });
  });

  it('coerces the text/plain block height body to a number', async () => {
    // Core serves /blocks/height as text/plain with a bare-digit body, so the
    // bridge and fallback parsers both deliver the digits as a string.
    qdnRequestMock.mockResolvedValueOnce({ data: '39994', ok: true, status: 200, statusText: 'OK' });

    await expect(getCurrentBlockHeight()).resolves.toBe(39994);

    // A parser that does return a number passes through unchanged.
    qdnRequestMock.mockResolvedValueOnce({ data: 40073, ok: true, status: 200, statusText: 'OK' });

    await expect(getCurrentBlockHeight()).resolves.toBe(40073);
  });

  it('rejects a block height body that is not a number', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      data: '<html>bad gateway</html>',
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getCurrentBlockHeight()).rejects.toThrow('Block height failed to parse as a number.');

    // Number('') is 0 — an empty body must fail, not read as height 0.
    qdnRequestMock.mockResolvedValueOnce({ data: '', ok: true, status: 200, statusText: 'OK' });

    await expect(getCurrentBlockHeight()).rejects.toThrow('Block height failed to parse as a number.');
  });

  it('submits an approve or oppose vote through the GROUP_APPROVAL bridge action', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ accepted: true, transactionSignature: 'vote1' })
      .mockResolvedValueOnce({ accepted: true, transactionSignature: 'vote2' });

    await expect(submitGroupApproval('pending1', true, 1)).resolves.toEqual({
      accepted: true,
      transactionSignature: 'vote1',
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GROUP_APPROVAL',
      approval: true,
      groupId: 1,
      pendingSignature: 'pending1',
    });

    await submitGroupApproval('pending2', false);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'GROUP_APPROVAL',
      approval: false,
      pendingSignature: 'pending2',
    });
  });

  it('prefers native group bridge actions when available', async () => {
    qdnRequestMock
      .mockResolvedValueOnce([{ groupId: 1, groupName: 'General' }])
      .mockResolvedValueOnce([{ groupId: 2, groupName: 'Dev' }]);

    await expect(searchGroups('qortium', '', ['LIST_GROUPS'])).resolves.toEqual([{ groupId: 1, groupName: 'General' }]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'LIST_GROUPS',
      limit: 100,
      reverse: false,
    });

    await expect(searchGroups('qortium', 'dev', ['SEARCH_GROUPS'])).resolves.toEqual([{ groupId: 2, groupName: 'Dev' }]);
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

    await expect(searchGroups('qortium', 'fallback', [])).resolves.toEqual([{ groupId: 3, groupName: 'Fallback' }]);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/groups/search?limit=100&reverse=false&query=fallback&visibility=ALL',
    });
  });

  it('resolves a group by id through the bridge or node fallback', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ groupId: 42, groupName: 'Bridge group' })
      .mockResolvedValueOnce({
        body: '{}',
        contentType: 'application/json',
        data: { groupId: 43, groupName: 'Node group' },
        ok: true,
        status: 200,
        statusText: 'OK',
      });

    await expect(getGroup('qortium', 42, ['GET_GROUP'])).resolves.toEqual({ groupId: 42, groupName: 'Bridge group' });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, { action: 'GET_GROUP', groupId: 42 });

    await expect(getGroup('qortium', 43, [])).resolves.toEqual({ groupId: 43, groupName: 'Node group' });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/groups/43',
    });
  });

  it('uses account-aware bridge actions for member groups and active chats', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ groupId: 4, groupName: 'Member' }]).mockResolvedValueOnce({
      direct: [],
      groups: [],
    });

    await expect(getMemberGroups('qortium', 'Qabc', ['GET_ACCOUNT_GROUPS'])).resolves.toEqual([
      { groupId: 4, groupName: 'Member' },
    ]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'GET_ACCOUNT_GROUPS',
      address: 'Qabc',
    });

    await expect(getActiveChats('qortium', 'Qabc', ['GET_ACTIVE_CHATS'])).resolves.toEqual({ direct: [], groups: [] });
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

  it('resolves a registered name to its owner address over FETCH_NODE_API', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      body: '{"name":"alice","owner":"Qowner"}',
      contentType: 'application/json',
      data: { name: 'alice', owner: 'Qowner' },
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getNameOwnerAddress(' alice ')).resolves.toBe('Qowner');
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/names/alice',
    });
  });

  it('returns null when the registered name is unknown (HTTP 404)', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      body: '',
      contentType: 'application/json',
      data: null,
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(getNameOwnerAddress('ghost')).resolves.toBeNull();
  });

  it('returns null when the name has no owner, and skips the request for blank input', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      body: '{"name":"alice"}',
      contentType: 'application/json',
      data: { name: 'alice' },
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getNameOwnerAddress('alice')).resolves.toBeNull();

    await expect(getNameOwnerAddress('   ')).resolves.toBeNull();
    expect(qdnRequestMock).toHaveBeenCalledTimes(1);
  });

  it('uses the group members bridge action when available', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      memberCount: 1,
      members: [{ member: 'Qmember', primaryName: 'Member Name' }],
    });

    await expect(getGroupMembers('qortium', 9, ['GET_GROUP_MEMBERS'])).resolves.toEqual([
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
      getGroupMessages('qortium', { groupId: 7, groupName: 'Open', isOpen: true }, ['SEARCH_CHAT_MESSAGES']),
    ).resolves.toEqual([
      { sender: 'Qa', timestamp: 10, txGroupId: 7 },
      { sender: 'Qb', timestamp: 20, txGroupId: 7 },
    ]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'SEARCH_CHAT_MESSAGES',
      encoding: 'BASE64',
      groupId: 7,
      txGroupId: 7,
      limit: 100,
      reverse: true,
    });

    await expect(
      getGroupMessages('qortium', { groupId: 8, groupName: 'Closed', isOpen: false }, [
        'SEARCH_CHAT_MESSAGES',
        'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
      ]),
    ).resolves.toEqual([{ sender: 'Qc', timestamp: 30, txGroupId: 8 }]);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
      encoding: 'BASE64',
      groupId: 8,
      txGroupId: 8,
      limit: 100,
      reverse: true,
    });
  });

  it('can read closed-group messages without private decryption', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ isEncrypted: true, sender: 'Qc', timestamp: 30, txGroupId: 8 }]);

    await expect(
      getGroupMessages('qortium', { groupId: 8, groupName: 'Closed', isOpen: false }, [
        'SEARCH_CHAT_MESSAGES',
        'SEARCH_PRIVATE_GROUP_CHAT_MESSAGES',
      ], {
        decryptPrivate: false,
      }),
    ).resolves.toEqual([{ isEncrypted: true, sender: 'Qc', timestamp: 30, txGroupId: 8 }]);

    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'SEARCH_CHAT_MESSAGES',
      encoding: 'BASE64',
      groupId: 8,
      txGroupId: 8,
      limit: 100,
      reverse: true,
    });
  });

  it('pages backward through history with a before timestamp', () => {
    expect(buildGroupMessagesPath(7, 100, 1234)).toBe(
      '/chat/messages?txGroupId=7&encoding=BASE64&limit=100&reverse=true&before=1234',
    );
  });

  it('forwards the before timestamp through the message bridge action', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ sender: 'Qa', timestamp: 5, txGroupId: 7 }]);

    await getGroupMessages('qortium', { groupId: 7, groupName: 'Open', isOpen: true }, ['SEARCH_CHAT_MESSAGES'], {
      before: 1234,
    });

    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'SEARCH_CHAT_MESSAGES',
      before: 1234,
      encoding: 'BASE64',
      groupId: 7,
      txGroupId: 7,
      limit: 100,
      reverse: true,
    });
  });

  it('forwards the before timestamp through raw closed-group reads', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ isEncrypted: true, sender: 'Qa', timestamp: 5, txGroupId: 8 }]);

    await getGroupMessages('qortium', { groupId: 8, groupName: 'Closed', isOpen: false }, ['SEARCH_CHAT_MESSAGES'], {
      before: 1234,
      decryptPrivate: false,
    });

    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'SEARCH_CHAT_MESSAGES',
      before: 1234,
      encoding: 'BASE64',
      groupId: 8,
      txGroupId: 8,
      limit: 100,
      reverse: true,
    });
  });

  it('forwards a caller limit through group and direct message reads', async () => {
    // The sidebar activity sweep fetches small windows instead of full pages.
    qdnRequestMock
      .mockResolvedValueOnce([{ sender: 'Qa', timestamp: 10, txGroupId: 7 }])
      .mockResolvedValueOnce([{ sender: 'Qb', timestamp: 20, txGroupId: 0 }]);

    await getGroupMessages('qortium', { groupId: 7, groupName: 'Open', isOpen: true }, ['SEARCH_CHAT_MESSAGES'], {
      limit: 10,
    });

    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'SEARCH_CHAT_MESSAGES',
      encoding: 'BASE64',
      groupId: 7,
      txGroupId: 7,
      limit: 10,
      reverse: true,
    });

    await getDirectMessages('Qpeer', ['SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES'], { limit: 10 });

    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
      encoding: 'BASE64',
      limit: 10,
      otherAddress: 'Qpeer',
      reverse: true,
    });

    // The keyless REST fallback carries the same limit in its path.
    expect(buildGroupMessagesPath(7, 10)).toBe(
      '/chat/messages?txGroupId=7&encoding=BASE64&limit=10&reverse=true',
    );
  });

  it('fails closed for closed-group message reads when private bridge support is absent', async () => {
    await expect(
      getGroupMessages('qortium', { groupId: 8, groupName: 'Closed', isOpen: false }, ['SEARCH_CHAT_MESSAGES']),
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
      .mockResolvedValueOnce({ signature: 'send-sig', timestamp: 1700000000000 })
      .mockResolvedValueOnce({ signature: 'send-direct-sig', timestamp: 1700000000001 });

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

    await expect(sendChatMessage('qortium', 9, 'hello')).resolves.toEqual({
      signature: 'send-sig',
      timestamp: 1700000000000,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(3, {
      action: 'SEND_CHAT_MESSAGE',
      message: 'hello',
      txGroupId: 9,
    });

    await expect(sendDirectChatMessage('Qpeer', 'hello direct')).resolves.toEqual({
      signature: 'send-direct-sig',
      timestamp: 1700000000001,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(4, {
      action: 'SEND_CHAT_MESSAGE',
      message: 'hello direct',
      recipientAddress: 'Qpeer',
    });
  });

  it('passes the edited message reference through to the bridge', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({ signature: 'edit-sig', timestamp: 1700000000010 })
      .mockResolvedValueOnce({ signature: 'edit-direct-sig', timestamp: 1700000000011 });

    await sendChatMessage('qortium', 9, 'fixed typo', 'original-sig');
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'SEND_CHAT_MESSAGE',
      chatReference: 'original-sig',
      message: 'fixed typo',
      txGroupId: 9,
    });

    await sendDirectChatMessage('Qpeer', 'fixed direct typo', 'direct-sig');
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'SEND_CHAT_MESSAGE',
      chatReference: 'direct-sig',
      message: 'fixed direct typo',
      recipientAddress: 'Qpeer',
    });
  });

  it('reads a legacy result-wrapped signature defensively', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      accepted: true,
      action: 'SEND_CHAT_MESSAGE',
      groupId: 9,
      result: { signature: 'legacy-sig', timestamp: 1700000000020 },
    });

    await expect(sendChatMessage('qortium', 9, 'hello')).resolves.toEqual({
      signature: 'legacy-sig',
      timestamp: 1700000000020,
    });
  });

  it('throws when the bridge accepts a chat send but returns no signature', async () => {
    qdnRequestMock.mockResolvedValueOnce({ accepted: true, action: 'SEND_CHAT_MESSAGE', groupId: 9 });

    await expect(sendChatMessage('qortium', 9, 'hello')).rejects.toThrow(
      'Chat send did not return a transaction signature.',
    );
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

  it('resolves identities in chunked RESOLVE_IDENTITIES requests', async () => {
    const addresses = Array.from({ length: RESOLVE_IDENTITIES_LIMIT + 1 }, (_value, index) => `Q${index}`);

    const firstChunk = addresses.slice(0, RESOLVE_IDENTITIES_LIMIT).map((address, index) => ({
      address,
      name: `identity-${index}`,
      avatarSrc: index % 2 === 0 ? `avatar-${index}.png` : null,
    }));

    const secondChunk = addresses
      .slice(RESOLVE_IDENTITIES_LIMIT)
      .map((address, index) => ({ address, name: `identity-${RESOLVE_IDENTITIES_LIMIT + index}` }));

    qdnRequestMock.mockResolvedValueOnce(firstChunk).mockResolvedValueOnce(secondChunk);

    await expect(resolveIdentities(addresses, ['RESOLVE_IDENTITIES'])).resolves.toHaveLength(addresses.length);
    expect(qdnRequestMock).toHaveBeenCalledTimes(2);
    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
      action: 'RESOLVE_IDENTITIES',
      addresses: addresses.slice(0, RESOLVE_IDENTITIES_LIMIT),
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'RESOLVE_IDENTITIES',
      addresses: addresses.slice(RESOLVE_IDENTITIES_LIMIT),
    });
  });

  it('deduplicates addresses before resolving identities', async () => {
    qdnRequestMock.mockResolvedValueOnce([{ address: 'Qabc', name: 'alice' }]);

    await expect(resolveIdentities(['Qabc', 'Qabc', 'Qabc'], ['RESOLVE_IDENTITIES'])).resolves.toEqual([
      { address: 'Qabc', name: 'alice' },
    ]);
    expect(qdnRequestMock).toHaveBeenCalledTimes(1);
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'RESOLVE_IDENTITIES',
      addresses: ['Qabc'],
    });
  });

  it('requires RESOLVE_IDENTITIES to be offered by Home before resolving identities', async () => {
    await expect(resolveIdentities(['Qabc'], [])).rejects.toThrow(
      'RESOLVE_IDENTITIES is not available in this Home build.',
    );
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  // Chat 2.0 slice 2: dual-chain network dispatch and per-protocol differences
  // (docs/HOME_V2_BRIDGE_COMPATIBILITY.md in qortium-home).
  describe('dual-chain (Chat 2.0 slice 2)', () => {
    it('routes a qortium call through qdnRequest and never touches qortalRequest', async () => {
      qdnRequestMock.mockResolvedValueOnce([{ groupId: 1, groupName: 'General' }]);

      await expect(searchGroups('qortium', '', ['LIST_GROUPS'])).resolves.toEqual([
        { groupId: 1, groupName: 'General' },
      ]);
      expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'LIST_GROUPS', limit: 100, reverse: false });
      expect(qortalRequestMock).not.toHaveBeenCalled();
    });

    it('routes a qortal call through qortalRequest and never touches qdnRequest', async () => {
      qortalRequestMock.mockResolvedValueOnce([{ groupId: 5, groupName: 'Qortal General' }]);

      await expect(searchGroups('qortal', '', ['LIST_GROUPS'])).resolves.toEqual([
        { groupId: 5, groupName: 'Qortal General' },
      ]);
      expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'LIST_GROUPS', limit: 100, reverse: false });
      expect(qdnRequestMock).not.toHaveBeenCalled();
    });

    it('searches Qortal groups by listing every group and filtering client-side (no SEARCH_GROUPS on Qortal)', async () => {
      qortalRequestMock.mockResolvedValueOnce([
        { groupId: 1, groupName: 'Chess Fans' },
        { groupId: 2, groupName: 'Dev Talk' },
        { groupId: 3, groupName: 'Chess Openings' },
      ]);

      // Qortal never advertises SEARCH_GROUPS (Qortium-only — Qortal Core has
      // no /groups/search), only LIST_GROUPS.
      await expect(searchGroups('qortal', 'chess', ['LIST_GROUPS'])).resolves.toEqual([
        { groupId: 1, groupName: 'Chess Fans' },
        { groupId: 3, groupName: 'Chess Openings' },
      ]);
      // One LIST_GROUPS call, not a search action.
      expect(qortalRequestMock).toHaveBeenCalledTimes(1);
      expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'LIST_GROUPS', limit: 100, reverse: false });
    });

    it('still uses SEARCH_GROUPS on Qortium even when a query is present (byte-identical to slice 1)', async () => {
      qdnRequestMock.mockResolvedValueOnce([{ groupId: 4, groupName: 'Chess Fans' }]);

      await expect(searchGroups('qortium', 'chess', ['SEARCH_GROUPS', 'LIST_GROUPS'])).resolves.toEqual([
        { groupId: 4, groupName: 'Chess Fans' },
      ]);
      expect(qdnRequestMock).toHaveBeenCalledWith({
        action: 'SEARCH_GROUPS',
        limit: 100,
        query: 'chess',
        reverse: false,
        visibility: 'ALL',
      });
    });

    it('rejects sending to Qortal group 0 (no general chat there) without ever calling the bridge', async () => {
      await expect(sendChatMessage('qortal', 0, 'hi')).rejects.toThrow('Qortal has no general chat group.');
      expect(qortalRequestMock).not.toHaveBeenCalled();
      expect(qdnRequestMock).not.toHaveBeenCalled();
    });

    it('still allows Qortium group 0 (general chat) sends', async () => {
      qdnRequestMock.mockResolvedValueOnce({ signature: 'general-sig', timestamp: 1700000000030 });

      await expect(sendChatMessage('qortium', 0, 'hi all')).resolves.toEqual({
        signature: 'general-sig',
        timestamp: 1700000000030,
      });
    });

    it('reads Qortal group messages via qortalRequest and sorts them the same way as Qortium', async () => {
      qortalRequestMock.mockResolvedValueOnce([
        { data: 'Yg==', sender: 'QsenderA', signature: 'sig-a', timestamp: 200, txGroupId: 7 },
        { data: 'YQ==', sender: 'QsenderB', signature: 'sig-b', timestamp: 100, txGroupId: 7 },
      ]);

      const messages = await getGroupMessages(
        'qortal',
        { groupId: 7, groupName: 'Qortal group', isOpen: true },
        ['SEARCH_CHAT_MESSAGES'],
      );

      expect(messages.map((message) => message.signature)).toEqual(['sig-b', 'sig-a']);
      expect(qortalRequestMock).toHaveBeenCalledWith({
        action: 'SEARCH_CHAT_MESSAGES',
        encoding: 'BASE64',
        groupId: 7,
        txGroupId: 7,
        limit: 100,
        reverse: true,
      });
    });

    it('gates a closed Qortal group the same way an unsupported closed Qortium group is gated', async () => {
      // Neither protocol's Home 2.0 v2 bridge advertises
      // SEARCH_PRIVATE_GROUP_CHAT_MESSAGES for qortalRequest in this slice.
      await expect(
        getGroupMessages('qortal', { groupId: 8, groupName: 'Closed', isOpen: false }, ['SEARCH_CHAT_MESSAGES']),
      ).rejects.toThrow('Closed group chat reads require Qortium Home private group chat support.');
      expect(qortalRequestMock).not.toHaveBeenCalled();
    });

    it('resolves a Qortal identity (address + publicKey, then a separate primary-name lookup)', async () => {
      qortalRequestMock
        .mockResolvedValueOnce({ address: 'QortalAddr', publicKey: 'pub123' })
        .mockResolvedValueOnce({ name: 'alice' });

      await expect(getQortalUserAccount(['GET_PRIMARY_NAME'])).resolves.toEqual({
        address: 'QortalAddr',
        name: 'alice',
        publicKey: 'pub123',
      });
      expect(qortalRequestMock).toHaveBeenNthCalledWith(1, { action: 'GET_USER_ACCOUNT' });
      expect(qortalRequestMock).toHaveBeenNthCalledWith(2, {
        action: 'GET_PRIMARY_NAME',
        address: 'QortalAddr',
      });
    });

    it('resolves a Qortal identity with no registered name when GET_PRIMARY_NAME is not offered', async () => {
      qortalRequestMock.mockResolvedValueOnce({ address: 'QortalAddr', publicKey: null });

      await expect(getQortalUserAccount([])).resolves.toEqual({
        address: 'QortalAddr',
        name: null,
        publicKey: null,
      });
      expect(qortalRequestMock).toHaveBeenCalledTimes(1);
    });
  });
});
