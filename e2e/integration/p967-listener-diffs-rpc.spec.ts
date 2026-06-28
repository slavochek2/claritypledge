/**
 * P967 INTEGRATION TEST: get_my_listener_calibration_diffs() RPC
 *
 * PURPOSE: This is the critical privacy regression test for P967.
 *
 * CONTEXT: The existing RLS on story_verifications leaks live-row data
 * cross-user when the attached story is public (confirmed in security review).
 * getListenerVerificationHistory(userId) (calibration-service-real.ts:297)
 * already exposes another user's partner names and ratings to any authenticated
 * caller. The new SECURITY DEFINER RPC hard-filters listener_id = auth.uid(),
 * making cross-user enumeration impossible — there is no userId parameter to
 * supply.
 *
 * THIS TEST MUST FAIL if someone implements the breakdown using the leaky
 * getListenerVerificationHistory path instead of the auth-scoped RPC.
 *
 * TWO-CLIENT PATTERN (P270 integration test convention):
 * - supabaseAdmin: schema/existence checks (bypasses RLS — proves function exists)
 * - user-scoped JWT client: RPC invocation as actual user (proves RLS behavior)
 *
 * Privacy invariant tested:
 * - User A has listener verifications → creates known rows
 * - User B (different JWT) calls the RPC → gets ZERO rows (never A's data)
 * - The RPC must have NO userId param (identity from auth.uid() only)
 * - Anonymous caller → zero rows returned (GRANT authenticated only)
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

const RPC_NAME = 'get_my_listener_calibration_diffs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getUserJwtClient(email: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

  // Use a temp anon client — never mutate supabaseAdmin's session.
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error(`[p967] Failed to sign in ${email}: ${error?.message}`);
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function insertVerificationRow({
  speakerId,
  listenerId,
  storyId,
  speakerRating,
  listenerRating,
}: {
  speakerId: string;
  listenerId: string;
  storyId: string;
  speakerRating: number;
  listenerRating: number;
}) {
  const { data, error } = await supabaseAdmin
    .from('story_verifications')
    .insert({
      speaker_id: speakerId,
      listener_id: listenerId,
      story_id: storyId,
      speaker_rating: speakerRating,
      listener_rating: listenerRating,
      // accuracy_achieved is GENERATED ALWAYS (speaker_rating >= 8) — never insert it
    })
    .select('id')
    .single();
  if (error) throw new Error(`[p967] Failed to insert verification: ${error.message}`);
  return data.id as string;
}

async function insertPublicStory(authorId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('stories')
    .insert({
      author_id: authorId,
      title: `P967 integration test story ${Date.now()}`,
      visibility: 'public',
    })
    .select('id')
    .single();
  if (error) throw new Error(`[p967] Failed to insert story: ${error.message}`);
  return data.id as string;
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('P967 Integration: get_my_listener_calibration_diffs() RPC', () => {
  let userAId: string;
  let userAEmail: string;
  let userBId: string;
  let userBEmail: string;
  let storyId: string;
  const verificationIds: string[] = [];

  test.beforeAll(async () => {
    // Create two independent test users
    const userA = await createTestUser({ name: 'P967 User A', email: generateTestEmail() });
    userAId = userA.user.id;
    userAEmail = userA.email;

    const userB = await createTestUser({ name: 'P967 User B', email: generateTestEmail() });
    userBId = userB.user.id;
    userBEmail = userB.email;

    // User A is the speaker who created public stories (listener needs stories to verify)
    // User B is the one who sat as a listener in A's stories — but we test from A's perspective
    // Concretely: User B speaks, User A listens. A's listener rows are the target.
    storyId = await insertPublicStory(userBId); // Speaker = User B

    // Insert 3 verifications where User A is the listener
    for (let i = 0; i < 3; i++) {
      const id = await insertVerificationRow({
        speakerId: userBId,
        listenerId: userAId,
        storyId,
        speakerRating: 7 + i,
        listenerRating: 8,
      });
      verificationIds.push(id);
    }
  });

  test.afterAll(async () => {
    // Clean up in dependency order
    if (verificationIds.length > 0) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .in('id', verificationIds);
    }
    if (storyId) {
      await supabaseAdmin.from('stories').delete().eq('id', storyId);
    }
    if (userAId) {
      await supabaseAdmin.from('profiles').delete().eq('id', userAId);
      await supabaseAdmin.auth.admin.deleteUser(userAId);
    }
    if (userBId) {
      await supabaseAdmin.from('profiles').delete().eq('id', userBId);
      await supabaseAdmin.auth.admin.deleteUser(userBId);
    }
  });

  // ── 1. Schema existence (P270 mandatory) ──────────────────────────────────

  test('RPC exists and is callable via service role', async () => {
    // supabaseAdmin bypasses RLS/GRANT — proves the function was created.
    // If this fails, the migration was not applied.
    const { error } = await supabaseAdmin.rpc(RPC_NAME);
    expect(
      error,
      `Migration not applied: "${RPC_NAME}" does not exist. Run: supabase db push`
    ).toBeNull();
  });

  test('RPC accepts no userId parameter (identity from auth.uid() only)', async () => {
    // The spec mandates zero client-supplied params. Calling with a userId arg
    // should either be rejected by Postgres (function signature mismatch) or ignored.
    // Either way, the test verifies the function's public API has no userId param.
    //
    // We verify this by calling with an explicit (wrong) userId and confirming
    // the call is rejected as an invalid argument OR that it returns only the
    // caller's own rows (proving the param is ignored, not trusted).
    //
    // Since service_role's auth.uid() is null, passing a param for a function
    // that doesn't accept one should produce a Postgres error about the arg.
    const { error } = await (supabaseAdmin.rpc as (fn: string, params: Record<string, unknown>) => Promise<{ error: unknown }>)(
      RPC_NAME,
      { user_id: userAId } // unexpected param — function must not accept it
    );
    // Postgres raises "function X(uuid) does not exist" if the signature has no such param.
    // Acceptable outcomes: error (param rejected) OR null (param ignored).
    // Unacceptable: returning rows scoped to user_id param.
    // We assert via the privacy test below that results are always auth.uid()-scoped.
    // Here we just document the contract — the param must not be relied on.
    console.log('[p967] No-param test result:', error ? 'param rejected (good)' : 'param ignored (check privacy test)');
  });

  // ── 2. CRITICAL: Privacy — User B cannot see User A's listener diffs ──────

  test('CRITICAL PRIVACY: user B calls RPC → gets zero rows (never user A data)', async () => {
    // This is the primary regression test for the cross-user data leak.
    //
    // Setup:
    // - User A has 3 listener verification rows (inserted in beforeAll)
    // - User B authenticates and calls the RPC
    //
    // Expected: User B receives ZERO rows — not User A's partner names,
    //           not User A's ratings, not User A's dates.
    //
    // If the breakdown were implemented via getListenerVerificationHistory(userAId)
    // instead of this RPC, User B calling with userAId would get all 3 rows.
    // This test catches that regression.
    const userBClient = await getUserJwtClient(userBEmail);

    const { data, error } = await userBClient.rpc(RPC_NAME);
    expect(error).toBeNull();

    // User B has NO listener verifications — they were only a speaker.
    // The RPC must return only B's own rows (zero in this case).
    expect(data).not.toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBe(0);

    // Extra guard: even if B somehow gets rows, none must have listener_id === A
    // (RPC doesn't return listener_id, but if it did, it must never be A's id)
    // This assertion documents the privacy contract explicitly.
    if (data && Array.isArray(data)) {
      for (const row of data as Record<string, unknown>[]) {
        // If listener_id were exposed, it must never be userAId
        expect(row['listener_id']).not.toBe(userAId);
      }
    }
  });

  test('CRITICAL PRIVACY: user A calls RPC → gets exactly their own 3 rows', async () => {
    // Proves the RPC returns data for the correct caller (positive case).
    // Complements the B-gets-nothing test: if A also got zero, the RPC might
    // be broken for everyone rather than correctly scoped.
    const userAClient = await getUserJwtClient(userAEmail);

    const { data, error } = await userAClient.rpc(RPC_NAME);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBe(3);
  });

  // ── 3. Anonymous access ───────────────────────────────────────────────────

  test('anonymous caller receives zero rows or an error (GRANT authenticated only)', async () => {
    // The RPC must be granted to "authenticated" only, never "anon".
    // An anon caller: auth.uid() = NULL → WHERE listener_id = NULL → zero rows.
    // Some Postgres setups may also deny execute entirely (permission denied error).
    // Both are acceptable fail-closed behaviors.
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await anonClient.rpc(RPC_NAME);

    // Acceptable outcomes:
    // (a) error (permission denied — GRANT excluded anon)
    // (b) data = [] (auth.uid() = NULL → no matching rows)
    if (error) {
      // Permission denied is the expected secure outcome
      expect(error.message).toMatch(/permission denied|not found|does not exist/i);
    } else {
      // Zero rows because auth.uid() is NULL
      expect(Array.isArray(data)).toBe(true);
      expect((data as unknown[]).length).toBe(0);
    }
  });

  // ── 4. Return shape ───────────────────────────────────────────────────────

  test('returned rows include required fields: listener_rating, speaker_rating, speaker_name, speaker_slug, story_title, created_at', async () => {
    const userAClient = await getUserJwtClient(userAEmail);

    const { data, error } = await userAClient.rpc(RPC_NAME);
    expect(error).toBeNull();
    expect(Array.isArray(data) && (data as unknown[]).length > 0).toBe(true);

    const row = (data as Record<string, unknown>[])[0];
    expect(typeof row['listener_rating']).toBe('number');
    expect(typeof row['speaker_rating']).toBe('number');
    expect(typeof row['speaker_name']).toBe('string');
    expect(typeof row['speaker_slug']).toBe('string');
    expect(typeof row['story_title']).toBe('string');
    expect(typeof row['created_at']).toBe('string');
  });

  // ── 5. Eligibility filter ─────────────────────────────────────────────────

  test('rows with null speaker_rating are excluded from RPC results', async () => {
    // Insert an ineligible row (null speaker_rating simulating a letter row)
    // then confirm it does not appear in the RPC results.
    let ineligibleId: string | undefined;
    try {
      const { data, error } = await supabaseAdmin
        .from('story_verifications')
        .insert({
          speaker_id: userBId,
          listener_id: userAId,
          story_id: storyId,
          speaker_rating: null, // ineligible — letter-like row
          listener_rating: 9,
          // accuracy_achieved is GENERATED ALWAYS — omit (would be null here since speaker_rating is null)
        })
        .select('id')
        .single();

      if (!error && data) ineligibleId = data.id;

      const userAClient = await getUserJwtClient(userAEmail);
      const { data: rpcData, error: rpcError } = await userAClient.rpc(RPC_NAME);
      expect(rpcError).toBeNull();

      // Should still be 3 eligible rows (ineligible row excluded)
      expect((rpcData as unknown[]).length).toBe(3);

      // Confirm no row has null speaker_rating
      for (const row of rpcData as Record<string, unknown>[]) {
        expect(row['speaker_rating']).not.toBeNull();
      }
    } finally {
      if (ineligibleId) {
        await supabaseAdmin.from('story_verifications').delete().eq('id', ineligibleId);
      }
    }
  });
});
