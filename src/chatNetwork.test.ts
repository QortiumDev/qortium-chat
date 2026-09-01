import { beforeEach, describe, expect, it, vi } from 'vitest';

const qdnRequestMock = vi.hoisted(() => vi.fn());
const qortalRequestMock = vi.hoisted(() => vi.fn());
const getBridgeStateMock = vi.hoisted(() => vi.fn());
const getQortalBridgeStateMock = vi.hoisted(() => vi.fn());
const hasHomeBridgeMock = vi.hoisted(() => vi.fn());
const hasQortalHomeBridgeMock = vi.hoisted(() => vi.fn());

vi.mock('./qdnRequest', () => ({
  getBridgeState: getBridgeStateMock,
  hasHomeBridge: hasHomeBridgeMock,
  qdnRequest: qdnRequestMock,
}));

vi.mock('./qortalRequest', () => ({
  getQortalBridgeState: getQortalBridgeStateMock,
  hasQortalHomeBridge: hasQortalHomeBridgeMock,
  qortalRequest: qortalRequestMock,
}));

import { bridgeRequest, canFetchNodeApi, getMessageNetworkIdentity, getNetworkBridgeState, hasNetworkBridge } from './chatNetwork';

describe('chatNetwork dispatcher (Chat 2.0 slice 2)', () => {
  beforeEach(() => {
    qdnRequestMock.mockReset();
    qortalRequestMock.mockReset();
    getBridgeStateMock.mockReset();
    getQortalBridgeStateMock.mockReset();
    hasHomeBridgeMock.mockReset();
    hasQortalHomeBridgeMock.mockReset();
  });

  it('routes a qortium request to qdnRequest, never qortalRequest', async () => {
    qdnRequestMock.mockResolvedValueOnce({ ok: true });

    await expect(bridgeRequest('qortium', { action: 'GET_ACTIVE_CHATS' })).resolves.toEqual({ ok: true });
    expect(qdnRequestMock).toHaveBeenCalledWith({ action: 'GET_ACTIVE_CHATS' });
    expect(qortalRequestMock).not.toHaveBeenCalled();
  });

  it('routes a qortal request to qortalRequest, never qdnRequest', async () => {
    qortalRequestMock.mockResolvedValueOnce({ ok: true });

    await expect(bridgeRequest('qortal', { action: 'GET_ACTIVE_CHATS' })).resolves.toEqual({ ok: true });
    expect(qortalRequestMock).toHaveBeenCalledWith({ action: 'GET_ACTIVE_CHATS' });
    expect(qdnRequestMock).not.toHaveBeenCalled();
  });

  it('routes bridge-state lookups by protocol the same way', async () => {
    getBridgeStateMock.mockResolvedValueOnce({ actions: ['A'] });
    getQortalBridgeStateMock.mockResolvedValueOnce({ actions: ['B'] });

    await expect(getNetworkBridgeState('qortium')).resolves.toEqual({ actions: ['A'] });
    await expect(getNetworkBridgeState('qortal')).resolves.toEqual({ actions: ['B'] });
    expect(getBridgeStateMock).toHaveBeenCalledTimes(1);
    expect(getQortalBridgeStateMock).toHaveBeenCalledTimes(1);
  });

  it('gates whole-section visibility on the real per-protocol bridge global, not SHOW_ACTIONS', () => {
    hasHomeBridgeMock.mockReturnValueOnce(true);
    hasQortalHomeBridgeMock.mockReturnValueOnce(false);

    expect(hasNetworkBridge('qortium')).toBe(true);
    expect(hasNetworkBridge('qortal')).toBe(false);
  });

  it('composes a (network, signature) identity so the same raw signature never collides across chains', () => {
    const qortiumId = getMessageNetworkIdentity('qortium', { signature: 'shared-sig' });
    const qortalId = getMessageNetworkIdentity('qortal', { signature: 'shared-sig' });

    expect(qortiumId).not.toBe(qortalId);
  });

  it('falls back to sendLocalId when a message has no real signature yet', () => {
    expect(getMessageNetworkIdentity('qortal', { sendLocalId: 'pending-1', signature: null })).toBe(
      'qortal:pending-1',
    );
  });
});

describe('canFetchNodeApi', () => {
  const base = { actions: [] as string[], host: 'home2' as const, transport: 'home' as const };

  it('accepts hosts advertising FETCH_NODE_API', () => {
    expect(canFetchNodeApi({ ...base, actions: ['FETCH_NODE_API'] })).toBe(true);
    expect(canFetchNodeApi({ ...base, actions: ['fetch_node_api'] })).toBe(true);
    expect(canFetchNodeApi(base)).toBe(false);
  });

  it("accepts Qortal Hub and the gateway, whose fetch rides the wrapper's same-origin fallback", () => {
    // Real Hub's SHOW_ACTIONS has no FETCH_NODE_API entry.
    expect(canFetchNodeApi({ actions: [], host: 'hub', transport: 'home' })).toBe(true);
    expect(canFetchNodeApi({ actions: [], host: 'gateway', transport: 'gateway' })).toBe(true);
  });
});

