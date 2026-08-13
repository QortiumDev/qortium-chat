import { afterEach, describe, expect, it, vi } from 'vitest';
import { getQortalBridgeState, hasQortalHomeBridge, LOCAL_READ_ACTIONS, qortalRequest } from './qortalRequest';

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
      isHomeBridge: true,
      isUsingPublicNode: false,
      transport: 'home',
      ui: 'QORTIUM_HOME_ELECTRON',
    });
  });

  it('reports no Qortal bridge when only window.qdnRequest is injected (older host)', () => {
    vi.stubGlobal('window', { qdnRequest: vi.fn() });

    expect(hasQortalHomeBridge()).toBe(false);
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
