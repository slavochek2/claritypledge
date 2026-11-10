/**
 * @file canvas-draft-remove-call.ts
 * @description P1621: the owner's removal of one point from their open draft (migration 20261106011000, canvas_draft_remove_point).
 * Its own file: canvas-draft-calls.ts is at its size limit. Re-exported by canvas-draft-service.ts.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { failRpc, refusalOf, type Row } from './canvas-draft-calls';
import { reReadWhenVisible } from './canvas-draft-reread';

export type RemoveCanvasDraftPointResult =
  | { ok: true; revision: number }
  | { ok: false; refused: 'stale_view' | 'busy' | 'not_found'; revision?: number };

/**
 * P1621: the owner takes one point off this draft, no confirmation. A refusal is a typed result: busy (a run is going), stale_view (the screen holds an old
 * revision), not_found (the point is not on this draft: already gone, e.g. a repeat after a lost answer). Every refusal except busy asks for a re-read, so the
 * screen shows the draft as it is; the caller treats "point absent after the re-read" as done. A thrown error also asks for a re-read: the answer may have
 * been lost after the removal landed.
 */
export async function removeCanvasDraftPoint(
  draftId: string, pointId: string, expectedRevision: number,
): Promise<RemoveCanvasDraftPointResult> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_remove_point', {
      p_draft: draftId, p_point: pointId, p_expected_revision: expectedRevision,
    });
    if (error) failRpc('removeCanvasDraftPoint', error, 'Could not remove this point');
    const refused = refusalOf(data as Row | null);
    if (refused) {
      // busy_elsewhere (another of the owner's drafts is being written, _canvas_draft_busy_code) reads as busy, as editCanvasDraftPoint treats it: no throw, no re-read.
      const code = refused.refused === 'busy_elsewhere' ? 'busy' : refused.refused;
      if (code !== 'stale_view' && code !== 'busy' && code !== 'not_found') {
        throw new Error(`removeCanvasDraftPoint: unexpected refusal ${code}`);
      }
      if (code !== 'busy') reReadWhenVisible(draftId);
      return refused.revision === null ? { ok: false, refused: code } : { ok: false, refused: code, revision: refused.revision };
    }
    const r = (data ?? {}) as Row;
    reReadWhenVisible(draftId);
    return { ok: true, revision: typeof r.revision === 'number' ? r.revision : expectedRevision + 1 };
  } catch (e) {
    reReadWhenVisible(draftId);
    throw e;
  } finally {
    clearListReturnCache();
  }
}
