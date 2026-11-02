/**
 * @file use-canvas-offers.ts
 * @description P1536 S5 (client): what one draft's thread knows about its offers. The SERVER keeps them (an offer is a durable relation, never message text); the client only reads.
 *
 * Reads (docs/technical/metered-services.md): no timer. One `get_canvas_draft_state` per CHANGE of the draft, under the same key Undo uses (draft, revision, newest run and its state:
 * every mutation moves the revision), so the two reads of one change are one request (canvas-draft-state-read joins them). Nothing is read while a run is going, and nothing while the tab
 * is hidden: coming back reads once. A closed draft's thread reads once when opened. The wait has a deadline: a read that does not answer in 10 seconds, or is refused, is SAID ("The
 * other canvases did not load." with Try again), and a late answer still replaces that. A failed read is never retried on a timer. `reread` is the read after a write of ours: it never
 * joins a request that was sent before the write.
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
  const asked = useRef<string | null>(null);
  const fresh = useRef(false);
  const keyNow = useRef(key);
  keyNow.current = key;

  useEffect(() => {
    if (!key || !visible || !canvasId || !draftId) return;
    const mark = `${key}:${again}`;
    if (asked.current === mark) return;
    asked.current = mark;
    const wantFresh = fresh.current;
    fresh.current = false;
    const deadline = setTimeout(() => { if (keyNow.current === key) setFailedKey(key); }, OFFERS_READ_DEADLINE_MS);
    void readCanvasOffers(canvasId, draftId, { fresh: wantFresh }).then(
      (read) => {
        clearTimeout(deadline);
        if (keyNow.current === key) { setState({ draftId, key, read }); setFailedKey(null); }
      },
      () => {
        // Said, not swallowed: Try again shows. No timer; coming back to the tab asks once more.
        clearTimeout(deadline);
        if (asked.current === mark) asked.current = null;
        if (keyNow.current === key) setFailedKey(key);
      },
    );
    return () => clearTimeout(deadline);
  }, [key, visible, canvasId, draftId, again]);

  const mine = state && state.draftId === draftId ? state : null;
  const reread = useCallback(() => { fresh.current = true; asked.current = null; setAgain((n) => n + 1); }, []);
  return {
    read: mine?.read ?? null,
    failed: failedKey !== null && failedKey === key, // said even beside rows read earlier: after a write of ours they may be behind
    retry: useCallback(() => { setFailedKey(null); reread(); }, [reread]),
    reread,
  };
}
