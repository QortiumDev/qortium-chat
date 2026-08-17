import { describe, expect, it } from 'vitest';
import {
  createLocalSendId,
  createPendingRevision,
  createPendingSend,
  confirmPendingSend,
  expirePendingSends,
  failPendingRevision,
  failPendingSend,
  getPendingSignatureIdentity,
  hasActiveDuplicateSend,
  indexPendingRevisionsByTarget,
  mergeOptimisticMessages,
  prunePendingRevisions,
  prunePendingSends,
  resolvePendingRevision,
  resolvePendingSend,
  retryPendingRevision,
  retryPendingSend,
  type PendingRevision,
  type PendingSend,
} from './pendingSends';
import type { ChatMessage } from './types';

function confirmedMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    data: 'body',
    encoding: 'BASE64',
    isEncrypted: false,
    isText: true,
    sender: 'Qsender',
    signature: 'confirmed-sig',
    timestamp: 100,
    txGroupId: 7,
    ...overrides,
  };
}

function pendingMessage(overrides: Partial<PendingSend> = {}): PendingSend {
  return createPendingSend({
    chatKey: 'group:7',
    kind: 'message',
    localId: 'pending-1',
    sender: 'Qsender',
    target: { groupId: 7, kind: 'group' },
    text: 'hello',
    timestamp: 100,
    txGroupId: 7,
    ...overrides,
  });
}

describe('createLocalSendId', () => {
  it('returns a fresh, distinct id on every call', () => {
    const first = createLocalSendId();
    const second = createLocalSendId();

    expect(first).not.toEqual(second);
  });
});

describe('createPendingSend', () => {
  it('builds an optimistic echo that decodes to the exact sent text, with no signature yet', () => {
    const pending = pendingMessage();

    expect(pending.status).toBe('sending');
    expect(pending.delivery).toEqual({ phase: 'pending', updatedAt: 100 });
    expect(pending.resolvedSignature).toBeNull();
    expect(pending.message.signature).toBeNull();
    expect(pending.message.sendState).toBe('sending');
    expect(pending.message.sendLocalId).toBe('pending-1');
    // decodeChatMessage's counterpart (decodeBase64) is covered in chatText.test.ts.
    expect(pending.message.data).toBe(btoa(String.fromCharCode(...new TextEncoder().encode('hello'))));
  });
});

describe('resolvePendingSend / failPendingSend / retryPendingSend', () => {
  it('resolvePendingSend records the bridge-returned signature but keeps status sending', () => {
    const resolved = resolvePendingSend(pendingMessage(), { signature: 'real-sig' }, 200);

    expect(resolved.resolvedSignature).toBe('real-sig');
    expect(resolved.status).toBe('sending');
    expect(resolved.delivery).toEqual({ phase: 'broadcast', updatedAt: 200 });
  });

  it('failPendingSend flips status and the echo message to failed, keeping the error', () => {
    const failed = failPendingSend(pendingMessage(), 'Unable to send chat message.', 200);

    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('Unable to send chat message.');
    expect(failed.message.sendState).toBe('failed');
    expect(failed.delivery).toEqual({ phase: 'rejected', updatedAt: 200 });
  });

  it('retryPendingSend re-arms a failed entry back to sending, clearing error and resolvedSignature', () => {
    const failed = failPendingSend(resolvePendingSend(pendingMessage(), { signature: 'stale-sig' }), 'boom');
    const retried = retryPendingSend(failed, 500);

    expect(retried.status).toBe('sending');
    expect(retried.error).toBeUndefined();
    expect(retried.resolvedSignature).toBeNull();
    expect(retried.message.sendState).toBe('sending');
    expect(retried.message.timestamp).toBe(500);
    expect(retried.delivery).toEqual({ phase: 'pending', updatedAt: 500 });
    // Same text/target — a retry re-invokes the identical send.
    expect(retried.text).toBe(failed.text);
    expect(retried.target).toEqual(failed.target);
  });

  it('models confirmation and expiry as explicit terminal delivery phases', () => {
    const broadcast = resolvePendingSend(pendingMessage(), { signature: 'real-sig' }, 200);
    const confirmed = confirmPendingSend(broadcast, 300);

    expect(confirmed.delivery).toEqual({ phase: 'confirmed', updatedAt: 300 });

    const expired = expirePendingSends([broadcast], 1_500, 1_000, 'Timed out.')[0];

    expect(expired.delivery).toEqual({ phase: 'expired', updatedAt: 1_500 });
    expect(expired.status).toBe('failed');
    expect(expired.message.sendState).toBe('failed');
    expect(expired.error).toBe('Timed out.');
    expect(expirePendingSends([pendingMessage()], 10_000, 1_000, 'Timed out.')[0].delivery.phase).toBe(
      'pending',
    );
  });
});

describe('duplicate prevention', () => {
  it('blocks the same target/body/reference while pending or broadcast, but not after rejection', () => {
    const candidate = pendingMessage();

    expect(hasActiveDuplicateSend([candidate], candidate)).toBe(true);
    expect(hasActiveDuplicateSend([resolvePendingSend(candidate, { signature: 'sig' })], candidate)).toBe(true);
    expect(hasActiveDuplicateSend([failPendingSend(candidate, 'nope')], candidate)).toBe(false);
  });

  it('keeps target network and reference in duplicate identity', () => {
    const qortium = pendingMessage();
    const qortal = pendingMessage({
      chatKey: 'qortal:group:7',
      target: { groupId: 7, kind: 'group', network: 'qortal' },
    });
    const reply = pendingMessage({ chatReference: 'reply-sig' });

    expect(hasActiveDuplicateSend([qortium], qortal)).toBe(false);
    expect(hasActiveDuplicateSend([qortium], reply)).toBe(false);
  });
});

describe('mergeOptimisticMessages', () => {
  it('inserts the optimistic echo when it has no confirmed counterpart yet', () => {
    const pending = pendingMessage();
    const merged = mergeOptimisticMessages([], [pending]);

    expect(merged).toEqual([pending.message]);
  });

  it('drops the echo once its resolved signature appears in the confirmed list (no duplicate)', () => {
    const resolved = resolvePendingSend(pendingMessage(), { signature: 'real-sig' });
    const confirmed = [confirmedMessage({ signature: 'real-sig', timestamp: 100 })];

    expect(mergeOptimisticMessages(confirmed, [resolved])).toEqual(confirmed);
  });

  it('keeps a still-unresolved echo even when unrelated confirmed messages exist', () => {
    const pending = pendingMessage();
    const confirmed = [confirmedMessage({ signature: 'other-sig', timestamp: 50 })];

    expect(mergeOptimisticMessages(confirmed, [pending])).toEqual(
      [...confirmed, pending.message].sort((first, second) => first.timestamp - second.timestamp),
    );
  });

  it('keeps a failed message-kind echo visible (retry affordance, not silently gone)', () => {
    const failed = failPendingSend(pendingMessage(), 'boom');

    expect(mergeOptimisticMessages([], [failed])).toEqual([failed.message]);
  });

  it('drops a failed reaction-kind echo (reverts the chip instead of leaving a stray entry)', () => {
    const failed = failPendingSend(pendingMessage({ kind: 'reaction' }), 'boom');

    expect(mergeOptimisticMessages([], [failed])).toEqual([]);
  });

  it('returns the confirmed array reference unchanged when there is nothing to overlay', () => {
    const confirmed = [confirmedMessage()];

    expect(mergeOptimisticMessages(confirmed, [])).toBe(confirmed);
  });
});

describe('prunePendingSends', () => {
  it('removes entries whose resolved signature is now confirmed', () => {
    const resolved = resolvePendingSend(pendingMessage(), { signature: 'real-sig' });
    const stillPending = pendingMessage({ localId: 'pending-2' });

    const next = prunePendingSends(
      [resolved, stillPending],
      new Set([getPendingSignatureIdentity('qortium', 'real-sig')]),
    );

    expect(next).toEqual([stillPending]);
  });

  it('returns the same array reference when nothing was pruned', () => {
    const pending = [pendingMessage()];

    expect(prunePendingSends(pending, new Set())).toBe(pending);
  });

  // Chat 2.0 slice 2: two independent chains draw signatures from unrelated
  // namespaces, so identity must be (network, signature), not a bare
  // signature — otherwise a Qortal send sharing a raw signature string with
  // something confirmed on Qortium (or vice versa) would be wrongly dropped
  // as "already confirmed" while it is still genuinely in flight.
  it('does not drop a still-pending Qortal send just because the SAME raw signature is confirmed on Qortium', () => {
    const qortalPending = resolvePendingSend(
      pendingMessage({ chatKey: 'qortal:group:7', target: { groupId: 7, kind: 'group', network: 'qortal' } }),
      { signature: 'shared-sig' },
    );
    const pending = [qortalPending];
    const qortiumConfirmedSignatures = new Set([getPendingSignatureIdentity('qortium', 'shared-sig')]);

    // Nothing pruned — the (network, signature) identities don't match — so
    // the same array reference comes back (same convention as the "returns
    // the same array reference when nothing was pruned" case above).
    expect(prunePendingSends(pending, qortiumConfirmedSignatures)).toBe(pending);
  });

  it('does drop a Qortal send once ITS OWN network is confirmed for that signature', () => {
    const qortalPending = resolvePendingSend(
      pendingMessage({ chatKey: 'qortal:group:7', target: { groupId: 7, kind: 'group', network: 'qortal' } }),
      { signature: 'shared-sig' },
    );

    const next = prunePendingSends([qortalPending], new Set([getPendingSignatureIdentity('qortal', 'shared-sig')]));

    expect(next).toEqual([]);
  });
});

function pendingRevision(overrides: Partial<Parameters<typeof createPendingRevision>[0]> = {}): PendingRevision {
  return createPendingRevision({
    chatKey: 'group:7',
    chatReference: 'original-sig',
    kind: 'edit',
    localId: 'pending-revision-1',
    target: { groupId: 7, kind: 'group' },
    text: 'edited body',
    ...overrides,
  });
}

describe('pending revisions (edit/delete side channel)', () => {
  it('starts sending with no resolved signature', () => {
    const revision = pendingRevision();

    expect(revision.status).toBe('sending');
    expect(revision.resolvedSignature).toBeNull();
  });

  it('resolvePendingRevision records the signature without changing status', () => {
    const resolved = resolvePendingRevision(pendingRevision(), { signature: 'revision-sig' });

    expect(resolved.resolvedSignature).toBe('revision-sig');
    expect(resolved.status).toBe('sending');
  });

  it('failPendingRevision marks it failed with the error retained', () => {
    const failed = failPendingRevision(pendingRevision(), "Couldn't save edit.");

    expect(failed.status).toBe('failed');
    expect(failed.error).toBe("Couldn't save edit.");
  });

  it('retryPendingRevision re-arms a failed revision to sending', () => {
    const failed = failPendingRevision(pendingRevision(), 'boom');
    const retried = retryPendingRevision(failed);

    expect(retried.status).toBe('sending');
    expect(retried.error).toBeUndefined();
    expect(retried.resolvedSignature).toBeNull();
  });

  it('prunePendingRevisions drops entries confirmed by signature, keeping array identity otherwise', () => {
    const resolved = resolvePendingRevision(pendingRevision(), { signature: 'revision-sig' });

    expect(
      prunePendingRevisions([resolved], new Set([getPendingSignatureIdentity('qortium', 'revision-sig')])),
    ).toEqual([]);

    const stillPending = [pendingRevision()];

    expect(prunePendingRevisions(stillPending, new Set())).toBe(stillPending);
  });

  it('indexPendingRevisionsByTarget maps by target signature, scoped to one chat', () => {
    const edit = pendingRevision({ chatKey: 'group:7', chatReference: 'sig-a' });
    const otherChat = pendingRevision({ chatKey: 'group:9', chatReference: 'sig-b', localId: 'pending-revision-2' });

    const index = indexPendingRevisionsByTarget([edit, otherChat], 'group:7');

    expect(index.get('sig-a')).toBe(edit);
    expect(index.has('sig-b')).toBe(false);
  });
});
