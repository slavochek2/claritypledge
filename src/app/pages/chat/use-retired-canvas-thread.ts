/**
 * @file use-retired-canvas-thread.ts
 * @description P1536 W0, narrowed by 3c X11: the canvas workspace is the one place an owner EDITS a canvas, so only the old address of an OPEN draft's thread
 * moves, with REPLACE navigation (Back never returns to a retired address): to the workspace on it (`/p/:handle/canvas/:tag?v=<draft>&ws=1`),
 * landing on the Thread tab below 1280px (X11: "N replies" on a draft opens the workspace with the thread showing).
 * A published or a discarded draft's thread stays where it is: it is history, read in the mirror chat's own thread panel (no composer, a closed line).
 *  - no draft for this viewer (deleted, or not theirs): nothing moves, the thread keeps its existing unavailable behaviour;
 *  - drafting off: nothing moves, the thread stays readable as it is.
 * Returns whether the thread should be held back (a skeleton) because the answer is still being worked out or a move is under way.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import { workspaceHref } from './canvas-links';
import type { CanvasThreadStatus } from './use-canvas-thread';

interface Address {
  canvasOn: boolean | null;
  status: CanvasThreadStatus;
  draft: CanvasDraft | null;
}

export function useRetiredCanvasThread(args: { enabled: boolean; canvasRoot: boolean; ownerSlug: string | null | undefined; address: Address }): boolean {
  const { enabled, canvasRoot, ownerSlug, address } = args;
  const navigate = useNavigate();
  const { canvasOn, status, draft } = address;
  const watching = enabled && canvasRoot && canvasOn !== false;
  const [moved, setMoved] = useState<string | null>(null);
  const draftId = draft?.id ?? null;
  const state = draft?.state ?? null;
  useEffect(() => {
    if (!watching || canvasOn !== true || status !== 'ready' || !draft || !ownerSlug) return;
    // Only an open draft whose address is readable moves; a closed one is read here.
    if (draft.state !== 'open' || !draft.canvasName || !draft.versionName) return;
    const target = workspaceHref(ownerSlug, draft.canvasName, draft.versionName);
    setMoved(target);
    navigate(target, { replace: true, state: { tab: 'thread' } });
    // the draft's identity and state decide the target; a poll that re-reads the same draft must not navigate again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, canvasOn, status, draftId, state, ownerSlug, navigate]);
  if (!watching || moved) return watching;
  // Holding while the answer is being worked out; once a read says there is nothing to resolve, show the thread.
  const resolvable = draft?.state === 'open' && !!draft.canvasName && !!draft.versionName;
  return canvasOn === null || status === 'idle' || status === 'loading' || (status === 'ready' && resolvable && !!ownerSlug);
}
