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
});
