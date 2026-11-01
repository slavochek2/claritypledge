/**
 * @file use-settled-run.ts
 * @description P1536 §2 Publish spot: "Updating…" lasts until the read that FOLLOWS a run's end has answered. A run finishes in the thread
 * before the canvas page has re-read its points, so the spot would otherwise fall back to what the old read says ("Not published yet") for a
 * moment and then jump to Publish. The thread says a run ended well with an 'updated' event (canvas-draft-events), and the page re-reads on it:
 * the spot holds from the run's end until the page reports a read newer than the one on screen when the event came. A run that ended without
 * that event (failed, cancelled) changes nothing on the page, so nothing is held. A failsafe lets go if the read never answers.
 */
import { useEffect, useRef, useState } from 'react';
import { subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';

/** The longest the spot holds "Updating…" for a read that has not answered. */
export const SETTLE_MAX_MS = 8_000;

export function useSettledRun<R>(runActive: boolean, read: R | null): boolean {
  /** The read the spot is waiting to see replaced; null: not holding. `none` marks "holding on a read that is null". */
  const [heldFrom, setHeldFrom] = useState<{ read: R | null } | null>(null);
  const readNow = useRef(read);
  readNow.current = read;
  /** The read on screen when a run's 'updated' event came (undefined: none came since the run began). */
  const eventAt = useRef<{ read: R | null } | undefined>(undefined);
  const wasActive = useRef(false);
  useEffect(() => subscribeCanvasDraftEvents((e) => {
    if (e.kind === 'updated') eventAt.current = { read: readNow.current };
  }), []);
  useEffect(() => {
    if (runActive) {
      eventAt.current = undefined;
      wasActive.current = true;
      return;
    }
    const at = eventAt.current;
    if (wasActive.current && at && at.read === readNow.current) setHeldFrom(at);
    wasActive.current = false;
  }, [runActive]);
  // The read after the event answered (the page reported a different one): let go. Failsafe: a read that never answers.
  const holding = heldFrom !== null && heldFrom.read === read;
  useEffect(() => {
    if (heldFrom && heldFrom.read !== read) setHeldFrom(null);
  }, [heldFrom, read]);
  useEffect(() => {
    if (!heldFrom) return;
    const t = setTimeout(() => setHeldFrom(null), SETTLE_MAX_MS);
    return () => clearTimeout(t);
  }, [heldFrom]);
  return runActive || holding;
}
