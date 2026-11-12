/**
 * @file use-round-canvas-reads.ts
 * @description P1529: the round card's two once-per-round reads (the table's Clarity Canvas, the canvases shared with the event) and the
 * visibility rule they share. A hidden tab reads nothing (metered-services rule 3); coming back to view reads at once.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMyRoundCanvas, type RoundCanvas } from '@/app/data/event-mastermind-service';
import { canvasService, type SharedCanvasRef } from '@/app/data/canvas-service';

/** True while the tab is in view. A hidden tab reads nothing (metered-services rule 3); coming back re-runs every effect keyed on this. */
export function useTabVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/**
 * The Clarity Canvas owner of this table's canvas, read once per round the person is seated in. A failed read is not "no
 * canvas": `failed` says so, and `retry` reads again.
 */
export function useRoundCanvas(roundId: string | null, seatKey = ''): { canvas: RoundCanvas | null; loaded: boolean; failed: boolean; retry: () => void } {
  // The read is keyed on the round AND the seating that decides whose canvas it is (my table + its owner): the host moving
  // someone or swapping roles inside a running round reads again. A hidden tab reads nothing; a key that already succeeded is not re-read on return.
  const key = roundId ? `${roundId}|${seatKey}` : null;
  const [read, setRead] = useState<{ key: string; canvas: RoundCanvas | null; failed: boolean } | null>(null);
  const readRef = useRef(read);
  readRef.current = read;
  const [attempt, setAttempt] = useState(0);
  const visible = useTabVisible();
  useEffect(() => {
    if (!roundId || !key || !visible) return;
    if (readRef.current?.key === key && !readRef.current.failed) return;
    let live = true;
    getMyRoundCanvas(roundId)
      .then(canvas => { if (live) setRead({ key, canvas, failed: false }); })
      .catch(() => { if (live) setRead({ key, canvas: null, failed: true }); });
    return () => { live = false; };
  }, [roundId, key, attempt, visible]);
  const retry = useCallback(() => { setRead(null); setAttempt(n => n + 1); }, []);
  const mine = read && read.key === key ? read : null;
  return { canvas: mine?.canvas ?? null, loaded: !!mine, failed: !!mine?.failed, retry };
}

/**
 * Every canvas shared with the event: the same read behind EventSharedCanvases (no new RPC). Read once per event for a
 * seated person. A failed read is `failed`: the card then shows the table's canvas alone, with no selector.
 */
export function useEventCanvasChoices(eventId: string, enabled: boolean, roundId: string | null): { list: SharedCanvasRef[]; failed: boolean; loaded: boolean } {
  const [read, setRead] = useState<{ eventId: string; roundKey: string | null; list: SharedCanvasRef[]; failed: boolean } | null>(null);
  const readRef = useRef(read);
  readRef.current = read;
  const visible = useTabVisible();
  useEffect(() => {
    if (!enabled || !visible) return;
    const done = readRef.current;
    if (done && done.eventId === eventId && done.roundKey === roundId && !done.failed) return; // already read for this round
    let live = true;
    canvasService.listSharedWithEvent(eventId)
      .then(list => { if (live) setRead({ eventId, roundKey: roundId, list, failed: false }); })
      .catch(() => { if (live) setRead({ eventId, roundKey: roundId, list: [], failed: true }); });
    return () => { live = false; };
  }, [eventId, enabled, roundId, visible]); // re-read each round: canvases shared or published meanwhile
  const mine = read && read.eventId === eventId ? read : null;
  return { list: mine?.list ?? [], failed: !mine || mine.failed, loaded: !!mine };
}

