/**
 * P1512: one request per key while it is in flight. The signed-in shell draws the same badges on
 * several surfaces at once (sidebar, bottom bar, You sheet), and each mounts its own badge hooks;
 * without this every surface sent its own copy of each badge query on every page load.
 *
 * Only concurrent callers share: the entry is dropped the moment the request settles, so a later
 * refetch (tab regains focus, a realtime event) always asks the server again. Nothing is cached.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  // Via a resolved promise, so a run() that throws synchronously still rejects (and is released).
  const p = Promise.resolve().then(run).finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

/**
 * P1542 round 9b: forget the shared request for `key` (or every key starting with `prefix` + ':'), so the next caller
 * sends a fresh one. Called after a WRITE (a read in flight across a write may carry the pre-write state) and when a
 * caller gives up on a stalled read (a later caller must not join a request that may never settle). The request
 * itself is not cancelled; whoever already holds it still gets its answer.
 */
export function forgetInFlight(prefix: string): void {
  for (const key of [...inFlight.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}:`)) inFlight.delete(key);
  }
}
