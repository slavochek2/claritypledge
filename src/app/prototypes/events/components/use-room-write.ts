/**
 * @file use-room-write.ts
 * @description The room's answer writes (Opt in / Opt out, the rating, "Change your choice"), moved out of
 * EventRoomMeet.tsx (over its size limit) with the same rules, plus the metered re-read (reconcile-retry.ts).
 *
 * One write, then adopt the row the RPC RETURNED as the new `self` — not a follow-up read (ordering against concurrent
 * reads lives in `runSelfWrite`). Only the write's own failure is reported as "That didn't save": when the write
 * committed and a separate refresh then failed, the phone used to say it didn't save while the projector already showed
 * the person opted in (2026-09-18 adversarial review).
 *
 * On failure the latch is HELD until a re-read has come back, and only then is the error shown. The rating step's
 * "Change your choice" appears only if that re-read SUCCEEDED (`reconciled`): a write whose response was lost may have
 * committed, and a reset must never be offered against an answer this screen has not caught up with (rounds 2-3).
 * Round 4: until a read succeeds every control stays locked — unlocking early let a tap on the OTHER answer record a
 * false change of mind in the research history.
 *
 * Metered (Codex review): the re-reads, the first included, wait for a visible tab, back off with jitter and stop after
 * a budget (`stuck`: still locked, the screen offers "Try again" = `retryReconcile`, one more budgeted loop). An
 * unmount aborts the loop; nothing is set on an unmounted room.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventRoomSelf } from '@/app/types';
import { retryUntilRead } from './reconcile-retry';

export function useRoomWrite(runSelfWrite: (write: () => Promise<EventRoomSelf>) => Promise<unknown>, refresh: (signal?: AbortSignal) => Promise<boolean>) {
  const [submitting, setSubmitting] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  /** After a failed write: did the re-read succeed? Only then does this screen know the current answer. */
  const [reconciled, setReconciled] = useState(true);
  /** The re-read budget ran out: still locked, "Try again" offered. */
  const [stuck, setStuck] = useState(false);
  /**
   * Synchronous in-flight latch. `submitting` drives the DISABLED styling, but it cannot be the guard: it is React
   * state, so two taps dispatched in the same frame both read `false` before either re-render lands, and both proceed.
   * Every set_room_opt_in call INSERTs a row into event_room_answers with a cascade count (migration 20260821120000),
   * so a double tap writes two history rows into the table the research question reads. A ref closes it.
   */
  const inFlight = useRef(false);
  const leaving = useRef(new AbortController()); // aborted on unmount: ends a re-read loop, and no state is set after
  useEffect(() => {
    if (leaving.current.signal.aborted) leaving.current = new AbortController(); // remount (StrictMode in dev)
    return () => leaving.current.abort();
  }, []);
  /** The current step, readable from inside an async write; the page sets it on every render. */
  const stepKeyRef = useRef<string>('choosing');
  const stepBefore = useRef('choosing');

  /** A re-read loop is running (synchronous, like `inFlight`: two "Try again" taps in one frame start one loop). */
  const reconciling = useRef(false);
  const reconcile = useCallback(async () => {
    if (reconciling.current) return;
    reconciling.current = true;
    setStuck(false);
    const signal = leaving.current.signal;
    let result: Awaited<ReturnType<typeof retryUntilRead>> = 'exhausted';
    try {
      result = await retryUntilRead(refresh, signal, () => { setReconciled(false); setWriteFailed(true); });
    } catch {
      // Unexpected (retryUntilRead already turns a failed or throwing read into "not yet"): treated as a spent budget,
      // so the screen is never left locked with no way forward.
    } finally {
      reconciling.current = false;
    }
    if (result === 'aborted') return;
    // The write latch stays held (still locked); "Try again" is the way forward.
    if (result === 'exhausted') { setReconciled(false); setWriteFailed(true); setStuck(true); return; }
    setReconciled(true);
    // The re-read may show the write DID commit (response lost): the step moved on, and "That didn't save" would be
    // false. Flag it only when the step is unchanged.
    setWriteFailed(stepKeyRef.current === stepBefore.current);
    inFlight.current = false;
    setSubmitting(false);
  }, [refresh]);

  const runWrite = useCallback(async (write: () => Promise<EventRoomSelf>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setWriteFailed(false);
    stepBefore.current = stepKeyRef.current;
    let failed = false;
    let handedOver = false; // the latch passes to reconcile(), which releases it once a read succeeds
    try {
      try { await runSelfWrite(write); } catch { failed = true; }
      if (leaving.current.signal.aborted) return;
      if (failed) { handedOver = true; return await reconcile(); }
    } finally {
      if (!handedOver) {
        inFlight.current = false;
        if (!leaving.current.signal.aborted) setSubmitting(false);
      }
    }
  }, [runSelfWrite, reconcile]);

  const retryReconcile = useCallback(() => {
    void reconcile();
  }, [reconcile]);

  return { submitting, writeFailed, setWriteFailed, reconciled, stuck, runWrite, retryReconcile, stepKeyRef };
}
