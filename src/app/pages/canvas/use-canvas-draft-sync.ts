/**
 * @file use-canvas-draft-sync.ts
 * @description P1536: the canvas page on its owner's draft version listens to that draft's events (canvas-draft-events):
 * a run that finished (or any change to its points) re-reads the canvas in place; a publish or discard, wherever it was
 * made (this header, the thread beside the page), moves the page off the draft's address, as the page's own Publish always did,
 * and re-reads. Only the draft that is on screen is listened for: on a published version the events mean nothing.
 */
import { useEffect, useRef } from 'react';
import { subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { resetPointEdits, useClearPointEditsOnAuthChange } from '@/app/components/canvas/canvas-point-edit-store';
import { resetNewCards } from '@/app/components/canvas/canvas-new-card-store';
import { dropFocusRequest } from '@/app/components/canvas/canvas-focus-request';

export function useCanvasDraftSync(
  /** what is on screen: the draft it shows is listened for (null, or any published version: nothing is) */
  ready: CanvasReady | null,
  setParams: (changes: Record<string, string | null>) => void,
  refresh: () => void,
  /** the signed-in viewer: a sign-out while the page is open discards point text typed and not saved (P1614) */
  viewerId?: string | null,
): void {
  const latest = useRef({ setParams, refresh });
  latest.current = { setParams, refresh };
  const draftId = ready && isViewingDraft(ready) ? ready.draft?.id : undefined;
  // P1614: the page leaving discards any point text typed and not saved, as an unsaved form does.
  // Leaving the page discards what was typed and never saved, new cards (P1621) as P1614's edits.
  useEffect(() => () => { resetPointEdits(); resetNewCards(); dropFocusRequest(); }, []);
  useClearPointEditsOnAuthChange(viewerId);
  useEffect(() => {
    if (!draftId) return;
    return subscribeCanvasDraftEvents((e) => {
      if (e.draftId !== draftId) return;
      // The draft's name is no longer a version to open once it is closed: leave its address, then read the canvas again.
      if (e.kind !== 'updated') latest.current.setParams({ v: null, point: null, box: null });
      latest.current.refresh();
    });
  }, [draftId]);
}
