/**
 * @file use-clone-canvas.ts
 * @description P1536 W3/J4: what Clone does, as the workspace's state. Tapping Clone WRITES NOTHING: it enters the PENDING state (ws=1 on
 * the published version, no draft); the first Send/upload/voice then makes the draft (`canvas_workspace_send`, workspace-next-draft).
 * Leaving before then writes nothing. Per the open draft of the canvas:
 *  - none: pending at once.
 *  - same base (started from this very version): Clone opens that draft.
 *  - another base with at least one message or run: the J4 sheet ("Add to my draft" opens it; "Start over from vN" goes pending and the
 *    first Send discards it inside its own transaction, passing the draft's id and revision).
 *  - another base, untouched (no message, no run): no sheet; pending, and the first Send replaces it.
 * The "touched" test is a run existing: a v6 send makes its message and its run in one transaction (spec G-L3), so a draft with a
 * message always has a run. A stale_view on that first Send (the draft moved on) puts the sheet back with fresh facts and keeps the text.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Location } from 'react-router-dom';
import { toast } from 'sonner';
import { getCanvasDraftByThread, getLatestCanvasRun } from '@/app/data/canvas-draft-service';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';
import { DRAFT_ERROR_TEXT } from '@/app/pages/chat/canvas-thread-copy';

/** The canvas's open draft when it is of another base: what the sheet names and what the first Send passes to discard it. */
export interface OtherDraft { id: string; revision: number; baseSeq: number | null; version: string; threadRootId: string }
/** What the pending state is: the published version being cloned, its number, and the draft a first Send discards (J4 start over). */
export interface ClonePending { version: string; seq: number | null; replace: OtherDraft | null }
export interface CloneSheetState { draft: OtherDraft; fromSeq: number | null; reask: boolean }

type SetParams = (next: (prev: URLSearchParams) => URLSearchParams, options: { replace: boolean; state: Location['state'] }) => void;

const seqOf = (ready: CanvasReady): number | null => ready.versions.find(v => v.name === ready.version)?.seq ?? null;

export function useCloneCanvas(args: {
  eligible: boolean;
  /** The workspace is on (`ws=1`). */
  active: boolean;
  /** The page's read, only when it was made for the `?v=` now in the address. */
  ready: CanvasReady | null;
  setParams: SetParams;
  state: Location['state'];
  /** Show this draft version in the workspace (ws=1 on it). */
  openDraft: (versionName: string) => void;
  /** Ask the page to read again. */
  reload: () => void;
}) {
  const { eligible, active, ready, setParams, state, openDraft, reload } = args;
  const [intent, setIntent] = useState<{ version: string; replace: OtherDraft | null } | null>(null);
  const [sheet, setSheet] = useState<CloneSheetState | null>(null);
  const checking = useRef(false);

  const editingPublished = active && !!ready && ready.isOwner && !isViewingDraft(ready) && !ready.publishedNone && !!ready.version;
  // Pending = a Clone was tapped (this session) and the owner is still on that published version. A bare `ws=1` on a published
  // view (a reload, or Add to chat) is the J3 state instead: same empty thread, but its own words and a "Published" spot.
  // Pending = a Clone was tapped (this session) and the owner is still on that published version. A bare `ws=1` on a published
  // view (a reload, or Add to chat) is the J3 state instead: same empty thread, but its own words and a "Published" spot.
  const pending = useMemo<ClonePending | null>(
    () => (editingPublished && ready && ready.version && intent?.version === ready.version
      ? { version: ready.version, seq: seqOf(ready), replace: intent.replace }
      : null),
    [editingPublished, ready, intent],
  );

  const setMarker = useCallback((on: boolean) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('thread');
      if (on) next.set(CANVAS_WORKSPACE_PARAM, '1');
      else next.delete(CANVAS_WORKSPACE_PARAM);
      return next;
    }, { replace: true, state });
  }, [setParams, state]);

  const enter = useCallback((version: string, replace: OtherDraft | null) => {
    setIntent({ version, replace });
    setSheet(null);
    setMarker(true);
  }, [setMarker]);

  /** × and switching away: back to the published view, nothing was written. */
  const cancel = useCallback(() => {
    setIntent(null);
    setSheet(null);
    setMarker(false);
  }, [setMarker]);

  const clone = useCallback(() => {
    if (!ready || !ready.isOwner || isViewingDraft(ready) || ready.publishedNone || !ready.version || checking.current) return;
    const version = ready.version;
    const d = ready.draft;
    if (!d) return enter(version, null);
    const mine = seqOf(ready);
    if (mine !== null && d.baseSeq === mine) return openDraft(d.version); // same base: Clone opens that draft
    const other: OtherDraft = { id: d.id, revision: d.revision, baseSeq: d.baseSeq, version: d.version, threadRootId: d.threadRootId };
    checking.current = true;
    void (async () => {
      try {
        const touched = d.runCount > 0 || (await getLatestCanvasRun(d.id)) !== null;
        if (touched) setSheet({ draft: other, fromSeq: mine, reask: false });
        else enter(version, other); // an untouched draft: no sheet, the first Send replaces it
      } catch {
        toast.error(DRAFT_ERROR_TEXT.FAILED);
      } finally {
        checking.current = false;
      }
    })();
  }, [ready, enter, openDraft]);

  // Switching to another version while a Clone is pending cancels it (a draft's own view keeps the workspace).
  const readVersion = ready?.version ?? null;
  useEffect(() => {
    if (!intent || !ready || readVersion === intent.version) return;
    setIntent(null);
    if (!isViewingDraft(ready) && active) setMarker(false);
  }, [intent, ready, readVersion, active, setMarker]);

  const addToDraft = useCallback(() => {
    const d = sheet?.draft;
    setSheet(null);
    setIntent(null);
    if (d) openDraft(d.version);
  }, [sheet, openDraft]);

  const startOver = useCallback(() => {
    if (!sheet || !ready?.version) return;
    enter(ready.version, sheet.draft);
  }, [sheet, ready, enter]);

  const dismissSheet = useCallback(() => {
    if (sheet?.reask) cancel(); // the first Send could not replace it: leave, nothing was written
    else setSheet(null);
  }, [sheet, cancel]);

  /** The first Send named a draft that moved on: ask again with what is there now (the composer keeps its text). */
  const onStale = useCallback(async () => {
    const replace = pending?.replace;
    if (!replace) return;
    try {
      const fresh = await getCanvasDraftByThread(replace.threadRootId);
      if (fresh && fresh.state === 'open') {
        setSheet({ draft: { ...replace, id: fresh.id, revision: fresh.revision, version: fresh.versionName ?? replace.version }, fromSeq: pending.seq, reask: true });
        return;
      }
      // it is gone (discarded or published elsewhere): nothing to replace now; the next Send opens from this version
      setIntent({ version: pending.version, replace: null });
      reload();
    } catch {
      toast.error(DRAFT_ERROR_TEXT.FAILED);
    }
  }, [pending, reload]);

  return { clone: eligible ? clone : null, pending, cancel, sheet, addToDraft, startOver, dismissSheet, onStale };
}
