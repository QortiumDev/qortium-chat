import type { ChatNetwork } from './types';

// 2.0.27: every chat mutation needs a proof-of-work that the host computes
// on ONE worker per network. Sends and revisions are therefore dispatched one
// at a time per network — a second message typed while the first is still
// computing waits its turn (its bubble stays "Sending…") instead of racing
// the host and being refused (QDN_POW_BUSY on Home builds before
// 2026-09-15). A failed predecessor never blocks the next dispatch.
export type DispatchChain = {
  run<T>(network: ChatNetwork, task: () => Promise<T>): Promise<T>;
};

export function createDispatchChain(): DispatchChain {
  const chains: Record<ChatNetwork, Promise<unknown>> = {
    qortal: Promise.resolve(),
    qortium: Promise.resolve(),
  };
  return {
    run<T>(network: ChatNetwork, task: () => Promise<T>): Promise<T> {
      const result = chains[network].then(task, task);
      chains[network] = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
