/**
 * @file use-offline-read-state.ts
 * @description P1369 Scope v2: the page-side half of `readThrough`, shared by every list page
 * (stake, feed, groups) so each one does the same three things:
 *
 *   - reports what it rendered to the strip (`cached` with its age) — cached data is never
 *     shown without the strip;
 *   - remembers "nothing stored, no network" so it renders the needs-connection body, never a
 *     spinner;
 *   - re-reads on reconnect, but only while what is on screen is not live (`reconnectKey` stays 0
 *     otherwise, so a live page never refetches on a sibling's reconnect).
 *
 * `apply(read)` takes a `ReadResult` and returns its data (or null for `offline`), setting the
 * two flags accordingly.
 */
import { useCallback, useState } from 'react';
import { useConnectivity, useOfflinePageReport } from '@/app/contexts/offline-status-context';
import type { ReadResult } from '@/lib/offline-read-cache';

export function useOfflineReadState() {
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [offlineMiss, setOfflineMiss] = useState(false);
  useOfflinePageReport(cachedAt === null ? null : { kind: 'cached', storedAt: cachedAt });
  const { reconnectTick } = useConnectivity();
  const reconnectKey = cachedAt !== null || offlineMiss ? reconnectTick : 0;

  const apply = useCallback(<T,>(read: ReadResult<T>): T | null => {
    if (read.source === 'offline') {
      setOfflineMiss(true);
      return null;
    }
    setOfflineMiss(false);
    setCachedAt(read.source === 'cache' ? read.storedAt : null);
    return read.data;
  }, []);

  /** Forget the offline state (a restore from the in-memory Back cache is live data). */
  const reset = useCallback(() => {
    setOfflineMiss(false);
    setCachedAt(null);
  }, []);

  return { cachedAt, offlineMiss, reconnectKey, apply, reset };
}
