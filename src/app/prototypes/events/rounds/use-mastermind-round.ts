/**
 * @file use-mastermind-round.ts
 * @description P1529 §5 and §6: the reads and taps behind the mastermind's round screen. Each read polls only while it
 * can change by itself (the round's clock running, the words arriving, a draft being written); everything else is read on
 * mount, when the rounds move, when the tab returns, and after the person's own tap.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getEveningEnd,
  getMyDraftRef,
  getMyEventCanvas,
  getMyNextVersionOffer,
  makeMyNextVersion,
  type NextVersionOffer,
} from '@/app/data/event-mastermind-service';
import { useTabVisible } from './use-round-canvas-reads';

// The once-per-round reads live beside the visibility rule; callers keep importing them from here.
export { useEventCanvasChoices, useRoundCanvas } from './use-round-canvas-reads';
import { startVisiblePoll } from '@/lib/visible-poll';
import type { EventRound } from '@/app/data/event-rounds-service';
import { discardCanvasDraft, getCanvasDraftState, publishCanvasDraft, retryCanvasRun } from '@/app/data/canvas-draft-service';
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
const MAX_READ_FAILS = 3;

/** Drafts being published right now, across mounts of the card: a second publish of the same draft is refused by the server
 * (stale_view), so a remount while one is in flight joins the first instead of starting another. */
const publishing = new Map<string, ReturnType<typeof publishCanvasDraft>>();
/** Per draft id: the first revision seen finished ('ready') of a one-tap run. Only that revision is ever auto-published; any later one is the owner's own edit. Module-level so it survives the room remounting after a visit to the workspace. */
const firstReadyRevision = new Map<string, number>();

/** Runs `read` now, and again every `ms` while `active`; a tab returning to view reads at once. Stops on unmount. */
function usePoll(read: () => Promise<void>, active: boolean, ms: number) {
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { if (document.visibilityState !== 'hidden') void read(); }, ms);
    return () => clearInterval(id);
  }, [read, active, ms]);
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
  /** The last read of the offer failed (what is shown, if anything, may be out of date). */
  readFailed: boolean;
  /** Reads the offer again (the card's Try again after a failed read). */
  reread: () => Promise<void>;
  /** The one-tap chain's publish was refused: the finished draft offers Try again. */
  publishFailed: boolean;
  /** A ready draft whose revision is not the AI run's (the owner edited it): never auto-published, so the card shows the manual ready face. */
  handEdited: boolean;
  /** The version number the last publish from this card made (null until one did). */
  publishedSeq: number | null;
  /** The unchanged draft could not be closed: the card offers "Close this". */
  discardFailed: boolean;
  /** The round whose unchanged draft was just closed while no other offer has arrived: its "nothing to add" stays. */
  nothingRound: string | null;
  closeDraft: () => Promise<void>;
  /** The owner's canvas tag for this event (read once published), for "Open it": it does not depend on an open draft. */
  canvasName: string | null;
  /** "Create next version": drafts and publishes. */
  make: () => Promise<void>;
  /** "Preview first": drafts without publishing, then hands the draft's address to `open`. */
  preview: (open: (draft: { canvasName: string | null; versionName: string | null } | null) => void) => Promise<void>;
  publish: () => Promise<void>;
  retry: () => Promise<void>;
}

/** Reads the offer on mount, when the rounds move and when the tab returns (the visible flag is the one return signal). */
function useOfferReads(
  eventId: string,
  enabled: boolean,
  roundsKey: string,
  setOffer: (offer: NextVersionOffer) => void,
  alive: { current: boolean },
) {
  const [fails, setFails] = useState(0);
  const visible = useTabVisible();
  const readOffer = useCallback(async () => {
    try {
      const next = await getMyNextVersionOffer(eventId);
      if (alive.current) { setOffer(next); setFails(0); }
    } catch { if (alive.current) setFails(n => n + 1); } // keep what is shown; the card says the read failed
  }, [eventId, setOffer, alive]);
  useEffect(() => {
    if (enabled && visible) void readOffer();
  }, [enabled, visible, roundsKey, readOffer]);
  return { readOffer, fails };
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

/**
 * The person's canvas tag for this event, read when `enabled` and the tab is in view. Kept per event (a different event starts empty); a failed or empty
 * read is tried again at the next refresh or tab return, so "Open it" is never hidden for good by one bad read.
 */
export function useOwnCanvasName(eventId: string, enabled: boolean, refresh: unknown): string | null {
  const [read, setRead] = useState<{ eventId: string; name: string } | null>(null);
  const visible = useTabVisible();
  const known = read?.eventId === eventId;
  useEffect(() => {
    if (!enabled || !visible || known) return;
    let live = true;
    getMyEventCanvas(eventId).then(c => { if (live && c?.name) setRead({ eventId, name: c.name }); }).catch(() => { /* tried again at the next refresh or tab return */ });
    return () => { live = false; };
  }, [eventId, enabled, visible, known, refresh]);
  return known ? read!.name : null;
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
 * closed the phone was meanwhile, and each draft is tried once per mount (a refusal shows Try again). Only the revision the AI run produced is
 * auto-published (a hand-edited one waits for the tap), and never while a round is running (`hold`): next versions happen in the break.
 */
export function useOwnerUpdate(eventId: string, enabled: boolean, roundsKey: string, hold = false): OwnerUpdate {
  const [offer, setOffer] = useState<NextVersionOffer | null>(null);
  const [note, setNote] = useState<TaskNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [failedDraft, setFailedDraft] = useState<string | null>(null);
  const [discardFailed, setDiscardFailed] = useState(false);
  const [published, setPublished] = useState<{ roundId: string | null; seq: number } | null>(null);
  // The round whose unchanged draft was closed: its "nothing to add" stays until a different offer arrives.
  const [settledRound, setSettledRound] = useState<string | null>(null);
  const alive = useRef(true);
  const attempted = useRef(new Set<string>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const { readOffer, fails } = useOfferReads(eventId, enabled, roundsKey, setOffer, alive);
  const draft = useDraftAddress(eventId, offer?.draftId ?? null);
  const draftId = offer?.draftId ?? null;
  // A refused publish belongs to ONE revision of the draft: a changed draft is ready again (Publish, not Try again or "nothing to add").
  const draftKey = draftId ? `${draftId}:${offer?.revision ?? ''}` : null;
  const canvasName = useOwnCanvasName(eventId, offer?.state === 'published', offer);

  // While a draft is being written: the database fails a run past its lease only when asked (get_canvas_draft_state), so each poll asks.
  const canvasId = draft?.canvasId ?? null;
  const drafting = offer?.state === 'drafting';
  const readDrafting = useCallback(async () => {
    if (canvasId && drafting) { try { await getCanvasDraftState(canvasId); } catch { /* the plain read below still tells */ } }
    await readOffer();
  }, [canvasId, drafting, readOffer]);
  // Never polls an offer that has not been read (the mount read is the first; a failed one shows Try again instead).
  // Consecutive failures back the poll off (5, 10, 20 s) and stop it at MAX_READ_FAILS; the card then shows Try again.
  // A settled state (offer, ready, published) is not polled, so its first failed refresh is said at once; a polled one waits for the third.
  const readFailed = fails > 0 && (!offer || fails >= MAX_READ_FAILS || !offerCanChange(offer));
  // Each backoff step carries ±30% jitter (drawn once per failure count, so the timer is not reset by renders), so screens do not retry in step.
  const pollMs = useMemo(() => (fails > 0 ? OFFER_POLL_MS * 2 ** fails * (0.7 + Math.random() * 0.6) : OFFER_POLL_MS), [fails]);
  usePoll(readDrafting, enabled && !!offer && fails < MAX_READ_FAILS && offerCanChange(offer), pollMs);

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

  const closeUnchanged = async (id: string, revision: number, roundId: string | null) => {
    try { const d = await discardCanvasDraft(id, revision); if (alive.current) { setDiscardFailed(!d.ok); if (d.ok) setSettledRound(roundId); } } catch { if (alive.current) setDiscardFailed(true); }
  };
  /** "Close this": the retry of that discard when it failed; the offer is re-read after, and moves on. */
  const closeDraft = () => guard(async () => {
    if (offer?.draftId && offer.revision !== null) await closeUnchanged(offer.draftId, offer.revision, offer.roundId);
    return note;
  });

  useEffect(() => { if (offer && offer.state !== 'none') setSettledRound(null); }, [offer]);
  const nothingRound = settledRound && (!offer || offer.state === 'none') ? settledRound : null;
  // The number belongs to the round that made it; any other published offer reads "Your next version is published."
  const publishedSeq = published && published.roundId === (offer?.roundId ?? null) ? published.seq : null;

  const doPublish = async (): Promise<TaskNote | null> => {
    if (!offer?.draftId || offer.revision === null) return null;
    const key = `${offer.draftId}:${offer.revision}`;
    // A remounted card awaits the publish already in flight, so it gets that publish's refusal (or success) too.
    let pending = publishing.get(key);
    if (!pending) {
      pending = publishCanvasDraft(offer.draftId, offer.revision);
      publishing.set(key, pending);
      const clear = () => { publishing.delete(key); };
      pending.then(clear, clear);
    }
    const r = await pending;
    if (r.ok) { setFailedDraft(null); setPublished({ roundId: offer.roundId, seq: r.seq }); return null; }
    // "The draft just changed" because another open room already published it: show the published state, not the error.
    if (r.refused === 'stale_view') {
      try {
        const fresh = await getMyNextVersionOffer(eventId);
        if (fresh.state === 'published') { setFailedDraft(null); return null; }
      } catch { /* fall through to the refusal */ }
    }
    setFailedDraft(`${offer.draftId}:${offer.revision}`);
    // A draft that changes nothing is closed through the ordinary discard, or it would block every later round's offer.
    if (r.refused === 'no_changes') await closeUnchanged(offer.draftId, offer.revision, offer.roundId);
    // A draft that changes nothing is a normal outcome, not a failure: the card says so calmly (no Try again).
    return { kind: r.refused === 'no_changes' ? 'nothing_new' : 'error', text: PUBLISH_REFUSED[r.refused] ?? NOTE_FAILED };
  };

  // The chain: a finished draft of a one-tap round is published once, by whichever screen reads it first.
  if (offer?.state === 'ready' && offer.autoPublish && offer.draftId && offer.revision !== null && !firstReadyRevision.has(offer.draftId)) firstReadyRevision.set(offer.draftId, offer.revision);
  const aiRevision = offer?.draftId ? firstReadyRevision.get(offer.draftId) : undefined;
  // A revision the AI run did not produce (the owner's own edit) is never auto-published: the card shows the manual ready face.
  const handEdited = offer?.state === 'ready' && offer.autoPublish && offer.revision !== null && aiRevision !== undefined && offer.revision !== aiRevision;
  const chainKey = !hold && offer?.state === 'ready' && offer.autoPublish && offer.draftId && offer.revision === aiRevision ? `${offer.draftId}:${offer.revision}` : null;
  useEffect(() => {
    if (!enabled || !chainKey || attempted.current.has(chainKey)) return;
    attempted.current.add(chainKey);
    void guard(async () => {
      try { return await doPublish(); } catch { setFailedDraft(draftKey); return { kind: 'error', text: NOTE_FAILED }; }
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

  return { offer, draft, note, busy, readFailed, reread: readOffer, publishFailed: !!draftKey && failedDraft === draftKey, handEdited, publishedSeq, nothingRound, canvasName, discardFailed, closeDraft, make, preview, publish, retry };
}
