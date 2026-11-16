/**
 * @file use-next-version-changes.ts
 * @description P1686: the room card's read of the owner's next-version draft against the version it was started from, and its Publish.
 * Never publish blind (decisions.md 2026-11-13 [product]): `publish` exists only in the `ready` phase, and it sends the draft id and revision
 * from the SAME read that produced the list on screen. Any refusal re-reads (Publish leaves the screen until the new list is in); a revision is
 * never taken from a refusal.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { canvasService } from '@/app/data/canvas-service';
import { publishCanvasDraft } from '@/app/data/canvas-draft-service';
import { CHANGES_COPY, diffCanvasPoints, type BoxChange } from './next-version-changes';

export type ChangesView =
  | { phase: 'loading' }
  /** `reason`: why the read failed, on the card as data-reason (diagnosable without devtools). */
  | { phase: 'failed'; reason?: string }
  | { phase: 'ready'; changes: BoxChange[]; draftId: string; revision: number; key: string }
  /** Published from this card: no Publish while the offer is read again. */
  | { phase: 'published' };

export interface NextVersionChanges {
  view: ChangesView;
  /** A line about the last Publish (busy, moved on, failed), or null. */
  note: string | null;
  publishing: boolean;
  /** Present only while a read's list is on screen and has changes. */
  publish: (() => void) | null;
  reload: () => void;
}

type Read = typeof canvasService.getCanvas;

const readKey = (ownerId: string, canvasName: string, versionName: string): string => `${ownerId}|${canvasName}|${versionName}`;
/** A refusal that re-reads the draft (Publish leaves the screen until the new list is in); any other keeps the list and says it could not publish. */
const REREAD: ReadonlySet<string> = new Set(['stale_view', 'busy', 'busy_elsewhere', 'no_changes', 'draft_empty']);

/** One read: the draft view, then its base version (none for a first draft). Null when the draft is no longer open. */
export async function readNextVersionChanges(getCanvas: Read, ownerId: string, canvasName: string, versionName: string): Promise<Extract<ChangesView, { phase: 'ready' }> | null> {
  const draftView = await getCanvas(ownerId, canvasName, ownerId, undefined, versionName);
  const draft = draftView.draft;
  if (!draft) return null;
  if (draft.version !== versionName) throw new Error(`draft version ${draft.version} is not ${versionName}`);
  const baseName = draft.baseSeq === null ? null : draftView.versions.find(v => !v.draft && v.seq === draft.baseSeq)?.name ?? null;
  if (draft.baseSeq !== null && !baseName) throw new Error('base version not listed');
  const base = baseName ? await getCanvas(ownerId, canvasName, ownerId, undefined, baseName) : null;
  return { phase: 'ready', changes: diffCanvasPoints(draftView.points, base ? base.points : null, draft.changedBoxes), draftId: draft.id, revision: draft.revision, key: readKey(ownerId, canvasName, versionName) };
}

export function useNextVersionChanges(args: {
  ownerId: string | null;
  canvasName: string | null;
  versionName: string | null;
  /** Told after a successful Publish, or when the draft turned out not to be open any more: the card re-reads its offer. */
  onSettled: () => void;
  getCanvas?: Read;
}): NextVersionChanges {
  const { ownerId, canvasName, versionName, onSettled } = args;
  const getCanvas = args.getCanvas ?? canvasService.getCanvas;
  const [view, setView] = useState<ChangesView>({ phase: 'loading' });
  const [note, setNote] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [round, setRound] = useState(0);
  const inFlight = useRef(false);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  useEffect(() => {
    if (!ownerId || !canvasName || !versionName) { setView({ phase: 'loading' }); setNote(null); return; }
    let live = true;
    setView({ phase: 'loading' });
    readNextVersionChanges(getCanvas, ownerId, canvasName, versionName)
      .then(r => { if (!live) return; if (r) setView(r); else { setView({ phase: 'failed', reason: 'draft not open' }); settled.current(); } })
      .catch((e: unknown) => {
        const reason = e instanceof Error ? e.message : String(e);
        console.warn('[P1686] could not read the next version changes:', reason);
        if (live) setView({ phase: 'failed', reason });
      });
    return () => { live = false; };
  }, [ownerId, canvasName, versionName, round, getCanvas]);

  useEffect(() => { setNote(null); }, [ownerId, canvasName, versionName]); // another draft: the last one's note goes with it
  const reload = useCallback(() => { setNote(null); setRound(n => n + 1); }, []);

  // The list counts only for the draft the card is asking about now: for the render after the draft changes, before the effect re-reads, no Publish.
  const key = ownerId && canvasName && versionName ? readKey(ownerId, canvasName, versionName) : null;
  const shown = view.phase === 'ready' && view.key === key ? view : null;
  const currentKey = useRef(key);
  currentKey.current = key;
  const publish = useCallback(() => {
    if (!shown || inFlight.current) return;
    inFlight.current = true;
    setPublishing(true);
    setNote(null);
    void (async () => {
      try {
        const r = await publishCanvasDraft(shown.draftId, shown.revision);
        // The answer belongs to the draft it was sent for: if the card has moved to another draft meanwhile, only the offer is read again.
        if (currentKey.current !== shown.key) { settled.current(); return; }
        if (r.ok) { setView({ phase: 'published' }); settled.current(); return; }
        if (!REREAD.has(r.refused)) { setNote(CHANGES_COPY.failed); return; }
        setNote(r.refused === 'stale_view' ? CHANGES_COPY.moved : r.refused === 'busy' || r.refused === 'busy_elsewhere' ? CHANGES_COPY.busy : null);
        setRound(n => n + 1); // Publish leaves the screen until the new list is in
      } catch {
        if (currentKey.current === shown.key) setNote(CHANGES_COPY.failed);
      } finally {
        inFlight.current = false;
        setPublishing(false);
      }
    })();
  }, [shown]);

  // "Your draft changed / is still being worked on" introduces a new list: shown only above one. A note never outlives its draft.
  const listShown = !!shown && shown.changes.length > 0;
  const shownNote = note && note !== CHANGES_COPY.failed && !listShown ? null : note;
  return { view: view.phase === 'ready' && !shown ? { phase: 'loading' } : view, note: shownNote, publishing, publish: shown && shown.changes.length > 0 ? publish : null, reload };
}
