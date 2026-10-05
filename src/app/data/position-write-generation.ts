/**
 * @file position-write-generation.ts
 * @description P1420: the latest-write generation per (viewer, point). Its own module so the
 * points service and the write-outcome owner (position-write-outcome.ts) share it without
 * importing each other.
 *
 * Generations come from ONE monotonic counter, so a number is never reused: an entry can be
 * dropped once its writes are finished (bounded memory) without a later write ever comparing
 * equal to — or lower than — a stale one still held by a cache patch.
 */
let counter = 0;
type BeginListener = (userId: string, pointId: string) => void;
const listeners = new Set<BeginListener>();

/** Be told when any write begins (a settle uses it to stop at once when superseded). */
export function onPositionWriteBegun(listener: BeginListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const latest = new Map<string, number>();
const active = new Map<string, number>();
const keyOf = (userId: string, pointId: string) => `${userId}|${pointId}`;

/** The latest generation for this viewer and point (0: none in memory). */
export function currentPositionWrite(userId: string, pointId: string): number {
  return latest.get(keyOf(userId, pointId)) ?? 0;
}

/** Start a write: it becomes the latest for this viewer and point. Pair with `endPositionWrite`. */
export function beginPositionWrite(userId: string, pointId: string): number {
  const key = keyOf(userId, pointId);
  const generation = ++counter;
  latest.set(key, generation);
  active.set(key, (active.get(key) ?? 0) + 1);
  for (const listener of [...listeners]) listener(userId, pointId);
  return generation;
}

export function isLatestPositionWrite(userId: string, pointId: string, generation: number): boolean {
  return currentPositionWrite(userId, pointId) === generation;
}

/** A write and everything it waits on (its request, its settle) are over. */
export function endPositionWrite(userId: string, pointId: string): void {
  const key = keyOf(userId, pointId);
  const left = (active.get(key) ?? 1) - 1;
  if (left > 0) {
    active.set(key, left);
    return;
  }
  active.delete(key);
  latest.delete(key); // nothing in flight can still ask about this key
}

/** The next generation number, for a write made outside `beginPositionWrite` (ordering only). */
export function nextPositionGeneration(): number {
  return ++counter;
}

/*
 * P1420 round 3: a write queued by saveInOrder is sent later than it was clicked. The generation it
 * was clicked with is handed to the service SYNCHRONOUSLY for the duration of the call, so the
 * service records the write under it — never under whatever click is newest when it is finally sent.
 */
let callerGeneration: number | null = null;

export function callWithGeneration<T>(generation: number, call: () => T): T {
  const previous = callerGeneration;
  callerGeneration = generation;
  try {
    return call();
  } finally {
    callerGeneration = previous;
  }
}

/** The generation handed in by `callWithGeneration`, or a fresh one for an unmanaged caller. */
export function takeCallerGeneration(): number {
  return callerGeneration ?? nextPositionGeneration();
}

/** Test-only. */
export function positionWriteMapSizesForTesting(): { latest: number; active: number } {
  return { latest: latest.size, active: active.size };
}

/** Test-only. */
export function _resetPositionWriteGenerationsForTesting(): void {
  latest.clear();
  active.clear();
}
