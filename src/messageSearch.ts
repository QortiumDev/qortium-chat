// 2.0.25 (G11): message search over the LOADED history of the open
// conversation. Deliberately client-side: Core has no full-text chat search on
// either chain, every host tier can do this, and the loaded window plus
// "load older" is what Hub's own search covers too. Pure helpers; the feed
// applies them (MessageList) and the header owns the query (App).

/** Whitespace-separated terms, lower-cased; empty when nothing to search for. */
export function parseSearchQuery(query: string | null | undefined): string[] {
  return (query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

/** Every term must appear somewhere in the message body or the sender label. */
export function messageMatchesSearch(terms: readonly string[], body: string, senderLabel: string) {
  if (terms.length === 0) return true;
  const haystack = `${body}\n${senderLabel}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
