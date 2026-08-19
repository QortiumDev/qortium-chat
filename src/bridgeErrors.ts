// Home 2's serialized bridge errors carry a structured `code` (+ `network`,
// `action`, `retryable`, `outcome`, `routeRevision`, `target`) alongside the
// plain `message` an Error already has (review/schemas-home2-actions.md
// "Serialized bridge errors"). These helpers read that structure defensively
// — a legacy host's plain Error (no extra properties) or an unrelated thrown
// value both resolve to nulls rather than throwing here.
//
// No i18n wiring lives here; mapping a code to a localized banner string is
// item C's job (App.tsx's getBridgeErrorMessage / getAccountMessage).
import type { ChatNetwork } from './types';

export const BRIDGE_ERROR_CODES = [
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
] as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

type BridgeErrorLike = {
  action?: unknown;
  code?: unknown;
  network?: unknown;
  outcome?: unknown;
  retryable?: unknown;
};

function readErrorProperties(error: unknown): BridgeErrorLike | null {
  // Both a thrown `Error` with extra own properties (Electron IPC serializes
  // Error subclasses this way) and a plain `{ code, ... }` object read the
  // same: only `typeof error === 'object'` is required, not `instanceof Error`.
  return error && typeof error === 'object' ? (error as BridgeErrorLike) : null;
}

export function getBridgeErrorCode(error: unknown): string | null {
  const record = readErrorProperties(error);

  return record && typeof record.code === 'string' && record.code ? record.code : null;
}

export type BridgeErrorDetails = {
  action: string | null;
  code: string | null;
  network: ChatNetwork | null;
  outcome: 'rejected' | 'unknown' | null;
  retryable: boolean | null;
};

export function getBridgeErrorDetails(error: unknown): BridgeErrorDetails {
  const record = readErrorProperties(error);

  return {
    action: record && typeof record.action === 'string' && record.action ? record.action : null,
    code: getBridgeErrorCode(error),
    network: record && (record.network === 'qortium' || record.network === 'qortal') ? record.network : null,
    outcome: record && (record.outcome === 'rejected' || record.outcome === 'unknown') ? record.outcome : null,
    retryable: record && typeof record.retryable === 'boolean' ? record.retryable : null,
  };
}

export function isPendingReconciliationRequired(error: unknown): boolean {
  return getBridgeErrorCode(error) === 'PENDING_TRANSACTION_RECONCILIATION_REQUIRED';
}
