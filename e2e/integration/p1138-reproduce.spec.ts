/**
 * @file p1138-reproduce.spec.ts
 * @description P1138 canary — five tables carry PERMISSIVE write policies with an
 * unconditional predicate (`USING(true)` / `WITH CHECK(true)`, no `TO <role>` scope)
 * plus INSERT/UPDATE grants to `anon`/`authenticated`. An unauthenticated caller
 * holding only the public anon key can write to them with no session, no ownership
 * relationship, and no legitimate client-side call site.
 *
 * `clarity_idea_votes` is deliberately excluded — `20260211_tighten_idea_feed_rls.sql`
 * keeps `USING(true)` there on purpose (anonymous voting has no `auth.uid()`;
 * enforcement is app-layer via `voter_session_id`). Not in scope for this canary.
 *
 * Each assertion checks the OBSERVABLE symptom via a service-role re-read after the
 * anon-key write attempt — never the policy text — matching AC1/AC2 of the spec.
 *
 * Run: npx playwright test --project=integration e2e/integration/p1138-reproduce.spec.ts
 *
 * Expected to FAIL before the fix (writes succeed) and PASS after (writes refused).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';

function makeAnonClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const SENTINEL = 'p1138-canary';

test.describe('P1138: unauthenticated writes must be refused on affected tables', () => {
  test.describe.configure({ timeout: 30000 });

  let sessionId: string;
  let messageId: string;

  test.beforeAll(async () => {
    // Unique per run — a retried beforeAll (Playwright re-runs beforeAll ahead of
    // each retried test in the same file) must not collide on the unique `code`.
    const sessionCode = `P1138${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({ code: sessionCode, creator_name: SENTINEL })
      .select('id')
      .single();
    if (sessionErr || !session) {
      throw new Error(`[p1138] failed to seed clarity_sessions: ${sessionErr?.message}`);
    }
    sessionId = session.id;

    const { data: message, error: messageErr } = await supabaseAdmin
      .from('clarity_chat_messages')
      .insert({ session_id: sessionId, author_name: SENTINEL, content: 'seed message' })
      .select('id')
      .single();
    if (messageErr || !message) {
      throw new Error(`[p1138] failed to seed clarity_chat_messages: ${messageErr?.message}`);
    }
    messageId = message.id;
  });

  test.afterAll(async () => {
    // ON DELETE CASCADE from clarity_sessions covers demo_rounds/ideas/live_turns/
    // chat_messages/verifications seeded under it.
    if (sessionId) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
  });

  test('clarity_verifications: anon UPDATE with no ownership is refused', async () => {
    const { data: seeded, error: seedErr } = await supabaseAdmin
      .from('clarity_verifications')
      .insert({ message_id: messageId, verifier_name: SENTINEL, paraphrase_text: 'seed paraphrase' })
      .select('id, accuracy_rating, status')
      .single();
    expect(seedErr, `seed failed: ${seedErr?.message}`).toBeNull();

    const anonClient = makeAnonClient();
    await anonClient
      .from('clarity_verifications')
      .update({ accuracy_rating: 99, status: 'accepted' })
      .eq('id', seeded!.id);

    const { data: after } = await supabaseAdmin
      .from('clarity_verifications')
      .select('accuracy_rating, status')
      .eq('id', seeded!.id)
      .single();

    expect(after?.accuracy_rating, 'unauthenticated caller must not be able to set accuracy_rating').toBe(
      seeded!.accuracy_rating,
    );
    expect(after?.status, 'unauthenticated caller must not be able to set status').toBe(seeded!.status);
  });

  test('clarity_demo_rounds: anon UPDATE with no ownership is refused', async () => {
    const { data: seeded, error: seedErr } = await supabaseAdmin
      .from('clarity_demo_rounds')
      .insert({ session_id: sessionId, level: 1, round_number: 1, speaker_name: 'a', listener_name: 'b' })
      .select('id, is_accepted, position')
      .single();
    expect(seedErr, `seed failed: ${seedErr?.message}`).toBeNull();

    const anonClient = makeAnonClient();
    await anonClient
      .from('clarity_demo_rounds')
      .update({ is_accepted: true, position: 'agree' })
      .eq('id', seeded!.id);

    const { data: after } = await supabaseAdmin
      .from('clarity_demo_rounds')
      .select('is_accepted, position')
      .eq('id', seeded!.id)
      .single();

    expect(after?.is_accepted, 'unauthenticated caller must not be able to set is_accepted').toBe(
      seeded!.is_accepted,
    );
    expect(after?.position, 'unauthenticated caller must not be able to set position').toBe(seeded!.position);
  });

  test('clarity_ideas: anon UPDATE with no ownership is refused', async () => {
    const { data: seeded, error: seedErr } = await supabaseAdmin
      .from('clarity_ideas')
      .insert({ session_id: sessionId, author_name: 'a', content: 'seed idea' })
      .select('id, status, position')
      .single();
    expect(seedErr, `seed failed: ${seedErr?.message}`).toBeNull();

    const anonClient = makeAnonClient();
    await anonClient
      .from('clarity_ideas')
      .update({ status: 'discussed', position: 'agree' })
      .eq('id', seeded!.id);

    const { data: after } = await supabaseAdmin
      .from('clarity_ideas')
      .select('status, position')
      .eq('id', seeded!.id)
      .single();

    expect(after?.status, 'unauthenticated caller must not be able to set status').toBe(seeded!.status);
    expect(after?.position, 'unauthenticated caller must not be able to set position').toBe(seeded!.position);
  });

  test('clarity_live_turns: anon UPDATE with no ownership is refused', async () => {
    const { data: seeded, error: seedErr } = await supabaseAdmin
      .from('clarity_live_turns')
      .insert({ session_id: sessionId, speaker_name: 'a', listener_name: 'b', actor_name: 'a', role: 'speaker' })
      .select('id, transcript, self_rating')
      .single();
    expect(seedErr, `seed failed: ${seedErr?.message}`).toBeNull();

    const anonClient = makeAnonClient();
    await anonClient
      .from('clarity_live_turns')
      .update({ transcript: 'TAMPERED BY ANON', self_rating: 10 })
      .eq('id', seeded!.id);

    const { data: after } = await supabaseAdmin
      .from('clarity_live_turns')
      .select('transcript, self_rating')
      .eq('id', seeded!.id)
      .single();

    expect(after?.transcript, 'unauthenticated caller must not be able to set transcript').toBe(
      seeded!.transcript,
    );
    expect(after?.self_rating, 'unauthenticated caller must not be able to set self_rating').toBe(
      seeded!.self_rating,
    );
  });

  test('ml_training_sessions: anon INSERT with no session is refused', async () => {
    const sessionCode = 'P1138INS';

    const anonClient = makeAnonClient();
    // No .select() — matches the real call sites in src/app/data/api.ts, all of
    // which insert without requesting representation back (Prefer: return=minimal).
    await anonClient.from('ml_training_sessions').insert({
      session_code: sessionCode,
      user_name: SENTINEL,
      audio_path: 'gs://none/none.webm',
      duration_ms: 1000,
      chunk_count: 1,
    });

    const { data: after } = await supabaseAdmin
      .from('ml_training_sessions')
      .select('id')
      .eq('session_code', sessionCode);

    // Cleanup in case the bug is present and the row landed — must run before the
    // assertion below, which throws on failure and would otherwise skip it.
    if (after && after.length > 0) {
      await supabaseAdmin.from('ml_training_sessions').delete().eq('session_code', sessionCode);
    }

    expect(after?.length ?? 0, 'unauthenticated caller must not be able to insert a training row').toBe(0);
  });

  test('ml_training_sessions: authenticated caller can still insert (legitimate path preserved)', async () => {
    const testUser = await createTestUser({ reason: 'p1138 legitimate-path canary' });
    const sessionCode = 'P1138AUTHINS';

    try {
      const authedClient = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: signInErr } = await authedClient.auth.signInWithPassword({
        email: testUser.email,
        password: TEST_PASSWORD,
      });
      expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();

      const { error: insertErr } = await authedClient.from('ml_training_sessions').insert({
        session_code: sessionCode,
        user_name: SENTINEL,
        audio_path: 'gs://none/none.webm',
        duration_ms: 1000,
        chunk_count: 1,
      });
      expect(insertErr, `authenticated insert must succeed: ${insertErr?.message}`).toBeNull();

      const { data: after } = await supabaseAdmin
        .from('ml_training_sessions')
        .select('id')
        .eq('session_code', sessionCode);
      expect(after?.length ?? 0, 'authenticated caller write must land').toBe(1);
    } finally {
      await supabaseAdmin.from('ml_training_sessions').delete().eq('session_code', sessionCode);
      await deleteTestUser(testUser.user.id);
    }
  });
});
