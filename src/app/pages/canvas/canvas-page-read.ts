/**
 * @file canvas-page-read.ts
 * @description P1545 helpers for CanvasPage (canvas-page.tsx): marking a shared canvas read on open, and the
 * owner line's phone width.
 */
import { useEffect } from 'react';
import { canvasService } from '@/app/data/canvas-service';

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
