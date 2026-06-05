/**
 * @file use-profile-search.ts
 * @description P878: debounced relationship-scoped profile search for the people picker.
 *
 * Centralizes the debounce + RPC call + loading state that was previously duplicated
 * inline in create-agreement-page.tsx and letter-receiver-modal.tsx (AD-5).
 *
 * Search only fires for queries that are ≥3 trimmed chars and contain no '@' —
 * anything with '@' is an email and belongs to the first-contact email path.
 */
import { useEffect, useRef, useState } from 'react';
import { agreementsService } from '@/app/data/agreements-service';
import type { ProfileSearchResult } from '@/app/data/agreements-service';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

export function isSearchableQuery(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= MIN_QUERY_LENGTH && !trimmed.includes('@');
}

export function useProfileSearch(query: string): {
  results: ProfileSearchResult[];
  isSearching: boolean;
  /** True once a search has completed for the CURRENT query (enables the empty state). */
  hasSearched: boolean;
} {
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!isSearchableQuery(query)) {
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      return;
    }

    setHasSearched(false);
    let cancelled = false;

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const found = await agreementsService.searchProfiles(query.trim());
        if (!cancelled) {
          setResults(found);
          setHasSearched(true);
        }
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return { results, isSearching, hasSearched };
}
