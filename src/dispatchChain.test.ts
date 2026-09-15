import { describe, expect, it } from 'vitest';
import { createDispatchChain } from './dispatchChain';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('dispatch chain', () => {
  it('runs one task at a time per network, in order, and isolates failures', async () => {
    const chain = createDispatchChain();
    const order: string[] = [];
    let active = 0;
    let peak = 0;
    const task = (name: string, ms: number, fail = false) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      order.push(`start:${name}`);
      await wait(ms);
      active -= 1;
      order.push(`end:${name}`);
      if (fail) throw new Error(name);
      return name;
    };
    const a = chain.run('qortium', task('a', 20, true));
    const b = chain.run('qortium', task('b', 5));
    const c = chain.run('qortium', task('c', 5));
    await expect(a).rejects.toThrow('a');
    expect(await b).toBe('b');
    expect(await c).toBe('c');
    expect(peak).toBe(1);
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  });

  it('keeps the two networks independent', async () => {
    const chain = createDispatchChain();
    let release!: () => void;
    const blocked = chain.run('qortium', () => new Promise<string>((resolve) => { release = () => resolve('slow'); }));
    expect(await chain.run('qortal', async () => 'fast')).toBe('fast');
    release();
    expect(await blocked).toBe('slow');
  });
});
