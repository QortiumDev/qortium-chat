// 2.0.19 (G1/G1b) composer helpers: wrap a textarea selection in a rich-text
// marker, and find/complete an `@mention` being typed. Pure so the composer
// behaviour is unit-testable without a DOM.
import { escapeRichText } from './richText';

export type ComposerMark = 'bold' | 'code' | 'italic' | 'strike';

export const COMPOSER_MARK_TOKENS: Readonly<Record<ComposerMark, string>> = {
  bold: '**',
  code: '`',
  italic: '*',
  strike: '~~',
};

export type SelectionEdit = { end: number; start: number; value: string };

/** Wraps [start,end) of `value` in the mark's token; toggles it off when already wrapped. */
export function wrapSelection(value: string, start: number, end: number, mark: ComposerMark): SelectionEdit {
  const token = COMPOSER_MARK_TOKENS[mark];
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  if (before.endsWith(token) && after.startsWith(token)) {
    return {
      end: end - token.length,
      start: start - token.length,
      value: `${before.slice(0, -token.length)}${selected}${after.slice(token.length)}`,
    };
  }

  if (selected.startsWith(token) && selected.endsWith(token) && selected.length >= token.length * 2) {
    const inner = selected.slice(token.length, -token.length);
    return { end: start + inner.length, start, value: `${before}${inner}${after}` };
  }

  return {
    end: end + token.length,
    start: start + token.length,
    value: `${before}${token}${selected}${token}${after}`,
  };
}

export type MentionCandidate = { address: string | null; name: string };

const MENTION_QUERY = /(^|[^\p{L}\p{N}])@([A-Za-z0-9._-]{0,40})$/u;

/** The `@query` immediately before the caret, if the user is typing a mention. */
export function findMentionQuery(value: string, caret: number): { query: string; start: number } | null {
  const match = MENTION_QUERY.exec(value.slice(0, caret));

  if (!match) return null;

  return { query: match[2] ?? '', start: caret - (match[2]?.length ?? 0) - 1 };
}

export function filterMentionCandidates(candidates: readonly MentionCandidate[], query: string, limit = 8) {
  const needle = query.toLowerCase();
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];

  for (const candidate of candidates) {
    const key = candidate.name.toLowerCase();
    if (!candidate.name || seen.has(key)) continue;
    if (needle && !key.includes(needle)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= limit) break;
  }

  // Prefix matches first, then the rest in their original order.
  return out.sort((left, right) => {
    const leftPrefix = left.name.toLowerCase().startsWith(needle) ? 0 : 1;
    const rightPrefix = right.name.toLowerCase().startsWith(needle) ? 0 : 1;
    return leftPrefix - rightPrefix;
  });
}

/** Replaces the typed `@query` with the chosen mention (plus a trailing space). */
export function completeMention(value: string, caret: number, candidate: MentionCandidate): SelectionEdit | null {
  const query = findMentionQuery(value, caret);

  if (!query) return null;

  const mention = /^[A-Za-z0-9._-]{1,40}$/.test(candidate.name)
    ? `@${candidate.name}`
    : `@[${escapeRichText(candidate.name).replace(/[\]\n]/g, ' ').slice(0, 40)}]`;
  const inserted = `${mention} `;
  const next = `${value.slice(0, query.start)}${inserted}${value.slice(caret)}`;
  const position = query.start + inserted.length;

  return { end: position, start: position, value: next };
}
