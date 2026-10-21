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

/** Key namespaces: every deduped read's key starts with one of these. */
export const STORY_READS = 'story';
export const EVENT_READS = 'event';

/**
 * Write-aware invalidation: forget every pending entry whose key starts with `prefix` (all of
 * them when omitted). A read started AFTER this call starts a fresh request instead of joining one
 * that began before the write; the dropped promise still resolves for the callers that hold it.
 * The `pending.get(key) === p` guard above keeps that old promise's cleanup from deleting a newer
 * entry stored under the same key.
 */
export function invalidateInFlight(prefix?: string): void {
  for (const key of [...pending.keys()]) {
    if (!prefix || key.startsWith(prefix)) pending.delete(key);
  }
}

/**
 * Wrap a write so pending reads under `prefix` are dropped once it settles (success or failure:
 * a spurious drop costs one extra request, a missed one serves pre-write data).
 */
export function invalidatingAfter<A extends unknown[], R>(
  prefix: string,
  write: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    try {
      return await write(...args);
    } finally {
      invalidateInFlight(prefix);
    }
  };
}

/** Patch the named write methods of a service object in place with `invalidatingAfter`. */
export function invalidateInFlightAfterWrites<T extends object>(service: T, writes: ReadonlyArray<keyof T>, prefix: string): void {
  for (const name of writes) {
    const original = service[name];
    if (typeof original !== 'function') throw new Error(`invalidateInFlightAfterWrites: ${String(name)} is not a method`);
    (service as Record<keyof T, unknown>)[name] = invalidatingAfter(prefix, (...args: unknown[]) =>
      (original as (...a: unknown[]) => Promise<unknown>).apply(service, args));
  }
}
