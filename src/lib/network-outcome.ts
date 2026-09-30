/**
 * @file network-outcome.ts
 * @description P1369: what actually happened to our requests to Supabase — the only honest
 * answer to "are we offline?".
 *
 * `navigator.onLine` is not that answer. Captive portals and venue Wi-Fi report online while
 * nothing reaches Supabase, and supabase-js turns a failed fetch into a `{ data: null }` result
 * that every service then maps to "not found". So the Supabase client's fetch is wrapped here and
 * each request's OUTCOME is recorded: a response of any status means the server was reached; a
 * rejected fetch (other than a deliberate abort) means it was not.
 *
 * Ordering uses a monotonic SEQUENCE, never timestamps: two outcomes in the same millisecond
 * must still have an order, or a failure right after a success is lost.
 *
 * Readers:
 *   - `readThrough` (offline-read-cache.ts) takes a `networkMark()` when a read starts and asks
 *     `networkFailedSince(mark)` when it settles: did a request that STARTED during this read
 *     fail? That is the read's own outcome — a sibling request succeeding afterwards does not
 *     erase it (the app-wide "last outcome" would).
 *   - `useConnectivity` (offline-status-context.tsx) shows the session bars' offline state while
 *     the most recent outcome is a failure (`isSupabaseUnreachable`).
 *   - Write handlers classify a failed write with `networkFailedSince` too (use-online-write-guard).
 */

type Listener = () => void;

/** Every start and every outcome takes the next number. */
let seq = 0;
let failureCount = 0;
let lastFailureSeq = 0;
let lastSuccessSeq = 0;
/** Start numbers of recent requests that never reached the server (bounded). */
let failedStarts: number[] = [];
const MAX_FAILED_STARTS = 500;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* a listener must never break a request */
    }
  }
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

/** A point in the outcome sequence. Requests that start after it are "since" it. */
export function networkMark(): number {
  return ++seq;
}

/**
 * A request failed at the network. `startedAt` is the mark taken when it was sent (the fetch
 * wrapper passes it); without one it counts as sent now.
 */
export function recordNetworkFailure(startedAt?: number): void {
  const started = startedAt ?? ++seq;
  failureCount += 1;
  failedStarts.push(started);
  if (failedStarts.length > MAX_FAILED_STARTS) failedStarts = failedStarts.slice(-MAX_FAILED_STARTS);
  lastFailureSeq = ++seq;
  notify();
}

/**
 * A request reached the server. It proves the connection is back only if it was SENT after the
 * latest failure: a request already in flight when a sibling failed says nothing about now. (It
 * did: a page whose one request kept failing re-read on every sibling's success — the siblings
 * had been sent alongside the failing request — and looped at ~250 requests/s.) `startedAt` is
 * the mark taken when it was sent (the fetch wrapper passes it); without one it counts as sent now.
 */
export function recordNetworkSuccess(startedAt?: number): void {
  const started = startedAt ?? ++seq;
  if (started < lastFailureSeq) return;
  const wasDown = lastFailureSeq > lastSuccessSeq;
  lastSuccessSeq = ++seq;
  if (wasDown) notify();
}

/**
 * No request failed, but the app could not get an answer in time (a read served by its
 * deadline): count as unreachable until the next success, so that success is a reconnect and
 * pages showing cached data refresh themselves. Not a request failure — it never marks another
 * read as failed.
 */
export function recordNetworkTrouble(): void {
  if (lastFailureSeq > lastSuccessSeq) return;
  lastFailureSeq = ++seq;
  notify();
}

/** Did a request that started after `mark` fail at the network? */
export function networkFailedSince(mark: number): boolean {
  for (let i = failedStarts.length - 1; i >= 0; i--) {
    const started = failedStarts[i];
    if (started !== undefined && started > mark) return true;
  }
  return false;
}

/** Monotonic count of requests that never reached the server. */
export function networkFailureCount(): number {
  return failureCount;
}

/** True while the most recent request outcome was "could not reach the server". */
export function isSupabaseUnreachable(): boolean {
  return lastFailureSeq > lastSuccessSeq;
}

export function subscribeNetworkOutcome(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Wrap a fetch so every call's outcome is recorded. The response/rejection passes through untouched. */
export function withNetworkOutcome(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const startedAt = networkMark();
    try {
      const res = await baseFetch(input, init);
      recordNetworkSuccess(startedAt);
      return res;
    } catch (err) {
      if (!isAbort(err)) recordNetworkFailure(startedAt);
      throw err;
    }
  };
}

/** Test-only. */
export function _resetNetworkOutcomeForTesting(): void {
  seq = 0;
  failureCount = 0;
  lastFailureSeq = 0;
  lastSuccessSeq = 0;
  failedStarts = [];
  listeners.clear();
}
