import { afterEach, describe, expect, it, vi } from 'vitest';
import { getInjectedQortalRequestGlobal } from './qortalGlobal';

// The Hub lexical-const case (a top-level `const qortalRequest` sharing the
// page's script global environment) cannot be simulated from a vitest module
// scope, so only the window-bridge and fully-absent cases are covered here;
// the lexical-global read path is exercised indirectly by the try/catch
// falling through to `undefined` below.
describe('getInjectedQortalRequestGlobal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns window.qortalRequest when it is a function', () => {
    const bridgeRequest = vi.fn();

    vi.stubGlobal('window', { qortalRequest: bridgeRequest });

    expect(getInjectedQortalRequestGlobal()).toBe(bridgeRequest);
  });

  it('returns undefined when no window global and no lexical global exist', () => {
    vi.stubGlobal('window', {});

    expect(getInjectedQortalRequestGlobal()).toBeUndefined();
  });

  it('ignores a non-function window.qortalRequest', () => {
    vi.stubGlobal('window', { qortalRequest: 'not-a-function' });

    expect(getInjectedQortalRequestGlobal()).toBeUndefined();
  });
});
