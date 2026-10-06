/**
 * @file p1429-topic-photo-race.test.ts
 * @description P1429 A1: a voter who hides their photo stays hidden, whatever the client sends.
 *
 * The race: a star vote leaves with "show my photo" captured at tap time, "Hide my photo" lands
 * first, then the slow vote lands and used to overwrite is_public back to true. Same shape from a
 * second tab (stale flag) and from the guest-votes flush after sign-in. The database must hold the
 * choice; the client's flag can only matter before any choice was ever made.
 *
 *   npm run test:integration -- p1429
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import { supabaseAdmin } from '../../../e2e/helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../../../e2e/helpers/test-user';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

async function signedIn(user: TestUser): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

async function isPublic(userId: string, topicId: string): Promise<boolean | null> {
  const { data, error } = await supabaseAdmin
    .from('topic_ratings')
    .select('is_public')
    .eq('user_id', userId)
    .eq('topic_id', topicId)
    .maybeSingle();
  if (error) throw error;
  return data?.is_public ?? null;
}

describe('P1429 A1: hiding your photo survives a late or stale vote', () => {
  let voter: TestUser;
  let fresh: TestUser;
  const ids: string[] = [];
  const tag = `p1429-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    voter = await createTestUser({ name: 'P1429 Voter' });
    fresh = await createTestUser({ name: 'P1429 Fresh' });
    const { data, error } = await supabaseAdmin
      .from('topic_candidates')
      .insert([1, 2, 3].map((n) => ({ title: `${tag} ${n}`, why: 'Test.', is_published: true, sort_order: -1000 - n })))
      .select('id');
    if (error) throw error;
    ids.push(...data.map((r) => r.id));
  });

  afterAll(async () => {
    await supabaseAdmin.from('topic_candidates').delete().in('id', ids);
    await deleteTestUser(voter.user.id);
    await deleteTestUser(fresh.user.id);
  });

  it('a vote landing after "Hide my photo" with the stale public flag stays hidden', async () => {
    const tabA = await signedIn(voter);
    const tabB = await signedIn(voter); // a second tab or device, still holding "show"
    expect((await tabA.rpc('rate_topic', { p_topic_id: ids[0]!, p_rating: 4, p_is_public: true })).error).toBeNull();

    // "Hide my photo" lands first...
    expect((await tabA.rpc('set_my_topic_votes_public', { p_is_public: false })).error).toBeNull();
    expect(await isPublic(voter.user.id, ids[0]!)).toBe(false);

    // ...then the slow vote from tap time, re-voting the same topic, and a vote from the other tab.
    expect((await tabA.rpc('rate_topic', { p_topic_id: ids[0]!, p_rating: 5, p_is_public: true })).error).toBeNull();
    expect((await tabB.rpc('rate_topic', { p_topic_id: ids[1]!, p_rating: 3, p_is_public: true })).error).toBeNull();

    expect(await isPublic(voter.user.id, ids[0]!)).toBe(false);
    expect(await isPublic(voter.user.id, ids[1]!)).toBe(false);
  });

  it('votes flushed after sign-in respect a photo already hidden', async () => {
    const c = await signedIn(voter);
    // The guest flush sends whatever the page computed; a hidden choice still wins.
    expect((await c.rpc('rate_topic', { p_topic_id: ids[2]!, p_rating: 2, p_is_public: true })).error).toBeNull();
    expect(await isPublic(voter.user.id, ids[2]!)).toBe(false);
  });

  it('showing the photo again shows it on later votes too', async () => {
    const c = await signedIn(voter);
    expect((await c.rpc('set_my_topic_votes_public', { p_is_public: true })).error).toBeNull();
    expect((await c.rpc('rate_topic', { p_topic_id: ids[2]!, p_rating: 4, p_is_public: false })).error).toBeNull();
    expect(await isPublic(voter.user.id, ids[2]!)).toBe(true);
    expect(await isPublic(voter.user.id, ids[0]!)).toBe(true);
  });

  it('before any choice was made, the vote carries the page flag (hidden if asked)', async () => {
    const c = await signedIn(fresh);
    expect((await c.rpc('rate_topic', { p_topic_id: ids[0]!, p_rating: 3, p_is_public: false })).error).toBeNull();
    expect(await isPublic(fresh.user.id, ids[0]!)).toBe(false);
  });

  it('the preference table is not readable or writable from a client', async () => {
    const c = await signedIn(voter);
    const read = await c.from('topic_vote_prefs').select('*').limit(1);
    expect(read.data ?? []).toEqual([]);
    const write = await c.from('topic_vote_prefs').upsert({ user_id: voter.user.id, show_photo: true });
    expect(write.error).not.toBeNull();
  });
});
