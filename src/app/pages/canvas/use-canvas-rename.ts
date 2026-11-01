/**
 * @file use-canvas-rename.ts
 * @description P1536 W8: the owner's rename of the canvas on screen. The title shown comes from ONE helper (canvasDisplayTitle: the rename, else the
 * name's canvasTitle). A save shows at once (optimistic); if the database refuses it the old title comes back with a toast. Only the owner of a canvas
 * with a record (a canvas id) can rename; everyone else gets `canRename: false`.
 */
import { useCallback, useState } from 'react';
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
  const save = useCallback((next: string) => {
    if (!canvasId) return;
    const before = saved;
    setSaved({ canvasId, title: next });
    canvasService.renameCanvas(canvasId, next).then(
      stored => setSaved({ canvasId, title: stored }),
      () => { setSaved(before); toast.error(RENAME_FAILED_TEXT); },
    );
  }, [canvasId, saved]);
  return { title, canRename: !!canvasId, save };
}
