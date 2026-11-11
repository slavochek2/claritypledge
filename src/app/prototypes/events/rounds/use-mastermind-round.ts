/**
 * @file use-mastermind-round.ts
 * @description P1529 §5 and §6: the reads and taps behind the mastermind's round screen. Each read polls only while it
 * can change by itself (the round's clock running, the words arriving, a draft being written); everything else is read on
 * mount, when the rounds move, when the tab returns, and after the person's own tap.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getEveningEnd,
  getMyDraftRef,
  getMyEventCanvas,
  getMyNextVersionOffer,
  getMyRoundCanvas,
  makeMyNextVersion,
  type NextVersionOffer,
  type RoundCanvas,
} from '@/app/data/event-mastermind-service';
import { startVisiblePoll } from '@/lib/visible-poll';
import type { EventRound } from '@/app/data/event-rounds-service';
import { canvasService, type SharedCanvasRef } from '@/app/data/canvas-service';
import { getCanvasDraftState, publishCanvasDraft, retryCanvasRun } from '@/app/data/canvas-draft-service';
import {
  NOTE_FAILED,
  PUBLISH_REFUSED,
  RETRY_REFUSED,
  GAP_POLL_MS,
  eveningEndedAfter,
  nextVersionNote,
  offerCanChange,
  type TaskNote,
} from './mastermind-round-helpers';

const OFFER_POLL_MS = 5000;

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
export function useEventCanvasChoices(eventId: string, enabled: boolean, roundId: string | null): { list: SharedCanvasRef[]; failed: boolean; loaded: boolean } {
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
  return { list: mine?.list ?? [], failed: !mine || mine.failed, loaded: !!mine };
}

/**
 * When the host ended the evening (null: not ended; undefined: not read yet). Read only while `watch` (no round on, rounds behind us,
 * event not closed) and the evening is not over: once over it is never read again; a round running needs no read (ending the evening
 * ends it, and the next watch starts with a read). The first read and the poll both wait for a visible tab (startVisiblePoll's own
 * rule). Cost: GAP_POLL_MS (3600 / 8 = 450 an hour per visible phone between rounds, 0 otherwise).
 */
export function useEveningEnd(eventId: string, enabled: boolean, rounds: ReadonlyArray<{ startedAt: string }>, watch: boolean): string | null | undefined {
  // undefined: not read yet (the card then shows neither "between rounds" nor "over"); a failed first read counts as not ended.
  // Stored with its event: a value read for another event is never this one's (switching events carries no stamp across).
  const [read0, setRead0] = useState<{ eventId: string; endedAt: string | null } | null>(null);
  const endedAt = read0 && read0.eventId === eventId ? read0.endedAt : undefined;
  const read = useCallback(async () => {
    try { setRead0({ eventId, endedAt: await getEveningEnd(eventId) }); } catch { setRead0(prev => (prev && prev.eventId === eventId ? prev : { eventId, endedAt: null })); }
  }, [eventId]);
  const active = enabled && watch && !eveningEndedAfter(endedAt ?? null, rounds);
  useEffect(() => {
    if (!active) return;
    if (document.visibilityState !== 'hidden') void read();
    return startVisiblePoll(() => void read(), GAP_POLL_MS);
  }, [active, read]);
  return endedAt;
}

/** The gap between rounds, as a phone reads it: the evening's stamp, and what follows. */
export function useRoundsGap({ eventId, enabled, rounds, round, ended }: {
  eventId: string;
  enabled: boolean;
  rounds: readonly EventRound[];
  /** The round that is on, if any. */
  round: unknown;
  /** The event itself has closed. */
  ended: boolean;
}) {
  const gap = !ended && !round && rounds.length > 0;
  const eveningEnd = useEveningEnd(eventId, enabled, rounds, gap);
  const eveningOver = gap && eveningEndedAfter(eveningEnd ?? null, rounds);
  return { eveningEnd, eveningOver, betweenRounds: gap && eveningEnd !== undefined && !eveningOver, idle: gap };
}

export interface OwnerUpdate {
  offer: NextVersionOffer | null;
  /** The address parts of the open draft, for "Preview first". */
  draft: { canvasId: string; canvasName: string | null; versionName: string | null } | null;
  note: TaskNote | null;
  busy: boolean;
  /** The one-tap chain's publish was refused: the finished draft offers Try again. */
  publishFailed: boolean;
  /** "Create next version": drafts and publishes. */
  make: () => Promise<void>;
  /** "Preview first": drafts without publishing, then hands the draft's address to `open`. */
  preview: (open: (draft: { canvasName: string | null; versionName: string | null } | null) => void) => Promise<void>;
  publish: () => Promise<void>;
  retry: () => Promise<void>;
}

/** Reads the offer on mount, when the rounds move and when the tab returns. */
function useOfferReads(
  eventId: string,
  enabled: boolean,
  roundsKey: string,
  setOffer: (offer: NextVersionOffer) => void,
  alive: { current: boolean },
) {
  const readOffer = useCallback(async () => {
    try { const next = await getMyNextVersionOffer(eventId); if (alive.current) setOffer(next); } catch { /* keep what is shown */ }
  }, [eventId, setOffer, alive]);
  useEffect(() => {
    if (enabled) void readOffer();
  }, [enabled, roundsKey, readOffer]);
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void readOffer(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, readOffer]);
  return { readOffer };
}

/** The open draft's address parts, once it exists (for "Preview first" and the expire read). */
function useDraftAddress(eventId: string, draftId: string | null): OwnerUpdate['draft'] {
  const [draft, setDraft] = useState<OwnerUpdate['draft']>(null);
  useEffect(() => {
    if (!draftId) { setDraft(null); return; }
    let live = true;
    Promise.all([getMyDraftRef(draftId), getMyEventCanvas(eventId)])
      .then(([d, c]) => { if (live) setDraft(d ? { ...d, canvasName: c?.name ?? null } : null); })
      .catch(() => { /* the preview link just stays hidden */ });
    return () => { live = false; };
  }, [draftId, eventId]);
  return draft;
}

/** One tap of "Create next version" (autoPublish) or "Preview first": the sentence to show, and the draft it made. */
async function startRun(offer: NextVersionOffer | null, autoPublish: boolean): Promise<{ note: TaskNote | null; draftId: string | null }> {
  if (!offer?.roundId) return { note: { kind: 'error', text: NOTE_FAILED }, draftId: null };
  const result = await makeMyNextVersion(offer.roundId, autoPublish);
  return { note: nextVersionNote(result), draftId: result.status === 'started' ? result.draftId : null };
}

/**
 * The owner's current next version, one owned round at a time (see get_my_next_version_offer). Publishing is chained here, not on the
 * server: publish_canvas_draft acts as the signed-in owner (auth.uid()), so a service-side hook has no caller to act as. The tap stores
 * its intent (`autoPublish`) in the database, so any read that finds a finished draft of a one-tap round publishes it, however slow or
 * closed the phone was meanwhile, and each draft is tried once per mount (a refusal shows Try again).
 */
export function useOwnerUpdate(eventId: string, enabled: boolean, roundsKey: string): OwnerUpdate {
  const [offer, setOffer] = useState<NextVersionOffer | null>(null);
  const [note, setNote] = useState<TaskNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedDraft, setFailedDraft] = useState<string | null>(null);
  const alive = useRef(true);
  const attempted = useRef(new Set<string>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const { readOffer } = useOfferReads(eventId, enabled, roundsKey, setOffer, alive);
  const draft = useDraftAddress(eventId, offer?.draftId ?? null);
  const draftId = offer?.draftId ?? null;

  // While a draft is being written: the database fails a run past its lease only when asked (get_canvas_draft_state), so each poll asks.
  const canvasId = draft?.canvasId ?? null;
  const drafting = offer?.state === 'drafting';
  const readDrafting = useCallback(async () => {
    if (canvasId && drafting) { try { await getCanvasDraftState(canvasId); } catch { /* the plain read below still tells */ } }
    await readOffer();
  }, [canvasId, drafting, readOffer]);
  usePoll(readDrafting, enabled && offerCanChange(offer), OFFER_POLL_MS);

  const guard = async (work: () => Promise<TaskNote | null>) => {
    setBusy(true);
    try {
      const next = await work();
      if (alive.current) setNote(next);
    } catch {
      if (alive.current) setNote({ kind: 'error', text: NOTE_FAILED });
    } finally {
      // Busy until the re-read has landed, so a started draft shows its state instead of the button flashing back.
      try { await readOffer(); } finally { if (alive.current) setBusy(false); }
    }
  };

  const doPublish = async (): Promise<TaskNote | null> => {
    if (!offer?.draftId || offer.revision === null) return null;
    const r = await publishCanvasDraft(offer.draftId, offer.revision);
    if (r.ok) { setFailedDraft(null); return null; }
    setFailedDraft(offer.draftId);
    return { kind: 'error', text: PUBLISH_REFUSED[r.refused] ?? NOTE_FAILED };
  };

  // The chain: a finished draft of a one-tap round is published once, by whichever screen reads it first.
  const chainKey = offer?.state === 'ready' && offer.autoPublish && offer.draftId ? `${offer.draftId}:${offer.revision}` : null;
  useEffect(() => {
    if (!enabled || !chainKey || attempted.current.has(chainKey)) return;
    attempted.current.add(chainKey);
    void guard(async () => {
      try { return await doPublish(); } catch { setFailedDraft(offer?.draftId ?? null); return { kind: 'error', text: NOTE_FAILED }; }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one attempt per finished draft (chainKey), not per render
  }, [enabled, chainKey]);

  const make = () => guard(async () => (await startRun(offer, true)).note);

  const preview: OwnerUpdate['preview'] = async open => {
    let made: string | null = null;
    await guard(async () => { const r = await startRun(offer, false); made = r.draftId; return r.note; });
    if (!made) return;
    try {
      const [d, c] = await Promise.all([getMyDraftRef(made), getMyEventCanvas(eventId)]);
      open(d ? { canvasName: c?.name ?? null, versionName: d.versionName } : null);
    } catch { open(null); }
  };

  const publish = () => guard(doPublish);

  const retry = () => guard(async () => {
    if (!offer?.draftId || offer.revision === null || !offer.runId) return null;
    const r = await retryCanvasRun({ draftId: offer.draftId, failedRunId: offer.runId, expectedRevision: offer.revision, clientId: crypto.randomUUID() });
    if (!r.ok) return { kind: 'error', text: RETRY_REFUSED[r.refused] ?? NOTE_FAILED };
    return r.start && !r.start.ok ? { kind: 'error', text: 'Your mirror could not start the draft. Try again in a moment.' } : null;
  });

  return { offer, draft, note, busy, publishFailed: !!draftId && failedDraft === draftId, make, preview, publish, retry };
}
