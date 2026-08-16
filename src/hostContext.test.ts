import { describe, expect, it } from 'vitest';
import { isHomeV2AppTab } from './hostContext';

describe('isHomeV2AppTab', () => {
  it('recognizes the explicit Home v2 app-tab bridge contract', () => {
    expect(isHomeV2AppTab('?homeV2Bridge=1')).toBe(true);
    expect(isHomeV2AppTab('foo=bar&homeV2Bridge=1')).toBe(true);
  });

  it('does not infer Home app-tab mode from unrelated or malformed values', () => {
    expect(isHomeV2AppTab('')).toBe(false);
    expect(isHomeV2AppTab('?homeV2Bridge=true')).toBe(false);
    expect(isHomeV2AppTab('?homeV2Bridge=0')).toBe(false);
    expect(isHomeV2AppTab('?other=1')).toBe(false);
  });
});
