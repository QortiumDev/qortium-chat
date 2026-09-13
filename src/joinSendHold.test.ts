import { describe, expect, it } from 'vitest';
import { JOIN_SEND_HOLD_MS, getJoinSendHoldMs, recordJoinSendHold, type JoinSendHolds } from './joinSendHold';

describe('joinSendHold', () => {
  it('holds Qortal group sends for one block after a join confirmation', () => {
    const holds: JoinSendHolds = new Map();
    recordJoinSendHold(holds, 'qortal', 1091, 1000);

    expect(getJoinSendHoldMs(holds, 'qortal', 1091, 1000)).toBe(JOIN_SEND_HOLD_MS);
    expect(getJoinSendHoldMs(holds, 'qortal', 1091, 1000 + JOIN_SEND_HOLD_MS - 1)).toBe(1);
    expect(getJoinSendHoldMs(holds, 'qortal', 1091, 1000 + JOIN_SEND_HOLD_MS)).toBe(0);
    expect(holds.size).toBe(0);
  });

  it('never holds Qortium sends or other groups', () => {
    const holds: JoinSendHolds = new Map();
    recordJoinSendHold(holds, 'qortium', 7, 1000);
    recordJoinSendHold(holds, 'qortal', 7, 1000);

    expect(getJoinSendHoldMs(holds, 'qortium', 7, 1000)).toBe(0);
    expect(getJoinSendHoldMs(holds, 'qortal', 8, 1000)).toBe(0);
    expect(getJoinSendHoldMs(holds, 'qortal', 7, 1000)).toBe(JOIN_SEND_HOLD_MS);
  });
});
