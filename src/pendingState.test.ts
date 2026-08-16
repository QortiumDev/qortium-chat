import { describe, expect, it, vi } from 'vitest';
import { updatePendingStateRef } from './pendingState';

describe('updatePendingStateRef', () => {
  it('publishes an enqueued entry synchronously for a detached runner', () => {
    const reference = { current: [{ id: 'existing' }] };
    const detachedRunner = vi.fn(() => reference.current.find((entry) => entry.id === 'new'));

    const next = updatePendingStateRef(reference, (current) => [...current, { id: 'new' }]);

    expect(reference.current).toBe(next);
    expect(detachedRunner()).toEqual({ id: 'new' });
  });

  it('uses the current ref for sequential updates', () => {
    const reference = { current: [] as Array<{ id: string }> };

    updatePendingStateRef(reference, (current) => [...current, { id: 'first' }]);
    updatePendingStateRef(reference, (current) => [...current, { id: 'second' }]);

    expect(reference.current.map((entry) => entry.id)).toEqual(['first', 'second']);
  });
});
