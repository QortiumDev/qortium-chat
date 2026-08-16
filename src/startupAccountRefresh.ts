type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

type ScheduleRefresh = (callback: () => void, delayMs: number) => TimerHandle;
type CancelRefresh = (handle: TimerHandle) => void;

const DEFAULT_FALLBACK_DELAY_MS = 250;
const DEFAULT_STARTUP_GRACE_MS = 5_000;

/**
 * Coalesces Home's initial selected-account notification with Chat's initial
 * account refresh. The first refresh absorbs Home's short startup-notification
 * burst; after that bounded grace period, every notification is forwarded
 * normally.
 */
export class StartupAccountRefreshCoordinator {
  private readonly scheduleRefresh: ScheduleRefresh;
  private readonly cancelRefresh: CancelRefresh;
  private refresh: (() => void) | null = null;
  private fallbackTimer: TimerHandle | null = null;
  private startupGraceTimer: TimerHandle | null = null;
  private pendingNotificationCount = 0;
  private manualRefreshRequested = false;
  private suppressNotifications = false;
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

    if (this.manualRefreshRequested) {
      this.manualRefreshRequested = false;
      this.pendingNotificationCount = 0;
      this.startInitialRefresh();
      return;
    }

    if (this.pendingNotificationCount > 0) {
      this.pendingNotificationCount = 0;
      this.startInitialRefresh();
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

    if (this.suppressNotifications) {
      return;
    }

    if (!this.initialRefreshStarted) {
      this.cancelFallback();
      this.startInitialRefresh();
      return;
    }

    this.refresh();
  }

  request() {
    if (this.disposed) {
      return;
    }

    if (this.suppressNotifications) {
      return;
    }

    if (!this.refresh) {
      this.manualRefreshRequested = true;
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
    this.clearStartupGrace();
    this.pendingNotificationCount = 0;
    this.manualRefreshRequested = false;
    this.refresh = null;
  }

  private startInitialRefresh() {
    if (this.disposed || this.initialRefreshStarted || !this.refresh) {
      return;
    }

    this.initialRefreshStarted = true;
    this.armStartupGrace();
    this.refresh();
  }

  private cancelFallback() {
    if (this.fallbackTimer === null) {
      return;
    }

    this.cancelRefresh(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  private armStartupGrace(delayMs = DEFAULT_STARTUP_GRACE_MS) {
    this.clearStartupGrace();
    this.suppressNotifications = true;
    this.startupGraceTimer = this.scheduleRefresh(() => {
      this.startupGraceTimer = null;
      this.suppressNotifications = false;
    }, delayMs);
  }

  private clearStartupGrace() {
    this.suppressNotifications = false;
    if (this.startupGraceTimer === null) {
      return;
    }

    this.cancelRefresh(this.startupGraceTimer);
    this.startupGraceTimer = null;
  }
}
