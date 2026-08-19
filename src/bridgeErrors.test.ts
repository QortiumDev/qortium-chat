import { describe, expect, it } from 'vitest';
import {
  BRIDGE_ERROR_CODES,
  getBridgeErrorCode,
  getBridgeErrorDetails,
  isPendingReconciliationRequired,
} from './bridgeErrors';

describe('bridgeErrors', () => {
  it('lists the 11 documented structured error codes', () => {
    expect(BRIDGE_ERROR_CODES).toHaveLength(11);
    expect(BRIDGE_ERROR_CODES).toEqual([
      'ACCOUNT_LOCKED',
      'HOME_BRIDGE_ERROR',
      'NODE_CAPABILITY_MISSING',
      'MISSING_GROUP_KEY',
      'MISSING_RECIPIENT_PUBLIC_KEY',
      'NOT_GROUP_MEMBER',
      'PENDING_TRANSACTION_RECONCILIATION_REQUIRED',
      'ROUTE_UNAVAILABLE',
      'STALE_CONTEXT',
      'USER_CANCELLED',
      'VALIDATION_FAILED',
    ]);
  });

  it('reads the code from an Error instance with extra own properties (Electron IPC serialization)', () => {
    const error = Object.assign(new Error('Node capability is missing.'), {
      action: 'SEND_CHAT_EDIT',
      code: 'NODE_CAPABILITY_MISSING',
      network: 'qortium',
      outcome: 'rejected',
      retryable: false,
    });

    expect(getBridgeErrorCode(error)).toBe('NODE_CAPABILITY_MISSING');
    expect(getBridgeErrorDetails(error)).toEqual({
      action: 'SEND_CHAT_EDIT',
      code: 'NODE_CAPABILITY_MISSING',
      network: 'qortium',
      outcome: 'rejected',
      retryable: false,
    });
  });

  it('reads the code from a plain object shaped like the serialized error payload', () => {
    const error = {
      action: 'JOIN_GROUP',
      code: 'ROUTE_UNAVAILABLE',
      message: 'Route unavailable.',
      network: 'qortal',
      outcome: 'unknown',
      retryable: true,
    };

    expect(getBridgeErrorCode(error)).toBe('ROUTE_UNAVAILABLE');
    expect(getBridgeErrorDetails(error)).toEqual({
      action: 'JOIN_GROUP',
      code: 'ROUTE_UNAVAILABLE',
      network: 'qortal',
      outcome: 'unknown',
      retryable: true,
    });
  });

  it('returns null for an unrelated thrown value, a plain Error, or a malformed code', () => {
    expect(getBridgeErrorCode(new Error('plain'))).toBeNull();
    expect(getBridgeErrorCode('a string was thrown')).toBeNull();
    expect(getBridgeErrorCode(null)).toBeNull();
    expect(getBridgeErrorCode(undefined)).toBeNull();
    expect(getBridgeErrorCode({ code: 42 })).toBeNull();
    expect(getBridgeErrorCode({ code: '' })).toBeNull();

    expect(getBridgeErrorDetails(new Error('plain'))).toEqual({
      action: null,
      code: null,
      network: null,
      outcome: null,
      retryable: null,
    });
  });

  it('ignores an out-of-domain network/outcome value rather than passing it through', () => {
    const error = { code: 'STALE_CONTEXT', network: 'bitcoin', outcome: 'maybe' };

    expect(getBridgeErrorDetails(error)).toEqual({
      action: null,
      code: 'STALE_CONTEXT',
      network: null,
      outcome: null,
      retryable: null,
    });
  });

  it('recognizes the pending-reconciliation code and rejects every other code', () => {
    expect(isPendingReconciliationRequired({ code: 'PENDING_TRANSACTION_RECONCILIATION_REQUIRED' })).toBe(true);
    expect(isPendingReconciliationRequired({ code: 'ROUTE_UNAVAILABLE' })).toBe(false);
    expect(isPendingReconciliationRequired(new Error('no code'))).toBe(false);
    expect(isPendingReconciliationRequired(null)).toBe(false);
  });
});
