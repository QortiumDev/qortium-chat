import { describe, expect, it } from 'vitest';
import { estimateComposerByteBudget, PUBLIC_CHAT_MAX_BYTES } from './composerByteBudget';

describe('composer byte budget (G10)', () => {
  it('measures a Qortium open-group draft on the plain wire text', () => {
    const budget = estimateComposerByteBudget({ draft: 'hello', kind: 'group', network: 'qortium' });

    expect(budget).toMatchObject({ bytes: 5, max: PUBLIC_CHAT_MAX_BYTES, overLimit: false, visible: false });
  });

  it('includes the reply envelope and the Qortal v3 document in the estimate', () => {
    const plain = estimateComposerByteBudget({ draft: 'hi', kind: 'group', network: 'qortal' });
    const reply = estimateComposerByteBudget({ draft: 'hi', kind: 'group', network: 'qortal', repliedTo: 'sig' });

    expect(plain.bytes).toBeGreaterThan(100);
    expect(reply.bytes).toBeGreaterThan(plain.bytes);
    expect(estimateComposerByteBudget({ draft: 'hi', kind: 'direct', network: 'qortal' }).max).toBe(3984);
  });

  it('shows the counter from half the cap and flags an over-limit draft', () => {
    const half = estimateComposerByteBudget({ draft: 'x'.repeat(2000), kind: 'group', network: 'qortium' });
    const over = estimateComposerByteBudget({ draft: 'x'.repeat(4001), kind: 'group', network: 'qortium' });
    const overDirect = estimateComposerByteBudget({ draft: 'x'.repeat(3985), kind: 'direct', network: 'qortium' });

    expect(half.visible).toBe(true);
    expect(half.overLimit).toBe(false);
    expect(over).toMatchObject({ overLimit: true, visible: true });
    expect(overDirect.overLimit).toBe(true);
  });

  it('counts multi-byte characters as bytes and never throws on an empty draft', () => {
    expect(estimateComposerByteBudget({ draft: '😀', kind: 'direct', network: 'qortium' }).bytes).toBe(4);
    expect(estimateComposerByteBudget({ draft: '', kind: 'direct', network: 'qortal' }).visible).toBe(false);
  });
});
