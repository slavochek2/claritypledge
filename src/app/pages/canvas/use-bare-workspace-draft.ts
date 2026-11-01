/**
 * @file use-bare-workspace-draft.ts
 * @description P1536 W0/W1: `?ws=1` with no `v` while the owner's canvas has an open draft IS the workspace on that draft (the address an old canvas
 * thread resolves to, and what a bookmarked workspace link is). The page reads the newest published version for a bare address, so without this the
 * workspace opened on the published view with "This chat edits your draft" instead of on the draft. Once the read for the bare address says a draft is
 * open, the page is moved to it (REPLACE). An explicit `?v=<published>&ws=1` is left alone (S3/J4: the chat edits the draft, "Go to draft" offers it),
 * and so is a Clone the owner started here (its pending state is the page).
 */
import { useEffect } from 'react';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';

export function useBareWorkspaceDraft(args: {
  eligible: boolean;
  params: URLSearchParams;
  /** The page's read and the `?v=` it was made for (null: the bare address). */
  reported: { ready: CanvasReady | null; forVersion: string | null };
  pendingClone: boolean;
  openDraft: (versionName: string) => void;
}): void {
  const { eligible, params, reported, pendingClone, openDraft } = args;
  const ready = reported.ready;
  const target =
    eligible && !pendingClone && params.get(CANVAS_WORKSPACE_PARAM) === '1' && !params.has('v') && reported.forVersion === null
    && ready && ready.isOwner && ready.draft && !isViewingDraft(ready)
      ? ready.draft.version
      : null;
  useEffect(() => {
    if (target) openDraft(target);
  }, [target, openDraft]);
}
