import { describe, expect, it } from 'vitest';
import { isHomeV2Embedded } from './hostContext';

describe('isHomeV2Embedded', () => {
  it('recognizes the explicit Home v2 bridge contract', () => {
    expect(isHomeV2Embedded('?homeV2Bridge=1')).toBe(true);
    expect(isHomeV2Embedded('foo=bar&homeV2Bridge=1')).toBe(true);
  });

  it('does not infer embedded mode from unrelated or malformed values', () => {
    expect(isHomeV2Embedded('')).toBe(false);
    expect(isHomeV2Embedded('?homeV2Bridge=true')).toBe(false);
    expect(isHomeV2Embedded('?homeV2Bridge=0')).toBe(false);
    expect(isHomeV2Embedded('?other=1')).toBe(false);
  });
});
