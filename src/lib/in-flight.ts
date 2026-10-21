/**
 * @file in-flight.ts
 * @description P1527: share ONE request between callers that ask for the same thing at the same
 * time (React StrictMode's double-invoked mount effects, two components mounting together).
 *
 * In-flight only, deliberately not a cache: the entry is removed the moment the promise settles
 * (success or failure), so a read started after a write never sees a result that predates it.
 * Callers get the same resolved value, so it must not be mutated by one consumer.
 */
const pending = new Map<string, Promise<unknown>>();

export function dedupeInFlight<T>(key: string, start: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const p = start().finally(() => {
    if (pending.get(key) === p) pending.delete(key);
  });
  pending.set(key, p);
  return p;
}
