import { describe, expect, it } from 'vitest';

import { messageMatchesSearch, parseSearchQuery } from './messageSearch';

describe('message search (G11)', () => {
  it('splits a query into lower-cased terms', () => {
    expect(parseSearchQuery('  Hello   World ')).toEqual(['hello', 'world']);
    expect(parseSearchQuery('')).toEqual([]);
    expect(parseSearchQuery(null)).toEqual([]);
  });

  it('matches when every term is in the body or the sender label', () => {
    const terms = parseSearchQuery('release notes');
    expect(messageMatchesSearch(terms, 'The RELEASE has notes attached', 'Seed2')).toBe(true);
    expect(messageMatchesSearch(terms, 'The release is out', 'Notes Bot')).toBe(true);
    expect(messageMatchesSearch(terms, 'The release is out', 'Seed2')).toBe(false);
    expect(messageMatchesSearch([], 'anything', 'anyone')).toBe(true);
    expect(messageMatchesSearch(parseSearchQuery('@alice'), 'ping @alice', 'bob')).toBe(true);
  });
});
