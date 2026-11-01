/**
 * @file use-retired-canvas-thread.ts
 * @description P1536 W0: the canvas workspace is the one place an owner edits a canvas, so an old canvas-thread address (a chat
 * thread whose root is a canvas version) resolves by the thread's draft, with REPLACE navigation (Back never returns to a retired
 * address):
 *  - open draft: the workspace on it (`/p/:handle/canvas/:tag?v=<draft>&ws=1`);
 *  - published: that version, plain (`?v=<version>`);
 *  - discarded: the canvas page at its newest published version, or Artifacts > Canvases when nothing was ever published;
 *  - no draft for this viewer (deleted, or not theirs): nothing moves, the thread keeps its existing unavailable behaviour;
 *  - drafting off: nothing moves, the thread stays readable as it is.
 * Returns whether the thread should be held back (a skeleton) because the answer is still being worked out or a move is under way.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listMyCanvasVersions, type CanvasDraft } from '@/app/data/canvas-draft-service';
import { retiredThreadTarget } from './canvas-links';
import type { CanvasThreadStatus } from './use-canvas-thread';

interface Address {
  canvasOn: boolean | null;
  status: CanvasThreadStatus;
  draft: CanvasDraft | null;
}

async function hasPublishedVersion(canvasName: string): Promise<boolean> {
  try {
    return (await listMyCanvasVersions()).some((v) => v.canvasName === canvasName);
  } catch {
    return false; // unknown reads as "none": Artifacts is a safe place to land
  }
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
    let live = true;
    void (async () => {
      const hasPublished = draft.state === 'discarded' && draft.canvasName ? await hasPublishedVersion(draft.canvasName) : false;
      const target = retiredThreadTarget({ ownerSlug, draft, hasPublished });
      if (!live || !target) return;
      setMoved(target);
      navigate(target, { replace: true });
    })();
    return () => {
      live = false;
    };
    // the draft's identity and state decide the target; a poll that re-reads the same draft must not navigate again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, canvasOn, status, draftId, state, ownerSlug, navigate]);
  if (!watching || moved) return watching;
  // Holding while the answer is being worked out; once a read says there is nothing to resolve, show the thread.
  const resolvable = !!draft?.canvasName && (draft.state === 'discarded' || !!draft.versionName);
  return canvasOn === null || status === 'idle' || status === 'loading' || (status === 'ready' && resolvable && !!ownerSlug);
}
