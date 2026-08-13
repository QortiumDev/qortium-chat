import { describe, expect, it } from 'vitest';
import { LatestRequestGuard } from './latestRequest';

describe('LatestRequestGuard', () => {
  it('accepts the newest request and invalidates every older request', () => {
    const guard = new LatestRequestGuard();
    const first = guard.begin();

    expect(guard.isLatest(first)).toBe(true);

    const second = guard.begin();

    expect(guard.isLatest(first)).toBe(false);
    expect(guard.isLatest(second)).toBe(true);
  });
});
