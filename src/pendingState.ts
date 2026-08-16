export type PendingStateRef<T> = {
  current: T[];
};

/**
 * Applies a pending-entry update to the synchronous ref before React is asked
 * to render it. Detached send runners start in the same call stack as the
 * enqueue, so waiting for a setState updater can otherwise leave them reading
 * the previous ref and abandoning a message in `Sending...` forever.
 */
export function updatePendingStateRef<T>(
  reference: PendingStateRef<T>,
  updater: (current: T[]) => T[],
) {
  const next = updater(reference.current);

  reference.current = next;

  return next;
}
