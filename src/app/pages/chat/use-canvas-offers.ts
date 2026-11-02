/**
 * @file use-canvas-offers.ts
 * @description P1536 S5 (client): what one draft's thread knows about its offers. The SERVER keeps them (an offer is a durable relation, never message text); the client only reads.
 *
 * Reads (docs/technical/metered-services.md): no timer. One `get_canvas_draft_state` per SIGNAL, under the key Undo uses (draft, revision, newest run and its state: every mutation moves
 * the revision), and the two reads of one signal are one request (canvas-draft-state-read batches the asks of one tick). The signals are: the key changing, the person's Try again or a write
 * of ours (`reread`), and the tab COMING BACK (what was read before may be behind: another of the owner's canvases can have finished since). Nothing is read while a run is going, and nothing
 * while the tab is hidden. A closed draft's thread reads once when opened.
 *
 * Every wait ends: each request has its own 10 second deadline, set when it is sent, and a request that is refused or does not answer is SAID ("The other canvases did not load." with Try
 * again). A tab that is hidden while a request is out does not strand the wait: coming back is a signal, so it sends a new request with a new deadline. A late answer still replaces the line,
 * but only the NEWEST request may write: an older answer arriving after a Try again is dropped (request generation), and a failure of an older request is dropped too.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { readCanvasOffers, type CanvasOffer, type CanvasOffersRead } from '@/app/data/canvas-draft-offers';
import { usePageVisible } from './chat-hooks';
import type { CanvasThread } from './use-canvas-thread';

/** The wait for the read ends in a readable line after this long (P1586's section deadline). */
export const OFFERS_READ_DEADLINE_MS = 10_000;

const TERMINAL = new Set(['done', 'undone', 'failed', 'capped', 'cancelled']);

/** The one key a read is for: the draft as its last SETTLED run left it (the key Undo reads under). `null`: nothing to read now (no run yet, or a run is going). */
export function openOffersKey(thread: CanvasThread | null): string | null {
  if (!thread || thread.draft.state !== 'open' || !thread.run || thread.running || !TERMINAL.has(thread.run.state)) return null;
  return `${thread.draft.id}:${thread.draft.revision}:${thread.run.id}:${thread.run.state}`;
}

/** A published draft's thread reads once, when opened (the draft cannot change any more, except by the owner's own actions, which `reread`). A discarded draft keeps no offers. */
export const closedOffersKey = (draftId: string): string => `${draftId}:closed`;

/** The offers a row is drawn for: open or started. A `focused` one is the canvas's own subject and a `dismissed` one is gone. */
export const liveOffers = (read: CanvasOffersRead | null): CanvasOffer[] => (read?.offers ?? []).filter((o) => o.state === 'offered' || o.state === 'started');

interface Read { draftId: string; key: string; read: CanvasOffersRead | null }

export interface CanvasOffersView {
  /** What was last read about THIS draft (a read of another draft is never borrowed); null: nothing yet, or the draft is not listed. */
  read: CanvasOffersRead | null;
  failed: boolean;
  retry: () => void;
  /** Read again after a write of ours. */
  reread: () => void;
}

export function useCanvasOffers(a: { canvasId: string | null; draftId: string | null; key: string | null }): CanvasOffersView {
  const { canvasId, draftId, key } = a;
  const visible = usePageVisible();
  const [state, setState] = useState<Read | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [again, setAgain] = useState(0);
  const [resumed, setResumed] = useState(0);
  const asked = useRef<string | null>(null);
  /** The number of the newest request: only it may write, whatever order the answers come in. */
  const newest = useRef(0);
  const keyNow = useRef(key);
  keyNow.current = key;
  const wasVisible = useRef(visible);

  // The tab coming back is a signal of its own: it asks again even when nothing about the draft changed. (A tab that was hidden before anything was asked has nothing to renew: the
  // read below sends its first request itself.)
  useEffect(() => {
    if (visible && !wasVisible.current && asked.current !== null) setResumed((n) => n + 1);
    wasVisible.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!key || !visible || !canvasId || !draftId) return;
    const mark = `${key}:${again}:${resumed}`;
    if (asked.current === mark) return;
    asked.current = mark;
    const mine = ++newest.current;
    const current = () => newest.current === mine && keyNow.current === key;
    const deadline = setTimeout(() => { if (current()) setFailedKey(key); }, OFFERS_READ_DEADLINE_MS);
    void readCanvasOffers(canvasId, draftId).then(
      (read) => {
        clearTimeout(deadline);
        if (current()) { setState({ draftId, key, read }); setFailedKey(null); }
      },
      () => {
        // Said, not swallowed: Try again shows. No timer; coming back to the tab asks once more.
        clearTimeout(deadline);
        if (newest.current !== mine) return; // an older request's failure says nothing about the newest
        if (asked.current === mark) asked.current = null;
        if (keyNow.current === key) setFailedKey(key);
      },
    );
    return () => clearTimeout(deadline); // a hidden tab or a new key: the next signal sends its own request with its own deadline
  }, [key, visible, canvasId, draftId, again, resumed]);

  const mine = state && state.draftId === draftId ? state : null;
  const reread = useCallback(() => { asked.current = null; setAgain((n) => n + 1); }, []);
  return {
    read: mine?.read ?? null,
    failed: failedKey !== null && failedKey === key, // said even beside rows read earlier: after a write of ours they may be behind
    retry: useCallback(() => { setFailedKey(null); reread(); }, [reread]),
    reread,
  };
}
