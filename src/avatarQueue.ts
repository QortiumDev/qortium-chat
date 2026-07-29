type QueuedTask<T> = {
  priority: number;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
  run: () => Promise<T> | T;
  sequence: number;
};

/**
 * Small priority-aware async pool for avatar/name work. Lower priorities run
 * first and equal-priority tasks retain insertion order.
 */
export class AvatarTaskQueue {
  private active = 0;
  private readonly concurrency: number;
  private pending: QueuedTask<unknown>[] = [];
  private sequence = 0;

  constructor(concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('Avatar task concurrency must be a positive integer.');
    }

    this.concurrency = concurrency;
  }

  enqueue<T>(run: () => Promise<T> | T, priority = 0): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        priority,
        reject,
        resolve: resolve as (value: unknown | PromiseLike<unknown>) => void,
        run,
        sequence: this.sequence,
      });
      this.sequence += 1;
      this.pending.sort(
        (first, second) =>
          first.priority - second.priority || first.sequence - second.sequence,
      );
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift() as QueuedTask<unknown>;

      this.active += 1;
      Promise.resolve()
        .then(task.run)
        .then(task.resolve, task.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}
