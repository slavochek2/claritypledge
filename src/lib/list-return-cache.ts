/**
 * @file list-return-cache.ts
 * @description P1364 §5: return to the exact place in /feed and /stake/:tag on Back.
 *
 * A module-level Map — no library — holding what a list page last RENDERED: the list and the
 * feed's link maps (the card footers), so card heights on return match the ones the reader
 * left and a pixel scroll restore lands on the same card.
 *
 * Rules (each one is a spec line, and each has a test in src/tests/p1364-list-return-cache):
 *   - Key = viewer id + pathname + query. A different viewer can never read another's rows.
 *   - Served ONLY on a POP navigation (browser back/forward, the Back controls). A PUSH — the
 *     nav's Feed tab, a link — and a REPLACE always fetch fresh. The caller enforces this by
 *     reading only when `useNavigationType() === 'POP'`.
 *   - On POP the cached list renders WITHOUT a background refresh: nothing is prepended above
 *     the reader. Stale-on-Back is an accepted risk ("Back means as I left it").
 *   - Cleared on any auth change (sign-in, sign-out, user switch) — see `useClearListReturnCacheOnAuthChange`.
 *   - Written through on surgical updates (P543 removals): `updateListReturnCache` rewrites
 *     every stored entry of a surface, so a removed point cannot come back from the cache.
 */
import { useEffect, useRef } from 'react';

export type ListSurface = 'feed' | 'stake';

interface Entry<T> {
  surface: ListSurface;
  data: T;
}

/** Enough for the handful of feed/stake states one Back chain can reach. */
const MAX_ENTRIES = 20;
const cache = new Map<string, Entry<unknown>>();

export function listReturnCacheKey(
  viewerId: string | null | undefined,
  pathname: string,
  search: string,
): string {
  return `${viewerId ?? 'anon'}|${pathname}${search}`;
}

export function readListReturnCache<T>(key: string, surface: ListSurface): T | undefined {
  const entry = cache.get(key);
  if (!entry || entry.surface !== surface) return undefined;
  return entry.data as T;
}

export function writeListReturnCache<T>(key: string, surface: ListSurface, data: T): void {
  cache.delete(key); // re-insert: Map order is least-recently-written first
  cache.set(key, { surface, data });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Write-through for surgical updates: rewrite every stored entry of `surface`. */
export function updateListReturnCache<T>(surface: ListSurface, update: (data: T) => T): void {
  for (const [key, entry] of cache) {
    if (entry.surface === surface) cache.set(key, { surface, data: update(entry.data as T) });
  }
}

export function clearListReturnCache(): void {
  cache.clear();
}

/** Test-only view of the store's size. */
export function __listReturnCacheSize(): number {
  return cache.size;
}

/**
 * Clears the cache whenever the signed-in viewer changes — sign-in, sign-out, a user switch.
 * Mounted once, inside the auth provider (App.tsx). The key already carries the viewer id;
 * this makes a sign-out drop the rows outright rather than leave them keyed and unreachable.
 */
export function useClearListReturnCacheOnAuthChange(viewerId: string | null | undefined): void {
  const lastViewerRef = useRef<string | null | undefined>(viewerId);
  useEffect(() => {
    if (lastViewerRef.current !== viewerId) {
      lastViewerRef.current = viewerId;
      clearListReturnCache();
    }
  }, [viewerId]);
}
