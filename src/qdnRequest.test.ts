import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildNodeWebSocketUrl, getBridgeState, hasAction, LOCAL_READ_ACTIONS, qdnRequest } from './qdnRequest';

describe('qdnRequest bridge adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects Home bridge actions', async () => {
    const qdnRequestMock = vi
      .fn()
      .mockResolvedValueOnce(['FETCH_NODE_API', 'GET_SELECTED_ACCOUNT'])
      .mockResolvedValueOnce('QORTIUM_HOME_ELECTRON')
      .mockResolvedValueOnce(true);

    vi.stubGlobal('window', { qdnRequest: qdnRequestMock });

    await expect(getBridgeState()).resolves.toEqual({
      actions: ['FETCH_NODE_API', 'GET_SELECTED_ACCOUNT'],
      isHomeBridge: true,
      isUsingPublicNode: true,
      ui: 'QORTIUM_HOME_ELECTRON',
    });
  });

  it('defaults to a trusted node when the public-node probe fails', async () => {
    const qdnRequestMock = vi
      .fn()
      .mockResolvedValueOnce(['FETCH_NODE_API'])
      .mockResolvedValueOnce('QORTIUM_HOME')
      .mockRejectedValueOnce(new Error('unsupported'));

    vi.stubGlobal('window', { qdnRequest: qdnRequestMock });

    await expect(getBridgeState()).resolves.toEqual({
      actions: ['FETCH_NODE_API'],
      isHomeBridge: true,
      isUsingPublicNode: false,
      ui: 'QORTIUM_HOME',
    });
  });

  it('uses local fallback actions outside Home', async () => {
    vi.stubGlobal('window', {});

    await expect(qdnRequest({ action: 'SHOW_ACTIONS' })).resolves.toEqual([...LOCAL_READ_ACTIONS]);
    expect(LOCAL_READ_ACTIONS).not.toContain('GET_SELECTED_ACCOUNT');
  });

  it('matches Home action names case-insensitively', () => {
    expect(hasAction(['send_chat_message'], 'SEND_CHAT_MESSAGE')).toBe(true);
    expect(hasAction(['FETCH_NODE_API'], 'JOIN_GROUP')).toBe(false);
  });

  it('builds local node websocket URLs outside Home', () => {
    expect(buildNodeWebSocketUrl('/websockets/chat/messages?txGroupId=0')).toBe(
      'ws://127.0.0.1:24891/websockets/chat/messages?txGroupId=0',
    );
  });
});
