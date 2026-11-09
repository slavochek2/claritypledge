/**
 * @file use-mastermind-round.ts
 * @description P1529 §5 and §6: the reads and taps behind the mastermind's round screen. Each read polls only while it
 * can change by itself (the round's clock running, the words arriving, a draft being written); everything else is read on
 * mount, when the rounds move, when the tab returns, and after the person's own tap.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCanvasUpdateStep,
  getMyDraftRef,
  getMyEventCanvas,
  getMyNextVersionOffer,
  getMyRoundCanvas,
  getMyUpdateState,
  makeMyNextVersion,
  type CanvasUpdateStep,
  type MyUpdateState,
  type NextVersionOffer,
  type RoundCanvas,
} from '@/app/data/event-mastermind-service';
import { canvasService, type SharedCanvasRef } from '@/app/data/canvas-service';
import { getCanvasDraftState, publishCanvasDraft, retryCanvasRun } from '@/app/data/canvas-draft-service';
import {
  NOTE_FAILED,
  PUBLISH_REFUSED,
  RETRY_REFUSED,
  nextVersionNote,
  offerCanChange,
  updateCanChange,
  type TaskNote,
} from './mastermind-round-helpers';

const OFFER_POLL_MS = 8000;
const UPDATE_POLL_MS = 5000;

/** Runs `read` now, and again every `ms` while `active`; a tab returning to view reads at once. Stops on unmount. */
function usePoll(read: () => Promise<void>, active: boolean, ms: number) {
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') void read(); }, ms);
    return () => clearInterval(id);
  }, [read, active, ms]);
}

/**
 * The Clarity Canvas owner of this table's canvas, read once per round the person is seated in. A failed read is not "no
 * canvas": `failed` says so, and `retry` reads again.
 */
export function useRoundCanvas(roundId: string | null): { canvas: RoundCanvas | null; loaded: boolean; failed: boolean; retry: () => void } {
  const [read, setRead] = useState<{ roundId: string; canvas: RoundCanvas | null; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!roundId) return;
    let live = true;
    getMyRoundCanvas(roundId)
      .then(canvas => { if (live) setRead({ roundId, canvas, failed: false }); })
      .catch(() => { if (live) setRead({ roundId, canvas: null, failed: true }); });
    return () => { live = false; };
  }, [roundId, attempt]);
  const retry = useCallback(() => { setRead(null); setAttempt(n => n + 1); }, []);
  const mine = read && read.roundId === roundId ? read : null;
  return { canvas: mine?.canvas ?? null, loaded: !!mine, failed: !!mine?.failed, retry };
}

/**
 * Every canvas shared with the event: the same read behind EventSharedCanvases (no new RPC). Read once per event for a
 * seated person. A failed read is `failed`: the card then shows the table's canvas alone, with no selector.
 */
export function useEventCanvasChoices(eventId: string, enabled: boolean, roundId: string | null): { list: SharedCanvasRef[]; failed: boolean } {
  const [read, setRead] = useState<{ eventId: string; list: SharedCanvasRef[]; failed: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    canvasService.listSharedWithEvent(eventId)
      .then(list => { if (live) setRead({ eventId, list, failed: false }); })
      .catch(() => { if (live) setRead({ eventId, list: [], failed: true }); });
    return () => { live = false; };
  }, [eventId, enabled, roundId]); // re-read each round: canvases shared or published meanwhile
  const mine = read && read.eventId === eventId ? read : null;
  return { list: mine?.list ?? [], failed: !mine || mine.failed };
}

/** The update step the host started: re-read when the rounds change (starting it ends the round; the next round ends it). */
export function useUpdateStep(eventId: string, enabled: boolean, roundsKey: string): CanvasUpdateStep | null {
  const [step, setStep] = useState<CanvasUpdateStep | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    getCanvasUpdateStep(eventId).then(s => { if (live) setStep(s); }).catch(() => { /* keep what is shown */ });
    return () => { live = false; };
  }, [eventId, enabled, roundsKey]);
  return step;
}

export interface OwnerUpdate {
  offer: NextVersionOffer | null;
  update: MyUpdateState | null;
  /** The address parts of the open draft, for "look at it and tweak first". */
  draft: { canvasId: string; canvasName: string | null; versionName: string | null } | null;
  note: TaskNote | null;
  busy: boolean;
  make: () => Promise<void>;
  publish: () => Promise<void>;
  retry: () => Promise<void>;
}

export function useOwnerUpdate(eventId: string, enabled: boolean, roundsKey: string): OwnerUpdate {
  const [offer, setOffer] = useState<NextVersionOffer | null>(null);
  const [update, setUpdate] = useState<MyUpdateState | null>(null);
  const [draft, setDraft] = useState<OwnerUpdate['draft']>(null);
  const [note, setNote] = useState<TaskNote | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const readOffer = useCallback(async () => {
    try { const next = await getMyNextVersionOffer(eventId); if (alive.current) setOffer(next); } catch { /* keep what is shown */ }
  }, [eventId]);
  const readUpdate = useCallback(async () => {
    try { const next = await getMyUpdateState(eventId); if (alive.current) setUpdate(next); } catch { /* keep what is shown */ }
  }, [eventId]);
  const readBoth = useCallback(async () => { await Promise.all([readOffer(), readUpdate()]); }, [readOffer, readUpdate]);

  useEffect(() => {
    if (enabled) void readBoth();
  }, [enabled, roundsKey, readBoth]);
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void readBoth(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, readBoth]);

  // The draft's address parts, once it exists; the expire read below needs its canvas.
  const draftId = update?.draftId ?? null;
  useEffect(() => {
    if (!draftId) { setDraft(null); return; }
    let live = true;
    Promise.all([getMyDraftRef(draftId), getMyEventCanvas(eventId)])
      .then(([d, c]) => { if (live) setDraft(d ? { ...d, canvasName: c?.name ?? null } : null); })
      .catch(() => { /* the tweak link just stays hidden */ });
    return () => { live = false; };
  }, [draftId, eventId]);

  // While a draft is being written: the database fails a run past its lease only when asked (get_canvas_draft_state), so
  // each poll asks, then reads the state.
  const drafting = updateCanChange(update);
  const canvasId = draft?.canvasId ?? null;
  const readDrafting = useCallback(async () => {
    if (canvasId) { try { await getCanvasDraftState(canvasId); } catch { /* the plain read below still tells */ } }
    await readUpdate();
  }, [canvasId, readUpdate]);
  usePoll(readDrafting, enabled && drafting, UPDATE_POLL_MS);
  usePoll(readOffer, enabled && offerCanChange(offer), OFFER_POLL_MS);

  const guard = async (work: () => Promise<TaskNote | null>) => {
    setBusy(true);
    try {
      const next = await work();
      if (alive.current) setNote(next);
    } catch {
      if (alive.current) setNote({ kind: 'error', text: NOTE_FAILED });
    } finally {
      if (alive.current) setBusy(false);
      await readBoth();
    }
  };

  const make = () => guard(async () => {
    if (!offer?.roundId) return null;
    return nextVersionNote(await makeMyNextVersion(offer.roundId));
  });

  const publish = () => guard(async () => {
    if (!update?.draftId || update.revision === null) return null;
    const r = await publishCanvasDraft(update.draftId, update.revision);
    return r.ok ? null : { kind: 'error', text: PUBLISH_REFUSED[r.refused] ?? NOTE_FAILED };
  });

  const retry = () => guard(async () => {
    if (!update?.draftId || update.revision === null || !update.runId) return null;
    const r = await retryCanvasRun({ draftId: update.draftId, failedRunId: update.runId, expectedRevision: update.revision, clientId: crypto.randomUUID() });
    if (!r.ok) return { kind: 'error', text: RETRY_REFUSED[r.refused] ?? NOTE_FAILED };
    return r.start && !r.start.ok ? { kind: 'error', text: 'Your mirror could not start the draft. Try again in a moment.' } : null;
  });

  return { offer, update, draft, note, busy, make, publish, retry };
}
