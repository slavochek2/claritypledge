/**
 * @file canvas-draft-edit-call.ts
 * @description P1614: the owner's hand edit of a point on their open draft (its own file: canvas-draft-calls.ts is at its size limit).
 * Re-exported by canvas-draft-service.ts.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { emitCanvasDraftEvent } from './canvas-draft-events';
import { failRpc, refusalOf, type CanvasRefused, type Row } from './canvas-draft-calls';
import { whenVisible } from '@/app/prototypes/events/when-visible';

/**
 * The page's follow-up re-read waits for a visible tab (metered-services rule 3, decisions.md 2026-10-30 [technical]; the helper is the one the event room uses), and
 * several outcomes for one draft while the tab is hidden coalesce into one re-read when it returns.
 */
const pendingReReads = new Set<string>();
function reReadWhenVisible(draftId: string): void {
  if (pendingReReads.has(draftId)) return;
  pendingReReads.add(draftId);
  whenVisible(() => {
    pendingReReads.delete(draftId);
    emitCanvasDraftEvent({ kind: 'updated', draftId });
  });
}

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
    if (refused) {
      if (refused.refused === 'stale_view') reReadWhenVisible(draftId);   // the screen holds an old revision: re-read, then ask again
      return refused;
    }
    const r = (data ?? {}) as Row;
    reReadWhenVisible(draftId);
    return { ok: true, changed: r.changed !== false, pointId: String(r.point_id ?? pointId), revision: typeof r.revision === 'number' ? r.revision : expectedRevision };
  } catch (e) {
    // The answer may have been lost after the write landed: ask the page to re-read, as stale_view does, so the editor can see the new point.
    reReadWhenVisible(draftId);
    throw e;
  } finally {
    clearListReturnCache();
  }
}
