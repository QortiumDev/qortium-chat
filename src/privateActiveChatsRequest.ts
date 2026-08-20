import type { ActiveChats, ChatNetwork, PrivateGroupActiveChatEntry } from './types';

export type PrivateActiveChatsSnapshot = {
  direct: NonNullable<ActiveChats['direct']> | null;
  groups: PrivateGroupActiveChatEntry[];
};

type PrivateActiveChatsRequest = {
  accountAddress: string;
  canReadDirect: boolean;
  canReadGroups: boolean;
  loadDirect: () => Promise<NonNullable<ActiveChats['direct']>>;
  loadGroups: () => Promise<PrivateGroupActiveChatEntry[]>;
  network: ChatNetwork;
};

type InFlightRequest = {
  generation: number;
  network: ChatNetwork;
  promise: Promise<PrivateActiveChatsSnapshot>;
};

/**
 * Shares one permissioned active-chat read sequence per network/account.
 * Several refresh triggers can overlap during startup or after a send; without
 * this coordinator, each trigger can queue its own native permission dialog
 * before Home has recorded the first decision.
 */
export class PrivateActiveChatsRequestCoordinator {
  private readonly generations: Record<ChatNetwork, number> = { qortal: 0, qortium: 0 };
  private readonly requests = new Map<string, InFlightRequest>();

  request({
    accountAddress,
    canReadDirect,
    canReadGroups,
    loadDirect,
    loadGroups,
    network,
  }: PrivateActiveChatsRequest): Promise<PrivateActiveChatsSnapshot> {
    const generation = this.generations[network];
    const key = JSON.stringify([network, accountAddress, canReadDirect, canReadGroups]);
    const current = this.requests.get(key);

    if (current?.generation === generation) {
      return current.promise;
    }

    const promise = (async () => ({
      direct: canReadDirect ? await loadDirect() : null,
      // Keep these permissioned reads sequential. That presents at most one
      // new native decision at a time when neither action has a tab grant yet.
      groups: canReadGroups ? await loadGroups() : [],
    }))();
    const request = { generation, network, promise };

    this.requests.set(key, request);
    void promise.then(
      () => this.deleteIfCurrent(key, request),
      () => this.deleteIfCurrent(key, request),
    );

    return promise;
  }

  /** Prevent a changed account/route context from joining an older request. */
  invalidate(network: ChatNetwork) {
    this.generations[network] += 1;

    for (const [key, request] of this.requests) {
      if (request.network === network) {
        this.requests.delete(key);
      }
    }
  }

  private deleteIfCurrent(key: string, request: InFlightRequest) {
    if (this.requests.get(key) === request) {
      this.requests.delete(key);
    }
  }
}
