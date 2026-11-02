/**
 * @file canvas-draft-undo.ts
 * @description P1536 D7 (client): Undo of a canvas draft's newest applied run. Two calls, both owner-only:
 *  - `readCanvasUndoTarget` asks the SERVER which run Undo would undo (`get_canvas_draft_state`'s `undo_run_id`: the newest `done` run that has a step), which reply
 *    message of the thread carries it, and which owner messages were undone. The client never guesses: the step table is closed to clients, and a run that changed
 *    no box has no step and no Undo.
 *  - `undoCanvasRun` calls `canvas_draft_undo` with the run and the revision the person saw. Refusals about the state of things come back typed (busy, busy_elsewhere,
 *    stale_view: nothing was changed); an authorization failure throws. A success, and a stale_view (the screen is behind), tell the canvas page beside the thread to re-read.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { failRpc, refusalOf, staleToEvent, type CanvasRefused, type Row } from './canvas-draft-calls';
import { emitCanvasDraftEvent } from './canvas-draft-events';

/** What the server said about Undo for one open draft, as of `revision`. */
export interface CanvasUndoTarget {
  draftId: string;
  /** The draft's revision this answer is for: what `undoCanvasRun` must pass. */
  revision: number;
  /** The run Undo would undo; null when no run can be undone. */
  runId: string | null;
  /** The mirror's reply to that run (where Undo is drawn); null when it has none. */
  replyMessageId: string | null;
  /** The owner messages whose run was undone: marked "Undone", never material again. */
  undoneMessageIds: string[];
}

/**
 * The server's answer to "what would Undo do?" for the open draft `draftId` of `canvasId`. Null when the canvas has no open draft or it is another one than the
 * thread's. A failed read is an error, never "nothing to undo". (Its first step is the server's expire step, so it is read when a run has settled or the
 * draft changed, not on a timer: see use-canvas-undo.)
 */
export async function readCanvasUndoTarget(canvasId: string, draftId: string): Promise<CanvasUndoTarget | null> {
  try {
    const { data, error } = await supabase.rpc('get_canvas_draft_state', { p_canvas: canvasId });
    if (error || !data) failRpc('readCanvasUndoTarget', error, 'Could not read this draft');
    const d = (data as Row).draft as Row | null;
    if (!d || d.id !== draftId || typeof d.revision !== 'number') return null;
    const runs = (Array.isArray(d.runs) ? d.runs : []) as Row[];
    const runId = typeof d.undo_run_id === 'string' ? d.undo_run_id : null;
    const reply = runs.find(r => r.id === runId)?.reply_message_id;
    const undone = runs.filter(r => r.state === 'undone' && typeof r.trigger_message_id === 'string').map(r => String(r.trigger_message_id));
    return { draftId, revision: d.revision, runId, replyMessageId: typeof reply === 'string' ? reply : null, undoneMessageIds: undone };
  } finally {
    clearListReturnCache(); // the server's expire step can fail a run: a write the cached lists never show
  }
}

export type UndoResult = { ok: true; revision: number; undoneRunId: string; nextUndoRunId: string | null } | CanvasRefused;

/**
 * Undoes `expectedRunId`, the draft's newest applied run as the person saw it at `expectedRevision`. No redo. The server restores the draft's points, questions,
 * links and focus, rewrites that run's reply to "Undone." and marks the run undone; a stale run or revision refuses with stale_view and changes nothing.
 */
export async function undoCanvasRun(a: { draftId: string; expectedRunId: string; expectedRevision: number }): Promise<UndoResult> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_undo', { p_draft: a.draftId, p_expected_run: a.expectedRunId, p_expected_revision: a.expectedRevision });
    if (error || !data) failRpc('undoCanvasRun', error, 'Could not undo this update');
    const r = data as Row;
    const refused = refusalOf(r);
    if (refused) return staleToEvent(refused, a.draftId);
    emitCanvasDraftEvent({ kind: 'updated', draftId: a.draftId }); // the boxes changed: the canvas page beside the thread re-reads in place
    return { ok: true, revision: Number(r.revision), undoneRunId: String(r.undone_run_id), nextUndoRunId: typeof r.next_undo_run_id === 'string' ? r.next_undo_run_id : null };
  } finally {
    clearListReturnCache();
  }
}
