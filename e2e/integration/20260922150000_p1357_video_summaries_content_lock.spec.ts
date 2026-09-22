/**
 * @file 20260922150000_p1357_video_summaries_content_lock.spec.ts
 * @description P1357 migration: a checked/confirmed status describes exactly the content that was
 * checked. Any content edit sends the row back to draft (so it leaves the public page); status-only
 * updates are untouched; the transcript hash column accepts only a sha256.
 *
 * Run against test DB:  npx playwright test e2e/integration/20260922150000_p1357_video_summaries_content_lock.spec.ts
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

const run = Date.now().toString(36).slice(-5);
const ids = { edit: `p1357e${run}`, status: `p1357s${run}`, sha: `p1357h${run}` }; // 6 + 5 = 11 chars
const now = new Date().toISOString();
const SHA = 'a'.repeat(64);

function row(videoId: string, status: string) {
  return {
    video_id: videoId,
    title: 'Test video',
    channel: 'Test channel',
    duration_seconds: 60,
    summary: 'Test summary.',
    key_points: ['One.'],
    moments: [{ t: 5, note: 'Test moment' }],
    transcript_sha256: SHA,
    status,
    written_by: 'writer-agent',
    checked_by: status === 'draft' ? null : 'checker-agent',
    checked_at: status === 'draft' ? null : now,
    confirmed_at: status === 'confirmed' ? now : null,
  };
}

test.describe.serial('P1357 video_summaries content lock', () => {
  test.afterAll(async () => {
    await supabaseAdmin.from('video_summaries').delete().in('video_id', Object.values(ids));
  });

  test('editing the content of a confirmed summary sends it back to draft and clears its check', async () => {
    expect((await supabaseAdmin.from('video_summaries').insert(row(ids.edit, 'confirmed'))).error).toBeNull();
    const { data, error } = await supabaseAdmin
      .from('video_summaries')
      .update({ summary: 'Edited after it was checked.' })
      .eq('video_id', ids.edit)
      .select('status, checked_by, checked_at, confirmed_at')
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ status: 'draft', checked_by: null, checked_at: null, confirmed_at: null });
  });

  test('a new transcript hash also voids the check', async () => {
    expect((await supabaseAdmin.from('video_summaries').insert(row(ids.sha, 'checked'))).error).toBeNull();
    const { data } = await supabaseAdmin
      .from('video_summaries')
      .update({ transcript_sha256: 'b'.repeat(64) })
      .eq('video_id', ids.sha)
      .select('status')
      .single();
    expect(data?.status).toBe('draft');
  });

  test('status-only updates keep their status, and updated_at is stamped', async () => {
    expect((await supabaseAdmin.from('video_summaries').insert(row(ids.status, 'checked'))).error).toBeNull();
    const before = (await supabaseAdmin.from('video_summaries').select('updated_at').eq('video_id', ids.status).single()).data?.updated_at;
    const { data } = await supabaseAdmin
      .from('video_summaries')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), updated_at: '2000-01-01T00:00:00Z' })
      .eq('video_id', ids.status)
      .select('status, updated_at')
      .single();
    expect(data?.status).toBe('confirmed');
    expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(new Date(before!).getTime());
  });

  test('the transcript hash column accepts only a sha256', async () => {
    const { error } = await supabaseAdmin.from('video_summaries').update({ transcript_sha256: 'not-a-hash' }).eq('video_id', ids.status);
    expect(error?.code).toBe('23514');
  });
});
