/**
 * @file p1429-topic-photo-concurrent.test.ts
 * @description P1429 A1 (review round): a vote and "Hide my photo" IN FLIGHT AT THE SAME TIME.
 * Without a shared per-user lock, rate_topic can read the old choice, Hide can commit and update the
 * existing votes, and the vote then writes its stale "public" — the voter exposed after hiding.
 * Both RPCs now take the same per-user transaction lock. A race cannot be scheduled from a client,
 * so this fires many overlapping pairs; the control run before the lock is recorded in the commit.
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
const PEOPLE = 5;
const RACES = 8; // per person, each on a fresh topic

/** Two clients on one sign-in (the auth API rate-limits sign-ins), so two connections race. */
async function twoConnections(user: TestUser): Promise<[SupabaseClient, SupabaseClient]> {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
  if (error) throw error;
  const d = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return [c, d];
}

describe('P1429 A1: a vote racing "Hide my photo" never lands public', () => {
  const voters: TestUser[] = [];
  const ids: string[] = [];
  const tag = `p1429c-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    for (let i = 0; i < PEOPLE; i++) voters.push(await createTestUser({ name: `P1429 Racer ${i}` }));
    const { data, error } = await supabaseAdmin
      .from('topic_candidates')
      .insert(Array.from({ length: RACES }, (_, k) => ({ title: `${tag} race ${k}`, why: 'Test.', is_published: true, sort_order: -2000 - k })))
      .select('id');
    if (error) throw error;
    ids.push(...data.map((r) => r.id));
  }, 120_000);

  afterAll(async () => {
    await supabaseAdmin.from('topic_candidates').delete().in('id', ids);
    for (const v of voters) await deleteTestUser(v.user.id);
  }, 120_000);

  it(`${PEOPLE} people x ${RACES} races: a star and Hide at once always end hidden`, async () => {
    const exposed: string[] = [];
    await Promise.all(
      voters.map(async (v) => {
        const [a, b] = await twoConnections(v);
        for (const topic of ids) {
          // Showing, then a new star and Hide sent together on two connections.
          expect((await a.rpc('set_my_topic_votes_public', { p_is_public: true })).error).toBeNull();
          const results = await Promise.all([
            a.rpc('rate_topic', { p_topic_id: topic, p_rating: 4, p_is_public: true }),
            b.rpc('set_my_topic_votes_public', { p_is_public: false }),
          ]);
          for (const r of results) expect(r.error).toBeNull();
          const { data } = await supabaseAdmin
            .from('topic_ratings').select('is_public').eq('topic_id', topic).eq('user_id', v.user.id).single();
          if (data?.is_public !== false) exposed.push(`${v.user.id}:${topic}`);
        }
      }),
    );
    expect(exposed).toEqual([]);
  }, 120_000);
});
