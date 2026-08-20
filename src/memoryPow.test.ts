import { describe, expect, it } from 'vitest';

import { compute2, POW_BUFFER_WORDS, verify2 } from './memoryPow';

describe('General Chat memory proof-of-work', () => {
  it('matches the Core difficulty-8 known-answer vector at the production buffer size', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array([0xaa, 0xbb, 0xcc]));
    const seed = new Uint8Array(digest);

    expect(POW_BUFFER_WORDS).toBe(1_048_576);
    const quickNonce = compute2(seed, 8, 8192);

    expect(verify2(seed, 8, quickNonce, 8192)).toBe(true);
    expect(verify2(seed, 8, 326)).toBe(true);
    expect(verify2(seed, 8, 325)).toBe(false);
  });
});
