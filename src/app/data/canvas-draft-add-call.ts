/**
 * @file canvas-draft-add-call.ts
 * @description P1621: the owner's hand-add of a point to a box of their open draft (migration 20261106000000, canvas_draft_add_point).
 * Its own file: canvas-draft-calls.ts is at its size limit. Re-exported by canvas-draft-service.ts.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { emitCanvasDraftEvent } from './canvas-draft-events';
import { failRpc, refusalOf, type CanvasRefused, type Row } from './canvas-draft-calls';
import { whenVisible } from '@/app/prototypes/events/when-visible';

/** The follow-up re-read waits for a visible tab (same helper and coalescing as the edit call). */
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
 * P1621: the owner adds a point to a box with no model call and no run. `clientId` makes a retry safe: a repeat returns the first result with
 * `changed: false` and writes nothing. A refusal is a typed result: busy, stale_view, box_full (3 already there), duplicate (same words in the box).
 * A bad box or empty or over-long text raises 22023, which is thrown: the editor stops it first.
 */
export async function addCanvasDraftPoint(
  draftId: string, box: string, statement: string, expectedRevision: number, clientId: string,
): Promise<{ ok: true; changed: boolean; pointId: string; revision: number } | CanvasRefused> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_add_point', {
      p_draft: draftId, p_box: box, p_statement: statement, p_expected_revision: expectedRevision, p_client_id: clientId,
    });
    if (error) failRpc('addCanvasDraftPoint', error, 'Could not save this point');
    const refused = refusalOf(data as Row | null);
    if (refused) {
      if (refused.refused === 'stale_view' || refused.refused === 'box_full' || refused.refused === 'not_found') reReadWhenVisible(draftId);   // the screen holds an old revision: re-read
      return refused;
    }
    const r = (data ?? {}) as Row;
    reReadWhenVisible(draftId);
    return { ok: true, changed: r.changed !== false, pointId: String(r.point_id ?? ''), revision: typeof r.revision === 'number' ? r.revision : expectedRevision };
  } catch (e) {
    // The answer may have been lost after the write landed: ask the page to re-read so the editor can see the new point.
    reReadWhenVisible(draftId);
    throw e;
  } finally {
    clearListReturnCache();
  }
}
