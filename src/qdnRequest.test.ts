import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBridgeState, hasAction, LOCAL_READ_ACTIONS, qdnRequest } from './qdnRequest';

describe('qdnRequest bridge adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects Home bridge actions', async () => {
    const qdnRequestMock = vi
      .fn()
      .mockResolvedValueOnce(['FETCH_NODE_API', 'GET_SELECTED_ACCOUNT'])
      .mockResolvedValueOnce('QORTIUM_HOME_ELECTRON');

    vi.stubGlobal('window', { qdnRequest: qdnRequestMock });

    await expect(getBridgeState()).resolves.toEqual({
      actions: ['FETCH_NODE_API', 'GET_SELECTED_ACCOUNT'],
      isHomeBridge: true,
      ui: 'QORTIUM_HOME_ELECTRON',
    });
  });

  it('uses local fallback actions outside Home', async () => {
    vi.stubGlobal('window', {});

    await expect(qdnRequest({ action: 'SHOW_ACTIONS' })).resolves.toEqual([...LOCAL_READ_ACTIONS]);
  });

  it('matches Home action names case-insensitively', () => {
    expect(hasAction(['send_chat_message'], 'SEND_CHAT_MESSAGE')).toBe(true);
    expect(hasAction(['FETCH_NODE_API'], 'JOIN_GROUP')).toBe(false);
  });
});
