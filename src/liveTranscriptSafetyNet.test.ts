import { describe, expect, it } from 'vitest';
import {
  WS_KEEPALIVE_MS,
  WS_SAFETY_POLL_AWAITING_MS,
  WS_SAFETY_POLL_IDLE_MS,
  getSafetyPollIntervalMs,
  hasBroadcastAwaitingConfirmation,
  shouldSendKeepalive,
} from './liveTranscriptSafetyNet';

const entry = (chatKey: string, phase: 'ambiguous' | 'broadcast' | 'confirmed' | 'expired' | 'pending' | 'rejected') => ({
  chatKey,
  delivery: { phase },
});

describe('hasBroadcastAwaitingConfirmation', () => {
  it('is true only for a broadcast entry on the same chat', () => {
    expect(hasBroadcastAwaitingConfirmation([entry('g:1', 'broadcast')], 'g:1')).toBe(true);
    expect(hasBroadcastAwaitingConfirmation([entry('g:2', 'broadcast')], 'g:1')).toBe(false);
    expect(hasBroadcastAwaitingConfirmation([entry('g:1', 'pending'), entry('g:1', 'expired')], 'g:1')).toBe(false);
    expect(hasBroadcastAwaitingConfirmation([], 'g:1')).toBe(false);
  });
});

describe('getSafetyPollIntervalMs', () => {
  it('never polls a hidden tab', () => {
    expect(getSafetyPollIntervalMs({ awaitingConfirmation: true, hidden: true })).toBeNull();
  });

  it('tightens while a broadcast awaits its row and relaxes otherwise', () => {
    expect(getSafetyPollIntervalMs({ awaitingConfirmation: true, hidden: false })).toBe(WS_SAFETY_POLL_AWAITING_MS);
    expect(getSafetyPollIntervalMs({ awaitingConfirmation: false, hidden: false })).toBe(WS_SAFETY_POLL_IDLE_MS);
    expect(WS_SAFETY_POLL_AWAITING_MS).toBeLessThan(WS_SAFETY_POLL_IDLE_MS);
  });
});

describe('shouldSendKeepalive', () => {
  it('pings an open, visible socket once per keepalive window', () => {
    expect(shouldSendKeepalive({ hidden: false, lastPingAt: 0, now: WS_KEEPALIVE_MS, socketOpen: true })).toBe(true);
    expect(shouldSendKeepalive({ hidden: false, lastPingAt: 0, now: WS_KEEPALIVE_MS - 1, socketOpen: true })).toBe(false);
    expect(shouldSendKeepalive({ hidden: true, lastPingAt: 0, now: WS_KEEPALIVE_MS, socketOpen: true })).toBe(false);
    expect(shouldSendKeepalive({ hidden: false, lastPingAt: 0, now: WS_KEEPALIVE_MS, socketOpen: false })).toBe(false);
  });
});
