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
  forgetPendingBridgeTransaction,
  getPendingBridgeTransactions,
  getPendingGroupApprovals,
  submitGroupApproval,
  getActiveChats,
  getAccountNames,
  getAccountNamesForNetwork,
  getCurrentBlockHeight,
  getAccountGroupJoinRequests,
  getAdminGroupJoinRequests,
  getDirectMessages,
  getGroupJoinRequests,
  getChatAttachmentStreamUrl,
  getGroup,
  getGroupMembers,
  getGroupMessages,
  getMemberGroups,
  getMissingPrivateGroupKeyRequests,
  getGroupApprovalVotes,
  getMintingStatus,
  getNameOwnerAddress,
  getNameOwnerAddressForNetwork,
  getQdnResourceStreamUrl,
  getQdnResourceUrl,
  getQortalUserAccount,
  getQortalActiveGroupStats,
  getTransactionStatus,
  getPrivateDirectActiveChats,
  getPrivateGroupActiveChats,
  getPrivateGroupChatState,
  isPrivateAttachmentDescriptor,
  isPublishSourceTokenError,
  isQortalPrivateGroupChatState,
  isQortiumPrivateGroupChatState,
  joinGroup,
  leaveGroup,
  listGroups,
  openChatAttachmentViewer,
  openQdnResourceViewer,
  publishChatAttachment,
  publishQdnAttachment,
  publishQdnResource,
  requestPrivateGroupChatKey,
  RESOLVE_IDENTITIES_LIMIT,
  resolveIdentities,
  resolvePrivateGroupChatKeyRequests,
  rotatePrivateGroupChatKey,
  saveChatAttachment,
  saveQdnResource,
  searchGroups,
  selectQdnPublishSource,
  sendChatDelete,
  sendChatEdit,
  sendChatMessage,
  sendChatReaction,
  sendDirectChatDelete,
  sendDirectChatEdit,
  sendDirectChatMessage,
  sendDirectChatReaction,
  sendPrivateGroupChatDelete,
  sendPrivateGroupChatEdit,
  sendPrivateGroupChatMessage,
  sendPrivateGroupChatReaction,
  startMinting,
} from './coreApi';
import type { PrivateAttachmentDescriptor } from './types';

const qdnRequestMock = vi.hoisted(() => vi.fn());
// Chat 2.0 slice 2: coreApi's network-aware functions dispatch through
// chatNetwork.ts's bridgeRequest, which calls qortalRequest for network
// 'qortal' — mocked here the same way qdnRequest already is above, so the
// qortal-specific tests below never touch the real window.qortalRequest.
const qortalRequestMock = vi.hoisted(() => vi.fn());
const qortalGeneralChatMessagesMock = vi.hoisted(() => vi.fn());
const rememberQortalGeneralChatAccountMock = vi.hoisted(() => vi.fn());
const qortalGeneralChatDeleteMock = vi.hoisted(() => vi.fn());
const qortalGeneralChatEditMock = vi.hoisted(() => vi.fn());
const qortalGeneralChatMessageMock = vi.hoisted(() => vi.fn());
const qortalGeneralChatReactionMock = vi.hoisted(() => vi.fn());

vi.mock('./qdnRequest', () => ({
  buildNodeWebSocketUrl: (path: string) => `ws://127.0.0.1:24891${path}`,
  qdnRequest: qdnRequestMock,
}));

vi.mock('./qortalRequest', () => ({
  qortalRequest: qortalRequestMock,
}));

vi.mock('./qortalGeneralChat', () => ({
  getQortalGeneralChatMessages: qortalGeneralChatMessagesMock,
  rememberQortalGeneralChatAccount: rememberQortalGeneralChatAccountMock,
  sendQortalGeneralChatDelete: qortalGeneralChatDeleteMock,
  sendQortalGeneralChatEdit: qortalGeneralChatEditMock,
  sendQortalGeneralChatMessage: qortalGeneralChatMessageMock,
  sendQortalGeneralChatReaction: qortalGeneralChatReactionMock,
}));

describe('Core API path builders', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
    qortalGeneralChatMessagesMock.mockReset();
    rememberQortalGeneralChatAccountMock.mockReset();
    qortalGeneralChatDeleteMock.mockReset();
    qortalGeneralChatEditMock.mockReset();
    qortalGeneralChatMessageMock.mockReset();
    qortalGeneralChatReactionMock.mockReset();
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

  it('keeps Qortal account-name resolution on the Qortal bridge', async () => {
    qortalRequestMock.mockResolvedValueOnce([{ name: 'alice', owner: 'Qabc' }]);

    await expect(getAccountNamesForNetwork('qortal', 'Qabc', ['GET_ACCOUNT_NAMES'])).resolves.toEqual([
      { name: 'alice', owner: 'Qabc' },
    ]);
    expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'GET_ACCOUNT_NAMES', address: 'Qabc' });
    expect(qdnRequestMock).not.toHaveBeenCalled();
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

  it('resolves a Qortal name via the exact GET_NAME_DATA action when advertised', async () => {
    qortalRequestMock.mockResolvedValueOnce({ name: 'bob', owner: 'QbobOwner' });

    await expect(getNameOwnerAddressForNetwork('qortal', ' bob ', ['GET_NAME_DATA'])).resolves.toBe('QbobOwner');
    expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'GET_NAME_DATA', name: 'bob' });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('falls back to FETCH_NODE_API against the Qortal node when GET_NAME_DATA is not advertised', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      body: '{"name":"bob","owner":"QbobOwner"}',
      contentType: 'application/json',
      data: { name: 'bob', owner: 'QbobOwner' },
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getNameOwnerAddressForNetwork('qortal', 'bob', [])).resolves.toBe('QbobOwner');
    expect(qortalRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/names/bob',
    });
  });

  it('treats a failed GET_NAME_DATA lookup as an unregistered name rather than throwing', async () => {
    qortalRequestMock.mockRejectedValueOnce(new Error('not found'));

    await expect(getNameOwnerAddressForNetwork('qortal', 'ghost', ['GET_NAME_DATA'])).resolves.toBeNull();
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
      timeToLive: 0,
    });

    await expect(sendChatMessage('qortium', 9, 'hello')).resolves.toEqual({
      signature: 'send-sig',
      timestamp: 1700000000000,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(3, {
      action: 'SEND_CHAT_MESSAGE',
      groupId: 9,
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

  it('preserves a signed Home broadcast failure as an ambiguous, reconcilable outcome', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      accepted: false,
      error: 'Node rejected the chat transaction.',
      errorType: 'BROADCAST_REJECTED',
      signature: 'signed-but-not-broadcast',
    });

    await expect(sendChatMessage('qortium', 9, 'hello')).resolves.toEqual({
      error: 'Node rejected the chat transaction.',
      errorType: 'BROADCAST_REJECTED',
      outcome: 'ambiguous',
      signature: 'signed-but-not-broadcast',
      timestamp: expect.any(Number),
    });
  });

  it('preserves a signed legacy errorType result as an ambiguous, reconcilable outcome', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      errorType: 'BROADCAST_REJECTED',
      signature: 'signed-but-not-broadcast',
    });

    await expect(sendChatMessage('qortium', 9, 'hello')).resolves.toEqual({
      error: 'BROADCAST_REJECTED',
      errorType: 'BROADCAST_REJECTED',
      outcome: 'ambiguous',
      signature: 'signed-but-not-broadcast',
      timestamp: expect.any(Number),
    });
  });

  it('marks an uncertain automatic key setup as a safe-to-retry message rejection', async () => {
    qdnRequestMock.mockResolvedValueOnce({
      accepted: false,
      error: 'Private-group key setup outcome is unknown. Your message was not submitted; retrying the message is safe.',
      errorType: 'KEY_ANNOUNCEMENT_BROADCAST_OUTCOME_UNKNOWN',
      messageSubmitted: false,
      outcome: 'unknown',
      signature: 'possibly-accepted-key-announcement',
      stage: 'key-announcement',
      timestamp: 1700000000002,
    });

    await expect(sendChatMessage('qortium', 9, 'hello')).resolves.toEqual({
      error: 'Private-group key setup outcome is unknown. Your message was not submitted; retrying the message is safe.',
      errorType: 'KEY_ANNOUNCEMENT_BROADCAST_OUTCOME_UNKNOWN',
      outcome: 'not-submitted',
      signature: 'possibly-accepted-key-announcement',
      stage: 'key-announcement',
      timestamp: 1700000000002,
    });
  });

  it('allows retry for exact pre-broadcast validation and user-cancel results', async () => {
    qdnRequestMock
      .mockResolvedValueOnce({
        accepted: false,
        error: 'Message is required.',
        errorType: 'VALIDATION_FAILED',
      })
      .mockResolvedValueOnce({
        accepted: false,
        canceled: true,
        reason: 'USER_CANCELLED',
      });

    await expect(sendChatMessage('qortium', 9, 'hello')).rejects.toMatchObject({
      message: 'Message is required.',
      name: 'ChatSendRejectedError',
    });
    await expect(sendChatMessage('qortium', 9, 'hello')).rejects.toMatchObject({
      name: 'ChatSendRejectedError',
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
      groupId: 9,
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

  it('normalizes a serialized group id before sending both Home bridge field names', async () => {
    qdnRequestMock.mockResolvedValueOnce({ signature: 'group-12-sig', timestamp: 1700000000021 });

    await expect(sendChatMessage('qortium', '12', 'announcement')).resolves.toEqual({
      signature: 'group-12-sig',
      timestamp: 1700000000021,
    });
    expect(qdnRequestMock).toHaveBeenCalledWith({
      action: 'SEND_CHAT_MESSAGE',
      groupId: 12,
      message: 'announcement',
      txGroupId: 12,
    });
  });

  it('rejects malformed group ids before calling either bridge', async () => {
    for (const groupId of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '', '12x']) {
      await expect(sendChatMessage('qortium', groupId, 'hello')).rejects.toThrow(
        'Chat group id must be a non-negative safe integer.',
      );
    }

    expect(qdnRequestMock).not.toHaveBeenCalled();
    expect(qortalRequestMock).not.toHaveBeenCalled();
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
    expect(qortalRequestMock).not.toHaveBeenCalled();
  });

  it('routes a qortal transaction-status lookup through the Qortal bridge, never the Qortium one', async () => {
    qortalRequestMock.mockResolvedValueOnce({
      body: '{"blockHeight":456}',
      contentType: 'application/json',
      data: { blockHeight: 456, signature: 'qortal-sig' },
      ok: true,
      status: 200,
      statusText: 'OK',
    });

    await expect(getTransactionStatus('qortal-sig', 'qortal')).resolves.toEqual({
      blockHeight: 456,
      signature: 'qortal-sig',
    });
    expect(qortalRequestMock).toHaveBeenCalledWith({
      action: 'FETCH_NODE_API',
      maxBytes: 2097152,
      path: '/transactions/signature/qortal-sig',
    });
    expect(qdnRequestMock).not.toHaveBeenCalled();
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

    it('loads Qortal active-chat previews through the Qortal bridge', async () => {
      qortalRequestMock.mockResolvedValueOnce({
        direct: [],
        groups: [{ data: 'aGVsbG8=', groupId: 12, senderName: 'alice', timestamp: 500 }],
      });

      await expect(getActiveChats('qortal', 'QortalAddress', ['GET_ACTIVE_CHATS'])).resolves.toEqual({
        direct: [],
        groups: [{ data: 'aGVsbG8=', groupId: 12, senderName: 'alice', timestamp: 500 }],
      });
      expect(qortalRequestMock).toHaveBeenCalledWith({
        action: 'GET_ACTIVE_CHATS',
        address: 'QortalAddress',
        encoding: 'BASE64',
        hasChatReference: false,
      });
    });

    it('routes Qortal roster fallback and older-history cursors to the Qortal node', async () => {
      qortalRequestMock
        .mockResolvedValueOnce({
          body: '',
          contentType: 'application/json',
          data: { members: [{ member: 'Qmember', name: 'alice' }] },
          ok: true,
          status: 200,
          statusText: 'OK',
        })
        .mockResolvedValueOnce([{ sender: 'Qmember', signature: 'older', timestamp: 100, txGroupId: 12 }]);

      await expect(getGroupMembers('qortal', 12, [])).resolves.toEqual([{ member: 'Qmember', name: 'alice' }]);
      await expect(
        getGroupMessages(
          'qortal',
          { groupId: 12, groupName: 'Qortal group', isOpen: true },
          ['SEARCH_CHAT_MESSAGES'],
          { before: 501 },
        ),
      ).resolves.toEqual([{ sender: 'Qmember', signature: 'older', timestamp: 100, txGroupId: 12 }]);

      expect(qortalRequestMock).toHaveBeenNthCalledWith(1, {
        action: 'FETCH_NODE_API',
        maxBytes: 2097152,
        path: '/groups/members/12?limit=100&reverse=false',
      });
      expect(qortalRequestMock).toHaveBeenNthCalledWith(2, {
        action: 'SEARCH_CHAT_MESSAGES',
        before: 501,
        encoding: 'BASE64',
        groupId: 12,
        limit: 100,
        reverse: true,
        txGroupId: 12,
      });
    });

    it('searches the complete Qortal catalogue and filters by name or numeric id (no SEARCH_GROUPS on Qortal)', async () => {
      qortalRequestMock.mockResolvedValueOnce([
        { groupId: 1, groupName: 'Chess Fans' },
        { groupId: 2, groupName: 'Dev Talk' },
        { groupId: 110, groupName: 'Chess Openings' },
      ]);

      // Qortal never advertises SEARCH_GROUPS (Qortium-only — Qortal Core has
      // no /groups/search), only LIST_GROUPS.
      await expect(searchGroups('qortal', 'chess', ['LIST_GROUPS'])).resolves.toEqual([
        { groupId: 1, groupName: 'Chess Fans' },
        { groupId: 110, groupName: 'Chess Openings' },
      ]);
      // One LIST_GROUPS call, not a search action.
      expect(qortalRequestMock).toHaveBeenCalledTimes(1);
      expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'LIST_GROUPS', limit: 0, reverse: false });
    });

    it('loads and bounds the Qortal gateway active-group seed', async () => {
      qortalRequestMock.mockResolvedValueOnce({
        data: [{ groupId: 23, size: 500 }],
        ok: true,
        status: 200,
      });

      await expect(getQortalActiveGroupStats(500)).resolves.toEqual([{ groupId: 23, size: 500 }]);
      expect(qortalRequestMock).toHaveBeenCalledWith({
        action: 'FETCH_NODE_API',
        maxBytes: 65536,
        path: '/chat/groupstats?limit=50',
      });
    });

    it('loads the full Qortal catalogue with an unlimited LIST_GROUPS request', async () => {
      qortalRequestMock.mockResolvedValueOnce([{ groupId: 110, groupName: 'Late group' }]);

      await expect(listGroups('qortal', ['LIST_GROUPS'], 0)).resolves.toEqual([
        { groupId: 110, groupName: 'Late group' },
      ]);
      expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'LIST_GROUPS', limit: 0, reverse: false });
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

    it('routes Qortal group 0 sends through the MESSAGE-wrapped General Chat protocol', async () => {
      qortalGeneralChatMessageMock.mockResolvedValueOnce({ signature: 'wrapped-sig', timestamp: 1700000000020 });

      await expect(sendChatMessage('qortal', 0, 'hi')).resolves.toEqual({
        signature: 'wrapped-sig',
        timestamp: 1700000000020,
      });
      expect(qortalGeneralChatMessageMock).toHaveBeenCalledWith('hi', undefined);
      expect(qortalRequestMock).not.toHaveBeenCalled();
      expect(qdnRequestMock).not.toHaveBeenCalled();
    });

    it('reads Qortal group 0 from the MESSAGE wrapper feed', async () => {
      qortalGeneralChatMessagesMock.mockResolvedValueOnce([
        { sender: 'Qsender', signature: 'wrapped-sig', timestamp: 100, txGroupId: 0 },
      ]);

      await expect(
        getGroupMessages(
          'qortal',
          { groupId: 0, groupName: 'General Chat', isOpen: true },
          ['SEARCH_CHAT_MESSAGES'],
          { before: 501, limit: 20 },
        ),
      ).resolves.toEqual([{ sender: 'Qsender', signature: 'wrapped-sig', timestamp: 100, txGroupId: 0 }]);
      expect(qortalGeneralChatMessagesMock).toHaveBeenCalledWith({ before: 501, limit: 20 });
      expect(qortalRequestMock).not.toHaveBeenCalled();
    });

    it('still allows Qortium group 0 (general chat) sends', async () => {
      qdnRequestMock.mockResolvedValueOnce({ signature: 'general-sig', timestamp: 1700000000030 });

      await expect(sendChatMessage('qortium', 0, 'hi all')).resolves.toEqual({
        signature: 'general-sig',
        timestamp: 1700000000030,
      });
      expect(qdnRequestMock).toHaveBeenCalledWith({
        action: 'SEND_CHAT_MESSAGE',
        groupId: 0,
        message: 'hi all',
        txGroupId: 0,
      });
    });

    it('treats Home 1.7 Qortal BROADCAST_REJECTED with a signature as outcome unknown', async () => {
      qortalRequestMock.mockResolvedValueOnce({
        accepted: false,
        error: 'Qortal node request timed out.',
        errorType: 'BROADCAST_REJECTED',
        signature: 'possibly-accepted-qortal-signature',
      });

      await expect(sendChatMessage('qortal', 7, 'hello')).resolves.toEqual({
        error: 'Qortal node request timed out.',
        errorType: 'BROADCAST_REJECTED',
        outcome: 'ambiguous',
        signature: 'possibly-accepted-qortal-signature',
        timestamp: expect.any(Number),
      });
      expect(qortalRequestMock).toHaveBeenCalledWith({
        action: 'SEND_CHAT_MESSAGE',
        groupId: 7,
        message: 'hello',
        txGroupId: 7,
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
      expect(rememberQortalGeneralChatAccountMock).toHaveBeenCalledWith({
        address: 'QortalAddr',
        publicKey: 'pub123',
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

  // P1 item B: typed Home 2 action wrappers (review/schemas-home2-actions.md).
  describe('Home 2 typed action wrappers (P1 item B)', () => {
    describe('public group revisions', () => {
      it('passes an edit through unchanged when SEND_CHAT_EDIT is advertised on Qortium', async () => {
        qdnRequestMock.mockResolvedValueOnce({ signature: 'edit-sig', timestamp: 1700000000100 });

        await expect(
          sendChatEdit('qortium', 9, '{"message":"fixed","repliedTo":"reply-sig"}', 'orig-sig', ['SEND_CHAT_EDIT']),
        ).resolves.toEqual({ signature: 'edit-sig', timestamp: 1700000000100 });
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'SEND_CHAT_EDIT',
          chatReference: 'orig-sig',
          message: '{"message":"fixed","repliedTo":"reply-sig"}',
          txGroupId: 9,
        });
        expect(qortalRequestMock).not.toHaveBeenCalled();
      });

      it('falls back to the generic SEND_CHAT_MESSAGE envelope for an edit when SEND_CHAT_EDIT is not advertised', async () => {
        qdnRequestMock.mockResolvedValueOnce({ signature: 'fallback-edit-sig', timestamp: 1700000000110 });

        await expect(sendChatEdit('qortium', 9, 'fixed typo', 'orig-sig', [])).resolves.toEqual({
          signature: 'fallback-edit-sig',
          timestamp: 1700000000110,
        });
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'SEND_CHAT_MESSAGE',
          chatReference: 'orig-sig',
          groupId: 9,
          message: 'fixed typo',
          txGroupId: 9,
        });
      });

      it('builds the exact SEND_CHAT_EDIT Hub v3 envelope for Qortal with a bounded specialId', async () => {
        qortalRequestMock.mockResolvedValueOnce({ signature: 'hub-edit-sig', timestamp: 1700000000120 });

        await expect(
          sendChatEdit('qortal', 7, 'Hello\nQortal', 'orig-sig', ['SEND_CHAT_EDIT']),
        ).resolves.toEqual({ signature: 'hub-edit-sig', timestamp: 1700000000120 });

        expect(qortalRequestMock).toHaveBeenCalledTimes(1);
        const call = qortalRequestMock.mock.calls[0][0];

        expect(call.action).toBe('SEND_CHAT_EDIT');
        expect(call.chatReference).toBe('orig-sig');
        expect(call.txGroupId).toBe(7);

        const payload = JSON.parse(call.message);

        expect(payload).toMatchObject({
          images: [],
          isEdited: true,
          messageText: {
            content: [
              {
                content: [{ text: 'Hello', type: 'text' }, { type: 'hardBreak' }, { text: 'Qortal', type: 'text' }],
                type: 'paragraph',
              },
            ],
            type: 'doc',
          },
          repliedTo: '',
          type: 'edit',
          version: 3,
        });
        expect(typeof payload.specialId).toBe('string');
        expect(payload.specialId.length).toBeGreaterThan(0);
        expect(payload.specialId.length).toBeLessThanOrEqual(128);
      });

      it('builds the Qortium JSON delete envelope, optionally carrying repliedTo, on both the exact and fallback paths', async () => {
        qdnRequestMock
          .mockResolvedValueOnce({ signature: 'delete-sig', timestamp: 1700000000130 })
          .mockResolvedValueOnce({ signature: 'delete-sig-2', timestamp: 1700000000131 })
          .mockResolvedValueOnce({ signature: 'delete-sig-fallback', timestamp: 1700000000132 });

        await sendChatDelete('qortium', 9, 'orig-sig', ['SEND_CHAT_DELETE']);
        expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
          action: 'SEND_CHAT_DELETE',
          chatReference: 'orig-sig',
          message: JSON.stringify({ message: '' }),
          txGroupId: 9,
        });

        await sendChatDelete('qortium', 9, 'orig-sig', ['SEND_CHAT_DELETE'], 'reply-target-sig');
        expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
          action: 'SEND_CHAT_DELETE',
          chatReference: 'orig-sig',
          message: JSON.stringify({ message: '', repliedTo: 'reply-target-sig' }),
          txGroupId: 9,
        });

        await sendChatDelete('qortium', 9, 'orig-sig', []);
        expect(qdnRequestMock).toHaveBeenNthCalledWith(3, {
          action: 'SEND_CHAT_MESSAGE',
          chatReference: 'orig-sig',
          groupId: 9,
          message: JSON.stringify({ message: '' }),
          txGroupId: 9,
        });
      });

      it('builds the canonical Hub v3 empty-edit envelope (exactly 7 keys) for a Qortal delete', async () => {
        qortalRequestMock.mockResolvedValueOnce({ signature: 'hub-delete-sig', timestamp: 1700000000140 });

        await sendChatDelete('qortal', 7, 'orig-sig', ['SEND_CHAT_DELETE']);

        const call = qortalRequestMock.mock.calls[0][0];
        const payload = JSON.parse(call.message);

        expect(payload).toMatchObject({
          images: [],
          isEdited: true,
          messageText: '<p></p>',
          repliedTo: '',
          type: 'edit',
          version: 3,
        });
        expect(Object.keys(payload).sort()).toEqual(
          ['images', 'isEdited', 'messageText', 'repliedTo', 'specialId', 'type', 'version'].sort(),
        );
        expect(payload.specialId.length).toBeGreaterThan(0);
        expect(payload.specialId.length).toBeLessThanOrEqual(128);
      });

      it('builds the reaction envelope inside message on both the exact and fallback paths for Qortium', async () => {
        qdnRequestMock
          .mockResolvedValueOnce({ signature: 'reaction-sig', timestamp: 1700000000150 })
          .mockResolvedValueOnce({ signature: 'reaction-sig-fallback', timestamp: 1700000000151 });

        await sendChatReaction('qortium', 9, 'target-sig', '👍', true, ['SEND_CHAT_REACTION']);
        expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
          action: 'SEND_CHAT_REACTION',
          chatReference: 'target-sig',
          message: JSON.stringify({ message: '', type: 'reaction', content: '👍', contentState: true }),
          txGroupId: 9,
        });

        await sendChatReaction('qortium', 9, 'target-sig', '👍', true, []);
        expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
          action: 'SEND_CHAT_MESSAGE',
          chatReference: 'target-sig',
          groupId: 9,
          message: JSON.stringify({ message: '', type: 'reaction', content: '👍', contentState: true }),
          txGroupId: 9,
        });
      });

      it('builds the reaction envelope with a bounded specialId for Qortal', async () => {
        qortalRequestMock.mockResolvedValueOnce({ signature: 'hub-reaction-sig', timestamp: 1700000000160 });

        await sendChatReaction('qortal', 7, 'target-sig', '❤️', false, ['SEND_CHAT_REACTION']);

        const call = qortalRequestMock.mock.calls[0][0];
        const payload = JSON.parse(call.message);

        expect(payload).toMatchObject({ content: '❤️', contentState: false, message: '', type: 'reaction' });
        expect(typeof payload.specialId).toBe('string');
        expect(payload.specialId.length).toBeGreaterThan(0);
        expect(payload.specialId.length).toBeLessThanOrEqual(128);
      });

      it('rejects empty or over-length reaction content before any bridge call', async () => {
        await expect(
          sendChatReaction('qortium', 9, 'target-sig', '', true, ['SEND_CHAT_REACTION']),
        ).rejects.toThrow('Reaction content must be a short emoji string.');
        await expect(
          sendChatReaction('qortium', 9, 'target-sig', 'x'.repeat(33), true, ['SEND_CHAT_REACTION']),
        ).rejects.toThrow('Reaction content must be a short emoji string.');
        expect(qdnRequestMock).not.toHaveBeenCalled();
        expect(qortalRequestMock).not.toHaveBeenCalled();
      });

      it('routes Qortal group 0 edit/delete/reaction through the MESSAGE wrapper protocol', async () => {
        qortalGeneralChatEditMock.mockResolvedValueOnce({ signature: 'edit', timestamp: 1 });
        qortalGeneralChatDeleteMock.mockResolvedValueOnce({ signature: 'delete', timestamp: 2 });
        qortalGeneralChatReactionMock.mockResolvedValueOnce({ signature: 'reaction', timestamp: 3 });

        await expect(sendChatEdit('qortal', 0, 'x', 'ref', ['SEND_CHAT_EDIT'])).resolves.toEqual({
          signature: 'edit',
          timestamp: 1,
        });
        await expect(sendChatDelete('qortal', 0, 'ref', ['SEND_CHAT_DELETE'])).resolves.toEqual({
          signature: 'delete',
          timestamp: 2,
        });
        await expect(
          sendChatReaction('qortal', 0, 'ref', '👍', true, ['SEND_CHAT_REACTION']),
        ).resolves.toEqual({ signature: 'reaction', timestamp: 3 });
        expect(qortalGeneralChatEditMock).toHaveBeenCalledWith('x', 'ref');
        expect(qortalGeneralChatDeleteMock).toHaveBeenCalledWith('ref');
        expect(qortalGeneralChatReactionMock).toHaveBeenCalledWith('ref', '👍', true);
        expect(qortalRequestMock).not.toHaveBeenCalled();
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });
    });

    describe('direct chat', () => {
      it('keeps sendDirectChatMessage byte-identical when no network/actions are passed', async () => {
        qdnRequestMock.mockResolvedValueOnce({ signature: 'legacy-direct-sig', timestamp: 1700000000200 });

        await expect(sendDirectChatMessage('Qpeer', 'hi there')).resolves.toEqual({
          signature: 'legacy-direct-sig',
          timestamp: 1700000000200,
        });
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'SEND_CHAT_MESSAGE',
          message: 'hi there',
          recipientAddress: 'Qpeer',
        });
      });

      it('uses the exact SEND_DIRECT_CHAT_MESSAGE action when advertised, with no chatReference sent', async () => {
        qdnRequestMock.mockResolvedValueOnce({ signature: 'exact-direct-sig', timestamp: 1700000000210 });

        await expect(
          sendDirectChatMessage('Qpeer', 'hi there', undefined, 'qortium', ['SEND_DIRECT_CHAT_MESSAGE']),
        ).resolves.toEqual({ signature: 'exact-direct-sig', timestamp: 1700000000210 });
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'SEND_DIRECT_CHAT_MESSAGE',
          message: 'hi there',
          otherAddress: 'Qpeer',
        });
      });

      it('routes the exact SEND_DIRECT_CHAT_MESSAGE action to Qortal when network is qortal, building the v2 envelope', async () => {
        qortalRequestMock.mockResolvedValueOnce({ signature: 'qortal-direct-sig', timestamp: 1700000000220 });

        await sendDirectChatMessage('QortalPeer', 'hi there', undefined, 'qortal', ['SEND_DIRECT_CHAT_MESSAGE']);

        expect(qortalRequestMock).toHaveBeenCalledTimes(1);
        const call = qortalRequestMock.mock.calls[0][0];

        expect(call.action).toBe('SEND_DIRECT_CHAT_MESSAGE');
        expect(call.otherAddress).toBe('QortalPeer');

        const payload = JSON.parse(call.message);

        expect(payload).toMatchObject({ message: '<p>hi there</p>', repliedTo: '', type: '', version: 2 });
        expect(typeof payload.specialId).toBe('string');
        expect(payload.specialId.length).toBeGreaterThan(0);
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('rejects a direct message over the 3984 UTF-8 byte cap before any bridge call, and allows exactly the cap', async () => {
        await expect(sendDirectChatMessage('Qpeer', 'x'.repeat(3985))).rejects.toThrow(
          'Direct chat messages must be at most 3984 UTF-8 bytes.',
        );
        expect(qdnRequestMock).not.toHaveBeenCalled();

        qdnRequestMock.mockResolvedValueOnce({ signature: 'boundary-sig', timestamp: 1700000000230 });
        await expect(sendDirectChatMessage('Qpeer', 'x'.repeat(3984))).resolves.toMatchObject({
          signature: 'boundary-sig',
        });
      });

      it('measures the 3984-byte cap on the built v2 envelope for qortal, not the raw text', async () => {
        // Exactly at the cap as raw text (and thus fine on qortium, per the
        // boundary case above), but the v2 envelope's JSON structure and
        // <p></p> wrapping push the actual wire bytes over the limit.
        const text = 'x'.repeat(3984);

        await expect(
          sendDirectChatMessage('QortalPeer', text, undefined, 'qortal', ['SEND_DIRECT_CHAT_MESSAGE']),
        ).rejects.toThrow('Direct chat messages must be at most 3984 UTF-8 bytes.');
        expect(qortalRequestMock).not.toHaveBeenCalled();

        // The identical raw text still passes on qortium, where the cap
        // applies to the text itself (unchanged behavior).
        qdnRequestMock.mockResolvedValueOnce({ signature: 'qortium-envelope-boundary-sig', timestamp: 1700000000232 });
        await expect(
          sendDirectChatMessage('Qpeer', text, undefined, 'qortium', ['SEND_DIRECT_CHAT_MESSAGE']),
        ).resolves.toMatchObject({ signature: 'qortium-envelope-boundary-sig' });
      });

      it('measures the 3984-byte cap on the built v2 edit envelope for qortal, not the raw text', async () => {
        const text = 'x'.repeat(3984);

        await expect(
          sendDirectChatEdit('qortal', 'QortalPeer', text, 'ref', ['SEND_DIRECT_CHAT_EDIT']),
        ).rejects.toThrow('Direct chat messages must be at most 3984 UTF-8 bytes.');
        expect(qortalRequestMock).not.toHaveBeenCalled();
      });

      it('throws a clear error for direct revisions when the exact action is not advertised (no generic fallback)', async () => {
        await expect(sendDirectChatEdit('qortium', 'Qpeer', 'fixed', 'ref', [])).rejects.toThrow(
          'Direct chat edits require Qortium Home direct chat revision support.',
        );
        await expect(sendDirectChatDelete('qortium', 'Qpeer', 'ref', [])).rejects.toThrow(
          'Direct chat deletes require Qortium Home direct chat revision support.',
        );
        await expect(
          sendDirectChatReaction('qortium', 'Qpeer', 'ref', '👍', true, []),
        ).rejects.toThrow('Direct chat reactions require Qortium Home direct chat revision support.');
        expect(qdnRequestMock).not.toHaveBeenCalled();
        expect(qortalRequestMock).not.toHaveBeenCalled();
      });

      it('builds the exact Qortium direct edit/delete envelopes (JSON, no type key)', async () => {
        qdnRequestMock
          .mockResolvedValueOnce({ signature: 'direct-edit-sig', timestamp: 1700000000240 })
          .mockResolvedValueOnce({ signature: 'direct-delete-sig', timestamp: 1700000000241 });

        await sendDirectChatEdit('qortium', 'Qpeer', 'fixed typo', 'ref', ['SEND_DIRECT_CHAT_EDIT']);
        expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
          action: 'SEND_DIRECT_CHAT_EDIT',
          chatReference: 'ref',
          message: JSON.stringify({ message: 'fixed typo' }),
          otherAddress: 'Qpeer',
        });

        await sendDirectChatDelete('qortium', 'Qpeer', 'ref', ['SEND_DIRECT_CHAT_DELETE']);
        expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
          action: 'SEND_DIRECT_CHAT_DELETE',
          chatReference: 'ref',
          message: JSON.stringify({ message: '' }),
          otherAddress: 'Qpeer',
        });
      });

      it('rejects an over-length direct edit before any bridge call', async () => {
        await expect(
          sendDirectChatEdit('qortium', 'Qpeer', 'x'.repeat(3985), 'ref', ['SEND_DIRECT_CHAT_EDIT']),
        ).rejects.toThrow('Direct chat messages must be at most 3984 UTF-8 bytes.');
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('builds the exact Qortal direct edit/delete/reaction envelopes (version 2, bounded specialId)', async () => {
        qortalRequestMock
          .mockResolvedValueOnce({ signature: 'hub-direct-edit-sig', timestamp: 1700000000250 })
          .mockResolvedValueOnce({ signature: 'hub-direct-delete-sig', timestamp: 1700000000251 })
          .mockResolvedValueOnce({ signature: 'hub-direct-reaction-sig', timestamp: 1700000000252 });

        await sendDirectChatEdit('qortal', 'QortalPeer', 'fixed typo', 'ref', ['SEND_DIRECT_CHAT_EDIT']);
        let payload = JSON.parse(qortalRequestMock.mock.calls[0][0].message);

        expect(payload).toMatchObject({
          isEdited: true,
          message: '<p>fixed typo</p>',
          repliedTo: '',
          type: 'edit',
          version: 2,
        });
        expect(Object.keys(payload).sort()).toEqual(
          ['isEdited', 'message', 'repliedTo', 'specialId', 'type', 'version'].sort(),
        );

        await sendDirectChatDelete('qortal', 'QortalPeer', 'ref', ['SEND_DIRECT_CHAT_DELETE']);
        payload = JSON.parse(qortalRequestMock.mock.calls[1][0].message);

        expect(payload).toMatchObject({ isEdited: true, message: '<p></p>', repliedTo: '', type: 'edit', version: 2 });
        expect(Object.keys(payload).sort()).toEqual(
          ['isEdited', 'message', 'repliedTo', 'specialId', 'type', 'version'].sort(),
        );

        await sendDirectChatReaction('qortal', 'QortalPeer', 'ref', '🙏', true, ['SEND_DIRECT_CHAT_REACTION']);
        payload = JSON.parse(qortalRequestMock.mock.calls[2][0].message);

        expect(payload).toMatchObject({ content: '🙏', contentState: true, message: '', type: 'reaction', version: 2 });
        expect(Object.keys(payload).sort()).toEqual(
          ['content', 'contentState', 'message', 'specialId', 'type', 'version'].sort(),
        );
      });

      it('routes getDirectMessages and getPrivateDirectActiveChats through the Qortal bridge when network is qortal', async () => {
        qortalRequestMock
          .mockResolvedValueOnce([{ sender: 'Qb', signature: 'sig-b', timestamp: 20, txGroupId: 0 }])
          .mockResolvedValueOnce([{ address: 'QortalPeer', timestamp: 40 }]);

        await expect(
          getDirectMessages('QortalPeer', ['SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES'], {}, 'qortal'),
        ).resolves.toEqual([{ sender: 'Qb', signature: 'sig-b', timestamp: 20, txGroupId: 0 }]);
        expect(qortalRequestMock).toHaveBeenNthCalledWith(1, {
          action: 'SEARCH_PRIVATE_DIRECT_CHAT_MESSAGES',
          encoding: 'BASE64',
          limit: 100,
          otherAddress: 'QortalPeer',
          reverse: true,
        });

        await expect(getPrivateDirectActiveChats(['GET_PRIVATE_DIRECT_ACTIVE_CHATS'], 'qortal')).resolves.toEqual([
          { address: 'QortalPeer', timestamp: 40 },
        ]);
        expect(qortalRequestMock).toHaveBeenNthCalledWith(2, {
          action: 'GET_PRIVATE_DIRECT_ACTIVE_CHATS',
          encoding: 'BASE64',
          hasChatReference: false,
        });
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });
    });

    describe('membership/admin network routing', () => {
      it('routes joinGroup/leaveGroup/approveGroupJoinRequest through the Qortal bridge, sending timeToLive: 0 on approve', async () => {
        qortalRequestMock
          .mockResolvedValueOnce({
            accepted: true,
            action: 'JOIN_GROUP',
            changed: true,
            groupId: 12,
            groupName: 'Qortal group',
            membership: 'joined',
            network: 'qortal',
          })
          .mockResolvedValueOnce({
            accepted: true,
            action: 'LEAVE_GROUP',
            changed: true,
            groupId: 12,
            groupName: 'Qortal group',
            membership: 'left',
            network: 'qortal',
          })
          .mockResolvedValueOnce({
            accepted: true,
            action: 'APPROVE_GROUP_JOIN_REQUEST',
            changed: true,
            groupId: 12,
            groupName: 'Qortal group',
            memberAddress: 'QortalJoiner',
            network: 'qortal',
            wireAction: 'GROUP_INVITE',
          });

        await expect(joinGroup(12, 'qortal')).resolves.toMatchObject({ membership: 'joined' });
        expect(qortalRequestMock).toHaveBeenNthCalledWith(1, { action: 'JOIN_GROUP', groupId: 12 });

        await expect(leaveGroup(12, 'qortal')).resolves.toMatchObject({ membership: 'left' });
        expect(qortalRequestMock).toHaveBeenNthCalledWith(2, { action: 'LEAVE_GROUP', groupId: 12 });

        await expect(approveGroupJoinRequest(12, 'QortalJoiner', 'qortal')).resolves.toMatchObject({
          wireAction: 'GROUP_INVITE',
        });
        expect(qortalRequestMock).toHaveBeenNthCalledWith(3, {
          action: 'APPROVE_GROUP_JOIN_REQUEST',
          groupId: 12,
          joiner: 'QortalJoiner',
          timeToLive: 0,
        });
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('defaults joinGroup/leaveGroup/approveGroupJoinRequest to Qortium when no network is passed', async () => {
        qdnRequestMock.mockResolvedValueOnce({ accepted: true, action: 'JOIN_GROUP', groupId: 3 });

        await joinGroup(3);
        expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'JOIN_GROUP', groupId: 3 });
        expect(qortalRequestMock).not.toHaveBeenCalled();
      });

      // D6: the three join-request readers pick up the same optional trailing
      // `network` parameter as joinGroup/leaveGroup/approveGroupJoinRequest
      // above — default 'qortium' keeps every pre-D6 call site byte-identical.
      it('routes the three join-request readers through the Qortal bridge actions when advertised', async () => {
        qortalRequestMock
          .mockResolvedValueOnce([{ groupId: 12, joiner: 'QortalJoiner' }])
          .mockResolvedValueOnce([{ group: { groupId: 12, groupName: 'Qortal group' }, joinRequests: [] }])
          .mockResolvedValueOnce([{ groupId: 12, joiner: 'QortalJoiner' }]);

        await expect(
          getAccountGroupJoinRequests('QortalAddr', ['GET_ACCOUNT_GROUP_JOIN_REQUESTS'], 'qortal'),
        ).resolves.toEqual([{ groupId: 12, joiner: 'QortalJoiner' }]);
        expect(qortalRequestMock).toHaveBeenNthCalledWith(1, {
          action: 'GET_ACCOUNT_GROUP_JOIN_REQUESTS',
          address: 'QortalAddr',
        });

        await expect(
          getAdminGroupJoinRequests('QortalAdmin', ['GET_ADMIN_GROUP_JOIN_REQUESTS'], 'qortal'),
        ).resolves.toEqual([{ group: { groupId: 12, groupName: 'Qortal group' }, joinRequests: [] }]);
        expect(qortalRequestMock).toHaveBeenNthCalledWith(2, {
          action: 'GET_ADMIN_GROUP_JOIN_REQUESTS',
          address: 'QortalAdmin',
        });

        await expect(getGroupJoinRequests(12, ['GET_GROUP_JOIN_REQUESTS'], 'qortal')).resolves.toEqual([
          { groupId: 12, joiner: 'QortalJoiner' },
        ]);
        expect(qortalRequestMock).toHaveBeenNthCalledWith(3, {
          action: 'GET_GROUP_JOIN_REQUESTS',
          groupId: 12,
        });
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('falls back to FETCH_NODE_API against the Qortal node for join-request reads when the actions are not advertised', async () => {
        qortalRequestMock
          .mockResolvedValueOnce({
            data: [{ groupId: 12, joiner: 'QortalJoiner' }],
            ok: true,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce({
            data: [{ group: { groupId: 12, groupName: 'Qortal group' }, joinRequests: [] }],
            ok: true,
            status: 200,
            statusText: 'OK',
          })
          .mockResolvedValueOnce({
            data: [{ groupId: 12, joiner: 'QortalJoiner' }],
            ok: true,
            status: 200,
            statusText: 'OK',
          });

        await expect(getAccountGroupJoinRequests('QortalAddr', [], 'qortal')).resolves.toEqual([
          { groupId: 12, joiner: 'QortalJoiner' },
        ]);
        expect(qortalRequestMock).toHaveBeenNthCalledWith(1, {
          action: 'FETCH_NODE_API',
          maxBytes: 2097152,
          path: '/groups/joinrequests/address/QortalAddr',
        });

        await expect(getAdminGroupJoinRequests('QortalAdmin', [], 'qortal')).resolves.toEqual([
          { group: { groupId: 12, groupName: 'Qortal group' }, joinRequests: [] },
        ]);
        expect(qortalRequestMock).toHaveBeenNthCalledWith(2, {
          action: 'FETCH_NODE_API',
          maxBytes: 2097152,
          path: '/groups/joinrequests/admin/QortalAdmin',
        });

        await expect(getGroupJoinRequests(12, [], 'qortal')).resolves.toEqual([
          { groupId: 12, joiner: 'QortalJoiner' },
        ]);
        expect(qortalRequestMock).toHaveBeenNthCalledWith(3, {
          action: 'FETCH_NODE_API',
          maxBytes: 2097152,
          path: '/groups/joinrequests/12',
        });
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('defaults the three join-request readers to Qortium when no network is passed', async () => {
        qdnRequestMock.mockResolvedValueOnce([{ groupId: 3, joiner: 'Qjoiner' }]);

        await expect(getAccountGroupJoinRequests('Qabc', ['GET_ACCOUNT_GROUP_JOIN_REQUESTS'])).resolves.toEqual([
          { groupId: 3, joiner: 'Qjoiner' },
        ]);
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'GET_ACCOUNT_GROUP_JOIN_REQUESTS',
          address: 'Qabc',
        });
        expect(qortalRequestMock).not.toHaveBeenCalled();
      });
    });

    describe('private group chat (P3a)', () => {
      describe('reads', () => {
        it('returns [] for active chats when the action is not advertised, without calling either bridge', async () => {
          await expect(getPrivateGroupActiveChats('qortium', [])).resolves.toEqual([]);
          expect(qdnRequestMock).not.toHaveBeenCalled();
          expect(qortalRequestMock).not.toHaveBeenCalled();
        });

        it('builds the active-chats request and routes it per network', async () => {
          qdnRequestMock.mockResolvedValueOnce([
            { groupId: 8, status: 'MISSING_KEY' },
            { groupId: 9, status: 'NO_MESSAGES' },
          ]);

          await expect(
            getPrivateGroupActiveChats('qortium', ['GET_PRIVATE_GROUP_ACTIVE_CHATS']),
          ).resolves.toEqual([
            { groupId: 8, status: 'MISSING_KEY' },
            { groupId: 9, status: 'NO_MESSAGES' },
          ]);
          expect(qdnRequestMock).toHaveBeenCalledWith({
            action: 'GET_PRIVATE_GROUP_ACTIVE_CHATS',
            encoding: 'BASE64',
            limit: 100,
          });

          qortalRequestMock.mockResolvedValueOnce([{ groupId: 11, status: 'NO_MESSAGES' }]);
          await getPrivateGroupActiveChats('qortal', ['GET_PRIVATE_GROUP_ACTIVE_CHATS']);
          expect(qortalRequestMock).toHaveBeenCalledWith({
            action: 'GET_PRIVATE_GROUP_ACTIVE_CHATS',
            encoding: 'BASE64',
            limit: 100,
          });
        });

        it('throws a clear error for chat state when the action is not advertised', async () => {
          await expect(getPrivateGroupChatState('qortium', 8, [])).rejects.toThrow(
            'Private group chat state requires Qortium Home private group chat support.',
          );
          expect(qdnRequestMock).not.toHaveBeenCalled();
        });

        it('builds the chat-state request and routes it per network', async () => {
          qdnRequestMock.mockResolvedValueOnce({
            allPublicKeysKnown: true,
            available: true,
            epochId: 'epoch-a',
            groupId: 8,
            isOpen: false,
            maxMessagePlaintextBytes: 4096,
            memberCount: 2,
            memberPublicKeys: ['key-a', 'key-b'],
            qpgcVersion: 1,
          });

          await expect(getPrivateGroupChatState('qortium', 8, ['GET_PRIVATE_GROUP_CHAT_STATE'])).resolves.toMatchObject(
            { qpgcVersion: 1 },
          );
          expect(qdnRequestMock).toHaveBeenCalledWith({
            action: 'GET_PRIVATE_GROUP_CHAT_STATE',
            encoding: 'BASE64',
            groupId: 8,
          });

          qortalRequestMock.mockResolvedValueOnce({
            available: true,
            groupId: 11,
            groupName: 'Qortal closed',
            isMember: true,
            isOpen: false,
            memberCount: 3,
            publisherName: 'publisher',
            qortalPrivateGroupVersion: 1,
            recipientCount: 2,
            resourceSignature: 'res-sig',
            rotationRequired: false,
          });

          await expect(
            getPrivateGroupChatState('qortal', 11, ['GET_PRIVATE_GROUP_CHAT_STATE']),
          ).resolves.toMatchObject({ qortalPrivateGroupVersion: 1 });
          expect(qortalRequestMock).toHaveBeenCalledWith({
            action: 'GET_PRIVATE_GROUP_CHAT_STATE',
            encoding: 'BASE64',
            groupId: 11,
          });
        });

        it('discriminates the per-chain state union with the exported type guards', () => {
          const qpgc = {
            allPublicKeysKnown: true as const,
            available: true as const,
            epochId: 'epoch-a',
            groupId: 8,
            isOpen: false as const,
            maxMessagePlaintextBytes: 4096,
            memberCount: 2,
            memberPublicKeys: ['key-a'],
            qpgcVersion: 1 as const,
          };
          const qortal = {
            available: true,
            groupId: 11,
            groupName: 'Qortal closed',
            isMember: true,
            isOpen: false as const,
            memberCount: 3,
            publisherName: null,
            qortalPrivateGroupVersion: 1 as const,
            recipientCount: null,
            resourceSignature: null,
            rotationRequired: false,
          };

          expect(isQortiumPrivateGroupChatState(qpgc)).toBe(true);
          expect(isQortiumPrivateGroupChatState(qortal)).toBe(false);
          expect(isQortalPrivateGroupChatState(qortal)).toBe(true);
          expect(isQortalPrivateGroupChatState(qpgc)).toBe(false);
        });
      });

      describe('sends have no generic fallback (safety invariant)', () => {
        it('throws instead of falling back to SEND_CHAT_MESSAGE when the exact private action is unadvertised', async () => {
          await expect(sendPrivateGroupChatMessage('qortium', 8, 'hi')).rejects.toThrow(
            'Private group chat sends require Qortium Home private group chat support.',
          );
          await expect(sendPrivateGroupChatEdit('qortium', 8, 'hi', 'orig-sig', [])).rejects.toThrow(
            'Private group chat edits require Qortium Home private group chat support.',
          );
          await expect(sendPrivateGroupChatDelete('qortium', 8, 'orig-sig', [])).rejects.toThrow(
            'Private group chat deletes require Qortium Home private group chat support.',
          );
          await expect(
            sendPrivateGroupChatReaction('qortium', 8, 'orig-sig', '👍', true, []),
          ).rejects.toThrow('Private group chat reactions require Qortium Home private group chat support.');

          // No bridge call at all — not even the generic SEND_CHAT_MESSAGE a
          // closed group's plaintext must never reach.
          expect(qdnRequestMock).not.toHaveBeenCalled();
          expect(qortalRequestMock).not.toHaveBeenCalled();
        });
      });

      describe('sends', () => {
        it('sends a plain-text new message on both chains (no envelope, unlike edit/delete/reaction)', async () => {
          qdnRequestMock.mockResolvedValueOnce({ signature: 'msg-sig', timestamp: 1700000000300 });

          await expect(
            sendPrivateGroupChatMessage('qortium', 8, 'hello group', ['SEND_PRIVATE_GROUP_CHAT_MESSAGE']),
          ).resolves.toEqual({ signature: 'msg-sig', timestamp: 1700000000300 });
          expect(qdnRequestMock).toHaveBeenCalledWith({
            action: 'SEND_PRIVATE_GROUP_CHAT_MESSAGE',
            groupId: 8,
            message: 'hello group',
          });

          qortalRequestMock.mockResolvedValueOnce({ signature: 'qortal-msg-sig', timestamp: 1700000000301 });
          await sendPrivateGroupChatMessage('qortal', 11, 'hello qortal group', [
            'SEND_PRIVATE_GROUP_CHAT_MESSAGE',
          ]);
          expect(qortalRequestMock).toHaveBeenCalledWith({
            action: 'SEND_PRIVATE_GROUP_CHAT_MESSAGE',
            groupId: 11,
            message: 'hello qortal group',
          });
        });

        it('enforces the fixed 2225-byte Qortal cap, and the optional Qortium cap only when supplied', async () => {
          await expect(
            sendPrivateGroupChatMessage('qortal', 11, 'x'.repeat(2226), ['SEND_PRIVATE_GROUP_CHAT_MESSAGE']),
          ).rejects.toThrow('Private group messages must be at most 2225 UTF-8 bytes on Qortal.');
          expect(qortalRequestMock).not.toHaveBeenCalled();

          qortalRequestMock.mockResolvedValueOnce({ signature: 'boundary-sig', timestamp: 1700000000302 });
          await expect(
            sendPrivateGroupChatMessage('qortal', 11, 'x'.repeat(2225), ['SEND_PRIVATE_GROUP_CHAT_MESSAGE']),
          ).resolves.toMatchObject({ signature: 'boundary-sig' });

          // Qortium has no fixed cap: an oversized message is allowed when no
          // maxPlaintextBytes is supplied...
          qdnRequestMock.mockResolvedValueOnce({ signature: 'uncapped-sig', timestamp: 1700000000303 });
          await expect(
            sendPrivateGroupChatMessage('qortium', 8, 'x'.repeat(5000), ['SEND_PRIVATE_GROUP_CHAT_MESSAGE']),
          ).resolves.toMatchObject({ signature: 'uncapped-sig' });

          // ...but is rejected before any bridge call once the caller supplies
          // the cap read from GET_PRIVATE_GROUP_CHAT_STATE.
          await expect(
            sendPrivateGroupChatMessage('qortium', 8, 'x'.repeat(101), ['SEND_PRIVATE_GROUP_CHAT_MESSAGE'], 100),
          ).rejects.toThrow('Private group messages must be at most 100 UTF-8 bytes.');
        });

        it('builds a plain-text edit request on Qortium and the Hub v3 edit envelope on Qortal', async () => {
          qdnRequestMock.mockResolvedValueOnce({ signature: 'edit-sig', timestamp: 1700000000310 });

          await expect(
            sendPrivateGroupChatEdit('qortium', 8, 'fixed typo', 'orig-sig', ['SEND_PRIVATE_GROUP_CHAT_EDIT']),
          ).resolves.toEqual({ signature: 'edit-sig', timestamp: 1700000000310 });
          expect(qdnRequestMock).toHaveBeenCalledWith({
            action: 'SEND_PRIVATE_GROUP_CHAT_EDIT',
            chatReference: 'orig-sig',
            groupId: 8,
            message: 'fixed typo',
          });

          qortalRequestMock.mockResolvedValueOnce({ signature: 'hub-edit-sig', timestamp: 1700000000311 });
          await sendPrivateGroupChatEdit('qortal', 11, 'fixed typo', 'orig-sig', ['SEND_PRIVATE_GROUP_CHAT_EDIT']);

          const call = qortalRequestMock.mock.calls[0][0];

          expect(call.action).toBe('SEND_PRIVATE_GROUP_CHAT_EDIT');
          expect(call.groupId).toBe(11);
          expect(call.chatReference).toBe('orig-sig');

          const payload = JSON.parse(call.message);

          expect(payload).toMatchObject({
            images: [],
            isEdited: true,
            repliedTo: '',
            type: 'edit',
            version: 3,
          });
          expect(Object.keys(payload).sort()).toEqual(
            ['images', 'isEdited', 'messageText', 'repliedTo', 'specialId', 'type', 'version'].sort(),
          );
        });

        it('measures the Qortal edit cap on the built envelope, not the raw text', async () => {
          const text = 'x'.repeat(2225);

          await expect(
            sendPrivateGroupChatEdit('qortal', 11, text, 'orig-sig', ['SEND_PRIVATE_GROUP_CHAT_EDIT']),
          ).rejects.toThrow('Private group messages must be at most 2225 UTF-8 bytes on Qortal.');
          expect(qortalRequestMock).not.toHaveBeenCalled();

          // The identical raw text passes on Qortium, where the cap (when
          // supplied) applies to the raw text itself.
          qdnRequestMock.mockResolvedValueOnce({ signature: 'qortium-edit-boundary-sig', timestamp: 1700000000312 });
          await expect(
            sendPrivateGroupChatEdit('qortium', 8, text, 'orig-sig', ['SEND_PRIVATE_GROUP_CHAT_EDIT'], 2225),
          ).resolves.toMatchObject({ signature: 'qortium-edit-boundary-sig' });
        });

        it('builds the Qortium JSON delete envelope (optionally carrying repliedTo) and the canonical Hub v3 empty-edit envelope for Qortal', async () => {
          qdnRequestMock
            .mockResolvedValueOnce({ signature: 'delete-sig', timestamp: 1700000000320 })
            .mockResolvedValueOnce({ signature: 'delete-sig-2', timestamp: 1700000000321 });

          await sendPrivateGroupChatDelete('qortium', 8, 'orig-sig', ['SEND_PRIVATE_GROUP_CHAT_DELETE']);
          expect(qdnRequestMock).toHaveBeenNthCalledWith(1, {
            action: 'SEND_PRIVATE_GROUP_CHAT_DELETE',
            chatReference: 'orig-sig',
            groupId: 8,
            message: JSON.stringify({ message: '' }),
          });

          await sendPrivateGroupChatDelete(
            'qortium',
            8,
            'orig-sig',
            ['SEND_PRIVATE_GROUP_CHAT_DELETE'],
            'reply-target-sig',
          );
          expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
            action: 'SEND_PRIVATE_GROUP_CHAT_DELETE',
            chatReference: 'orig-sig',
            groupId: 8,
            message: JSON.stringify({ message: '', repliedTo: 'reply-target-sig' }),
          });

          qortalRequestMock.mockResolvedValueOnce({ signature: 'hub-delete-sig', timestamp: 1700000000322 });
          await sendPrivateGroupChatDelete('qortal', 11, 'orig-sig', ['SEND_PRIVATE_GROUP_CHAT_DELETE']);

          const call = qortalRequestMock.mock.calls[0][0];
          const payload = JSON.parse(call.message);

          expect(call.groupId).toBe(11);
          expect(payload).toMatchObject({
            images: [],
            isEdited: true,
            messageText: '<p></p>',
            repliedTo: '',
            type: 'edit',
            version: 3,
          });
          expect(Object.keys(payload).sort()).toEqual(
            ['images', 'isEdited', 'messageText', 'repliedTo', 'specialId', 'type', 'version'].sort(),
          );
        });

        it('builds the reaction envelope inside message on Qortium, and with a bounded specialId on Qortal', async () => {
          qdnRequestMock.mockResolvedValueOnce({ signature: 'reaction-sig', timestamp: 1700000000330 });

          await sendPrivateGroupChatReaction('qortium', 8, 'target-sig', '👍', true, [
            'SEND_PRIVATE_GROUP_CHAT_REACTION',
          ]);
          expect(qdnRequestMock).toHaveBeenCalledWith({
            action: 'SEND_PRIVATE_GROUP_CHAT_REACTION',
            chatReference: 'target-sig',
            groupId: 8,
            message: JSON.stringify({ message: '', type: 'reaction', content: '👍', contentState: true }),
          });

          qortalRequestMock.mockResolvedValueOnce({ signature: 'hub-reaction-sig', timestamp: 1700000000331 });
          await sendPrivateGroupChatReaction('qortal', 11, 'target-sig', '❤️', false, [
            'SEND_PRIVATE_GROUP_CHAT_REACTION',
          ]);

          const call = qortalRequestMock.mock.calls[0][0];
          const payload = JSON.parse(call.message);

          expect(call.groupId).toBe(11);
          expect(payload).toMatchObject({ content: '❤️', contentState: false, message: '', type: 'reaction' });
          expect(typeof payload.specialId).toBe('string');
          expect(payload.specialId.length).toBeGreaterThan(0);
        });

        it('rejects empty or over-length reaction content before any bridge call', async () => {
          await expect(
            sendPrivateGroupChatReaction('qortium', 8, 'target-sig', '', true, ['SEND_PRIVATE_GROUP_CHAT_REACTION']),
          ).rejects.toThrow('Reaction content must be a short emoji string.');
          expect(qdnRequestMock).not.toHaveBeenCalled();
        });
      });

      describe('key lifecycle', () => {
        it('routes REQUEST_PRIVATE_GROUP_CHAT_KEY to Qortal and normalizes the local-recovery result', async () => {
          qortalRequestMock.mockResolvedValueOnce({
            accepted: true,
            recovered: true,
            resourceSignature: 'res-sig',
          });

          await expect(
            requestPrivateGroupChatKey({ groupId: 11 }, ['REQUEST_PRIVATE_GROUP_CHAT_KEY'], 'qortal'),
          ).resolves.toMatchObject({
            accepted: true,
            kind: 'recovery',
            recovered: true,
            resourceSignature: 'res-sig',
          });
          expect(qortalRequestMock).toHaveBeenCalledWith({
            action: 'REQUEST_PRIVATE_GROUP_CHAT_KEY',
            groupId: 11,
          });
          expect(qdnRequestMock).not.toHaveBeenCalled();
        });

        it('normalizes the QPGC broadcast result as kind: broadcast', async () => {
          qdnRequestMock.mockResolvedValueOnce({ signature: 'key-req-sig', timestamp: 1700000000400 });

          await expect(
            requestPrivateGroupChatKey({ groupId: 8 }, ['REQUEST_PRIVATE_GROUP_CHAT_KEY']),
          ).resolves.toMatchObject({ kind: 'broadcast', signature: 'key-req-sig', timestamp: 1700000000400 });
        });

        it('normalizes every documented RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS result shape', async () => {
          // QPGC: no matching requests.
          qdnRequestMock.mockResolvedValueOnce({ accepted: true, relayed: 0 });
          await expect(resolvePrivateGroupChatKeyRequests(8, ['RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS'])).resolves.toMatchObject(
            { kind: 'relay', relayed: 0, signatures: [] },
          );

          // QPGC: exactly one relayed envelope (bare {signature, timestamp}).
          qdnRequestMock.mockResolvedValueOnce({ signature: 'relay-sig', timestamp: 1700000000410 });
          await expect(resolvePrivateGroupChatKeyRequests(8, ['RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS'])).resolves.toMatchObject(
            { kind: 'relay', signatures: ['relay-sig'] },
          );

          // QPGC: multiple relayed envelopes.
          qdnRequestMock.mockResolvedValueOnce({
            accepted: true,
            relayed: 2,
            results: [
              { signature: 'relay-sig-1', timestamp: 1700000000411 },
              { signature: 'relay-sig-2', timestamp: 1700000000412 },
            ],
          });
          await expect(resolvePrivateGroupChatKeyRequests(8, ['RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS'])).resolves.toMatchObject(
            { kind: 'relay', relayed: 2, signatures: ['relay-sig-1', 'relay-sig-2'] },
          );

          // Qortal: administrator publication.
          qortalRequestMock.mockResolvedValueOnce({
            accepted: true,
            signature: 'publish-sig',
            timestamp: 1700000000413,
          });
          await expect(
            resolvePrivateGroupChatKeyRequests(11, ['RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS'], 20, 'qortal'),
          ).resolves.toMatchObject({ kind: 'publication', signatures: ['publish-sig'] });
          expect(qortalRequestMock).toHaveBeenCalledWith({
            action: 'RESOLVE_PRIVATE_GROUP_CHAT_KEY_REQUESTS',
            groupId: 11,
            limit: 20,
          });
        });

        it('routes ROTATE_PRIVATE_GROUP_CHAT_KEY per network and normalizes the same result family as resolve', async () => {
          qdnRequestMock.mockResolvedValueOnce({
            accepted: true,
            relayed: 1,
            results: [{ signature: 'rotate-relay-sig', timestamp: 1700000000420 }],
          });

          await expect(
            rotatePrivateGroupChatKey('qortium', 8, ['ROTATE_PRIVATE_GROUP_CHAT_KEY']),
          ).resolves.toMatchObject({ kind: 'relay', signatures: ['rotate-relay-sig'] });
          expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'ROTATE_PRIVATE_GROUP_CHAT_KEY', groupId: 8 });

          qortalRequestMock.mockResolvedValueOnce({
            accepted: true,
            signature: 'rotate-publish-sig',
            timestamp: 1700000000421,
          });
          await expect(
            rotatePrivateGroupChatKey('qortal', 11, ['ROTATE_PRIVATE_GROUP_CHAT_KEY']),
          ).resolves.toMatchObject({ kind: 'publication', signatures: ['rotate-publish-sig'] });
          expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'ROTATE_PRIVATE_GROUP_CHAT_KEY', groupId: 11 });
        });

        it('throws a clear error when key-lifecycle actions are unadvertised, on either chain', async () => {
          await expect(rotatePrivateGroupChatKey('qortium', 8, [])).rejects.toThrow(
            'Private group chat key rotation requires Qortium Home key recovery support.',
          );
          expect(qdnRequestMock).not.toHaveBeenCalled();
        });
      });

      describe('getMissingPrivateGroupKeyRequests tolerates Qortal rows', () => {
        it('dedupes Qortal MISSING_KEY rows (no epochId/keyId) to one bare {groupId} request per group', () => {
          expect(
            getMissingPrivateGroupKeyRequests(
              [
                { sender: 'Qa', status: 'MISSING_KEY', timestamp: 10, txGroupId: 11 },
                { sender: 'Qb', status: 'MISSING_KEY', timestamp: 20, txGroupId: 11 },
                { sender: 'Qc', status: 'DECRYPTED', timestamp: 30, txGroupId: 11 },
              ],
              11,
            ),
          ).toEqual([{ groupId: 11 }]);
        });

        it('keeps Qortium epochId/keyId-bearing MISSING_KEY rows distinct from bare Qortal rows in the same group', () => {
          expect(
            getMissingPrivateGroupKeyRequests([
              { epochId: 'epoch-a', keyId: 'key-a', sender: 'Qa', status: 'MISSING_KEY', timestamp: 10, txGroupId: 8 },
              { sender: 'Qb', status: 'MISSING_KEY', timestamp: 20, txGroupId: 8 },
            ]),
          ).toEqual([
            { epochId: 'epoch-a', groupId: 8, keyId: 'key-a' },
            { groupId: 8 },
          ]);
        });
      });
    });

    describe('pending transaction journal', () => {
      it('returns the empty default shape when GET_PENDING_TRANSACTIONS is not advertised', async () => {
        await expect(getPendingBridgeTransactions('qortium', [])).resolves.toEqual({
          entries: [],
          network: 'qortium',
          version: 1,
        });
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('reads the pending journal through the advertised bridge action', async () => {
        const result = {
          entries: [
            {
              action: 'JOIN_GROUP',
              createdAt: 1,
              network: 'qortium',
              signature: 'sig-a',
              target: { groupId: 9, kind: 'group' as const },
              timestamp: 2,
            },
          ],
          network: 'qortium' as const,
          version: 1 as const,
        };

        qdnRequestMock.mockResolvedValueOnce(result);

        await expect(getPendingBridgeTransactions('qortium', ['GET_PENDING_TRANSACTIONS'])).resolves.toEqual(result);
        expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'GET_PENDING_TRANSACTIONS' });
      });

      it('forgets a pending transaction through the advertised bridge action, and throws a clear error otherwise', async () => {
        await expect(forgetPendingBridgeTransaction('qortium', 'sig-a', [])).rejects.toThrow(
          'Pending transaction journal support requires a newer Qortium Home bridge.',
        );
        expect(qdnRequestMock).not.toHaveBeenCalled();

        qdnRequestMock.mockResolvedValueOnce({ forgotten: true, network: 'qortium', signature: 'sig-a' });
        await expect(
          forgetPendingBridgeTransaction('qortium', 'sig-a', ['FORGET_PENDING_TRANSACTION']),
        ).resolves.toEqual({ forgotten: true, network: 'qortium', signature: 'sig-a' });
        expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'FORGET_PENDING_TRANSACTION', signature: 'sig-a' });
      });
    });
  });

  describe('P4a: publish/attachment/viewer coreApi layer', () => {
    const validDescriptor: PrivateAttachmentDescriptor = {
      ciphertext: {
        algorithm: 'SHA-256',
        hash: 'a'.repeat(64),
        size: 1024,
        transactionSignature: 'tx-sig-1',
      },
      codec: 'qenc-v2-direct',
      conversation: { kind: 'direct', otherAddress: 'QpeerAddress' },
      encrypted: true,
      network: 'qortium',
      resource: { identifier: 'ident-1', name: 'publisher', service: 'IMAGE' },
      version: 1,
    };

    describe('selectQdnPublishSource', () => {
      it('throws a clear error when SELECT_QDN_PUBLISH_SOURCE is not advertised', async () => {
        await expect(selectQdnPublishSource('qortium', [])).rejects.toThrow(
          'Selecting a file to publish requires a newer Qortium Home bridge.',
        );
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('returns the typed selection and dispatches on the requested network', async () => {
        qortalRequestMock.mockResolvedValueOnce({
          canceled: false,
          fileName: 'photo.png',
          kind: 'file',
          mimeType: null,
          size: 512,
          sourceToken: 'token-123',
        });

        await expect(selectQdnPublishSource('qortal', ['SELECT_QDN_PUBLISH_SOURCE'])).resolves.toEqual({
          canceled: false,
          fileName: 'photo.png',
          kind: 'file',
          mimeType: null,
          size: 512,
          sourceToken: 'token-123',
        });
        expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'SELECT_QDN_PUBLISH_SOURCE' });
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('returns the cancellation shape unchanged', async () => {
        qdnRequestMock.mockResolvedValueOnce({ canceled: true });

        await expect(selectQdnPublishSource('qortium', ['SELECT_QDN_PUBLISH_SOURCE'])).resolves.toEqual({
          canceled: true,
        });
      });

      it('throws when a non-canceled response is missing required fields', async () => {
        qdnRequestMock.mockResolvedValueOnce({ canceled: false, fileName: '', size: 1, sourceToken: '' });

        await expect(selectQdnPublishSource('qortium', ['SELECT_QDN_PUBLISH_SOURCE'])).rejects.toThrow(
          'Publish source selection is missing required fields.',
        );
      });
    });

    describe('publishQdnAttachment (deprecated shim)', () => {
      it('always throws, explaining the token flow, and never calls the bridge', async () => {
        await expect(
          publishQdnAttachment({
            dataBase64: 'ZGF0YQ==',
            filename: 'a.png',
            identifier: 'ident',
            name: 'publisher',
            service: 'IMAGE',
          }),
        ).rejects.toThrow('Select a file with selectQdnPublishSource, then publish its sourceToken');
        expect(qdnRequestMock).not.toHaveBeenCalled();
        expect(qortalRequestMock).not.toHaveBeenCalled();
      });
    });

    describe('publishQdnResource', () => {
      it('throws a clear error when PUBLISH_QDN_RESOURCE is not advertised', async () => {
        await expect(
          publishQdnResource('qortium', { name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' }, []),
        ).rejects.toThrow('Publishing a QDN resource requires a newer Qortium Home bridge.');
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('rejects a missing/empty sourceToken with the exact Home validation message, before any bridge call', async () => {
        await expect(
          publishQdnResource(
            'qortium',
            { name: 'publisher', service: 'IMAGE', sourceToken: '' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('A valid Home-issued publish source token is required.');
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('sends the exact request shape, never a fee field, and returns the typed accepted result', async () => {
        const accepted = {
          accepted: true,
          immutable: { algorithm: 'SHA-256', contentHash: 'c'.repeat(64), transactionSignature: 'tx-sig' },
          network: 'qortium',
          resource: { identifier: 'ident-1', name: 'publisher', service: 'IMAGE' },
          source: { fileName: 'a.png', size: 100 },
          transactionSignature: 'tx-sig',
        };

        qdnRequestMock.mockResolvedValueOnce(accepted);

        await expect(
          publishQdnResource(
            'qortium',
            { identifier: 'ident-1', name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).resolves.toEqual(accepted);
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'PUBLISH_QDN_RESOURCE',
          identifier: 'ident-1',
          name: 'publisher',
          service: 'IMAGE',
          sourceToken: 'token-1',
        });

        const sentRequest = qdnRequestMock.mock.calls[0][0];
        expect(sentRequest.fee).toBeUndefined();
      });

      it('passes through title/description/category/tags on Qortium', async () => {
        qdnRequestMock.mockResolvedValueOnce({
          accepted: true,
          immutable: { algorithm: 'SHA-256', contentHash: 'd'.repeat(64), transactionSignature: 'tx-sig-2' },
          network: 'qortium',
          resource: { identifier: null, name: 'publisher', service: 'IMAGE' },
          source: { fileName: 'a.png', size: 100 },
          transactionSignature: 'tx-sig-2',
        });

        await publishQdnResource(
          'qortium',
          {
            category: 'general',
            description: 'a photo',
            name: 'publisher',
            service: 'IMAGE',
            sourceToken: 'token-1',
            tags: ['a', 'b'],
            title: 'My photo',
          },
          ['PUBLISH_QDN_RESOURCE'],
        );
        // Not asserting the network here; the point of this test is metadata
        // pass-through. Dispatch-routing is asserted by the qortal-metadata
        // rejection test below, which proves qortal never even reaches
        // bridgeRequest with metadata present.
        expect(qdnRequestMock).toHaveBeenCalledWith(
          expect.objectContaining({
            category: 'general',
            description: 'a photo',
            tags: ['a', 'b'],
            title: 'My photo',
          }),
        );
      });

      it('rejects nonempty title/description/category/tags on Qortal before any bridge call', async () => {
        await expect(
          publishQdnResource(
            'qortal',
            { name: 'publisher', service: 'IMAGE', sourceToken: 'token-1', title: 'x' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('Qortal does not accept a title, description, category, or tags on a published resource.');

        await expect(
          publishQdnResource(
            'qortal',
            { description: 'x', name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('Qortal does not accept a title, description, category, or tags on a published resource.');

        await expect(
          publishQdnResource(
            'qortal',
            { category: 'x', name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('Qortal does not accept a title, description, category, or tags on a published resource.');

        await expect(
          publishQdnResource(
            'qortal',
            { name: 'publisher', service: 'IMAGE', sourceToken: 'token-1', tags: ['x'] },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('Qortal does not accept a title, description, category, or tags on a published resource.');

        expect(qortalRequestMock).not.toHaveBeenCalled();
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('publishes cleanly on Qortal without metadata', async () => {
        qortalRequestMock.mockResolvedValueOnce({
          accepted: true,
          immutable: { algorithm: 'SHA-256', contentHash: 'e'.repeat(64), transactionSignature: 'tx-sig-3' },
          network: 'qortal',
          resource: { identifier: null, name: 'publisher', service: 'IMAGE' },
          source: { fileName: 'a.png', size: 100 },
          transactionSignature: 'tx-sig-3',
        });

        await publishQdnResource(
          'qortal',
          { name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' },
          ['PUBLISH_QDN_RESOURCE'],
        );
        expect(qortalRequestMock).toHaveBeenCalledWith({
          action: 'PUBLISH_QDN_RESOURCE',
          name: 'publisher',
          service: 'IMAGE',
          sourceToken: 'token-1',
        });
      });

      it('enforces the 40-byte Qortium / 400-byte Qortal name limits, and the 64-byte identifier limit, client-side', async () => {
        const qortiumName = 'x'.repeat(41);
        await expect(
          publishQdnResource(
            'qortium',
            { name: qortiumName, service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('Resource name must be at most 40 UTF-8 bytes.');

        const qortiumNameOk = 'x'.repeat(40);
        qdnRequestMock.mockResolvedValueOnce({
          accepted: true,
          immutable: { algorithm: 'SHA-256', contentHash: 'f'.repeat(64), transactionSignature: 'tx-ok' },
          network: 'qortium',
          resource: { identifier: null, name: qortiumNameOk, service: 'IMAGE' },
          source: { fileName: 'a.png', size: 1 },
          transactionSignature: 'tx-ok',
        });
        await expect(
          publishQdnResource(
            'qortium',
            { name: qortiumNameOk, service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).resolves.toMatchObject({ accepted: true });

        const qortalName = 'x'.repeat(401);
        await expect(
          publishQdnResource(
            'qortal',
            { name: qortalName, service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('Resource name must be at most 400 UTF-8 bytes.');

        const identifierOverLimit = 'x'.repeat(65);
        await expect(
          publishQdnResource(
            'qortium',
            { identifier: identifierOverLimit, name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('Resource identifier must be at most 64 UTF-8 bytes.');
      });

      it('rejects a "." or ".." resource name/identifier', async () => {
        await expect(
          publishQdnResource('qortium', { name: '.', service: 'IMAGE', sourceToken: 'token-1' }, [
            'PUBLISH_QDN_RESOURCE',
          ]),
        ).rejects.toThrow('Resource name cannot be "." or "..".');

        await expect(
          publishQdnResource(
            'qortium',
            { identifier: '..', name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('Resource identifier cannot be "." or "..".');
      });

      it('passes through the BROADCAST_UNKNOWN outcome as a typed variant instead of throwing', async () => {
        const unknownOutcome = {
          accepted: false,
          contentHash: 'a'.repeat(64),
          error: 'timed out waiting for broadcast confirmation',
          errorType: 'BROADCAST_UNKNOWN',
          outcome: 'unknown',
          retryable: false,
          timestamp: 1700000000000,
          transactionSignature: 'tx-sig-unknown',
        };

        qdnRequestMock.mockResolvedValueOnce(unknownOutcome);

        await expect(
          publishQdnResource(
            'qortium',
            { name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).resolves.toEqual(unknownOutcome);
      });

      it('throws when the bridge returns an unrecognized shape', async () => {
        qdnRequestMock.mockResolvedValueOnce({ somethingElse: true });

        await expect(
          publishQdnResource(
            'qortium',
            { name: 'publisher', service: 'IMAGE', sourceToken: 'token-1' },
            ['PUBLISH_QDN_RESOURCE'],
          ),
        ).rejects.toThrow('QDN resource publish returned an unrecognized result.');
      });
    });

    describe('publishChatAttachment', () => {
      it('throws a clear error when PUBLISH_CHAT_ATTACHMENT is not advertised', async () => {
        await expect(
          publishChatAttachment('qortium', 'token-1', { kind: 'direct', otherAddress: 'Qpeer' }, []),
        ).rejects.toThrow('Private chat attachments require a newer Qortium Home bridge.');
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('rejects a missing sourceToken before any bridge call', async () => {
        await expect(
          publishChatAttachment('qortium', '', { kind: 'direct', otherAddress: 'Qpeer' }, [
            'PUBLISH_CHAT_ATTACHMENT',
          ]),
        ).rejects.toThrow('A valid Home-issued publish source token is required.');
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('rejects a direct selector missing otherAddress, and a group selector with an out-of-range groupId', async () => {
        await expect(
          publishChatAttachment('qortium', 'token-1', { kind: 'direct', otherAddress: '' }, [
            'PUBLISH_CHAT_ATTACHMENT',
          ]),
        ).rejects.toThrow('A direct attachment requires the recipient address.');

        await expect(
          publishChatAttachment('qortium', 'token-1', { groupId: 0, kind: 'group' }, ['PUBLISH_CHAT_ATTACHMENT']),
        ).rejects.toThrow('A group attachment requires a valid group id.');

        await expect(
          publishChatAttachment('qortium', 'token-1', { groupId: 2147483648, kind: 'group' }, [
            'PUBLISH_CHAT_ATTACHMENT',
          ]),
        ).rejects.toThrow('A group attachment requires a valid group id.');

        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('sends the exact request shape for a direct conversation and returns the typed accepted result', async () => {
        const accepted = { accepted: true, descriptor: validDescriptor, transactionSignature: 'tx-sig' };
        qdnRequestMock.mockResolvedValueOnce(accepted);

        await expect(
          publishChatAttachment('qortium', 'token-1', { kind: 'direct', otherAddress: 'Qpeer' }, [
            'PUBLISH_CHAT_ATTACHMENT',
          ]),
        ).resolves.toEqual(accepted);
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'PUBLISH_CHAT_ATTACHMENT',
          conversation: { kind: 'direct', otherAddress: 'Qpeer' },
          sourceToken: 'token-1',
        });
      });

      it('sends the exact request shape for a group conversation on qortal', async () => {
        const accepted = {
          accepted: true,
          descriptor: { ...validDescriptor, codec: 'qortal-qatt-group-v1' as const, network: 'qortal' as const },
          transactionSignature: 'tx-sig-2',
        };
        qortalRequestMock.mockResolvedValueOnce(accepted);

        await expect(
          publishChatAttachment('qortal', 'token-2', { groupId: 42, kind: 'group' }, [
            'PUBLISH_CHAT_ATTACHMENT',
          ]),
        ).resolves.toEqual(accepted);
        expect(qortalRequestMock).toHaveBeenCalledWith({
          action: 'PUBLISH_CHAT_ATTACHMENT',
          conversation: { groupId: 42, kind: 'group' },
          sourceToken: 'token-2',
        });
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('passes through the BROADCAST_UNKNOWN outcome carrying the descriptor, instead of throwing', async () => {
        const unknownOutcome = {
          accepted: false,
          descriptor: validDescriptor,
          error: 'timed out waiting for broadcast confirmation',
          errorType: 'BROADCAST_UNKNOWN',
          outcome: 'unknown',
          retryable: false,
          timestamp: 1700000000000,
          transactionSignature: 'tx-sig-unknown',
        };
        qdnRequestMock.mockResolvedValueOnce(unknownOutcome);

        await expect(
          publishChatAttachment('qortium', 'token-1', { kind: 'direct', otherAddress: 'Qpeer' }, [
            'PUBLISH_CHAT_ATTACHMENT',
          ]),
        ).resolves.toEqual(unknownOutcome);
      });

      it('throws when the bridge returns an unrecognized shape', async () => {
        qdnRequestMock.mockResolvedValueOnce({ somethingElse: true });

        await expect(
          publishChatAttachment('qortium', 'token-1', { kind: 'direct', otherAddress: 'Qpeer' }, [
            'PUBLISH_CHAT_ATTACHMENT',
          ]),
        ).rejects.toThrow('Chat attachment publish returned an unrecognized result.');
      });
    });

    describe('isPrivateAttachmentDescriptor', () => {
      it('accepts a fully valid descriptor', () => {
        expect(isPrivateAttachmentDescriptor(validDescriptor)).toBe(true);
      });

      it('tolerates extra unknown fields at every level without failing', () => {
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            conversation: { ...validDescriptor.conversation, extra: 'x' },
            extraTopLevel: 'x',
            resource: { ...validDescriptor.resource, extraResource: 'x' },
          }),
        ).toBe(true);
      });

      it('never throws and rejects non-object/null/undefined input', () => {
        expect(isPrivateAttachmentDescriptor(null)).toBe(false);
        expect(isPrivateAttachmentDescriptor(undefined)).toBe(false);
        expect(isPrivateAttachmentDescriptor('not an object')).toBe(false);
        expect(isPrivateAttachmentDescriptor(42)).toBe(false);
        expect(isPrivateAttachmentDescriptor([])).toBe(false);
      });

      it('rejects an unrecognized codec', () => {
        expect(isPrivateAttachmentDescriptor({ ...validDescriptor, codec: 'not-a-real-codec' })).toBe(false);
      });

      it('rejects an unrecognized resource service', () => {
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            resource: { ...validDescriptor.resource, service: 'ATTACHMENT' },
          }),
        ).toBe(false);
      });

      it('rejects a malformed hash (wrong length, uppercase, non-hex)', () => {
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            ciphertext: { ...validDescriptor.ciphertext, hash: 'a'.repeat(63) },
          }),
        ).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            ciphertext: { ...validDescriptor.ciphertext, hash: 'A'.repeat(64) },
          }),
        ).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            ciphertext: { ...validDescriptor.ciphertext, hash: 'g'.repeat(64) },
          }),
        ).toBe(false);
      });

      it('rejects oversize ciphertext (over 1 MiB) and zero/negative size', () => {
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            ciphertext: { ...validDescriptor.ciphertext, size: 1024 * 1024 + 1 },
          }),
        ).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            ciphertext: { ...validDescriptor.ciphertext, size: 0 },
          }),
        ).toBe(false);
      });

      it('rejects a missing/invalid conversation selector', () => {
        expect(isPrivateAttachmentDescriptor({ ...validDescriptor, conversation: undefined })).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({ ...validDescriptor, conversation: { kind: 'direct', otherAddress: '' } }),
        ).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({ ...validDescriptor, conversation: { kind: 'group', groupId: 0 } }),
        ).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({ ...validDescriptor, conversation: { kind: 'carrier-pigeon' } }),
        ).toBe(false);
      });

      it('rejects an unrecognized network, wrong version, or encrypted !== true', () => {
        expect(isPrivateAttachmentDescriptor({ ...validDescriptor, network: 'bitcoin' })).toBe(false);
        expect(isPrivateAttachmentDescriptor({ ...validDescriptor, version: 2 })).toBe(false);
        expect(isPrivateAttachmentDescriptor({ ...validDescriptor, encrypted: false })).toBe(false);
      });

      it('rejects a missing resource name/identifier or a wrong ciphertext algorithm/signature', () => {
        expect(
          isPrivateAttachmentDescriptor({ ...validDescriptor, resource: { ...validDescriptor.resource, name: '' } }),
        ).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            resource: { ...validDescriptor.resource, identifier: '' },
          }),
        ).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            ciphertext: { ...validDescriptor.ciphertext, algorithm: 'MD5' },
          }),
        ).toBe(false);
        expect(
          isPrivateAttachmentDescriptor({
            ...validDescriptor,
            ciphertext: { ...validDescriptor.ciphertext, transactionSignature: '' },
          }),
        ).toBe(false);
      });
    });

    describe('access trio (getChatAttachmentStreamUrl / openChatAttachmentViewer / saveChatAttachment)', () => {
      it('gates each action on its own advertisement', async () => {
        await expect(getChatAttachmentStreamUrl('qortium', validDescriptor, [])).rejects.toThrow(
          'Streaming a chat attachment requires a newer Qortium Home bridge.',
        );
        await expect(openChatAttachmentViewer('qortium', validDescriptor, [])).rejects.toThrow(
          'Opening the chat attachment viewer requires a newer Qortium Home bridge.',
        );
        await expect(saveChatAttachment('qortium', validDescriptor, [])).rejects.toThrow(
          'Saving a chat attachment requires a newer Qortium Home bridge.',
        );
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('sends { action, descriptor } for each action, dispatched on the requested network', async () => {
        qdnRequestMock.mockResolvedValueOnce('qortium-home-resource://stream/abc-123');
        await expect(
          getChatAttachmentStreamUrl('qortium', validDescriptor, ['GET_CHAT_ATTACHMENT_STREAM_URL']),
        ).resolves.toBe('qortium-home-resource://stream/abc-123');
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'GET_CHAT_ATTACHMENT_STREAM_URL',
          descriptor: validDescriptor,
        });

        qortalRequestMock.mockResolvedValueOnce(true);
        await expect(
          openChatAttachmentViewer('qortal', validDescriptor, ['OPEN_CHAT_ATTACHMENT_VIEWER']),
        ).resolves.toBe(true);
        expect(qortalRequestMock).toHaveBeenCalledWith({
          action: 'OPEN_CHAT_ATTACHMENT_VIEWER',
          descriptor: validDescriptor,
        });

        qdnRequestMock.mockResolvedValueOnce({ canceled: false });
        await expect(
          saveChatAttachment('qortium', validDescriptor, ['SAVE_CHAT_ATTACHMENT']),
        ).resolves.toEqual({ canceled: false });
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'SAVE_CHAT_ATTACHMENT',
          descriptor: validDescriptor,
        });

        qdnRequestMock.mockResolvedValueOnce({ canceled: true });
        await expect(
          saveChatAttachment('qortium', validDescriptor, ['SAVE_CHAT_ATTACHMENT']),
        ).resolves.toEqual({ canceled: true });
      });
    });

    describe('public quartet (openQdnResourceViewer / getQdnResourceStreamUrl / saveQdnResource / getQdnResourceUrl)', () => {
      const coordinate = { identifier: 'ident-1', name: 'publisher', service: 'IMAGE' };

      it('gates each action on its own advertisement', async () => {
        await expect(openQdnResourceViewer('qortium', coordinate, [])).rejects.toThrow(
          'Opening the QDN resource viewer requires a newer Qortium Home bridge.',
        );
        await expect(getQdnResourceStreamUrl('qortium', coordinate, [])).rejects.toThrow(
          'Streaming a QDN resource requires a newer Qortium Home bridge.',
        );
        await expect(saveQdnResource('qortium', coordinate, [])).rejects.toThrow(
          'Saving a QDN resource requires a newer Qortium Home bridge.',
        );
        await expect(getQdnResourceUrl('qortium', coordinate, [])).rejects.toThrow(
          'Resolving a QDN resource URL requires a newer Qortium Home bridge.',
        );
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('sends only the populated coordinate fields alongside the action, network-routed', async () => {
        qortalRequestMock.mockResolvedValueOnce(true);
        await openQdnResourceViewer('qortal', { name: 'publisher', service: 'IMAGE' }, [
          'OPEN_QDN_RESOURCE_VIEWER',
        ]);
        expect(qortalRequestMock).toHaveBeenCalledWith({
          action: 'OPEN_QDN_RESOURCE_VIEWER',
          name: 'publisher',
          service: 'IMAGE',
        });

        qdnRequestMock.mockResolvedValueOnce('qortium-home-resource://stream/def-456');
        await getQdnResourceStreamUrl('qortium', coordinate, ['GET_QDN_RESOURCE_STREAM_URL']);
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'GET_QDN_RESOURCE_STREAM_URL',
          identifier: 'ident-1',
          name: 'publisher',
          service: 'IMAGE',
        });

        qdnRequestMock.mockResolvedValueOnce({ canceled: false });
        await expect(saveQdnResource('qortium', coordinate, ['SAVE_QDN_RESOURCE'])).resolves.toEqual({
          canceled: false,
        });
        expect(qdnRequestMock).toHaveBeenCalledWith({
          action: 'SAVE_QDN_RESOURCE',
          identifier: 'ident-1',
          name: 'publisher',
          service: 'IMAGE',
        });

        qdnRequestMock.mockResolvedValueOnce('http://127.0.0.1:24891/arbitrary/IMAGE/publisher/ident-1');
        await expect(getQdnResourceUrl('qortium', coordinate, ['GET_QDN_RESOURCE_URL'])).resolves.toBe(
          'http://127.0.0.1:24891/arbitrary/IMAGE/publisher/ident-1',
        );
      });

      it('rejects an unsupported stream service (APP/WEBSITE/GAME), naming navigation as the alternative', async () => {
        await expect(
          getQdnResourceStreamUrl('qortium', { name: 'publisher', service: 'APP' }, [
            'GET_QDN_RESOURCE_STREAM_URL',
          ]),
        ).rejects.toThrow('APP resources cannot be streamed inline; open them with a navigation action instead');
        await expect(
          getQdnResourceStreamUrl('qortium', { name: 'publisher', service: 'WEBSITE' }, [
            'GET_QDN_RESOURCE_STREAM_URL',
          ]),
        ).rejects.toThrow('WEBSITE resources cannot be streamed inline');
        await expect(
          getQdnResourceStreamUrl('qortium', { name: 'publisher', service: 'GAME' }, [
            'GET_QDN_RESOURCE_STREAM_URL',
          ]),
        ).rejects.toThrow('GAME resources cannot be streamed inline');
        expect(qdnRequestMock).not.toHaveBeenCalled();
      });

      it('allows every documented streaming service through the allowlist', async () => {
        const streamable = [
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
        ];

        for (const service of streamable) {
          qdnRequestMock.mockResolvedValueOnce('qortium-home-resource://stream/x');
          await expect(
            getQdnResourceStreamUrl('qortium', { name: 'publisher', service }, ['GET_QDN_RESOURCE_STREAM_URL']),
          ).resolves.toBe('qortium-home-resource://stream/x');
        }
      });
    });

    describe('isPublishSourceTokenError', () => {
      it('matches all three documented source-token validation messages', () => {
        expect(isPublishSourceTokenError(new Error('A valid Home-issued publish source token is required.'))).toBe(
          true,
        );
        expect(
          isPublishSourceTokenError(new Error('Selected publish source expired. Select the file again.')),
        ).toBe(true);
        expect(
          isPublishSourceTokenError(
            new Error('Selected publish source is not available to this app, account, network, or route.'),
          ),
        ).toBe(true);
      });

      it('does not match an unrelated error, and never throws on a non-Error value', () => {
        expect(isPublishSourceTokenError(new Error('Something unrelated failed.'))).toBe(false);
        expect(isPublishSourceTokenError('A valid Home-issued publish source token is required.')).toBe(true);
        expect(isPublishSourceTokenError(null)).toBe(false);
        expect(isPublishSourceTokenError(undefined)).toBe(false);
        expect(isPublishSourceTokenError({ message: 'A valid Home-issued publish source token is required.' })).toBe(
          false,
        );
      });

      it('matches the exact message publishQdnResource/publishChatAttachment throw client-side for an empty token', async () => {
        try {
          await publishQdnResource('qortium', { name: 'publisher', service: 'IMAGE', sourceToken: '' }, [
            'PUBLISH_QDN_RESOURCE',
          ]);
          throw new Error('expected publishQdnResource to throw');
        } catch (error) {
          expect(isPublishSourceTokenError(error)).toBe(true);
        }
      });
    });
  });
});
