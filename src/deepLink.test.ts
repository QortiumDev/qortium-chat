import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getChatRouteUrl,
  getInitialDeepLinkTarget,
  parseDeepLinkSearch,
  parseOpenAppTargetMessage,
  writeChatRoute,
} from './deepLink';

const address = `Q${'1'.repeat(33)}`;

describe('conversation deep links', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses address and group URL query parameters', () => {
    expect(parseDeepLinkSearch(`?address=${address}&group=42`)).toEqual({ address, group: 42 });
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
  });

  it('rewrites only Chat-owned keys while preserving host parameters and fragments', () => {
    const location = {
      hash: '#message-7',
      pathname: '/render/APP/Chat/Chat',
      search: `?qdnHomeBridge=token&theme=dark&lang=es&textSize=large&accent=%23abc&uiStyle=modern&future=kept&group=4&address=${address}`,
    };

    expect(getChatRouteUrl({ group: 42 }, location)).toBe(
      '/render/APP/Chat/Chat?qdnHomeBridge=token&theme=dark&lang=es&textSize=large&accent=%23abc&uiStyle=modern&future=kept&group=42#message-7',
    );
    expect(getChatRouteUrl({ address, group: 42 }, location)).toBe(
      `/render/APP/Chat/Chat?qdnHomeBridge=token&theme=dark&lang=es&textSize=large&accent=%23abc&uiStyle=modern&future=kept&address=${address}#message-7`,
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

    expect(pushState).toHaveBeenCalledWith({}, '', '/render/APP/Chat/Chat?theme=dark&group=2');
    expect(replaceState).toHaveBeenCalledWith({}, '', `/render/APP/Chat/Chat?theme=dark&address=${address}`);
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate the current canonical route', () => {
    const pushState = vi.fn();
    const replaceState = vi.fn();
    const browser = {
      history: { pushState, replaceState },
      location: { hash: '#kept', pathname: '/app', search: '?theme=dark&group=7' },
    };

    writeChatRoute({ group: 7 }, 'push', browser);

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('parses the Home OPEN_APP_TARGET message contract', () => {
    expect(parseOpenAppTargetMessage({
      action: 'OPEN_APP_TARGET',
      requestedHandler: 'UI',
      query: { address, group: '7' },
    })).toEqual({ address, group: 7 });
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
