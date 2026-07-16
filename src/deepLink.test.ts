import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInitialDeepLinkTarget, parseDeepLinkSearch, parseOpenAppTargetMessage } from './deepLink';

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
