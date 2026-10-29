/**
 * P1536: starting a canvas thread. `startCanvasThread` is the one call everything uses: the mirror's "New canvas" menu
 * item, the paperclip's Canvases tab, "Start a new version?" under a published thread, and the canvas page's "New
 * version". It makes the draft and its thread on the server and says where the thread is; whoever called it navigates.
 */
import { CanvasDraftRefusal, openCanvasDraft, type OpenDraftResult } from '@/app/data/canvas-draft-service';
import { registerCanvasThread } from './canvas-thread-registry';
import { chatPath } from './chat-view-model';

export interface StartedCanvasThread extends OpenDraftResult {
  /** The thread's address in the app (open it with the chat's own navigation). */
  path: string;
}

/**
 * Opens a draft from one of the caller's published versions (or a brand-new canvas when `fromVersionId` is empty).
 * `status: 'open_elsewhere'` means the canvas already has an open draft and nothing new was made: `path` is that draft's
 * thread, and the caller asks the owner whether to continue there or discard it (see OpenDraftDialog).
 */
export async function startCanvasThread(fromVersionId?: string | null): Promise<StartedCanvasThread> {
  const r = await openCanvasDraft(fromVersionId ?? null);
  // The mirror stays silent in a canvas thread: it must know this one before any message (a carried change request, the
  // first note) is sent into it, not only once the thread panel has loaded and registered it.
  registerCanvasThread(r.threadRootId);
  return { ...r, path: chatPath(r.conversationId, { rootId: r.threadRootId }) };
}

/** What to tell the owner when starting a thread failed. */
export function canvasStartErrorText(e: unknown): string {
  if (e instanceof CanvasDraftRefusal) {
    if (e.code === 'TOO_MANY_DRAFTS') return 'You have too many open canvas drafts. Publish or discard one first.';
    if (e.code === 'RUN_ACTIVE') return 'That draft is being written right now. Try again in a minute.';
  }
  return 'Could not start a canvas. Try again.';
}
