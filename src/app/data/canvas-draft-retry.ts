/**
 * @file canvas-draft-retry.ts
 * @description P1536 (Design v6): trying a failed run again. Re-exported by canvas-draft-service.ts with the other draft calls.
 */

import { supabase } from '@/lib/supabase';
import { clearListReturnCache } from '@/lib/list-return-cache';
import { failRpc, refusalOf, staleToEvent, startCanvasRun, type CanvasRefused, type RunStart, type Row } from './canvas-draft-calls';

/** What `retryCanvasRun` answers: the new run (started at once unless the retry was a repeat of an earlier one), or a typed refusal. */
export interface CanvasRetried { ok: true; runId: string; revision: number; replayed: boolean; start: RunStart | null }

/**
 * Tries a failed run again: `canvas_draft_retry` makes ONE new queued run that copies the failed run's kind and trigger message
 * (it is the draft's newest run, and the owner is idle), then that run is started by id. Refusals are typed results; `not_retryable`
 * is an upload whose file was never kept (the owner sends the file again). A repeat with the same `clientId` starts nothing twice.
 */
export async function retryCanvasRun(a: { draftId: string; failedRunId: string; expectedRevision: number; clientId: string }): Promise<CanvasRetried | CanvasRefused> {
  try {
    const { data, error } = await supabase.rpc('canvas_draft_retry', {
      p_draft: a.draftId, p_failed_run: a.failedRunId, p_expected_revision: a.expectedRevision, p_client_id: a.clientId,
    });
    if (error || !data) failRpc('retryCanvasRun', error, 'Could not try again');
    const r = data as Row;
    const refused = refusalOf(r);
    if (refused) return staleToEvent(refused, a.draftId);
    const replayed = r.replayed === true;
    const runId = String(r.run_id);
    return { ok: true, runId, revision: Number(r.revision), replayed, start: replayed ? null : await startCanvasRun(runId) };
  } finally {
    clearListReturnCache();
  }
}

