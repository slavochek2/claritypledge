/**
 * @file canvas-page-read.ts
 * @description P1545 helpers for CanvasPage (canvas-page.tsx): marking a shared canvas read on open, and the
 * owner line's phone width. P1613: the Compare setup, gated by what is on screen.
 */
import { useEffect } from 'react';
import { screenOf } from '@/app/components/canvas/canvas-header-model';
import { compareSetup, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { useCanvasWorkspace } from '@/app/components/canvas/canvas-workspace-context';
import { canvasService } from '@/app/data/canvas-service';
import { useCanvasDraftsOff } from '@/app/pages/chat/use-canvas-availability';

/**
 * P1613: who the viewer compares with (`?with=`). Only a published version compares: a draft has no positions, and a pending Clone is a published view with nothing written
 * yet, so `with` is ignored for both. The owner's bar (which draws Compare beside the version) reads the same rule through `screenOf`, so no box compares with no control to end it.
 */
export function useCompareSetup(ready: CanvasReady | null, viewerId: string | undefined, handle: string | undefined, requestedWith: string | null) {
  const { active, cloneSeq, cloning } = useCanvasWorkspace();
  const drafting = !useCanvasDraftsOff();
  const published = !ready || screenOf({ ready, drafting, workspace: active, pendingSeq: cloneSeq, cloning }) === 'published';
  return compareSetup(ready, viewerId, handle, published ? requestedWith : null);
}

/**
 * P1545: opening a canvas someone shared with you marks it read (also what a chat share card leads to).
 * Fire-and-forget; the server ignores the owner and link holders.
 */
export function useMarkCanvasRead(
  ready: { isOwner: boolean; ownerId: string } | null,
  projectTag: string | null | undefined,
  viewerId: string | null | undefined,
): void {
  const readOwnerId = ready && !ready.isOwner ? ready.ownerId : null;
  useEffect(() => {
    if (!readOwnerId || !projectTag || !viewerId) return;
    void canvasService.markCanvasRead(readOwnerId, projectTag).catch(() => undefined);
  }, [readOwnerId, projectTag, viewerId]);
}

/**
 * Phones: with no version switcher the owner line fills the row, so the share circle sits beside it,
 * right-aligned; with one, the owner keeps its own line and the switcher takes the row beside Share.
 */
export function ownerPhoneWidth(versionCount: number): string {
  return versionCount >= 2 ? 'max-sm:w-full' : 'max-sm:flex-1';
}
