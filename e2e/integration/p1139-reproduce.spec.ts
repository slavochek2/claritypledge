/**
 * @file p1139-reproduce.spec.ts
 * @description P1139 canary — the four idea-feed tables carry PERMISSIVE INSERT policies
 * with an unconditional predicate (`WITH CHECK (true)`, no `TO <role>` scope), exactly as
 * written in `20251218_p19_3_idea_feed.sql`. `20260211_tighten_idea_feed_rls.sql` and
 * `20260810160000_p1046_...` tightened this family's UPDATE side and never touched INSERT.
 * An unauthenticated caller holding only the public anon key can write to all four with no
 * session and no ownership relationship.
 *
 * Unlike P1138 — where `ml_training_sessions` had a genuine unauthenticated write path that
 * had to be preserved — every DB-touching idea-feed function in `src/app/data/api.ts`
 * (`createFeedIdea`, `voteOnIdea`, `addIdeaComment`, `elevateCommentToIdea`, `getFeedIdeas`,
 * `subscribeToFeed`) has ZERO callers anywhere in the repo. There is no legitimate client
 * write path on any of these four tables to preserve.
 *
 * `clarity_idea_votes` UPDATE is out of scope — `scripts/rls-drift-allowlist.txt` carries it
 * as an accepted founder decision. This canary covers INSERT only, per the spec's Non-Goals.
 *
 * Each assertion checks the OBSERVABLE symptom via a service-role re-read after the anon-key
 * write attempt — never the policy text — matching AC1/AC2. Per the P1138 pitfall, the anon
 * write is issued WITHOUT `.select()` chained (`Prefer: return=minimal`), so a SELECT-policy
 * refusal on the echo-back can never be mistaken for a WITH CHECK refusal.
 *
 * Tests 5 and 6 cover the column-level scenario the P1083 adversarial review named
 * (2026-08-17): RLS is row-level only and says nothing about which COLUMNS a client may set.
 * These tables have no `GRANT INSERT (col)` column scoping, so an anon caller can set
 * server-owned columns directly.
 *
 * Run: npx playwright test --project=integration e2e/integration/p1139-reproduce.spec.ts
 *
 * Expected to FAIL before the fix (writes land) and PASS after (writes refused).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';

function makeAnonClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const SENTINEL = 'p1139-canary';

/** Random UUID for a spoofed anonymous session id — these columns are plain UUIDs, no FK. */
function fakeSessionId(): string {
  return crypto.randomUUID();
}

test.describe('P1139: unauthenticated INSERTs must be refused on the idea-feed tables', () => {
  test.describe.configure({ timeout: 30000 });

  /** Seeded via service role so each table has a real parent row to attach to. */
  let ideaId: string;
  let voteId: string;
  const createdIdeaIds: string[] = [];

  test.beforeAll(async () => {
    const { data: idea, error: ideaErr } = await supabaseAdmin
      .from('clarity_feed_ideas')
      .insert({
        content: `${SENTINEL} seed idea`,
        originator_name: SENTINEL,
        originator_session_id: fakeSessionId(),
        provenance_type: 'direct',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (ideaErr || !idea) {
      throw new Error(`[p1139] failed to seed clarity_feed_ideas: ${ideaErr?.message}`);
    }
    ideaId = idea.id;
    createdIdeaIds.push(ideaId);

    const { data: vote, error: voteErr } = await supabaseAdmin
      .from('clarity_idea_votes')
      .insert({
        idea_id: ideaId,
        voter_session_id: fakeSessionId(),
        voter_name: SENTINEL,
        vote: 'agree',
      })
      .select('id')
      .single();
    if (voteErr || !vote) {
      throw new Error(`[p1139] failed to seed clarity_idea_votes: ${voteErr?.message}`);
    }
    voteId = vote.id;
  });

  test.afterAll(async () => {
    // Comments, votes and vote_history all cascade from clarity_feed_ideas
    // (ON DELETE CASCADE on idea_id / vote_id). vote_history.idea_id has no FK,
    // so clear it by sentinel explicitly.
    await supabaseAdmin.from('clarity_idea_vote_history').delete().eq('voter_name', SENTINEL);
    if (createdIdeaIds.length > 0) {
      await supabaseAdmin.from('clarity_feed_ideas').delete().in('id', createdIdeaIds);
    }
    // Anything else this run's anon writes may have created, by sentinel.
    await supabaseAdmin.from('clarity_idea_comments').delete().eq('author_name', SENTINEL);
    await supabaseAdmin.from('clarity_idea_votes').delete().eq('voter_name', SENTINEL);
    await supabaseAdmin.from('clarity_feed_ideas').delete().eq('originator_name', SENTINEL);
  });

  test('clarity_feed_ideas: anon INSERT with no session is refused', async () => {
    const anonClient = makeAnonClient();
    const marker = `${SENTINEL} forged idea ${crypto.randomUUID()}`;

    await anonClient.from('clarity_feed_ideas').insert({
      content: marker,
      originator_name: SENTINEL,
      originator_session_id: fakeSessionId(),
      provenance_type: 'direct',
      visibility: 'public',
    });

    const { data: after } = await supabaseAdmin
      .from('clarity_feed_ideas')
      .select('id')
      .eq('content', marker);

    if (after) createdIdeaIds.push(...after.map((r) => r.id));

    expect(
      after ?? [],
      'anon INSERT landed a forged idea — clarity_feed_ideas accepts unauthenticated writes'
    ).toHaveLength(0);
  });

  test('clarity_idea_comments: anon INSERT with no session is refused', async () => {
    const anonClient = makeAnonClient();
    const marker = `${SENTINEL} forged comment ${crypto.randomUUID()}`;

    await anonClient.from('clarity_idea_comments').insert({
      idea_id: ideaId,
      author_session_id: fakeSessionId(),
      author_name: SENTINEL,
      content: marker,
    });

    const { data: after } = await supabaseAdmin
      .from('clarity_idea_comments')
      .select('id')
      .eq('content', marker);

    expect(
      after ?? [],
      'anon INSERT landed a forged comment — clarity_idea_comments accepts unauthenticated writes'
    ).toHaveLength(0);
  });

  test('clarity_idea_votes: anon INSERT with no session is refused', async () => {
    const anonClient = makeAnonClient();
    const forgedVoterSession = fakeSessionId();

    await anonClient.from('clarity_idea_votes').insert({
      idea_id: ideaId,
      voter_session_id: forgedVoterSession,
      voter_name: SENTINEL,
      vote: 'agree',
    });

    const { data: after } = await supabaseAdmin
      .from('clarity_idea_votes')
      .select('id')
      .eq('voter_session_id', forgedVoterSession);

    expect(
      after ?? [],
      'anon INSERT landed a forged vote — clarity_idea_votes accepts unauthenticated ballot stuffing'
    ).toHaveLength(0);
  });

  test('clarity_idea_vote_history: anon INSERT of a fabricated history entry is refused', async () => {
    const anonClient = makeAnonClient();
    const forgedVoterSession = fakeSessionId();

    // A fabricated history row claiming this voter previously held a different position —
    // vote history is the record of how someone's stated position changed over time.
    await anonClient.from('clarity_idea_vote_history').insert({
      vote_id: voteId,
      idea_id: ideaId,
      voter_session_id: forgedVoterSession,
      voter_name: SENTINEL,
      vote: 'disagree',
    });

    const { data: after } = await supabaseAdmin
      .from('clarity_idea_vote_history')
      .select('id')
      .eq('voter_session_id', forgedVoterSession);

    expect(
      after ?? [],
      'anon INSERT landed a fabricated vote-history entry — the record of position change is forgeable'
    ).toHaveLength(0);
  });

  test('clarity_feed_ideas: anon cannot set the server-owned created_at column', async () => {
    // RLS is row-level only — it says nothing about which COLUMNS a client may set.
    // Without `GRANT INSERT (col)` scoping (the shape P1083 adopted after its 2026-08-17
    // adversarial review), an anon caller can pin created_at and permanently occupy the
    // top of any `.order('created_at', { ascending: false })` feed query.
    const anonClient = makeAnonClient();
    const marker = `${SENTINEL} backdated idea ${crypto.randomUUID()}`;

    await anonClient.from('clarity_feed_ideas').insert({
      content: marker,
      originator_name: SENTINEL,
      originator_session_id: fakeSessionId(),
      provenance_type: 'direct',
      visibility: 'public',
      created_at: '2099-01-01T00:00:00Z',
    });

    const { data: after } = await supabaseAdmin
      .from('clarity_feed_ideas')
      .select('id, created_at')
      .eq('content', marker);

    if (after) createdIdeaIds.push(...after.map((r) => r.id));

    expect(
      after ?? [],
      'anon set created_at directly — no column-level INSERT grant scoping on clarity_feed_ideas'
    ).toHaveLength(0);
  });

  test('clarity_idea_vote_history: anon cannot set the server-owned changed_at column', async () => {
    const anonClient = makeAnonClient();
    const forgedVoterSession = fakeSessionId();

    await anonClient.from('clarity_idea_vote_history').insert({
      vote_id: voteId,
      idea_id: ideaId,
      voter_session_id: forgedVoterSession,
      voter_name: SENTINEL,
      vote: 'disagree',
      changed_at: '2020-01-01T00:00:00Z',
    });

    const { data: after } = await supabaseAdmin
      .from('clarity_idea_vote_history')
      .select('id, changed_at')
      .eq('voter_session_id', forgedVoterSession);

    expect(
      after ?? [],
      'anon backdated changed_at — a fabricated history entry can be planted before the real one'
    ).toHaveLength(0);
  });
});
