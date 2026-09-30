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
 * Two readers:
 *   - `readThrough` (offline-read-cache.ts) compares the failure count before and after a read to
 *     learn whether that read hit the network wall, because the services swallow the error.
 *   - `useConnectivity` (offline-status-context.tsx) shows the session bars' offline state while
 *     the most recent outcome is a failure.
 */

type Listener = () => void;

let failureCount = 0;
let lastFailureAt = 0;
let lastSuccessAt = 0;
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

export function recordNetworkFailure(): void {
  failureCount += 1;
  lastFailureAt = Date.now();
  notify();
}

export function recordNetworkSuccess(): void {
  const wasDown = lastFailureAt > lastSuccessAt;
  lastSuccessAt = Date.now();
  if (wasDown) notify();
}

/** Monotonic count of requests that never reached the server. */
export function networkFailureCount(): number {
  return failureCount;
}

/** True while the most recent request outcome was "could not reach the server". */
export function isSupabaseUnreachable(): boolean {
  return lastFailureAt > lastSuccessAt;
}

export function subscribeNetworkOutcome(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Wrap a fetch so every call's outcome is recorded. The response/rejection passes through untouched. */
export function withNetworkOutcome(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      const res = await baseFetch(input, init);
      recordNetworkSuccess();
      return res;
    } catch (err) {
      if (!isAbort(err)) recordNetworkFailure();
      throw err;
    }
  };
}

/** Test-only. */
export function _resetNetworkOutcomeForTesting(): void {
  failureCount = 0;
  lastFailureAt = 0;
  lastSuccessAt = 0;
  listeners.clear();
}
