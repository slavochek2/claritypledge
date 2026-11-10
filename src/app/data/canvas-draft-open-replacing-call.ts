/**
 * @file canvas-draft-open-replacing-call.ts
 * @description P1621: "Start over" on a clone's pending page: discard the open draft and open a fresh one from the same published version in ONE
 * transaction (migration 20261106013000, canvas_draft_open_replacing). Its own file: canvas-draft-calls.ts is at its size limit. Re-exported by
 * canvas-draft-service.ts.
 */
import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { failRpc, readOpenedDraft, refusalOf, staleToEvent, type CanvasRefused, type OpenDraftResult, type Row } from './canvas-draft-calls';
import { openedResultOf } from './canvas-draft-opened';

/**
 * Opens a fresh draft from `fromVersionId` in place of the open draft `replaceDraftId`, which the person last saw at `replaceRevision`. The discard and
 * the open commit or roll back together. A refusal is a typed result with nothing discarded: busy (a run is going), stale_view (the draft changed or is
 * gone: re-read; the page is told to). A repeat after a lost answer returns the draft the first call opened (same OpenDraftResult). A database refusal
 * throws, keeping its Postgres `code` (54000: too many open drafts; 42501: not yours).
 */
export async function openCanvasDraftReplacing(
  fromVersionId: string, replaceDraftId: string, replaceRevision: number,
): Promise<OpenDraftResult | CanvasRefused> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_open_replacing', {
      p_from_version: fromVersionId, p_replace_draft: replaceDraftId, p_replace_revision: replaceRevision,
    });
    if (error || !data) failRpc('openCanvasDraftReplacing', error, 'Could not start over');
    const refused = refusalOf(data as Row | null);
    if (refused) return staleToEvent(refused, replaceDraftId);
    const r = data as Row;
    return openedResultOf(r, 'opened', await readOpenedDraft(String(r.draft_id)));
  } finally {
    clearListReturnCache();
  }
}
