/**
 * @file use-finish-close.ts
 * @description P1389 / P1542: record "this close is finished" once the thank-you is reached, so skipped text never
 * looks like an unfinished close and a return skips the questions.
 *
 * The retry belongs to the PAGE, not to the thank-you screen (round 6d, Codex): a learned non-member who taps Join
 * (thank-you → group terms) before a retry lands must not cancel it. And it must not cost money while it cannot help
 * (round 7b, Codex HIGH — a 30-second retry forever was ~120 requests per hour per open tab):
 *   - "done" is set only after the server confirmed the write (or the caller says it already is); success or unmount
 *     stops everything;
 *   - a chain makes at most FINISH_MAX_ATTEMPTS requests, waiting 3s, 6s, 12s … (exponential, with jitter) up to a
 *     cap of 5 minutes between them;
 *   - nothing is sent while the tab is hidden; a retry that falls due then waits for the tab to become visible;
 *   - 'online' / becoming visible retries at once ONLY when the chain is exhausted or a retry fell due while hidden
 *     (round 7c, Gemini) — mid-chain the pending backoff timer keeps its turn, so tab switches never multiply requests;
 *   - every request carries a generation token: a response from an older generation (another event, a reset) changes
 *     nothing (round 7c, Codex — a stale e1 response used to free the slot for a second e2 request).
 * Worst case with no 'online'/visible events: FINISH_MAX_ATTEMPTS requests per page visit (8 in about 6 minutes, then
 * silence). Each such event after an exhausted chain can add at most one further chain (≤ 8).
 */
import { useEffect, useRef } from 'react';
import { finishEventClose } from '@/app/data/event-close-service';

export const FINISH_MAX_ATTEMPTS = 8;
export const FINISH_RETRY_BASE_MS = 3000;
export const FINISH_RETRY_MAX_MS = 5 * 60 * 1000;

/** The wait before retry `n` (1-based): 3s · 2^(n−1), capped at 5 min, with jitter in [50%, 100%] of that. */
export function finishRetryDelay(n: number, random: () => number = Math.random): number {
  const ceiling = Math.min(FINISH_RETRY_BASE_MS * 2 ** (n - 1), FINISH_RETRY_MAX_MS);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/** `onPersisted` (P1542 review round 3): called once the server has confirmed the write — never on merely reaching the
 *  thank-you, so a room's "feedback is in" tick is never shown for a write that did not land. */
export function useFinishCloseOnce(atThankYou: boolean, eventId: string, alreadyFinished: boolean, onPersisted?: () => void): void {
  const persistedRef = useRef(onPersisted);
  persistedRef.current = onPersisted;
  const done = useRef(alreadyFinished);
  const wanted = useRef(false); // the thank-you was reached: the write is owed until it lands
  const attempts = useRef(0); // requests made in the current chain
  const inFlight = useRef(false);
  const dueWhileHidden = useRef(false); // a request fell due while the tab was hidden
  const generation = useRef(0); // bumped on every reset; a response from an older generation is ignored
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const event = useRef(eventId);
  const attemptRef = useRef<() => void>(() => undefined);

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = undefined; } };

  attemptRef.current = () => {
    timer.current = undefined;
    if (!mounted.current || done.current || !wanted.current || inFlight.current) return;
    if (hidden()) { dueWhileHidden.current = true; return; } // no request from a hidden tab: wait to be visible
    if (attempts.current >= FINISH_MAX_ATTEMPTS) return; // exhausted: only 'online' / visible starts a new chain
    dueWhileHidden.current = false;
    attempts.current += 1;
    inFlight.current = true;
    const myGeneration = generation.current;
    const forEvent = event.current;
    // A thrown request (offline) counts as a failed write.
    void finishEventClose(forEvent).catch(() => false).then((ok) => {
      if (!mounted.current || myGeneration !== generation.current) return; // stale: mutate nothing
      inFlight.current = false;
      if (ok) { done.current = true; clearTimer(); persistedRef.current?.(); return; }
      if (attempts.current < FINISH_MAX_ATTEMPTS) {
        timer.current = setTimeout(() => attemptRef.current(), finishRetryDelay(attempts.current));
      }
    });
  };

  // Mount / unmount, and the two events that may retry at once.
  useEffect(() => {
    mounted.current = true;
    const kick = () => {
      if (done.current || !wanted.current || hidden() || inFlight.current) return;
      const exhausted = attempts.current >= FINISH_MAX_ATTEMPTS;
      if (!exhausted && !dueWhileHidden.current) return; // mid-chain: the pending backoff timer keeps its turn
      if (exhausted) attempts.current = 0; // a new chain
      clearTimer();
      attemptRef.current();
    };
    const onVisibility = () => { if (!hidden()) kick(); };
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      clearTimer();
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Round 7b/7c: another event in the same mounted page starts from a clean slate; an in-flight request for the old
  // event becomes stale (new generation).
  useEffect(() => {
    if (event.current === eventId) return;
    event.current = eventId;
    generation.current += 1;
    clearTimer();
    done.current = alreadyFinished;
    wanted.current = false;
    attempts.current = 0;
    inFlight.current = false;
    dueWhileHidden.current = false;
  }, [eventId, alreadyFinished]);

  // Round 7c (Gemini): the caller learning that this event's close is already finished means nothing is owed.
  // P1542 review round 4 (R3): that is a persisted finish too (another tab wrote it) — the room is told.
  useEffect(() => {
    if (!alreadyFinished) return;
    persistedRef.current?.();
    done.current = true;
    generation.current += 1; // an in-flight request's answer no longer matters
    inFlight.current = false;
    clearTimer();
  }, [alreadyFinished]);

  // Reaching the thank-you owes the write; leaving it for the terms does not cancel it (no cleanup here on purpose).
  useEffect(() => {
    if (!atThankYou || done.current || wanted.current) return;
    wanted.current = true;
    attempts.current = 0;
    attemptRef.current();
  }, [atThankYou, eventId]);
}
