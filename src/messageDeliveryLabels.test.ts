import { describe, expect, it } from 'vitest';
import { getMessageDeliveryLabel, getRevisionDeliveryLabel } from './MessageList';
import type { TranslateFunction } from './i18n';
import type { PendingRevision } from './pendingSends';

const t = ((key: string) => key) as TranslateFunction;

function ambiguousRevision(kind: 'delete' | 'edit'): PendingRevision {
  return {
    accountAddress: 'Qaccount',
    chatKey: 'group:7',
    chatReference: 'original-signature',
    delivery: { phase: 'ambiguous', updatedAt: 1 },
    kind,
    localId: `local-${kind}`,
    resolvedSignature: 'possibly-broadcast',
    status: 'failed',
    target: { groupId: 7, kind: 'group', network: 'qortium' },
    text: 'payload',
  };
}

describe('ambiguous delivery labels', () => {
  it('uses the explicit outcome-unknown warning for messages', () => {
    expect(getMessageDeliveryLabel('ambiguous', t)).toBe('message.delivery.ambiguous');
  });

  it.each(['edit', 'delete'] as const)('uses the same duplicate-risk warning for %s revisions', (kind) => {
    expect(getRevisionDeliveryLabel(ambiguousRevision(kind), t)).toBe('message.delivery.ambiguous');
  });
});
