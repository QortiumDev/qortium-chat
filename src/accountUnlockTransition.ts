type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type ScheduleTimeout = (callback: () => void, delayMs: number) => TimerHandle;
type CancelTimeout = (handle: TimerHandle) => void;

export const ACCOUNT_UNLOCK_STATE_CHANGE_TIMEOUT_MS = 2_000;

/**
 * Latches Home's selected-account-change notification across the unlock
 * request boundary. Home 2 versions before the account-state ordering fix can
 * emit this notification while still rejecting UNLOCK_SELECTED_ACCOUNT with
 * ACCOUNT_LOCKED, so the notification may arrive before or after the bridge
 * rejection reaches Chat.
 */
export class AccountUnlockTransition {
  private readonly scheduleTimeout: ScheduleTimeout;
  private readonly cancelTimeout: CancelTimeout;
  private observed = false;
  private disposed = false;
  private timeout: TimerHandle | null = null;
  private resolveWait: ((observed: boolean) => void) | null = null;

  constructor(
    scheduleTimeout: ScheduleTimeout = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    cancelTimeout: CancelTimeout = (handle) => globalThis.clearTimeout(handle),
  ) {
    this.scheduleTimeout = scheduleTimeout;
    this.cancelTimeout = cancelTimeout;
  }

  /** Returns true when this active unlock attempt consumed the notification. */
  notify() {
    if (this.disposed) {
      return false;
    }

    this.observed = true;
    this.settle(true);
    return true;
  }

  wait(timeoutMs: number = ACCOUNT_UNLOCK_STATE_CHANGE_TIMEOUT_MS): Promise<boolean> {
    if (this.disposed) {
      return Promise.resolve(false);
    }

    if (this.observed) {
      return Promise.resolve(true);
    }

    if (this.resolveWait) {
      throw new Error('Account unlock transition is already being awaited.');
    }

    return new Promise((resolve) => {
      this.resolveWait = resolve;
      this.timeout = this.scheduleTimeout(() => this.settle(false), timeoutMs);
    });
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.settle(false);
  }

  private settle(observed: boolean) {
    if (this.timeout !== null) {
      this.cancelTimeout(this.timeout);
      this.timeout = null;
    }

    const resolve = this.resolveWait;

    this.resolveWait = null;
    resolve?.(observed);
  }
}
