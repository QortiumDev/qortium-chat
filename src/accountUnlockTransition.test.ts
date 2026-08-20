import { describe, expect, it } from 'vitest';
import { AccountUnlockTransition } from './accountUnlockTransition';

function createHarness() {
  const scheduled = new Map<number, () => void>();
  let nextHandle = 1;
  const transition = new AccountUnlockTransition(
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
    runTimeouts() {
      const callbacks = [...scheduled.values()];

      scheduled.clear();
      callbacks.forEach((callback) => callback());
    },
    scheduled,
    transition,
  };
}

describe('AccountUnlockTransition', () => {
  it('latches a notification that arrives before the bridge rejection is handled', async () => {
    const { scheduled, transition } = createHarness();

    expect(transition.notify()).toBe(true);
    await expect(transition.wait()).resolves.toBe(true);
    expect(scheduled.size).toBe(0);
  });

  it('resolves an active wait when Home delivers the account-state notification', async () => {
    const { scheduled, transition } = createHarness();
    const observed = transition.wait();

    expect(scheduled.size).toBe(1);
    expect(transition.notify()).toBe(true);
    await expect(observed).resolves.toBe(true);
    expect(scheduled.size).toBe(0);
  });

  it('times out without claiming an account state change that never arrived', async () => {
    const { runTimeouts, transition } = createHarness();
    const observed = transition.wait();

    runTimeouts();
    await expect(observed).resolves.toBe(false);
  });

  it('settles a pending wait and stops consuming notifications when disposed', async () => {
    const { scheduled, transition } = createHarness();
    const observed = transition.wait();

    transition.dispose();

    await expect(observed).resolves.toBe(false);
    expect(transition.notify()).toBe(false);
    expect(scheduled.size).toBe(0);
  });
});
