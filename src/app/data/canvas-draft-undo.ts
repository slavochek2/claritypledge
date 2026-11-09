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
import { readCanvasDraftState } from './canvas-draft-state-read';
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
  /** P1621: Undo is gone because the owner's own hand-write (edit, add, remove) closed it, not because no run changed a box. False until a hand-write deleted a step; false again once a run with steps completes. */
  handClosed: boolean;
  /** Run id to the mirror's reply message, and run id to its owner message, for every run the answer lists: what lets the screen move Undo to the next run the moment an undo succeeds (`nextTargetAfterUndo`), before the next read lands. */
  replies: Record<string, string>;
  triggers: Record<string, string>;
}

/**
 * The server's answer to "what would Undo do?" for the draft `draftId` of `canvasId`, and which owner messages of it were undone. For a draft that is no longer open the target
 * has no run and only the marks. A failed read is an error, never "nothing to undo". (Its first step is the server's expire step, so it is read when a run has settled or the
 * draft changed, not on a timer: see use-canvas-undo.)
 */
export async function readCanvasUndoTarget(canvasId: string, draftId: string): Promise<CanvasUndoTarget> {
  const data = await readCanvasDraftState(canvasId); // the offer rows ask the same question in the same moment: one request answers both
  const d = data.draft as Row | null;
  // This thread's draft is closed (published or discarded), or the open draft is another one: nothing can be undone here, but the owner messages whose run was undone stay marked
  // (J6): `closed_undone` lists them by closed draft. A server without that key (before its migration) just has no marks, never an error.
  if (!d || d.id !== draftId || typeof d.revision !== 'number') {
    const marks = (data.closed_undone as Record<string, unknown> | undefined)?.[draftId];
    return { draftId, revision: 0, runId: null, replyMessageId: null, undoneMessageIds: Array.isArray(marks) ? marks.map(String) : [], handClosed: false, replies: {}, triggers: {} };
  }
  const runs = (Array.isArray(d.runs) ? d.runs : []) as Row[];
  const runId = typeof d.undo_run_id === 'string' ? d.undo_run_id : null;
  const reply = runs.find(r => r.id === runId)?.reply_message_id;
  const undone = runs.filter(r => r.state === 'undone' && typeof r.trigger_message_id === 'string').map(r => String(r.trigger_message_id));
  const pick = (col: string): Record<string, string> => Object.fromEntries(runs.filter(r => typeof r.id === 'string' && typeof r[col] === 'string').map(r => [String(r.id), String(r[col])]));
  return { draftId, revision: d.revision, runId, replyMessageId: typeof reply === 'string' ? reply : null, undoneMessageIds: undone, handClosed: d.undo_closed_by_hand === true, replies: pick('reply_message_id'), triggers: pick('trigger_message_id') };
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

/**
 * What the screen knows the moment an undo succeeds, with no read: the undo call said which run is next (`nextUndoRunId`) and the revision; the last read said each run's reply and
 * owner message. So Undo moves to the next reply and the undone message is marked at once, and the read for the new revision only confirms it.
 */
export function nextTargetAfterUndo(t: CanvasUndoTarget, r: { revision: number; undoneRunId: string; nextUndoRunId: string | null }): CanvasUndoTarget {
  const trigger = t.triggers[r.undoneRunId];
  return {
    ...t,
    revision: r.revision,
    runId: r.nextUndoRunId,
    replyMessageId: r.nextUndoRunId ? t.replies[r.nextUndoRunId] ?? null : null,
    undoneMessageIds: trigger && !t.undoneMessageIds.includes(trigger) ? [...t.undoneMessageIds, trigger] : t.undoneMessageIds,
  };
}
