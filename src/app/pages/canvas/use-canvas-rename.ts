/**
 * @file use-canvas-rename.ts
 * @description P1536 W8: the owner's rename of the canvas on screen. The title shown comes from ONE helper (canvasDisplayTitle: the rename, else the
 * name's canvasTitle). A save shows at once (optimistic); if the database refuses it the last CONFIRMED title comes back with a toast. Saves are
 * numbered: only the newest one's answer drives what is shown, so a late answer to an older save never overwrites a newer title. An older save's
 * success still counts as confirmed (it is what the database holds) when the newer one failed. Only the owner of a canvas with a record (a canvas
 * id) can rename; everyone else gets `canRename: false`.
 */
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { canvasService } from '@/app/data/canvas-service';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { canvasDisplayTitle } from '@/lib/canvas-boxes';

export const RENAME_FAILED_TEXT = "Couldn't rename this canvas.";

export function useCanvasRename(ready: CanvasReady | null, projectTag: string | null): { title: string; canRename: boolean; save: (next: string) => void } {
  const canvasId = ready?.isOwner ? ready.canvasId ?? null : null;
  // The title this device saved for this canvas: shown over the page's read, which is older until it is read again.
  const [saved, setSaved] = useState<{ canvasId: string; title: string } | null>(null);
  const shown = saved && saved.canvasId === canvasId ? saved.title : null;
  const title = shown ?? (projectTag ? canvasDisplayTitle(ready?.title, projectTag) : '');
  const latest = useRef(0);
  // The newest answer the database gave: what a refusal falls back to. `failed`: the newest save was refused (an older answer may still arrive).
  const confirmed = useRef<{ seq: number; canvasId: string; title: string } | null>(null);
  const failed = useRef(false);
  const save = useCallback((next: string) => {
    if (!canvasId) return;
    const mine = ++latest.current;
    failed.current = false;
    setSaved({ canvasId, title: next });
    canvasService.renameCanvas(canvasId, next).then(
      stored => {
        if (mine > (confirmed.current?.seq ?? 0)) confirmed.current = { seq: mine, canvasId, title: stored };
        if (mine === latest.current) setSaved({ canvasId, title: stored });
        else if (failed.current && confirmed.current?.canvasId === canvasId) setSaved({ canvasId, title: confirmed.current.title });
      },
      () => {
        if (mine !== latest.current) return; // an older save's refusal: the newer title is the one on screen
        failed.current = true;
        setSaved(confirmed.current?.canvasId === canvasId ? { canvasId, title: confirmed.current.title } : null);
        toast.error(RENAME_FAILED_TEXT);
      },
    );
  }, [canvasId]);
  return { title, canRename: !!canvasId, save };
}
