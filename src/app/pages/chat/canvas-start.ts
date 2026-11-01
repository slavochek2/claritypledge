/**
 * P1536: starting a canvas. `startCanvasThread` is the one call everything uses: the mirror's "New canvas" menu item, the
 * paperclip's Canvases tab and Artifacts' New canvas. It makes the canvas, its draft and its (hidden) thread on the server and says
 * where they are; whoever called it opens the workspace on the draft (use-start-canvas).
 */
import { CanvasDraftRefusal, openCanvasDraft, type OpenDraftResult } from '@/app/data/canvas-draft-service';
import { registerCanvasThread } from './canvas-thread-registry';

export type StartedCanvasThread = OpenDraftResult;

/**
 * Opens a draft from one of the caller's published versions (or a brand-new canvas when `fromVersionId` is empty).
 * `status: 'open_elsewhere'` means the canvas already has an open draft and nothing new was made: the result names that draft,
 * and the caller asks the owner whether to continue there or discard it (see OpenDraftDialog).
 */
export async function startCanvasThread(fromVersionId?: string | null): Promise<StartedCanvasThread> {
  const r = await openCanvasDraft(fromVersionId ?? null);
  // The mirror stays silent in a canvas thread: it must know this one before any message (a carried change request, the
  // first note) is sent into it, not only once the thread panel has loaded and registered it.
  registerCanvasThread(r.threadRootId);
  return r;
}

/** What to tell the owner when starting a thread failed. */
export function canvasStartErrorText(e: unknown): string {
  if (e instanceof CanvasDraftRefusal) {
    if (e.code === 'TOO_MANY_DRAFTS') return 'You have too many open canvas drafts. Publish or discard one first.';
    if (e.code === 'RUN_ACTIVE') return 'That draft is being written right now. Try again in a minute.';
  }
  return 'Could not start a canvas. Try again.';
}
