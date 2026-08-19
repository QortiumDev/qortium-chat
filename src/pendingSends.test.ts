import { describe, expect, it } from 'vitest';
import {
  canRetryPendingDelivery,
  createLocalSendId,
  createPendingRevision,
  createPendingSend,
  confirmPendingSend,
  expirePendingRevisions,
  expirePendingSends,
  failPendingRevisionAmbiguously,
  failPendingRevision,
  failPendingSendAmbiguously,
  failPendingSend,
  getPendingSignatureIdentity,
  hasActiveDuplicateSend,
  indexPendingRevisionsByTarget,
  mergeOptimisticMessages,
  prunePendingRevisions,
  prunePendingSends,
  retainPendingForNetworkAccount,
  resolvePendingRevision,
  resolvePendingRevisionAmbiguously,
  resolvePendingSend,
  resolvePendingSendAmbiguously,
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
    accountAddress: 'Qaccount',
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

  it('carries the raw reaction content/contentState through, for App.tsx to dispatch via sendChatReaction', () => {
    const reaction = pendingMessage({ chatReference: 'target-sig', content: '👍', contentState: true, kind: 'reaction' });

    expect(reaction.content).toBe('👍');
    expect(reaction.contentState).toBe(true);

    // A retry re-arms the same entry without losing that raw content/state.
    const failed = failPendingSend(reaction, 'boom');
    const retried = retryPendingSend(failed, 500);

    expect(retried.content).toBe('👍');
    expect(retried.contentState).toBe(true);
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

  it('only retries a proven bridge rejection, never an ambiguous expiry', () => {
    const rejected = failPendingSend(pendingMessage(), 'Bridge rejected the request.', 200);
    const broadcast = resolvePendingSend(pendingMessage(), { signature: 'maybe-landed' }, 200);
    const expired = expirePendingSends([broadcast], 1_500, 1_000, 'Confirmation timed out.')[0];

    expect(canRetryPendingDelivery(rejected.delivery)).toBe(true);
    expect(canRetryPendingDelivery(expired.delivery)).toBe(false);
    expect(retryPendingSend(expired, 2_000)).toBe(expired);
  });

  it('keeps a transport-ambiguous failure visible and duplicate-blocking without allowing retry', () => {
    const candidate = pendingMessage();
    const ambiguous = failPendingSendAmbiguously(candidate, 'Request timed out.', 200);

    expect(ambiguous.delivery).toEqual({ phase: 'ambiguous', updatedAt: 200 });
    expect(ambiguous.status).toBe('failed');
    expect(ambiguous.message.sendState).toBe('failed');
    expect(canRetryPendingDelivery(ambiguous.delivery)).toBe(false);
    expect(hasActiveDuplicateSend([ambiguous], candidate)).toBe(true);
  });

  it('keeps an ambiguous bridge signature for reconciliation without enabling retry', () => {
    const ambiguous = resolvePendingSendAmbiguously(
      pendingMessage(),
      { signature: 'possibly-broadcast' },
      'Node response timed out.',
      200,
    );

    expect(ambiguous).toMatchObject({
      delivery: { phase: 'ambiguous', updatedAt: 200 },
      error: 'Node response timed out.',
      resolvedSignature: 'possibly-broadcast',
      status: 'failed',
    });
    expect(canRetryPendingDelivery(ambiguous.delivery)).toBe(false);
    expect(
      prunePendingSends(
        [ambiguous],
        new Set([getPendingSignatureIdentity('qortium', 'possibly-broadcast')]),
      ),
    ).toEqual([]);
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
  it('blocks the same target/body/reference while pending, broadcast, or ambiguously expired', () => {
    const candidate = pendingMessage();
    const broadcast = resolvePendingSend(candidate, { signature: 'sig' }, 200);
    const expired = expirePendingSends([broadcast], 1_500, 1_000, 'Confirmation timed out.')[0];

    expect(hasActiveDuplicateSend([candidate], candidate)).toBe(true);
    expect(hasActiveDuplicateSend([broadcast], candidate)).toBe(true);
    expect(hasActiveDuplicateSend([expired], candidate)).toBe(true);
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

  it('blocks an identical reaction dispatch while allowing a different reaction on the same message', () => {
    const thumbsUp = pendingMessage({
      chatReference: 'message-sig',
      kind: 'reaction',
      text: '{"type":"reaction","content":"👍","contentState":true}',
    });
    const heart = pendingMessage({
      chatReference: 'message-sig',
      kind: 'reaction',
      localId: 'pending-2',
      text: '{"type":"reaction","content":"❤️","contentState":true}',
    });

    expect(hasActiveDuplicateSend([thumbsUp], thumbsUp)).toBe(true);
    expect(hasActiveDuplicateSend([thumbsUp], heart)).toBe(false);
  });

  it('does not treat another account session as a duplicate send', () => {
    const firstAccount = pendingMessage({ accountAddress: 'Qaccount-one' });
    const secondAccount = pendingMessage({ accountAddress: 'Qaccount-two' });

    expect(hasActiveDuplicateSend([firstAccount], secondAccount)).toBe(false);
  });

  it('scopes Qortal duplicate detection to the Qortal sender identity', () => {
    const target = { groupId: 7, kind: 'group' as const, network: 'qortal' as const };
    const firstAccount = pendingMessage({ accountAddress: 'Qortal-one', target });
    const sameAccount = pendingMessage({ accountAddress: 'Qortal-one', localId: 'pending-2', target });
    const secondAccount = pendingMessage({ accountAddress: 'Qortal-two', localId: 'pending-3', target });

    expect(hasActiveDuplicateSend([firstAccount], sameAccount)).toBe(true);
    expect(hasActiveDuplicateSend([firstAccount], secondAccount)).toBe(false);
  });
});

describe('network account invalidation', () => {
  it('drops stale Qortal work without touching Qortium work', () => {
    const qortium = pendingMessage({ accountAddress: 'Qortium', localId: 'qortium' });
    const currentQortal = pendingMessage({
      accountAddress: 'Qortal-current',
      localId: 'qortal-current',
      target: { groupId: 7, kind: 'group', network: 'qortal' },
    });
    const staleQortal = pendingMessage({
      accountAddress: 'Qortal-stale',
      localId: 'qortal-stale',
      target: { groupId: 7, kind: 'group', network: 'qortal' },
    });

    expect(
      retainPendingForNetworkAccount(
        [qortium, currentQortal, staleQortal],
        'qortal',
        'Qortal-current',
      ).map((entry) => entry.localId),
    ).toEqual(['qortium', 'qortal-current']);
    expect(
      retainPendingForNetworkAccount([qortium, currentQortal], 'qortal', null).map(
        (entry) => entry.localId,
      ),
    ).toEqual(['qortium']);
  });

  it('drops stale Qortium work without touching Qortal work', () => {
    const currentQortium = pendingMessage({ accountAddress: 'Qortium-current', localId: 'qortium-current' });
    const staleQortium = pendingMessage({ accountAddress: 'Qortium-stale', localId: 'qortium-stale' });
    const qortal = pendingMessage({
      accountAddress: 'Qortal',
      chatKey: 'qortal:group:7',
      localId: 'qortal',
      target: { groupId: 7, kind: 'group', network: 'qortal' },
    });

    expect(
      retainPendingForNetworkAccount(
        [currentQortium, staleQortium, qortal],
        'qortium',
        'Qortium-current',
      ).map((entry) => entry.localId),
    ).toEqual(['qortium-current', 'qortal']);
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
    accountAddress: 'Qaccount',
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

  it('carries repliedTo through for a delete, for App.tsx to dispatch via sendChatDelete', () => {
    const deletion = pendingRevision({ kind: 'delete', repliedTo: 'reply-target-sig', text: '' });

    expect(deletion.repliedTo).toBe('reply-target-sig');

    // A retry re-arms the same entry without losing it.
    const retried = retryPendingRevision(failPendingRevision(deletion, 'boom'), 500);

    expect(retried.repliedTo).toBe('reply-target-sig');
  });

  it('failPendingRevision marks it failed with the error retained', () => {
    const failed = failPendingRevision(pendingRevision(), "Couldn't save edit.");

    expect(failed.status).toBe('failed');
    expect(failed.error).toBe("Couldn't save edit.");
  });

  it('marks an ambiguous revision failure non-retryable', () => {
    const failed = failPendingRevisionAmbiguously(pendingRevision(), 'Request timed out.', 200);

    expect(failed.delivery).toEqual({ phase: 'ambiguous', updatedAt: 200 });
    expect(failed.status).toBe('failed');
    expect(canRetryPendingDelivery(failed.delivery)).toBe(false);
  });

  it('keeps an ambiguous revision signature for reconciliation without enabling retry', () => {
    const ambiguous = resolvePendingRevisionAmbiguously(
      pendingRevision(),
      { signature: 'possibly-revised' },
      'Node response timed out.',
      200,
    );

    expect(ambiguous).toMatchObject({
      delivery: { phase: 'ambiguous', updatedAt: 200 },
      error: 'Node response timed out.',
      resolvedSignature: 'possibly-revised',
      status: 'failed',
    });
    expect(canRetryPendingDelivery(ambiguous.delivery)).toBe(false);
    expect(
      prunePendingRevisions(
        [ambiguous],
        new Set([getPendingSignatureIdentity('qortium', 'possibly-revised')]),
      ),
    ).toEqual([]);
  });

  it('retryPendingRevision re-arms a failed revision to sending', () => {
    const failed = failPendingRevision(pendingRevision(), 'boom');
    const retried = retryPendingRevision(failed);

    expect(retried.status).toBe('sending');
    expect(retried.error).toBeUndefined();
    expect(retried.resolvedSignature).toBeNull();
  });

  it('does not retry an edit whose accepted broadcast later expires', () => {
    const broadcast = resolvePendingRevision(pendingRevision(), { signature: 'maybe-landed' }, 200);
    const expired = expirePendingRevisions([broadcast], 1_500, 1_000, 'Confirmation timed out.')[0];

    expect(expired.delivery.phase).toBe('expired');
    expect(retryPendingRevision(expired, 2_000)).toBe(expired);
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
