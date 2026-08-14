type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type ScheduleRefresh = (callback: () => void, delayMs: number) => TimerHandle;
type CancelRefresh = (handle: TimerHandle) => void;

const DEFAULT_FALLBACK_DELAY_MS = 250;

/**
 * Coalesces Home's initial selected-account notification with Chat's initial
 * account refresh. Once that first refresh starts, every later notification is
 * forwarded so an actual account change can never be hidden.
 */
export class StartupAccountRefreshCoordinator {
  private readonly scheduleRefresh: ScheduleRefresh;
  private readonly cancelRefresh: CancelRefresh;
  private refresh: (() => void) | null = null;
  private fallbackTimer: TimerHandle | null = null;
  private pendingNotificationCount = 0;
  private initialRefreshStarted = false;
  private disposed = false;

  constructor(
    scheduleRefresh: ScheduleRefresh = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    cancelRefresh: CancelRefresh = (handle) => globalThis.clearTimeout(handle),
  ) {
    this.scheduleRefresh = scheduleRefresh;
    this.cancelRefresh = cancelRefresh;
  }

  markReady(refresh: () => void, fallbackDelayMs = DEFAULT_FALLBACK_DELAY_MS) {
    if (this.disposed || this.refresh) {
      return;
    }

    this.refresh = refresh;

    if (this.pendingNotificationCount > 0) {
      const notificationCount = this.pendingNotificationCount;
      this.pendingNotificationCount = 0;
      this.startInitialRefresh();

      // The first queued notification supplies the initial refresh. Preserve
      // every additional notification because it may represent a real switch.
      for (let index = 1; index < notificationCount; index += 1) {
        this.refresh();
      }
      return;
    }

    this.fallbackTimer = this.scheduleRefresh(() => {
      this.fallbackTimer = null;
      this.startInitialRefresh();
    }, fallbackDelayMs);
  }

  notify() {
    if (this.disposed) {
      return;
    }

    if (!this.refresh) {
      this.pendingNotificationCount += 1;
      return;
    }

    if (!this.initialRefreshStarted) {
      this.cancelFallback();
      this.startInitialRefresh();
      return;
    }

    this.refresh();
  }

  dispose() {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancelFallback();
    this.pendingNotificationCount = 0;
    this.refresh = null;
  }

  private startInitialRefresh() {
    if (this.disposed || this.initialRefreshStarted || !this.refresh) {
      return;
    }

    this.initialRefreshStarted = true;
    this.refresh();
  }

  private cancelFallback() {
    if (this.fallbackTimer === null) {
      return;
    }

    this.cancelRefresh(this.fallbackTimer);
    this.fallbackTimer = null;
  }
}
