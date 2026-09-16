import { describe, expect, it } from 'vitest';
import { CHAT_MESSAGE_MAX_BYTES, encodeInlineImage, INLINE_IMAGE_RESERVED_BYTES, inlineImageBudget, isInlineImageCandidate } from './inlineImage';

describe('inline image budget', () => {
  it('accepts raster image files only', () => {
    expect(isInlineImageCandidate({ type: 'image/png' })).toBe(true);
    expect(isInlineImageCandidate({ type: 'image/WEBP' })).toBe(true);
    expect(isInlineImageCandidate({ type: 'image/svg+xml' })).toBe(false);
    expect(isInlineImageCandidate({ type: 'application/pdf' })).toBe(false);
    expect(isInlineImageCandidate(null)).toBe(false);
  });

  it('leaves room for the draft envelope and Chat overhead', () => {
    expect(inlineImageBudget(CHAT_MESSAGE_MAX_BYTES, 0)).toBe(CHAT_MESSAGE_MAX_BYTES - INLINE_IMAGE_RESERVED_BYTES);
    expect(inlineImageBudget(CHAT_MESSAGE_MAX_BYTES, 3900)).toBeLessThan(0);
  });

  it('declines without touching the DOM when the budget cannot hold any preview', async () => {
    expect(await encodeInlineImage(new Blob(['not an image'], { type: 'image/png' }), 100)).toBeNull();
  });

  it('never inlines an image that does not already fit — no downscaling, no re-encoding', async () => {
    // A 1.9 MB PNG (the 2026-09-16 report) is refused on its byte length alone,
    // before any decode, so the composer takes the attachment path with the
    // ORIGINAL file. Previously it was shrunk to a ~3 KB thumbnail and sent.
    const large = new Blob([new Uint8Array(1_900_000)], { type: 'image/png' });
    expect(await encodeInlineImage(large, inlineImageBudget(CHAT_MESSAGE_MAX_BYTES, 0))).toBeNull();
    // Just over budget by base64 arithmetic: also refused.
    const budget = inlineImageBudget(CHAT_MESSAGE_MAX_BYTES, 0);
    const overBudget = new Blob([new Uint8Array(Math.ceil(budget * 3 / 4))], { type: 'image/webp' });
    expect(await encodeInlineImage(overBudget, budget)).toBeNull();
  });

  it('carries only the encodings the markup grammar accepts', async () => {
    expect(await encodeInlineImage(new Blob([new Uint8Array(100)], { type: 'image/gif' }), 4000)).toBeNull();
    expect(await encodeInlineImage(new Blob([new Uint8Array(100)], { type: 'image/bmp' }), 4000)).toBeNull();
  });
});
