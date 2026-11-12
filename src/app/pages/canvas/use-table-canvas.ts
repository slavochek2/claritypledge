/**
 * @file use-table-canvas.ts
 * @description P1529: what a canvas opened from the event room's table does with the table. (1) When the host ends a round or starts the next one it says so and,
 * after a 5-second countdown, takes the person back to the table (the owner editing an open draft gets a link and no countdown). (2) It opens in Compare with the
 * table's counterpart. Nothing here runs for a canvas that was not opened from a table: `table` is null and no read is made.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/auth';
import { useNavigate, type Location } from 'react-router-dom';
import { tryRoomRoster } from '@/app/data/event-room-service';
import { isViewingDraft, type CanvasPerson, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { useEventRounds } from '@/app/prototypes/events/rounds/use-event-rounds';
import type { EventRoomMember } from '@/app/types';
import { pageIsBusy, roundChange, roundChangeLine, roundMarkOf, tableCounterpart, type RoundChange, type RoundMark } from './table-round-helpers';

export const ROUND_RETURN_SECONDS = 5;
const ROSTER_ATTEMPTS = 3;

/** The wait before roster retry N+1: 1s, 2s, each with +-30% jitter so phones that failed together do not retry together. */
export function retryWaitMs(attempt: number, random = Math.random): number {
  return 1000 * 2 ** (attempt - 1) * (0.7 + 0.6 * random());
}

/** The page's read, only while it is the one held for the canvas on screen (the held read carries the identity check); a previous canvas's read is null. */
export function scopedReady(ready: CanvasReady | null, held: CanvasReady | null): CanvasReady | null {
  return ready && ready === held ? ready : null;
}

type SetParams = (next: (prev: URLSearchParams) => URLSearchParams, options: { replace: boolean; state: Location['state'] }) => void;

export interface RoundReturnBarProps {
  line: string;
  /** Seconds left; null: no countdown (the owner's open draft), a link only. */
  left: number | null;
  to: string;
  onStay: () => void;
}

/** `linkOnly`: the page was busy (a dialog, a text field) at some point of this change, so it never moves by itself, and does not start counting again when the dialog closes. */
type Pending = RoundChange & { left: number; linkOnly: boolean };

/** The rounds of the event this canvas was opened from (read and polled only for a table canvas) and its roster (read once, for who is who). */
function useTableRounds(eventId: string | null) {
  // A hidden tab makes no read (visibleOnly) and a tab returning reads once at once (the hook's own visibilitychange read). Each read is 3 queries (rounds, seats, tables).
  const { state, loaded } = useEventRounds(eventId ?? undefined, !!eventId, true, { visibleOnly: true });
  const [roster, setRoster] = useState<EventRoomMember[]>([]);
  useEffect(() => {
    if (!eventId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onVisible: (() => void) | undefined;
    // A failed read is told from an empty roster (null): retried up to 3 times with growing waits, then the page simply has no counterpart (normal view).
    let retry: (attempt: number) => void = () => undefined;
    const read = (attempt: number) => {
      void tryRoomRoster(eventId).then(r => {
        if (!alive) return;
        if (r) setRoster(r);
        else if (attempt < ROSTER_ATTEMPTS) timer = setTimeout(() => retry(attempt + 1), retryWaitMs(attempt));
      }).catch(() => undefined);
    };
    // A hidden tab makes no request: the retry waits for the tab to come back (once), then reads.
    retry = (attempt: number) => {
      if (document.visibilityState !== 'hidden') { read(attempt); return; }
      const handler = () => { if (document.visibilityState === 'hidden') return; document.removeEventListener('visibilitychange', handler); onVisible = undefined; read(attempt); };
      onVisible = handler;
      document.addEventListener('visibilitychange', handler);
    };
    retry(1); // the first read goes through the same visibility check: a background tab reads once when it comes to the front
    return () => { alive = false; clearTimeout(timer); if (onVisible) document.removeEventListener('visibilitychange', onVisible); };
  }, [eventId]);
  return { state, loaded, roster };
}

/** The bar's props: set when the host moves the rounds after this page opened (the first read is a baseline), counted down, then the table. */
function useRoundReturn(to: string | null, eventId: string | null, mark: RoundMark | null, loaded: boolean, hold: boolean): RoundReturnBarProps | null {
  const navigate = useNavigate();
  const baseline = useRef<{ eventId: string | null; mark: RoundMark | null } | null>(null);
  // After the event changes the hook still shows the old event's rounds for one render: wait for it to empty (loaded false) before taking a new baseline.
  const waitReset = useRef(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const markKey = mark ? `${mark.id}:${mark.ended}` : '';
  useEffect(() => {
    if (baseline.current && baseline.current.eventId !== eventId) { baseline.current = null; waitReset.current = true; setPending(null); }
    if (!loaded) waitReset.current = false;
    if (!loaded || !to || waitReset.current) return;
    const prev = baseline.current;
    baseline.current = { eventId, mark };
    const change = prev ? roundChange(prev.mark, mark) : null;
    if (change) setPending({ ...change, left: ROUND_RETURN_SECONDS, linkOnly: pageIsBusy() });
    // `mark` is read through `markKey`: the poll hands a new object every few seconds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, to, eventId, markKey]);
  const left = pending?.left ?? null;
  const counting = !!pending && !pending.linkOnly;
  // While counting, a dialog opening or a field taking focus turns the bar into the link (checked on DOM adds to <body>, which is where dialogs portal, and on focus).
  useEffect(() => {
    if (!counting) return;
    const check = () => { if (pageIsBusy()) setPending(p => (p && !p.linkOnly ? { ...p, linkOnly: true } : p)); };
    const dom = new MutationObserver(check);
    dom.observe(document.body, { childList: true });
    document.addEventListener('focusin', check);
    return () => { dom.disconnect(); document.removeEventListener('focusin', check); };
  }, [counting]);
  // The owner's open draft holds the countdown; once held it is link-only for good: the hold ending later never starts a countdown.
  useEffect(() => {
    if (hold) setPending(p => (p && !p.linkOnly ? { ...p, linkOnly: true } : p));
  }, [hold, pending]);
  useEffect(() => {
    if (left === null || hold || !to || !counting) return;
    // Every tick (and the last) asks the page again: a dialog toggled by attribute, or a field focused without an event we saw, still stops the move.
    if (pageIsBusy()) { setPending(p => (p ? { ...p, linkOnly: true } : p)); return; }
    if (left <= 0) { navigate(to, { replace: true }); return; }
    const id = setTimeout(() => setPending(p => (p ? { ...p, left: p.left - 1 } : p)), 1000);
    return () => clearTimeout(id);
  }, [left, hold, to, counting, navigate]);
  if (!pending || !to) return null;
  return { line: roundChangeLine(pending), left: hold || pending.linkOnly ? null : pending.left, to, onStay: () => setPending(null) };
}

/** The counterpart, held while its identity and name are unchanged (a poll hands a new state every few seconds, and the workspace value must not churn with it). */
function useStableCounterpart(raw: CanvasPerson | null, canvasKey: string): CanvasPerson | null {
  const [pinned, setPinned] = useState<{ key: string; person: CanvasPerson | null }>({ key: canvasKey, person: raw });
  // Pinned for this canvas visit: a later re-seating (raw null or another person) never drops the person from the chooser. Another canvas starts afresh.
  if (pinned.key !== canvasKey) setPinned({ key: canvasKey, person: raw });
  else if (!pinned.person ? raw : false) setPinned({ key: canvasKey, person: raw });
  return pinned.key === canvasKey ? pinned.person : raw;
}

/** Opens the canvas in Compare with the counterpart once per canvas: writes `?with=` into the address (replace), so turning Compare off or switching stays the person's own. */
function useCompareDefault(a: { counterpart: CanvasPerson | null; ready: CanvasReady | null; params: URLSearchParams; setParams: SetParams; canvasKey: string; state: Location['state'] }) {
  const { counterpart, ready, params, canvasKey, state, setParams } = a;
  const applied = useRef<string | null>(null);
  const hasWith = !!params.get('with');
  useEffect(() => {
    if (!counterpart || !ready || isViewingDraft(ready) || applied.current === canvasKey) return;
    applied.current = canvasKey;
    if (hasWith) return;
    setParams(prev => { const next = new URLSearchParams(prev); next.set('with', counterpart.id); return next; }, { replace: true, state });
  }, [counterpart, ready, hasWith, canvasKey, state, setParams]);
}

export function useTableCanvasForViewer(a: Omit<Parameters<typeof useTableCanvas>[0], 'viewerId'>) {
  const { user } = useAuth();
  return useTableCanvas({ ...a, viewerId: user?.id });
}

export function useTableCanvas(a: {
  table: { to: string; eventId: string | null } | null;
  viewerId: string | undefined;
  ready: CanvasReady | null;
  /** The owner has a draft open or the workspace on: the countdown never runs over it. */
  editing: boolean;
  params: URLSearchParams;
  setParams: SetParams;
  canvasKey: string;
  state: Location['state'];
}): { counterpart: CanvasPerson | null; roundBar: RoundReturnBarProps | null } {
  const { table, viewerId, ready, editing } = a;
  const { state, loaded, roster } = useTableRounds(table?.eventId ?? null);
  const raw = useMemo(() => tableCounterpart({ state, roster, viewerId, canvasOwnerId: ready?.ownerId }), [state, roster, viewerId, ready?.ownerId]);
  const counterpart = useStableCounterpart(table ? raw : null, a.canvasKey);
  useCompareDefault({ counterpart, ready, params: a.params, setParams: a.setParams, canvasKey: a.canvasKey, state: a.state });
  const roundBar = useRoundReturn(table?.eventId ? table.to : null, table?.eventId ?? null, roundMarkOf(state), loaded, editing);
  return { counterpart, roundBar };
}
