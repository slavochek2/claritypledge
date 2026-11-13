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
import { getCanvasDraftState, retryCanvasRun } from '@/app/data/canvas-draft-service';
import {
  NOTE_FAILED,
  RETRY_REFUSED,
  GAP_POLL_MS,
  eveningEndedAfter,
  nextVersionNote,
  offerCanChange,
  type TaskNote,
} from './mastermind-round-helpers';

const OFFER_POLL_MS = 5000;
const MAX_READ_FAILS = 3;

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
  /** The address parts of the open draft, for the draft link. */
  draft: { canvasId: string; canvasName: string | null; versionName: string | null } | null;
  note: TaskNote | null;
  busy: boolean;
  /** The last read of the offer failed (what is shown, if anything, may be out of date). */
  readFailed: boolean;
  /** Reads the offer again (the card's Try again after a failed read). */
  reread: () => Promise<void>;
  /** The owner's canvas tag for this event (read once published), for "Open it": it does not depend on an open draft. */
  canvasName: string | null;
  /** The draft's address could not be read (after the bounded retries): the card offers Try again. */
  draftFailed: boolean;
  /** Reads the draft's address again. */
  retryDraft: () => void;
  /** "Create next version": drafts without publishing (Publish happens in the workspace), then hands the draft's address to `open`. */
  make: (open: (draft: { canvasName: string | null; versionName: string | null } | null) => void) => Promise<void>;
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

const DRAFT_ADDRESS_TRIES = 3;
const DRAFT_ADDRESS_RETRY_MS = 4000;

/**
 * The open draft's address parts, once it exists (for the draft link). A failed read is tried again while the tab is in view, up to
 * DRAFT_ADDRESS_TRIES times; after that `failed` is set and the card offers Try again (`retry` starts the bounded tries over).
 */
function useDraftAddress(eventId: string, draftId: string | null): { draft: OwnerUpdate['draft']; failed: boolean; retry: () => void } {
  const [draft, setDraft] = useState<OwnerUpdate['draft']>(null);
  const [fails, setFails] = useState(0);
  const [round, setRound] = useState(0);
  const visible = useTabVisible();
  useEffect(() => { setFails(0); }, [draftId, eventId]);
  useEffect(() => {
    if (!draftId) { setDraft(null); return; }
    if (!visible || fails >= DRAFT_ADDRESS_TRIES) return;
    let live = true;
    // The first try is at once; each later one waits (a failed read is often a moment's network).
    const timer = setTimeout(() => {
      Promise.all([getMyDraftRef(draftId), getMyEventCanvas(eventId)])
        .then(([d, c]) => { if (!live) return; if (d) { setDraft({ ...d, canvasName: c?.name ?? null }); setFails(0); } else setFails(n => n + 1); })
        .catch(() => { if (live) setFails(n => n + 1); });
    }, fails === 0 ? 0 : DRAFT_ADDRESS_RETRY_MS);
    return () => { live = false; clearTimeout(timer); };
  }, [draftId, eventId, visible, fails, round]);
  return { draft, failed: !!draftId && !draft && fails >= DRAFT_ADDRESS_TRIES, retry: () => { setFails(0); setRound(n => n + 1); } };
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

/** One tap of "Create next version" (never auto-published): the sentence to show, and the draft it made. */
async function startRun(offer: NextVersionOffer | null): Promise<{ note: TaskNote | null; draftId: string | null }> {
  if (!offer?.roundId) return { note: { kind: 'error', text: NOTE_FAILED }, draftId: null };
  const result = await makeMyNextVersion(offer.roundId, false);
  return { note: nextVersionNote(result), draftId: result.status === 'started' ? result.draftId : null };
}

/**
 * The owner's current next version, one owned round at a time (see get_my_next_version_offer). Nothing is ever published from here: the tap
 * makes a draft and the owner reviews and publishes it in the canvas workspace (an older tap that stored auto_publish = true is treated the same).
 */
export function useOwnerUpdate(eventId: string, enabled: boolean, roundsKey: string): OwnerUpdate {
  const [offer, setOffer] = useState<NextVersionOffer | null>(null);
  const [note, setNote] = useState<TaskNote | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const { readOffer, fails } = useOfferReads(eventId, enabled, roundsKey, setOffer, alive);
  const { draft, failed: draftFailed, retry: retryDraft } = useDraftAddress(eventId, offer?.draftId ?? null);
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

  const make: OwnerUpdate['make'] = async open => {
    let made: string | null = null;
    await guard(async () => { const r = await startRun(offer); made = r.draftId; return r.note; });
    if (!made) return;
    try {
      const [d, c] = await Promise.all([getMyDraftRef(made), getMyEventCanvas(eventId)]);
      open(d ? { canvasName: c?.name ?? null, versionName: d.versionName } : null);
    } catch { open(null); }
  };

  const retry = () => guard(async () => {
    if (!offer?.draftId || offer.revision === null || !offer.runId) return null;
    const r = await retryCanvasRun({ draftId: offer.draftId, failedRunId: offer.runId, expectedRevision: offer.revision, clientId: crypto.randomUUID() });
    if (!r.ok) return { kind: 'error', text: RETRY_REFUSED[r.refused] ?? NOTE_FAILED };
    return r.start && !r.start.ok ? { kind: 'error', text: 'Your mirror could not start the draft. Try again in a moment.' } : null;
  });

  return { offer, draft, note, busy, readFailed, reread: readOffer, canvasName, draftFailed, retryDraft, make, retry };
}
