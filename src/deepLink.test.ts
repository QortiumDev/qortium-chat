import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalizeChatViewUrl,
  getChatRouteUrl,
  getChatViewUrl,
  getInitialChatView,
  getInitialDeepLinkTarget,
  isDeepLinkTargetForSelection,
  normalizeChatView,
  parseChatView,
  parseDeepLinkSearch,
  parseOpenAppTargetMessage,
  writeChatRoute,
  writeChatView,
} from './deepLink';

const address = `Q${'1'.repeat(33)}`;

describe('conversation deep links', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses address and group URL query parameters', () => {
    expect(parseDeepLinkSearch(`?address=${address}&group=42&network=qortal`)).toEqual({
      address,
      group: 42,
      network: 'qortal',
    });
    expect(parseDeepLinkSearch('?group=0')).toEqual({ group: 0 });
  });

  it('ignores a URL without a conversation target', () => {
    expect(parseDeepLinkSearch('?theme=dark')).toBeNull();
    expect(parseDeepLinkSearch('')).toBeNull();
  });

  it('reads the initial target from window.location.search', () => {
    vi.stubGlobal('window', { location: { search: `?address=${address}` } });

    expect(getInitialDeepLinkTarget()).toEqual({ address });
  });

  it('rejects malformed URL targets', () => {
    expect(parseDeepLinkSearch('?address=not-an-address')).toBeNull();
    expect(parseDeepLinkSearch('?group=-1')).toBeNull();
    expect(parseDeepLinkSearch('?group=1.5')).toBeNull();
    expect(parseDeepLinkSearch('?group=9007199254740992')).toBeNull();
    expect(parseDeepLinkSearch(`?address=${address}&group=nope`)).toBeNull();
    expect(parseDeepLinkSearch('?group=7&network=other')).toBeNull();
  });

  it('rewrites only Chat-owned keys while preserving host parameters and fragments', () => {
    const location = {
      hash: '#message-7',
      pathname: '/render/APP/Chat/Chat',
      search: `?qdnHomeBridge=token&theme=dark&lang=es&textSize=large&accent=%23abc&uiStyle=modern&future=kept&group=4&address=${address}`,
    };

    expect(getChatRouteUrl({ group: 42 }, location)).toBe(
      '/render/APP/Chat/Chat?qdnHomeBridge=token&theme=dark&lang=es&textSize=large&accent=%23abc&uiStyle=modern&future=kept&group=42&network=qortium#message-7',
    );
    expect(getChatRouteUrl({ address, group: 42 }, location)).toBe(
      `/render/APP/Chat/Chat?qdnHomeBridge=token&theme=dark&lang=es&textSize=large&accent=%23abc&uiStyle=modern&future=kept&address=${address}&network=qortium#message-7`,
    );
  });

  it('pushes deliberate selections, replaces restore targets, and never writes during popstate rehydration', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    const browser = {
      history: { pushState, replaceState },
      location: { pathname: '/render/APP/Chat/Chat', search: '?theme=dark&group=1' },
    };

    writeChatRoute({ group: 2 }, 'push', browser);
    writeChatRoute({ address }, 'replace', browser);
    writeChatRoute({ group: 3 }, 'none', browser);

    expect(pushState).toHaveBeenCalledWith({}, '', '/render/APP/Chat/Chat?theme=dark&group=2&network=qortium');
    expect(replaceState).toHaveBeenCalledWith({}, '', `/render/APP/Chat/Chat?theme=dark&address=${address}&network=qortium`);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate the current canonical route', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    const browser = {
      history: { pushState, replaceState },
      location: { hash: '#kept', pathname: '/app', search: '?theme=dark&group=7&network=qortium' },
    };

    writeChatRoute({ group: 7 }, 'push', browser);

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('serializes Qortal targets with an explicit network discriminator', () => {
    expect(getChatRouteUrl({ group: 12, network: 'qortal' }, { pathname: '/app', search: '?theme=dark' })).toBe(
      '/app?theme=dark&group=12&network=qortal',
    );
  });

  it('parses the Home OPEN_APP_TARGET message contract', () => {
    expect(parseOpenAppTargetMessage({
      action: 'OPEN_APP_TARGET',
      requestedHandler: 'UI',
      query: { address, group: '7', network: 'qortal' },
    })).toEqual({ address, group: 7, network: 'qortal' });
  });

  it('rejects malformed or unrelated host messages', () => {
    expect(parseOpenAppTargetMessage(null)).toBeNull();
    expect(parseOpenAppTargetMessage([])).toBeNull();
    expect(parseOpenAppTargetMessage({ action: 'OTHER', requestedHandler: 'UI', query: { group: '7' } })).toBeNull();
    expect(parseOpenAppTargetMessage({ action: 'OPEN_APP_TARGET', requestedHandler: 'WINDOW', query: { group: '7' } })).toBeNull();
    expect(parseOpenAppTargetMessage({ action: 'OPEN_APP_TARGET', requestedHandler: 'UI', query: { group: -1 } })).toBeNull();
    expect(parseOpenAppTargetMessage({ action: 'OPEN_APP_TARGET', requestedHandler: 'UI', query: {} })).toBeNull();
  });
});

describe('Developers workspace route', () => {
  const location = {
    hash: '#envelope',
    pathname: '/render/APP/Chat/Chat',
    search: `?qdnHomeBridge=token&homeV2Bridge=1&theme=dark&future=a&future=b&group=7&network=qortal&address=${address}`,
  };

  it('parses the canonical view and folds the developer/reference aliases', () => {
    expect(parseChatView('?view=developers')).toBe('developers');
    expect(parseChatView('?view=developer')).toBe('developers');
    expect(parseChatView('?view=reference')).toBe('developers');
    expect(parseChatView('?view=Reference')).toBe('developers');
    expect(parseChatView('?view=chat&view=developer')).toBe('developers');
    expect(parseChatView('?view=chat')).toBe('chat');
    expect(parseChatView('?view=unknown')).toBe('chat');
    expect(parseChatView('?group=7')).toBe('chat');
    expect(parseChatView('')).toBe('chat');
    expect(normalizeChatView(' DEVELOPER ')).toBe('developers');
    expect(normalizeChatView(undefined)).toBe('chat');
  });

  it('keeps the conversation keys, host params, repeated keys and fragment when entering and leaving', () => {
    const entered = getChatViewUrl('developers', location);

    expect(entered).toBe(
      `/render/APP/Chat/Chat?qdnHomeBridge=token&homeV2Bridge=1&theme=dark&future=a&future=b&group=7&network=qortal&address=${address}&view=developers#envelope`,
    );

    const enteredUrl = new URL(entered, 'http://localhost');

    expect(parseChatView(enteredUrl.search)).toBe('developers');
    expect(parseDeepLinkSearch(enteredUrl.search)).toEqual(parseDeepLinkSearch(location.search));
    expect(enteredUrl.searchParams.getAll('future')).toEqual(['a', 'b']);

    const left = getChatViewUrl('chat', { ...location, search: enteredUrl.search });

    expect(left).toBe(`${location.pathname}${location.search}${location.hash}`);
    expect(parseDeepLinkSearch(new URL(left, 'http://localhost').search)).toEqual(parseDeepLinkSearch(location.search));
  });

  it('replaces every view spelling with the single canonical value', () => {
    expect(getChatViewUrl('developers', { pathname: '/app', search: '?view=developer&view=reference&theme=dark' })).toBe(
      '/app?theme=dark&view=developers',
    );
    expect(getChatViewUrl('chat', { pathname: '/app', search: '?view=developers&view=reference' })).toBe('/app');
  });

  it('conversation writes leave the workspace view in place', () => {
    const viewLocation = { pathname: '/app', search: '?theme=dark&view=developers&group=1' };

    expect(getChatRouteUrl({ group: 2 }, viewLocation)).toBe('/app?theme=dark&view=developers&group=2&network=qortium');
  });

  it('pushes on enter, replaces when asked, never writes for none, and skips a no-op', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    const browser = {
      history: { pushState, replaceState },
      location: { pathname: '/app', search: '?theme=dark&group=1&network=qortium' },
    };

    writeChatView('developers', 'push', browser);
    writeChatView('chat', 'none', browser);
    writeChatView('chat', 'push', browser);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledWith({}, '', '/app?theme=dark&group=1&network=qortium&view=developers');

    writeChatView('chat', 'replace', { ...browser, location: { pathname: '/app', search: '?theme=dark&group=1&network=qortium&view=developers' } });
    expect(replaceState).toHaveBeenCalledWith({}, '', '/app?theme=dark&group=1&network=qortium');
  });

  it('canonicalizes aliases with replaceState and leaves canonical or view-less URLs alone', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    const history = { pushState, replaceState };

    canonicalizeChatViewUrl({ history, location: { hash: '#limits', pathname: '/app', search: '?group=1&network=qortium&view=reference' } });
    expect(replaceState).toHaveBeenCalledWith({}, '', '/app?group=1&network=qortium&view=developers#limits');

    canonicalizeChatViewUrl({ history, location: { pathname: '/app', search: '?view=developers&group=1' } });
    canonicalizeChatViewUrl({ history, location: { pathname: '/app', search: '?group=1' } });
    expect(replaceState).toHaveBeenCalledTimes(1);

    canonicalizeChatViewUrl({ history, location: { pathname: '/app', search: '?view=chat&group=1' } });
    expect(replaceState).toHaveBeenLastCalledWith({}, '', '/app?group=1');
    expect(pushState).not.toHaveBeenCalled();
  });

  it('reads the initial view from window.location.search', () => {
    vi.stubGlobal('window', { location: { search: '?view=developer' } });

    expect(getInitialChatView()).toBe('developers');
  });
});

describe('Back/Forward between workspaces keeps the conversation selected', () => {
  const group = { group: { groupId: 7 }, kind: 'group' as const };
  const direct = { direct: { address }, kind: 'direct' as const, network: 'qortal' as const };

  it('recognises history entries that only differ by workspace or section', () => {
    const search = getChatViewUrl('developers', { hash: '#limits', pathname: '/app', search: '?group=7&network=qortium' });
    const target = parseDeepLinkSearch(new URL(search, 'http://localhost').search);

    expect(target).toEqual({ group: 7, network: 'qortium' });
    expect(isDeepLinkTargetForSelection(target, group)).toBe(true);
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch('?group=7'), group)).toBe(true);
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch(`?address=${address}&network=qortal`), direct)).toBe(true);
  });

  it('still re-resolves entries that name another conversation, network or nothing', () => {
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch('?group=8'), group)).toBe(false);
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch('?group=7&network=qortal'), group)).toBe(false);
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch(`?address=${address}&group=7`), group)).toBe(false);
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch(`?address=${address}`), direct)).toBe(false);
    expect(isDeepLinkTargetForSelection(null, group)).toBe(false);
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch('?group=7'), null)).toBe(false);
  });

  it('models a chat → developers → Back round trip as one push and no re-selection', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    const browser = {
      history: { pushState, replaceState },
      location: { pathname: '/app', search: '?group=7&network=qortium&homeV2Bridge=1' },
    };

    writeChatView('developers', 'push', browser);
    expect(pushState).toHaveBeenCalledTimes(1);

    const enteredUrl = new URL(pushState.mock.calls[0][2] as string, 'http://localhost');
    expect(parseChatView(enteredUrl.search)).toBe('developers');
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch(enteredUrl.search), group)).toBe(true);

    // Back returns to the pre-push URL: same conversation, chat workspace.
    expect(parseChatView(browser.location.search)).toBe('chat');
    expect(isDeepLinkTargetForSelection(parseDeepLinkSearch(browser.location.search), group)).toBe(true);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
