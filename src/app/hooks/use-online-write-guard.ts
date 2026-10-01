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
import { isSupabaseUnreachable, networkFailedSince } from '@/lib/network-outcome';

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

/**
 * Classify a write that failed: did it fail because the network / Supabase was unreachable?
 * The guard above only knows what failed BEFORE the write; a captive portal's first write is
 * the first request to fail, so the write's own catch must ask too. `since` is a
 * `networkMark()` taken just before the write was sent.
 */
export function isNetworkWriteFailure(err: unknown, since?: number): boolean {
  // throwDbError's verdict for a fetch that never reached the server (lib/network-blip.ts).
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'NetworkBlipError') return true;
  if (since !== undefined && networkFailedSince(since)) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** The toast for a failed write: the needs-internet message when the network was the cause. */
export function writeFailureMessage(err: unknown, fallback: string, since?: number): string {
  return isNetworkWriteFailure(err, since) ? NEEDS_INTERNET_MESSAGE : fallback;
}
