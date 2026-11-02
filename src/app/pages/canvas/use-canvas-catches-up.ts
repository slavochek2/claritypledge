/**
 * @file use-canvas-catches-up.ts
 * @description P1536: the canvas page beside a draft's thread never stays behind what the thread read. The thread's 'updated' event says "a run I watched ended"; a run that
 * ended BEFORE the thread first looked says nothing (a first read only records, use-canvas-thread), and the page's own read can be older than that end: it is made first, and the
 * thread mounts from its answer. Measured at 375 on hosted TEST: 3 of 20 first Sends, the boxes and "Nothing to publish yet" stale until a reload (a short run on a loaded server; no width in it).
 * So the rule is on the state, not on the order of arrival: when the thread has read the draft after a finished draft run at a revision above the page's read, the page is asked again (the 'updated' event the page
 * listens to) and the Publish spot holds "Updating…" until it answers (§2). One ask per revision, never a loop: that read is made after the thread's and any older one still out is dropped by the
 * page (its request counter), so its answer carries the revision; should it not, nothing more is asked and the spot lets go; should it fail, SETTLE_MAX_MS does.
 * A page already at the thread's revision asks nothing. A run the thread watched end has already asked, through the same event, so it costs no second read.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { emitCanvasDraftEvent, subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';
import { SETTLE_MAX_MS, useSettledRun } from './use-settled-run';

export function useCanvasCatchesUp(read: CanvasReady | null): { behind: boolean; onDraftRead: (draftId: string, revision: number) => void } {
  const [seen, setSeen] = useState<{ draftId: string; revision: number } | null>(null);
  const onDraftRead = useCallback((draftId: string, revision: number) => {
    setSeen(prev => (prev?.draftId === draftId && prev.revision === revision ? prev : { draftId, revision }));
  }, []);
  const readNow = useRef(read);
  readNow.current = read;
  /** The read on screen when the page was last asked (its answer will replace it), and the highest revision of which draft it was asked about (each draft counts its own revisions). */
  const asked = useRef<{ read: CanvasReady | null; draftId: string | null; revision: number }>({ read: null, draftId: null, revision: -1 });
  useEffect(() => subscribeCanvasDraftEvents((e) => {
    if (e.kind === 'updated') asked.current.read = readNow.current;
  }), []);
  const draft = read && isViewingDraft(read) ? read.draft : null;
  const behind = !!draft && draft.id === seen?.draftId && draft.revision < seen.revision;
  const draftId = draft?.id;
  const seenRevision = seen?.revision ?? -1;
  // The spot lets go of a read that answered and is still behind (nothing more is coming), that failed, or that never answers: it says what the read on screen says.
  const [gaveUpOn, setGaveUpOn] = useState<CanvasReady | null>(null);
  useEffect(() => {
    if (!behind || !draftId) return;
    const out = asked.current.read === read;
    const askedAlready = asked.current.draftId === draftId && asked.current.revision >= seenRevision;
    asked.current = { read: asked.current.read, draftId, revision: seenRevision };
    if (!out && askedAlready) setGaveUpOn(read);
    else if (!out) emitCanvasDraftEvent({ kind: 'updated', draftId });
  }, [behind, draftId, read, seenRevision]);
  useEffect(() => {
    if (!behind) return;
    const t = setTimeout(() => setGaveUpOn(read), SETTLE_MAX_MS);
    return () => clearTimeout(t);
  }, [behind, read]);
  return { behind: behind && gaveUpOn !== read, onDraftRead };
}

/**
 * §2: what the Publish spot counts as a run going. "Updating…" lasts until the page has read what the run changed: the run ends in the thread before the page re-reads its points (useSettledRun),
 * and a run can also end before the thread first looked, with the page's read older than that end (useCanvasCatchesUp).
 */
export function useSpotRun(runActive: boolean, read: CanvasReady | null): { spotRunActive: boolean; onDraftRead: (draftId: string, revision: number) => void } {
  const settling = useSettledRun(runActive, read);
  const { behind, onDraftRead } = useCanvasCatchesUp(read);
  return { spotRunActive: settling || behind, onDraftRead };
}
