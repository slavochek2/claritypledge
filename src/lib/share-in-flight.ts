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
