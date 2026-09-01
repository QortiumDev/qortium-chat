// Debounced registered-name suggestions shared by the link-resource dialog's
// publisher field and the new-direct-chat inputs (attachments-matrix A7-2/3).
import { useEffect, useState } from 'react';
import { searchNames } from './coreApi';
import { type ChatNetwork } from './types';

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export function useNameSuggestions(network: ChatNetwork, query: string): string[] {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH || trimmed.startsWith('Q')) {
      // Addresses (Q…) and one-letter fragments produce noise, not help —
      // an address typed into the DM field must not trigger name lookups.
      setSuggestions([]);
      return;
    }

    let stale = false;
    const timer = setTimeout(() => {
      searchNames(network, trimmed)
        .then((names) => {
          if (!stale) {
            setSuggestions(names.map((entry) => entry.name));
          }
        })
        .catch(() => {
          if (!stale) {
            setSuggestions([]);
          }
        });
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [network, trimmed]);

  return suggestions;
}
