import { describe, expect, it } from 'vitest';
import {
  BRIDGE_ERROR_CODES,
  getBridgeErrorCode,
  getBridgeErrorDetails,
  isDefiniteChatMutationRejection,
  isHomeUnlockStateRace,
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

  it('classifies structured pre-broadcast chat failures as definite rejections', () => {
    expect(isDefiniteChatMutationRejection({ code: 'ACCOUNT_LOCKED' })).toBe(true);
    expect(isDefiniteChatMutationRejection({ code: 'ROUTE_UNAVAILABLE' })).toBe(true);
    expect(isDefiniteChatMutationRejection({ code: 'HOME_BRIDGE_ERROR', outcome: 'rejected' })).toBe(true);
    expect(isDefiniteChatMutationRejection(
      new Error('No private-group key is available. Request or rotate the key first.'),
    )).toBe(true);
    expect(isDefiniteChatMutationRejection(
      new Error('No Qortal private-group key bundle is available to this account.'),
    )).toBe(true);
  });

  it('keeps true unknown, reconciliation, generic, and transport failures non-retryable', () => {
    expect(isDefiniteChatMutationRejection({ code: 'ACCOUNT_LOCKED', outcome: 'unknown' })).toBe(false);
    expect(isDefiniteChatMutationRejection({
      code: 'PENDING_TRANSACTION_RECONCILIATION_REQUIRED',
      outcome: 'rejected',
    })).toBe(false);
    expect(isDefiniteChatMutationRejection({ code: 'HOME_BRIDGE_ERROR' })).toBe(false);
    expect(isDefiniteChatMutationRejection(new Error('Request timed out.'))).toBe(false);
  });

  it('recognizes only the structured Home unlock/account-state race', () => {
    expect(isHomeUnlockStateRace({
      action: 'UNLOCK_SELECTED_ACCOUNT',
      code: 'ACCOUNT_LOCKED',
    })).toBe(true);
    expect(isHomeUnlockStateRace({ action: 'SEND_CHAT_MESSAGE', code: 'ACCOUNT_LOCKED' })).toBe(false);
    expect(isHomeUnlockStateRace({ action: 'UNLOCK_SELECTED_ACCOUNT', code: 'USER_CANCELLED' })).toBe(false);
    expect(isHomeUnlockStateRace(new Error('The account was not unlocked.'))).toBe(false);
  });
});
