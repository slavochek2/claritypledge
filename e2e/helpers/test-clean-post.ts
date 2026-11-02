/**
 * @file test-clean-post.ts
 * @description P1596: the clean-post RPC as the round-clean worker calls it (post_clean_round, one atomic call
 * fenced on the claim), for specs that seed a `processing` clean job by hand. Service role only.
 */
import { supabaseAdmin } from './supabase-admin';

/** event_room_members ids seated at one table of a round: what the cut snapshots as the job's roster. */
export async function seatedRoster(roundId: string, tableNo: number): Promise<string[]> {
  const { data } = await supabaseAdmin.from('event_round_seats').select('room_member_id').eq('round_id', roundId).eq('table_no', tableNo);
  return (data ?? []).map((r) => r.room_member_id as string);
}

/** Re-snapshot a round job's roster from the live seats (specs that re-seat people between posts). */
export async function refreshRoster(jobId: string): Promise<void> {
  const { data: job } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('kind, round_id, table_no').eq('id', jobId).single();
  if (job?.kind !== 'round') return;
  const roster = await seatedRoster(job.round_id as string, job.table_no as number);
  await supabaseAdmin.from('transcribe_round_clean_jobs').update({ roster, seated_count: roster.length }).eq('id', jobId);
}

/** One item through post_clean_round with the job's current attempt. Returns the RPC result plus the posted message id (null = nothing posted). */
export async function postClean(jobId: string, memberId: string, chunkMs: number, text: string) {
  const { data: job } = await supabaseAdmin.from('transcribe_round_clean_jobs').select('attempts').eq('id', jobId).single();
  const res = await supabaseAdmin.rpc('post_clean_round', {
    p_job_id: jobId, p_attempt: job?.attempts ?? 0, p_items: [{ member_id: memberId, chunk_ms: chunkMs, text }],
  });
  let id: string | null = null;
  if (!res.error) {
    const { data: row } = await supabaseAdmin.from('transcribe_round_clean_posts').select('chat_message_id')
      .eq('job_id', jobId).eq('member_id', memberId).eq('chunk_ms', chunkMs).maybeSingle();
    id = (row?.chat_message_id as string | undefined) ?? null;
  }
  return { error: res.error, id, count: res.data as number | null };
}

/** The SQL form for specs that drive psql (attempt 0 = a job inserted by hand). */
export function postCleanSql(jobId: string, memberId: string, chunkMs: number, text: string, attempt = 0): string {
  const item = JSON.stringify([{ member_id: memberId, chunk_ms: chunkMs, text }]).replace(/'/g, "''");
  return `SELECT public.post_clean_round('${jobId}', ${attempt}, '${item}'::jsonb);`;
}
