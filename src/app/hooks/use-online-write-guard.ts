/**
 * @file use-online-write-guard.ts
 * @description P1369: offline, anything that writes is blocked with a clear message — no offline
 * write queue, and nothing may appear to succeed (several handlers update optimistically).
 *
 * Call the returned function at the top of a write handler; it returns false (and says why) when
 * the write cannot happen: the connection is down, or the page is showing a cached copy (which
 * means the last read already failed to reach the server).
 */
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useConnectivity } from '@/app/contexts/offline-status-context';
import { isSupabaseUnreachable } from '@/lib/network-outcome';

/** [FOUNDER DECISION: copy — PROPOSED; the spec asks for "a clear 'needs internet' message"] */
export const NEEDS_INTERNET_MESSAGE = "You're offline. This needs internet, so nothing was saved.";

export function useOnlineWriteGuard(showingCachedCopy = false): () => boolean {
  const { offline } = useConnectivity();
  return useCallback(() => {
    const down =
      offline ||
      showingCachedCopy ||
      isSupabaseUnreachable() ||
      (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (down) {
      toast.error(NEEDS_INTERNET_MESSAGE);
      return false;
    }
    return true;
  }, [offline, showingCachedCopy]);
}
