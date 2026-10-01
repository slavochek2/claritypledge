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
  // A save that never answered (saveWithin below): the connection is the likely cause.
  if (err instanceof WriteTimeoutError) return true;
  if (since !== undefined && networkFailedSince(since)) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** The toast for a failed write: the needs-internet message when the network was the cause. */
export function writeFailureMessage(err: unknown, fallback: string, since?: number): string {
  return isNetworkWriteFailure(err, since) ? NEEDS_INTERNET_MESSAGE : fallback;
}

/**
 * How long a vote's save may stay unanswered before it counts as not saved. A captive portal can
 * swallow the request without ever answering it; without a bound the optimistic vote looked saved
 * for as long as the page stayed open.
 */
export const WRITE_TIMEOUT_MS = 12_000;

export class WriteTimeoutError extends Error {
  constructor() {
    super('The save did not get an answer in time');
    this.name = 'WriteTimeoutError';
  }
}

/**
 * Await a write, but reject with WriteTimeoutError after `ms`. The request itself is not
 * cancelled: if it lands late, the next read shows it — the page never claims a save it did not
 * see confirmed.
 */
const inFlightByKey = new Map<string, Promise<unknown>>();

/**
 * Like `saveWithin`, but writes for the same `key` (e.g. one point) are sent in click order: a
 * new write is sent only after the previous one for that key has settled. A save that timed out
 * on a captive portal can still land later — without ordering it could land AFTER a newer click and
 * overwrite it (/finish review, P1369). The services take no abort signal, so order is the fix.
 */
export function saveInOrder<T>(key: string, write: () => Promise<T>, ms = WRITE_TIMEOUT_MS): Promise<T> {
  const previous = inFlightByKey.get(key) ?? Promise.resolve();
  // The bound covers the wait for the previous write too: a write that never answers must not
  // hold every later write for this key forever. Past the bound, order is no longer guaranteed —
  // that write has already been reported as not saved.
  const bounded = saveWithin(previous.then(write), ms);
  const settled = bounded.then(() => undefined, () => undefined);
  inFlightByKey.set(key, settled);
  void settled.finally(() => {
    if (inFlightByKey.get(key) === settled) inFlightByKey.delete(key);
  });
  return bounded;
}

export function saveWithin<T>(write: Promise<T>, ms = WRITE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    write,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new WriteTimeoutError()), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
