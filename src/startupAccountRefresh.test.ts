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
    expect(scheduled.size).toBe(0);
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

  it('preserves every notification after the initial refresh', () => {
    const { coordinator } = createHarness();
    let refreshCount = 0;

    coordinator.notify();
    coordinator.markReady(() => {
      refreshCount += 1;
    });
    coordinator.notify();

    expect(refreshCount).toBe(2);
  });

  it('preserves additional notifications queued before readiness', () => {
    const { coordinator } = createHarness();
    let refreshCount = 0;

    coordinator.notify();
    coordinator.notify();
    coordinator.markReady(() => {
      refreshCount += 1;
    });

    expect(refreshCount).toBe(2);
  });

  it('falls back to an initial refresh when the host sends no notification', () => {
    const { coordinator, runFallbacks } = createHarness();
    let refreshCount = 0;

    coordinator.markReady(() => {
      refreshCount += 1;
    });
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
    runFallbacks();

    expect(refreshCount).toBe(0);
  });
});
