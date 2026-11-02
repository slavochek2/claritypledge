/**
 * @file use-canvas-rename.ts
 * @description P1536 W8: the owner's rename of the canvas on screen. The title shown comes from ONE helper (canvasDisplayTitle: the rename, else the
 * name's canvasTitle). A save shows at once (optimistic); if the database refuses it the last CONFIRMED title comes back with a toast. One save is in
 * flight at a time and only the newest waiting title follows it, so the database always ends on the title on screen (two overlapping updates could
 * commit in either order). Only the owner of a canvas with a record (a canvas id) can rename; everyone else gets `canRename: false`.
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { canvasService } from '@/app/data/canvas-service';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { canvasDisplayTitle } from '@/lib/canvas-boxes';

export const RENAME_FAILED_TEXT = "Couldn't rename this canvas.";
// [FOUNDER DECISION: wording, built as written in the spec's X15 table.] A rename goes live to every reader at once, so saving says so.
export const RENAME_SAVED_TEXT = 'Name updated for everyone.';

export function useCanvasRename(ready: CanvasReady | null, projectTag: string | null): { title: string; canRename: boolean; save: (next: string) => void } {
  const canvasId = ready?.isOwner ? ready.canvasId ?? null : null;
  // The title this device saved for this canvas: shown over the page's read, which is older until it is read again.
  const [saved, setSaved] = useState<{ canvasId: string; title: string } | null>(null);
  const shown = saved && saved.canvasId === canvasId ? saved.title : null;
  const title = shown ?? (projectTag ? canvasDisplayTitle(ready?.title, projectTag) : '');
  const inFlight = useRef(false);
  const waiting = useRef<{ canvasId: string; title: string } | null>(null);
  // The newest title the database answered with: what a refusal falls back to.
  const confirmed = useRef<{ canvasId: string; title: string } | null>(null);
  const send = useCallback((id: string, next: string) => {
    inFlight.current = true;
    const settle = (shownAfter: () => void) => {
      inFlight.current = false;
      const queued = waiting.current;
      waiting.current = null;
      if (queued) send(queued.canvasId, queued.title); // a newer title is on screen: its own answer decides what stays
      else shownAfter();
    };
    canvasService.renameCanvas(id, next).then(
      stored => {
        confirmed.current = { canvasId: id, title: stored };
        settle(() => { setSaved({ canvasId: id, title: stored }); toast.success(RENAME_SAVED_TEXT); });
      },
      () => settle(() => {
        setSaved(confirmed.current?.canvasId === id ? { canvasId: id, title: confirmed.current.title } : null);
        toast.error(RENAME_FAILED_TEXT);
      }),
    );
  }, []);
  const save = useCallback((next: string) => {
    if (!canvasId) return;
    setSaved({ canvasId, title: next });
    if (inFlight.current) waiting.current = { canvasId, title: next };
    else send(canvasId, next);
  }, [canvasId, send]);
  return { title, canRename: !!canvasId, save };
}
