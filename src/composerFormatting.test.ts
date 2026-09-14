import { describe, expect, it } from 'vitest';
import { completeMention, filterMentionCandidates, findMentionQuery, wrapSelection } from './composerFormatting';

describe('wrapSelection', () => {
  it('wraps, toggles off, and places the caret inside empty markers', () => {
    expect(wrapSelection('hello world', 6, 11, 'bold')).toEqual({ end: 13, start: 8, value: 'hello **world**' });
    expect(wrapSelection('hello **world**', 8, 13, 'bold')).toEqual({ end: 11, start: 6, value: 'hello world' });
    expect(wrapSelection('say **hi**', 4, 10, 'bold')).toEqual({ end: 6, start: 4, value: 'say hi' });
    expect(wrapSelection('abc', 3, 3, 'code')).toEqual({ end: 4, start: 4, value: 'abc``' });
  });
});

describe('mentions', () => {
  const members = [
    { address: 'Qa', name: 'alice' },
    { address: 'Qb', name: 'Bob Smith' },
    { address: 'Qc', name: 'malice' },
  ];

  it('finds the query being typed and filters candidates (prefix first)', () => {
    expect(findMentionQuery('hi @al', 6)).toEqual({ query: 'al', start: 3 });
    expect(findMentionQuery('hi @', 4)).toEqual({ query: '', start: 3 });
    expect(findMentionQuery('mail me@x', 9)).toBeNull();
    expect(findMentionQuery('hi @al there', 6)).toEqual({ query: 'al', start: 3 });
    expect(filterMentionCandidates(members, 'al').map((c) => c.name)).toEqual(['alice', 'malice']);
    expect(filterMentionCandidates(members, 'bob').map((c) => c.name)).toEqual(['Bob Smith']);
    expect(filterMentionCandidates(members, '').length).toBe(3);
  });

  it('completes the mention, bracketing names with spaces', () => {
    expect(completeMention('hi @al there', 6, members[0]!)).toEqual({ end: 10, start: 10, value: 'hi @alice  there' });
    expect(completeMention('@b', 2, members[1]!)).toEqual({ end: 13, start: 13, value: '@[Bob Smith] ' });
    expect(completeMention('no query', 8, members[0]!)).toBeNull();
  });
});
