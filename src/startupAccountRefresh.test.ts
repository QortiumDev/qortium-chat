import { describe, expect, it } from 'vitest';
import { StartupAccountRefreshCoordinator } from './startupAccountRefresh';

function createHarness() {
  const scheduled = new Map<number, () => void>();
  let nextHandle = 1;
  const coordinator = new StartupAccountRefreshCoordinator(
    (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      scheduled.set(handle, callback);
      return handle;
    },
    (handle) => {
      scheduled.delete(handle as number);
    },
  );

  return {
    coordinator,
    runFallbacks() {
      const callbacks = [...scheduled.values()];
      scheduled.clear();
      callbacks.forEach((callback) => callback());
    },
    scheduled,
  };
}

describe('StartupAccountRefreshCoordinator', () => {
  it('uses one queued host notification as the initial refresh', () => {
    const { coordinator, scheduled } = createHarness();
    let refreshCount = 0;

    coordinator.notify();
    coordinator.markReady(() => {
      refreshCount += 1;
    });

    expect(refreshCount).toBe(1);
    expect(scheduled.size).toBe(1);
  });

  it('cancels the fallback when the initial host notification arrives', () => {
    const { coordinator, runFallbacks, scheduled } = createHarness();
    let refreshCount = 0;

    coordinator.markReady(() => {
      refreshCount += 1;
    });
    expect(scheduled.size).toBe(1);

    coordinator.notify();
    runFallbacks();

    expect(refreshCount).toBe(1);
  });

  it('preserves notifications after the bounded startup grace period', () => {
    const { coordinator, runFallbacks } = createHarness();
    let refreshCount = 0;

    coordinator.notify();
    coordinator.markReady(() => {
      refreshCount += 1;
    });
    coordinator.notify();
    expect(refreshCount).toBe(1);

    runFallbacks();
    coordinator.notify();

    expect(refreshCount).toBe(2);
  });

  it('coalesces notifications queued before readiness into one current-account refresh', () => {
    const { coordinator } = createHarness();
    let refreshCount = 0;

    coordinator.notify();
    coordinator.notify();
    coordinator.markReady(() => {
      refreshCount += 1;
    });

    expect(refreshCount).toBe(1);
  });

  it('coalesces a manual pre-ready request with the delayed startup notification burst', () => {
    const { coordinator, runFallbacks } = createHarness();
    let refreshCount = 0;

    coordinator.request();
    coordinator.markReady(() => {
      refreshCount += 1;
    });
    coordinator.notify();

    expect(refreshCount).toBe(1);

    coordinator.notify();
    coordinator.notify();
    expect(refreshCount).toBe(1);

    runFallbacks();
    coordinator.notify();
    expect(refreshCount).toBe(2);
  });

  it('still forwards later changes when the host signal was already queued', () => {
    const { coordinator, runFallbacks } = createHarness();
    let refreshCount = 0;

    coordinator.notify();
    coordinator.request();
    coordinator.markReady(() => {
      refreshCount += 1;
    });
    coordinator.notify();
    expect(refreshCount).toBe(1);

    runFallbacks();
    coordinator.notify();

    expect(refreshCount).toBe(2);
  });

  it('expires manual startup coalescing when no delayed host signal arrives', () => {
    const { coordinator, runFallbacks } = createHarness();
    let refreshCount = 0;

    coordinator.request();
    coordinator.markReady(() => {
      refreshCount += 1;
    });
    runFallbacks();
    coordinator.notify();

    expect(refreshCount).toBe(2);
  });

  it('coalesces a manual retry made while the initial startup refresh is settling', () => {
    const { coordinator, runFallbacks } = createHarness();
    let refreshCount = 0;

    coordinator.markReady(() => {
      refreshCount += 1;
    });
    coordinator.notify();
    coordinator.request();

    expect(refreshCount).toBe(1);

    runFallbacks();
    coordinator.request();
    expect(refreshCount).toBe(2);
  });

  it('falls back to an initial refresh when the host sends no notification', () => {
    const { coordinator, runFallbacks } = createHarness();
    let refreshCount = 0;

    coordinator.markReady(() => {
      refreshCount += 1;
    });
    runFallbacks();
    runFallbacks();

    expect(refreshCount).toBe(1);

    coordinator.notify();
    expect(refreshCount).toBe(2);
  });

  it('cancels pending work when disposed', () => {
    const { coordinator, runFallbacks } = createHarness();
    let refreshCount = 0;

    coordinator.markReady(() => {
      refreshCount += 1;
    });
    coordinator.dispose();
    coordinator.notify();
    coordinator.request();
    runFallbacks();

    expect(refreshCount).toBe(0);
  });
});
