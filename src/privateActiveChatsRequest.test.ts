import { describe, expect, it, vi } from 'vitest';
import { PrivateActiveChatsRequestCoordinator } from './privateActiveChatsRequest';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function createRequest(
  loadDirect: () => Promise<never[]>,
  loadGroups: () => Promise<never[]>,
) {
  return {
    accountAddress: 'Q-account',
    canReadDirect: true,
    canReadGroups: true,
    loadDirect,
    loadGroups,
    network: 'qortium' as const,
  };
}

describe('PrivateActiveChatsRequestCoordinator', () => {
  it('shares one sequential private-read request while a permission decision is pending', async () => {
    const coordinator = new PrivateActiveChatsRequestCoordinator();
    const direct = deferred<never[]>();
    const groups = deferred<never[]>();
    const loadDirect = vi.fn(() => direct.promise);
    const loadGroups = vi.fn(() => groups.promise);
    const request = createRequest(loadDirect, loadGroups);

    const first = coordinator.request(request);
    const second = coordinator.request(request);

    expect(second).toBe(first);
    expect(loadDirect).toHaveBeenCalledTimes(1);
    expect(loadGroups).not.toHaveBeenCalled();

    direct.resolve([]);
    await Promise.resolve();
    expect(loadGroups).toHaveBeenCalledTimes(1);

    groups.resolve([]);
    await expect(first).resolves.toEqual({ direct: [], groups: [] });
    await expect(second).resolves.toEqual({ direct: [], groups: [] });
  });

  it('removes a failed request so the same context can retry', async () => {
    const coordinator = new PrivateActiveChatsRequestCoordinator();
    const loadDirect = vi.fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce([]);
    const loadGroups = vi.fn().mockResolvedValue([]);
    const request = createRequest(loadDirect, loadGroups);

    await expect(coordinator.request(request)).rejects.toThrow('denied');
    await expect(coordinator.request(request)).resolves.toEqual({ direct: [], groups: [] });

    expect(loadDirect).toHaveBeenCalledTimes(2);
    expect(loadGroups).toHaveBeenCalledTimes(1);
  });

  it('does not share a pending request after its network context is invalidated', async () => {
    const coordinator = new PrivateActiveChatsRequestCoordinator();
    const firstDirect = deferred<never[]>();
    const loadDirect = vi.fn()
      .mockReturnValueOnce(firstDirect.promise)
      .mockResolvedValueOnce([]);
    const loadGroups = vi.fn().mockResolvedValue([]);
    const request = createRequest(loadDirect, loadGroups);

    const first = coordinator.request(request);
    coordinator.invalidate('qortium');
    const second = coordinator.request(request);

    expect(second).not.toBe(first);
    await expect(second).resolves.toEqual({ direct: [], groups: [] });
    expect(loadDirect).toHaveBeenCalledTimes(2);

    firstDirect.resolve([]);
    await expect(first).resolves.toEqual({ direct: [], groups: [] });
  });

  it('skips unadvertised private reads', async () => {
    const coordinator = new PrivateActiveChatsRequestCoordinator();
    const loadDirect = vi.fn().mockResolvedValue([]);
    const loadGroups = vi.fn().mockResolvedValue([]);

    await expect(coordinator.request({
      ...createRequest(loadDirect, loadGroups),
      canReadDirect: false,
      canReadGroups: false,
    })).resolves.toEqual({ direct: null, groups: [] });

    expect(loadDirect).not.toHaveBeenCalled();
    expect(loadGroups).not.toHaveBeenCalled();
  });
});
