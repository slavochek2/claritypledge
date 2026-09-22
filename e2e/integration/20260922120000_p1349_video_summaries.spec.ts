/**
 * @file 20260922120000_p1349_video_summaries.spec.ts
 * @description P1349 migration: video_summaries is public ONLY once confirmed, and only the
 * service role can write it.
 *
 * The client never filters on status — RLS is the whole guarantee that a draft or an
 * agent-checked-but-unconfirmed summary cannot reach the "Read video summary" link or the
 * /video/:id page. So each status is seeded and read back as anon.
 *
 * Run against test DB:  npx playwright test e2e/integration/20260922120000_p1349_video_summaries.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';

const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Obviously-fake ids, unique per run so concurrent runs cannot collide.
const run = Date.now().toString(36).slice(-6);
const ids = { draft: `p1349d${run}`, checked: `p1349c${run}`, confirmed: `p1349f${run}` };
const now = new Date().toISOString();

function row(videoId: string, status: string) {
  return {
    video_id: videoId,
    title: 'Test video',
    channel: 'Test channel',
    duration_seconds: 60,
    summary: 'Test summary.',
    key_points: ['One.'],
    moments: [{ t: 5, note: 'Test moment' }],
    status,
    written_by: 'writer-agent',
    checked_by: status === 'draft' ? null : 'checker-agent',
    checked_at: status === 'draft' ? null : now,
    confirmed_at: status === 'confirmed' ? now : null,
  };
}

test.describe.serial('P1349 video_summaries RLS', () => {
  test.beforeAll(async () => {
    const { error } = await supabaseAdmin
      .from('video_summaries')
      .insert([row(ids.draft, 'draft'), row(ids.checked, 'checked'), row(ids.confirmed, 'confirmed')]);
    expect(error).toBeNull();
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('video_summaries').delete().in('video_id', [...Object.values(ids), `p1349n${run}`, `p1349s${run}`]);
  });

  test('anon sees the confirmed summary and neither the draft nor the checked one', async () => {
    const { data, error } = await anon.from('video_summaries').select('video_id').in('video_id', Object.values(ids));
    expect(error).toBeNull();
    expect((data ?? []).map((r) => r.video_id)).toEqual([ids.confirmed]);
  });

  test('anon cannot insert or update', async () => {
    const ins = await anon.from('video_summaries').insert(row(`p1349x${run}`, 'confirmed'));
    expect(ins.error).not.toBeNull();
    await anon.from('video_summaries').update({ title: 'hijacked' }).eq('video_id', ids.confirmed);
    const { data } = await supabaseAdmin.from('video_summaries').select('title').eq('video_id', ids.confirmed).single();
    expect(data?.title).toBe('Test video');
  });

  test('a summary cannot be checked by the agent that wrote it', async () => {
    const bad = { ...row(`p1349s${run}`, 'checked'), checked_by: 'writer-agent' };
    const { error } = await supabaseAdmin.from('video_summaries').insert(bad);
    expect(error?.code).toBe('23514'); // check_violation
  });

  test('a confirmed summary must name its checker', async () => {
    const bad = { ...row(`p1349n${run}`, 'confirmed'), checked_by: null };
    const { error } = await supabaseAdmin.from('video_summaries').insert(bad);
    expect(error?.code).toBe('23514');
  });

  test('one row per video: a second summary for the same video is refused', async () => {
    const { error } = await supabaseAdmin.from('video_summaries').insert(row(ids.confirmed, 'draft'));
    expect(error?.code).toBe('23505'); // unique_violation
  });
});
