import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getQortalBridgeState,
  hasLegacyQortalBridgeCandidate,
  hasQortalChatBridgeActions,
  hasQortalHomeBridge,
  isQortalChatBridgeAvailable,
  LOCAL_READ_ACTIONS,
  qortalRequest,
} from './qortalRequest';

describe('qortalRequest bridge adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects the injected Qortal bridge separately from window.qdnRequest', async () => {
    const qortalRequestMock = vi
      .fn()
      .mockResolvedValueOnce(['FETCH_NODE_API', 'GET_USER_ACCOUNT', 'SEND_CHAT_MESSAGE'])
      .mockResolvedValueOnce('QORTIUM_HOME_ELECTRON')
      .mockResolvedValueOnce(false);

    vi.stubGlobal('window', { qdnRequest: vi.fn(), qortalRequest: qortalRequestMock });

    expect(hasQortalHomeBridge()).toBe(true);
    await expect(getQortalBridgeState()).resolves.toEqual({
      actions: ['FETCH_NODE_API', 'GET_USER_ACCOUNT', 'SEND_CHAT_MESSAGE'],
      host: 'home2',
      isHomeBridge: true,
      isUsingPublicNode: false,
      transport: 'home',
      ui: 'QORTIUM_HOME_ELECTRON',
    });
  });

  it('reports host "hub" when WHICH_UI resolves a Hub shell, even though the bridge global lives on window in this test', async () => {
    const qortalRequestMock = vi
      .fn()
      .mockResolvedValueOnce(['FETCH_NODE_API', 'GET_USER_ACCOUNT', 'SEARCH_CHAT_MESSAGES', 'SEND_CHAT_MESSAGE'])
      .mockResolvedValueOnce('HUB_ELECTRON')
      .mockResolvedValueOnce(false);

    vi.stubGlobal('window', { qdnRequest: vi.fn(), qortalRequest: qortalRequestMock });

    const bridge = await getQortalBridgeState();

    expect(bridge).toMatchObject({
      host: 'hub',
      isHomeBridge: true,
      transport: 'home',
      ui: 'HUB_ELECTRON',
    });
  });

  it('recognizes a legacy Home bridge candidate without claiming a dedicated global', () => {
    vi.stubGlobal('window', { qdnRequest: vi.fn() });

    expect(hasQortalHomeBridge()).toBe(false);
    expect(hasLegacyQortalBridgeCandidate()).toBe(true);
  });

  it('normalizes the released Home 1.7 Qortal action catalogue', async () => {
    const qdnRequestMock = vi
      .fn()
      .mockResolvedValueOnce([
        'FETCH_QORTAL_NODE_API',
        'GET_QORTAL_ACCOUNT_GROUPS',
        'GET_QORTAL_ACTIVE_CHATS',
        'GET_QORTAL_CHAT_MESSAGE',
        'GET_QORTAL_CHAT_MESSAGES',
        'GET_QORTAL_PRIMARY_NAME',
        'GET_SELECTED_ACCOUNT',
        'SEND_QORTAL_GROUP_CHAT',
        'SHOW_ACTIONS',
        'WHICH_UI',
      ])
      .mockResolvedValueOnce('QORTIUM_HOME_ELECTRON');

    vi.stubGlobal('window', { qdnRequest: qdnRequestMock });

    const bridge = await getQortalBridgeState();

    expect(bridge).toMatchObject({
      host: 'legacy-home',
      isHomeBridge: true,
      isUsingPublicNode: false,
      transport: 'home',
      ui: 'QORTIUM_HOME_ELECTRON',
    });
    expect(bridge.actions).toEqual(
      expect.arrayContaining([
        'FETCH_NODE_API',
        'GET_ACCOUNT_GROUPS',
        'GET_ACTIVE_CHATS',
        'GET_CHAT_MESSAGE',
        'GET_PRIMARY_NAME',
        'GET_USER_ACCOUNT',
        'SEARCH_CHAT_MESSAGES',
        'SEND_CHAT_MESSAGE',
      ]),
    );
    expect(hasQortalChatBridgeActions(bridge.actions)).toBe(true);
  });

  it('does not present a Qortium-only legacy catalogue as Qortal Chat', async () => {
    const qdnRequestMock = vi
      .fn()
      .mockResolvedValueOnce(['FETCH_NODE_API', 'GET_SELECTED_ACCOUNT', 'SHOW_ACTIONS', 'WHICH_UI'])
      .mockResolvedValueOnce('QORTIUM_HOME_ELECTRON');

    vi.stubGlobal('window', { qdnRequest: qdnRequestMock });

    const bridge = await getQortalBridgeState();

    expect(hasQortalChatBridgeActions(bridge.actions)).toBe(false);
    expect(bridge.isHomeBridge).toBe(false);
    expect(bridge.transport).toBe('browser-dev');
  });

  it('relaxes GET_ACCOUNT_GROUPS for the hub host but still requires it elsewhere', () => {
    const withoutGroups = ['GET_USER_ACCOUNT', 'SEARCH_CHAT_MESSAGES'];

    expect(hasQortalChatBridgeActions(withoutGroups, 'hub')).toBe(true);
    expect(hasQortalChatBridgeActions(withoutGroups)).toBe(false);
    expect(hasQortalChatBridgeActions(withoutGroups, 'home2')).toBe(false);
    expect(hasQortalChatBridgeActions([...withoutGroups, 'GET_ACCOUNT_GROUPS'], 'home2')).toBe(true);
  });

  it('keeps a Hub bridge available when its public-chat catalogue omits GET_ACCOUNT_GROUPS', () => {
    expect(
      isQortalChatBridgeAvailable({
        actions: ['GET_USER_ACCOUNT', 'SEARCH_CHAT_MESSAGES'],
        host: 'hub',
        isHomeBridge: true,
        isUsingPublicNode: false,
        transport: 'home',
        ui: 'HUB_ELECTRON',
      }),
    ).toBe(true);
  });

  it('uses the rendered Core origin for Hub node reads instead of sending an unsupported action', async () => {
    const qortalRequestMock = vi.fn().mockResolvedValueOnce('HUB_ELECTRON');
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify([{ groupId: 7 }]), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    );

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', {
      location: { origin: 'http://127.0.0.1:12391' },
      qdnRequest: vi.fn(),
      qortalRequest: qortalRequestMock,
    });

    await expect(
      qortalRequest({ action: 'FETCH_NODE_API', maxBytes: 4096, path: '/groups/member/Qaccount' }),
    ).resolves.toMatchObject({ data: [{ groupId: 7 }], ok: true, status: 200 });
    expect(qortalRequestMock).toHaveBeenCalledOnce();
    expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'WHICH_UI' });
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:12391/groups/member/Qaccount', { method: 'GET' });
  });

  it('maps legacy account, message-read, and reply-send requests without exposing keys', async () => {
    const qdnRequestMock = vi
      .fn()
      .mockResolvedValueOnce({ address: 'QortalAddress', isUnlocked: true, name: 'QortiumName' })
      .mockResolvedValueOnce([{ data: 'message' }])
      .mockResolvedValueOnce({ accepted: true, signature: 'sent-sig' });

    vi.stubGlobal('window', { qdnRequest: qdnRequestMock });

    await expect(qortalRequest({ action: 'GET_USER_ACCOUNT' })).resolves.toEqual({
      address: 'QortalAddress',
      publicKey: null,
    });
    await expect(
      qortalRequest({ action: 'SEARCH_CHAT_MESSAGES', limit: 100, reverse: true, txGroupId: 12 }),
    ).resolves.toEqual([{ data: 'message' }]);
    await expect(
      qortalRequest({
        action: 'SEND_CHAT_MESSAGE',
        groupId: 12,
        message: '{"message":"hello","repliedTo":"reply-sig"}',
        txGroupId: 12,
      }),
    ).resolves.toEqual({ accepted: true, signature: 'sent-sig' });

    expect(qdnRequestMock).toHaveBeenNthCalledWith(1, { action: 'GET_SELECTED_ACCOUNT' });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(2, {
      action: 'GET_QORTAL_CHAT_MESSAGES',
      limit: 100,
      reverse: true,
      txGroupId: 12,
    });
    expect(qdnRequestMock).toHaveBeenNthCalledWith(3, {
      action: 'SEND_QORTAL_GROUP_CHAT',
      groupId: 12,
      repliedTo: 'reply-sig',
      text: 'hello',
      txGroupId: 12,
    });
  });

  it('builds a Hub v3 payload for Home 2, including the generic-envelope revision fallback', async () => {
    const qortalRequestMock = vi.fn().mockResolvedValueOnce({ signature: 'sent-sig' });

    vi.stubGlobal('window', { qdnRequest: vi.fn(), qortalRequest: qortalRequestMock });

    await qortalRequest({ action: 'SEND_CHAT_MESSAGE', message: 'hello', txGroupId: 12 });

    const request = qortalRequestMock.mock.calls[0]?.[0] as Record<string, unknown>;
    const payload = JSON.parse(String(request.message)) as Record<string, unknown>;

    expect(payload).toMatchObject({ images: [], isEdited: false, repliedTo: '', type: '', version: 3 });
    expect(payload.specialId).toEqual(expect.any(String));
    expect(request.txGroupId).toBe(12);

    // A chatReference (edit/delete/reaction routed through the generic
    // SEND_CHAT_MESSAGE envelope, when the exact Home 2 action is not
    // advertised) is no longer blanket-rejected — it forwards unchanged
    // alongside the same Hub v3 payload wrapping.
    qortalRequestMock.mockResolvedValueOnce({ signature: 'edit-sig' });
    await qortalRequest({ action: 'SEND_CHAT_MESSAGE', chatReference: 'edit-sig', message: 'edited', txGroupId: 12 });

    const revisionRequest = qortalRequestMock.mock.calls[1]?.[0] as Record<string, unknown>;

    expect(revisionRequest.chatReference).toBe('edit-sig');
    expect(qortalRequestMock).toHaveBeenCalledTimes(2);
  });

  it('uses local fallback actions outside Home, distinct from GET_SELECTED_ACCOUNT', async () => {
    vi.stubGlobal('window', {});

    await expect(qortalRequest({ action: 'SHOW_ACTIONS' })).resolves.toEqual([...LOCAL_READ_ACTIONS]);
    expect(LOCAL_READ_ACTIONS).not.toContain('GET_USER_ACCOUNT');
    await expect(qortalRequest({ action: 'GET_USER_ACCOUNT' })).rejects.toThrow(
      'Qortal user account is only available inside Qortium Home.',
    );
  });

  it('rejects a request with no action', async () => {
    vi.stubGlobal('window', {});

    await expect(qortalRequest({} as never)).rejects.toThrow('Qortal requests must include an action.');
  });
});
