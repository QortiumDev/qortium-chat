import type { ChatNetwork } from './types';

// O4 (2026-09-13 parity review, cell 3): a Qortal group message sent seconds
// after the account's JOIN_GROUP confirmed was accepted by the load-balanced
// public gateway and then vanished — a backend that had not yet applied the
// join block rejected the CHAT on relay. Holding group sends for about one
// block after a join confirmation lets every backend catch up. Qortal only:
// Qortium sends after a join were fine on every route (cells 1/2), and its
// public nodes are addressed individually rather than through a balancer.

export const JOIN_SEND_HOLD_MS = 75_000;

export type JoinSendHolds = Map<string, number>;

function getKey(network: ChatNetwork, groupId: number) {
  return `${network}:${groupId}`;
}

export function recordJoinSendHold(holds: JoinSendHolds, network: ChatNetwork, groupId: number, now = Date.now()) {
  if (network !== 'qortal') return;
  holds.set(getKey(network, groupId), now + JOIN_SEND_HOLD_MS);
}

// Milliseconds a group send should still wait, 0 when no hold applies.
// Expired holds are dropped on lookup so the map never grows.
export function getJoinSendHoldMs(holds: JoinSendHolds, network: ChatNetwork, groupId: number, now = Date.now()) {
  const key = getKey(network, groupId);
  const until = holds.get(key);
  if (until === undefined) return 0;
  if (until <= now) {
    holds.delete(key);
    return 0;
  }
  return until - now;
}
