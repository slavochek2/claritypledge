/**
 * @file p1347-topic-voting.test.ts
 * @description P1347: what the DATABASE allows on the /topics surface, run against the live TEST project.
 *
 * Every client is the anon key, exactly as anyone who has read this public repo would hold it:
 *   - anon reads only published topics, and only the four published fields plus aggregates;
 *   - only signed-in people vote (1–5); results show only on topics you voted on;
 *   - suggestions need sign-in and never come back out to a non-admin;
 *   - the tables themselves are unreadable; admin RPCs refuse anon and non-admins.
 *
 *   npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

function anon(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signedIn(user: TestUser): Promise<SupabaseClient> {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

// Redesign: only the title (plus source and aggregates) is public. No video, no "why".
const PUBLIC_COLUMNS = ['id', 'title', 'source', 'my_rating', 'my_is_public', 'rating_avg', 'rating_count', 'voters'].sort();

describe('P1347: topic voting is gated in the database', () => {
  let plain: TestUser;
  let other: TestUser;
  let openId: string;
  let hiddenId: string;
  const tag = `p1347-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    plain = await createTestUser({ name: 'P1347 Plain' });
    other = await createTestUser({ name: 'P1347 Other' });
    const { data, error } = await supabaseAdmin
      .from('topic_candidates')
      .insert([
        { title: `${tag} open`, why: 'Contested because tests.', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thinker_name: 'Test Thinker', is_published: true, sort_order: -1000 },
        { title: `${tag} hidden`, why: 'Private row.', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', thinker_name: 'Hidden Thinker', is_published: false, sort_order: 0 },
      ])
      .select('id, is_published');
    if (error) throw error;
    openId = data.find((r) => r.is_published)!.id;
    hiddenId = data.find((r) => !r.is_published)!.id;
  });

  afterAll(async () => {
    await supabaseAdmin.from('topic_candidates').delete().in('id', [openId, hiddenId]);
    await supabaseAdmin.from('topic_candidates').delete().eq('created_by', plain.user.id);
    await supabaseAdmin.from('topic_suggestions').delete().eq('user_id', plain.user.id);
    await deleteTestUser(plain.user.id);
    await deleteTestUser(other.user.id);
  });

  it('anon sees published titles only, and no results', async () => {
    const { data, error } = await anon().rpc('get_open_topics');
    expect(error).toBeNull();
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).toContain(openId);
    expect(ids).not.toContain(hiddenId);
    expect(Object.keys(data![0]).sort()).toEqual(PUBLIC_COLUMNS);
    const row = data!.find((r: { id: string }) => r.id === openId);
    expect([row.rating_avg, row.rating_count, row.voters]).toEqual([null, null, null]);
  });

  it('anon cannot read any of the three tables directly', async () => {
    for (const table of ['topic_candidates', 'topic_ratings', 'topic_suggestions']) {
      const { data, error } = await anon().from(table).select('*').limit(1);
      expect(error, table).not.toBeNull();
      expect(data, table).toBeNull();
    }
  });

  it('only signed-in people can vote', async () => {
    const r = await anon().rpc('rate_topic', { p_topic_id: openId, p_rating: 4, p_is_public: true });
    expect(r.error).not.toBeNull();
  });

  it('results come back only for a topic you voted on; public voters show, anonymous ones only count', async () => {
    const a = await signedIn(plain);
    const b = await signedIn(other);
    // Before voting, even signed in: no result.
    const pre = (await a.rpc('get_open_topics')).data!.find((r: { id: string }) => r.id === openId);
    expect(pre.rating_avg).toBeNull();

    expect((await b.rpc('rate_topic', { p_topic_id: openId, p_rating: 2, p_is_public: true })).error).toBeNull();
    expect((await a.rpc('rate_topic', { p_topic_id: openId, p_rating: 3, p_is_public: false })).error).toBeNull();
    expect((await a.rpc('rate_topic', { p_topic_id: openId, p_rating: 4, p_is_public: false })).error).toBeNull(); // re-vote replaces

    const row = (await a.rpc('get_open_topics')).data!.find((r: { id: string }) => r.id === openId);
    expect(row.my_rating).toBe(4);
    expect(row.rating_count).toBe(2);
    expect(Number(row.rating_avg)).toBe(3);
    expect(row.voters.map((v: { name: string }) => v.name)).toEqual(['P1347 Other']);

    // Switching to "show my photo" applies to existing votes.
    expect((await a.rpc('set_my_topic_votes_public', { p_is_public: true })).error).toBeNull();
    const after = (await b.rpc('get_open_topics')).data!.find((r: { id: string }) => r.id === openId);
    expect(after.voters.map((v: { name: string }) => v.name).sort()).toEqual(['P1347 Other', 'P1347 Plain']);
  });

  it('out-of-range ratings and unpublished topics are refused', async () => {
    const c = await signedIn(plain);
    expect((await c.rpc('rate_topic', { p_topic_id: openId, p_rating: 0, p_is_public: true })).error?.code).toBe('22023');
    expect((await c.rpc('rate_topic', { p_topic_id: hiddenId, p_rating: 3, p_is_public: true })).error?.code).toBe('P0002');
  });

  it('anon cannot suggest; a signed-in user can, and cannot read suggestions back', async () => {
    const a = await anon().rpc('suggest_topic', { p_topic_id: null, p_body: 'anon idea', p_link: null });
    expect(a.error).not.toBeNull();

    const c = await signedIn(plain);
    const ok = await c.rpc('suggest_topic', { p_topic_id: openId, p_body: 'Pair it with a rebuttal video', p_link: 'https://example.com/x' });
    expect(ok.error).toBeNull();
    const bad = await c.rpc('suggest_topic', { p_topic_id: null, p_body: 'x', p_link: 'javascript:alert(1)' });
    expect(bad.error?.code).toBe('22023');

    const read = await c.from('topic_suggestions').select('*');
    expect(read.data).toBeNull();
  });

  it('add_topic: anon refused; signed-in adds a public topic listed above host topics, note kept private', async () => {
    expect((await anon().rpc('add_topic', { p_title: `${tag} anon`, p_note: null, p_link: null })).error).not.toBeNull();

    const c = await signedIn(plain);
    const added = await c.rpc('add_topic', { p_title: `${tag} community`, p_note: 'secret note', p_link: 'https://youtu.be/x' });
    expect(added.error).toBeNull();

    const { data } = await anon().rpc('get_open_topics');
    const ids = data!.map((r: { id: string }) => r.id);
    const row = data!.find((r: { id: string }) => r.id === added.data);
    expect(row.source).toBe('community');
    expect(ids.indexOf(added.data)).toBeLessThan(ids.indexOf(openId));
    expect(JSON.stringify(data)).not.toContain('secret note');

    const bad = await c.rpc('add_topic', { p_title: `${tag} bad link`, p_note: null, p_link: 'javascript:alert(1)' });
    expect(bad.error?.code).toBe('22023');
  });

  it('admin RPCs refuse anon and a signed-in non-admin', async () => {
    const c = await signedIn(plain);
    for (const [fn, args] of [
      ['admin_list_topics', {}],
      ['admin_list_topic_suggestions', {}],
      ['admin_set_topic_published', { p_id: hiddenId, p_published: true }],
      ['admin_save_topic', { p_id: null, p_title: 'x', p_why: 'y', p_video_url: 'https://youtu.be/x', p_thinker_name: 'z', p_sort_order: 0 }],
    ] as const) {
      const r1 = await anon().rpc(fn, args);
      expect(r1.error, `anon ${fn}`).not.toBeNull();
      const r2 = await c.rpc(fn, args);
      expect(r2.error?.code, `non-admin ${fn}`).toBe('42501');
    }
    const { data } = await supabaseAdmin.from('topic_candidates').select('is_published').eq('id', hiddenId).single();
    expect(data!.is_published).toBe(false);
  });
});
