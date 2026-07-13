import { useCallback, useEffect, useRef, useState } from 'react';
import {
  extractUsernameSearchQuery,
  searchProfilesByUsernamePrefix,
  type UsernameSearchResult,
} from '../../lib/friendRequests';

export const USERNAME_SEARCH_DEBOUNCE_MS = 300;

export type UsernameSearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

interface UseUsernameTypeaheadOptions {
  /** When false, pending searches are cancelled and results are cleared. */
  enabled: boolean;
}

export function useUsernameTypeahead(
  identifier: string,
  { enabled }: UseUsernameTypeaheadOptions
) {
  const [results, setResults]       = useState<UsernameSearchResult[]>([]);
  const [status, setStatus]         = useState<UsernameSearchStatus>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);

  const requestSeqRef   = useRef(0);
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResults = useCallback(() => {
    requestSeqRef.current += 1;
    setResults([]);
    setStatus('idle');
    setSearchError(null);
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!enabled) {
      clearResults();
      return;
    }

    const query = extractUsernameSearchQuery(identifier);
    if (!query) {
      clearResults();
      return;
    }

    debounceRef.current = setTimeout(() => {
      const seq = ++requestSeqRef.current;
      setStatus('loading');
      setSearchError(null);

      searchProfilesByUsernamePrefix(query)
        .then((rows) => {
          if (seq !== requestSeqRef.current) return;

          if (rows.length === 0) {
            setResults([]);
            setStatus('empty');
          } else {
            setResults(rows);
            setStatus('ready');
          }
        })
        .catch((err: unknown) => {
          if (seq !== requestSeqRef.current) return;
          setResults([]);
          setStatus('error');
          setSearchError(
            err instanceof Error ? err.message : 'We couldn\'t search for usernames. Please try again.'
          );
        });
    }, USERNAME_SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [identifier, enabled, clearResults]);

  return { results, status, searchError, clearResults };
}
