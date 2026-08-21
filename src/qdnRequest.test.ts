import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildNodeWebSocketUrl,
  canUseNodeWebSockets,
  classifyBridgeHost,
  classifyBridgeTransport,
  getBridgeState,
  hasAction,
  LOCAL_READ_ACTIONS,
  qdnRequest,
} from './qdnRequest';

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
      host: 'home2',
      isHomeBridge: true,
      isUsingPublicNode: true,
      transport: 'home',
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
      host: 'home2',
      isHomeBridge: true,
      isUsingPublicNode: false,
      transport: 'home',
      ui: 'QORTIUM_HOME',
    });
  });

  it('classifies Core gateway injection separately from Home', async () => {
    const qdnRequestMock = vi
      .fn()
      .mockResolvedValueOnce(['FETCH_NODE_API', 'SEARCH_CHAT_MESSAGES'])
      .mockResolvedValueOnce('QORTIUM_GATEWAY')
      .mockResolvedValueOnce(true);

    vi.stubGlobal('window', { qdnRequest: qdnRequestMock });

    await expect(getBridgeState()).resolves.toEqual({
      actions: ['FETCH_NODE_API', 'SEARCH_CHAT_MESSAGES'],
      host: 'gateway',
      isHomeBridge: false,
      isUsingPublicNode: true,
      transport: 'gateway',
      ui: 'QORTIUM_GATEWAY',
    });
  });

  it('classifies unknown injected bridges as Home-compatible', () => {
    expect(classifyBridgeTransport('QORTIUM_GATEWAY', true)).toBe('gateway');
    expect(classifyBridgeTransport('future-home-shell', true)).toBe('home');
    expect(classifyBridgeTransport('BROWSER_DEV', false)).toBe('browser-dev');
  });

  it('classifies bridge host from ui + transport', () => {
    expect(classifyBridgeHost('QORTIUM_HOME_ELECTRON', 'home')).toBe('home2');
    expect(classifyBridgeHost('HUB_ELECTRON', 'home')).toBe('hub');
    expect(classifyBridgeHost('HUB_WEB', 'home')).toBe('hub');
    expect(classifyBridgeHost('QORTIUM_GATEWAY', 'gateway')).toBe('gateway');
    expect(classifyBridgeHost('BROWSER_DEV', 'browser-dev')).toBe('browser-dev');
    expect(classifyBridgeHost('QORTIUM_HOME_ELECTRON', 'home', { isLegacyAdapter: true })).toBe(
      'legacy-home',
    );
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

  it('disables node websockets on Android WebView synthetic hosts', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'app-hash.qdn.androidplatform.net' },
      qdnRequest: vi.fn(),
    });

    expect(canUseNodeWebSockets()).toBe(false);
  });

  it('keeps node websockets enabled for desktop Home and local development', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      qdnRequest: vi.fn(),
    });

    expect(canUseNodeWebSockets()).toBe(true);

    vi.stubGlobal('window', {
      location: { hostname: 'home.qortium.local' },
      qdnRequest: vi.fn(),
    });

    expect(canUseNodeWebSockets()).toBe(true);
  });
});
