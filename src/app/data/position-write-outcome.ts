/**
 * @file position-write-outcome.ts
 * @description P1420: one owner for "what did the viewer's position write actually do?".
 *
 * Every surface that writes the viewer's position on a point (the feed point card, the feed story
 * card's quoted points, the remove dialog) goes through here, so they share:
 *
 *   - ONE generation per (viewer, point). Each write takes the next one. Any effect of a write —
 *     a cache patch, a parent callback, saved state, a toast — happens only while that write is
 *     still the latest, so a late answer can never undo a newer click on any surface.
 *   - the RAW request. `saveInOrder` stops waiting after 12s but does not cancel the request; until
 *     the request itself settles, a read showing the old value proves nothing ("not landed YET"),
 *     so it is retried, never reported as "not saved".
 *   - cancellation: a settle stops (no more reads, no effects) when its caller unmounts, a newer
 *     write starts, or the signed-in viewer changes.
 *   - one shared "Checking…" toast, however many writes are being checked.
 */
import { toast } from 'sonner';
import { pointsService } from '@/app/data/points-service';
import { saveInOrder, saveWithin, UNCONFIRMED_WRITE_MESSAGE } from '@/app/hooks/use-online-write-guard';
import { offlineCacheOwner } from '@/lib/offline-read-cache';
import type { PositionType } from '@/app/types';
import { recordOwnPosition } from './own-position-writes';
import {
  _resetPositionWriteGenerationsForTesting,
  callWithGeneration,
  isLatestPositionWrite,
  onPositionWriteBegun,
} from './position-write-generation';

export { beginPositionWrite, isLatestPositionWrite } from './position-write-generation';

const keyOf = (userId: string, pointId: string) => `${userId}|${pointId}`;

/** Raw write requests still unanswered, per (viewer, point). */
const unsettledWrites = new Map<string, Set<Promise<unknown>>>();

function trackRaw<T>(userId: string, pointId: string, raw: Promise<T>): Promise<T> {
  const key = keyOf(userId, pointId);
  const set = unsettledWrites.get(key) ?? new Set();
  unsettledWrites.set(key, set);
  set.add(raw);
  const done = () => {
    set.delete(raw);
    if (!set.size) unsettledWrites.delete(key);
  };
  raw.then(done, done);
  return raw;
}

function hasUnsettledWrite(userId: string, pointId: string): boolean {
  return (unsettledWrites.get(keyOf(userId, pointId))?.size ?? 0) > 0;
}

/**
 * Send the write (in click order, bounded), remembering the raw request until it answers. The
 * `generation` is the one taken at click time and travels with the write unchanged: when the raw
 * request succeeds — even late, even after a newer click — it is recorded under THAT generation,
 * and the cache's ordering keeps a newer write's value over it.
 */
export function sendPositionWrite(
  userId: string,
  pointId: string,
  position: PositionType | null,
  generation: number,
): Promise<void> {
  return saveInOrder(`position:${pointId}`, () =>
    trackRaw(
      userId,
      pointId,
      // The service records a success under THIS generation (read synchronously at call start).
      callWithGeneration(generation, () =>
        position === null ? pointsService.removePosition(pointId, userId) : pointsService.setPosition(pointId, userId, position),
      ),
    ),
  );
}

/** After a settle confirmed a write: patch the offline copies under its own generation. */
export function recordConfirmedPosition(userId: string, pointId: string, generation: number, position: PositionType | null): void {
  void recordOwnPosition(pointId, userId, position, generation);
}

export { endPositionWrite } from './position-write-generation';

// ─── the shared "Checking…" toast ────────────────────────────────────────────

export const CHECKING_TOAST_ID = 'p1420-position-checking';
let checking = 0;

function acquireCheckingToast(): () => void {
  checking += 1;
  if (checking === 1) toast.loading(UNCONFIRMED_WRITE_MESSAGE, { id: CHECKING_TOAST_ID });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    checking -= 1;
    if (checking === 0) toast.dismiss(CHECKING_TOAST_ID);
  };
}

// ─── settling ────────────────────────────────────────────────────────────────

/** Delays between reads (the first is immediate). Each read is bounded by the write timeout. */
export const SETTLE_RETRY_DELAYS_MS = [0, 2_000, 4_000, 8_000, 15_000, 30_000];

export type PositionSettle =
  | { kind: 'confirmed' } // the server has the value the write asked for
  | { kind: 'rejected' } // the request answered, and the server does not have it
  | { kind: 'unresolved' } // could not find out
  | { kind: 'superseded' }; // cancelled, a newer write, or another viewer: do nothing

const ABORTED = Symbol('aborted');

/** `p`, or ABORTED the moment `signal` aborts (at once if it already has). */
function untilAborted<T>(p: Promise<T>, signal: AbortSignal): Promise<T | typeof ABORTED> {
  if (signal.aborted) return Promise.resolve(ABORTED);
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve(ABORTED);
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Find out what an unanswered write did. Returns `superseded` (and the caller must then do
 * NOTHING) when the caller's signal aborts, a newer write for this viewer and point starts, or the
 * stored session no longer belongs to `userId` (sign-out, account switch). Cancellation is prompt:
 * a pending wait or read is abandoned the moment it happens, and the shared toast is released.
 */
export async function settlePositionWrite(opts: {
  userId: string;
  pointId: string;
  generation: number;
  expected: PositionType | null;
  signal?: AbortSignal;
  delays?: number[];
}): Promise<PositionSettle> {
  const { userId, pointId, generation, expected, signal, delays = SETTLE_RETRY_DELAYS_MS } = opts;
  const stop = new AbortController();
  const release = acquireCheckingToast();
  const cancel = () => {
    stop.abort();
    release(); // at once — not when the abandoned wait would have ended
  };
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const unsubscribe = onPositionWriteBegun((u, p) => {
    if (u === userId && p === pointId && !isLatestPositionWrite(userId, pointId, generation)) cancel();
  });
  const stillMine = async () => {
    if (stop.signal.aborted || !isLatestPositionWrite(userId, pointId, generation)) return false;
    const owner = await untilAborted(offlineCacheOwner(), stop.signal);
    return owner !== ABORTED && (owner ?? '').startsWith(`u:${userId}`);
  };
  try {
    for (const delay of delays) {
      if (!(await stillMine())) return { kind: 'superseded' }; // before sleeping, not only after
      if ((await untilAborted(sleep(delay), stop.signal)) === ABORTED) return { kind: 'superseded' };
      if (!(await stillMine())) return { kind: 'superseded' };
      let value: PositionType | null | typeof ABORTED;
      try {
        value = await untilAborted(saveWithin(pointsService.readMyPosition(pointId, userId)), stop.signal);
      } catch {
        continue; // could not read: still unknown
      }
      if (value === ABORTED || !(await stillMine())) return { kind: 'superseded' };
      if (value === expected) return { kind: 'confirmed' };
      // The old value while the request itself is still out means "not landed YET".
      if (hasUnsettledWrite(userId, pointId)) continue;
      return { kind: 'rejected' };
    }
    return (await stillMine()) ? { kind: 'unresolved' } : { kind: 'superseded' };
  } finally {
    unsubscribe();
    signal?.removeEventListener('abort', cancel);
    release();
  }
}

/** Test-only. */
export function _resetPositionWritesForTesting(): void {
  _resetPositionWriteGenerationsForTesting();
  unsettledWrites.clear();
  checking = 0;
}
