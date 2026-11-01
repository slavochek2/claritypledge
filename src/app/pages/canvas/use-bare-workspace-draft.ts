/**
 * @file use-bare-workspace-draft.ts
 * @description P1536 W0/W1: `?ws=1` with no `v` while the owner's canvas has an open draft IS the workspace on that draft (the address an old canvas
 * thread resolves to, and what a bookmarked workspace link is). The page reads the newest published version for a bare address and ADOPTS it into the
 * address (`?v=<published>`) before this hook sees any read, so the hook remembers that the address ARRIVED bare. While that memory holds, the first
 * FRESH read (made for the address now shown) of the owner decides: a draft that is open and not on screen moves the page to it (REPLACE), once; any
 * other owner read lets go, so a version picked afterwards is never dragged back. An explicit `?v=<published>&ws=1` that never was bare is left alone
 * (S3/J4: the chat edits the draft, "Go to draft" offers it), and so is a Clone the owner started here (its pending state is the page).
 */
import { useEffect, useRef } from 'react';
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
  /** The address arrived bare (`ws=1`, no `v`) and no fresh owner read has decided yet. */
  const armed = useRef(false);
  const workspaceOn = params.get(CANVAS_WORKSPACE_PARAM) === '1';
  const version = params.get('v');
  useEffect(() => {
    if (!workspaceOn) {
      armed.current = false;
      return;
    }
    if (version === null) armed.current = true;
    const ready = reported.ready;
    // A read left over from another canvas or address (made for a different `?v=`) decides nothing.
    if (!armed.current || !eligible || pendingClone || reported.forVersion !== version || !ready || !ready.isOwner) return;
    armed.current = false;
    if (ready.draft && !isViewingDraft(ready)) openDraft(ready.draft.version);
  }, [eligible, workspaceOn, version, reported, pendingClone, openDraft]);
}
