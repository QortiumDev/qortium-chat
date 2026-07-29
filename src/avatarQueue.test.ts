import { describe, expect, it } from 'vitest';
import { AvatarTaskQueue } from './avatarQueue';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe('AvatarTaskQueue', () => {
  it('never exceeds its concurrency bound', async () => {
    const queue = new AvatarTaskQueue(2);
    const releases = Array.from({ length: 4 }, deferred);
    let active = 0;
    let maxActive = 0;
    const tasks = releases.map((release) =>
      queue.enqueue(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await release.promise;
        active -= 1;
      }),
    );

    await Promise.resolve();
    expect(active).toBe(2);
    releases[0].resolve();
    releases[1].resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(active).toBe(2);
    releases[2].resolve();
    releases[3].resolve();
    await Promise.all(tasks);
    expect(maxActive).toBe(2);
  });

  it('starts a newly queued higher-priority task before queued background work', async () => {
    const queue = new AvatarTaskQueue(1);
    const first = deferred();
    const order: string[] = [];
    const firstTask = queue.enqueue(async () => {
      order.push('active');
      await first.promise;
    }, 10);
    const background = queue.enqueue(() => {
      order.push('background');
    }, 20);
    const foreground = queue.enqueue(() => {
      order.push('foreground');
    }, 0);

    await Promise.resolve();
    first.resolve();
    await Promise.all([firstTask, background, foreground]);

    expect(order).toEqual(['active', 'foreground', 'background']);
  });
});
