/**
 * @file canvas-draft-edit-call.ts
 * @description P1614: the owner's hand edit of a point on their open draft (its own file: canvas-draft-calls.ts is at its size limit).
 * Re-exported by canvas-draft-service.ts.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { emitCanvasDraftEvent } from './canvas-draft-events';
import { failRpc, refusalOf, staleToEvent, type CanvasRefused, type Row } from './canvas-draft-calls';

/**
 * P1614: the owner changes a point's text on their open draft, with no model call and no run. `changed: false` means the text matched and nothing was
 * written. A refusal is a typed result: busy while a run or Publish is going, stale_view when the draft (or the point) moved on since the person last saw it.
 * Empty or over-long text raises 22023, which is thrown: the editor stops it first.
 */
export async function editCanvasDraftPoint(
  draftId: string, pointId: string, statement: string, expectedRevision: number,
): Promise<{ ok: true; changed: boolean; pointId: string; revision: number } | CanvasRefused> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_edit_point', {
      p_draft: draftId, p_point: pointId, p_statement: statement, p_expected_revision: expectedRevision,
    });
    if (error) failRpc('editCanvasDraftPoint', error, 'Could not save this point');
    const refused = refusalOf(data as Row | null);
    if (refused) return staleToEvent(refused, draftId);
    const r = (data ?? {}) as Row;
    emitCanvasDraftEvent({ kind: 'updated', draftId });
    return { ok: true, changed: r.changed !== false, pointId: String(r.point_id ?? pointId), revision: typeof r.revision === 'number' ? r.revision : expectedRevision };
  } catch (e) {
    // The answer may have been lost after the write landed: ask the page to re-read, as stale_view does, so the editor can see the new point.
    emitCanvasDraftEvent({ kind: 'updated', draftId });
    throw e;
  } finally {
    clearListReturnCache();
  }
}
