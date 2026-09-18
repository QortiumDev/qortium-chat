import type { SendDeliveryPhase } from './pendingSends';

/**
 * 2.0.34: a send's only confirmation input is the open conversation's
 * transcript (see the reconcile effect in App.tsx). On the websocket transport
 * that transcript used to be fed by live frames alone — no poll, no keepalive —
 * so a socket that stayed open but stopped delivering (Core's live-push gate
 * fails closed and never retries; a half-dead TCP session never fires
 * `close`) left a just-sent message "Sending…" until the 120 s expiry, while
 * re-opening the group reconciled it instantly. These helpers drive the
 * safety net that now runs beside the socket: a keepalive ping (Core answers
 * "pong") and a quiet REST reload whose cadence tightens while this chat has
 * a broadcast still awaiting its confirmed row.
 */
export const WS_KEEPALIVE_MS = 20000;
export const WS_SAFETY_POLL_IDLE_MS = 30000;
export const WS_SAFETY_POLL_AWAITING_MS = 5000;

type DeliveryTracked = {
  readonly chatKey: string;
  readonly delivery: { readonly phase: SendDeliveryPhase };
};

/** True while any optimistic entry for `chatKey` was broadcast and is still waiting for its confirmed row. */
export function hasBroadcastAwaitingConfirmation(entries: readonly DeliveryTracked[], chatKey: string): boolean {
  return entries.some((entry) => entry.chatKey === chatKey && entry.delivery.phase === 'broadcast');
}

/** Cadence of the quiet safety-net reload; null while the tab is hidden (the socket's reconnect also waits for visibility). */
export function getSafetyPollIntervalMs(input: { awaitingConfirmation: boolean; hidden: boolean }): number | null {
  if (input.hidden) {
    return null;
  }

  return input.awaitingConfirmation ? WS_SAFETY_POLL_AWAITING_MS : WS_SAFETY_POLL_IDLE_MS;
}

/** Whether this tick should send a keepalive ping on an open socket. */
export function shouldSendKeepalive(input: { hidden: boolean; lastPingAt: number; now: number; socketOpen: boolean }): boolean {
  return input.socketOpen && !input.hidden && input.now - input.lastPingAt >= WS_KEEPALIVE_MS;
}
