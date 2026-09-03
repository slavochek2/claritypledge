/**
 * @file 20260903150000_p1243_consent_post_erasure_guard.spec.ts
 * @description Integration test for
 *   supabase/migrations/20260903150000_p1243_restore_consent_post_erasure_guard.sql
 *
 * The consent INSERT policies on `terms_acceptances` and `session_consents` must carry TWO
 * conjuncts, and this file exists because a migration dropped one of them while leaving the
 * other in place — a state in which every test that checked only the surviving invariant still
 * passed.
 *
 *   user_id = auth.uid()   (P1235) — binds the row to its writer. Without it any authenticated
 *                                    user can forge a consent record naming somebody else.
 *   EXISTS profiles(uid)   (P520)  — requires the writer to still exist. Without it a stale
 *                                    access token belonging to an ERASED account keeps writing
 *                                    consent rows for up to an hour after erasure.
 *
 * Neither implies the other: a post-erasure ghost writing its own erased uuid satisfies P1235's
 * binding exactly. Coverage split:
 *
 *   - the erased-writer (P520) half is asserted end-to-end, against a genuinely erased account,
 *     by e2e/integration/p520-account-deletion.spec.ts "stale JWT: ... no writes through the
 *     uid-only tables". That test is this migration's red/green proof and is NOT duplicated here.
 *   - this file covers the forging (P1235) half, the LEGITIMATE path — a live signed-in user
 *     recording their own consent must still succeed on both tables.
 *
 * The legitimate-path tests are the point. A guard exercised only against inputs it should
 * reject has an unmeasured false-positive rate, and the failure mode this migration risks is
 * precisely a false positive: a conjunct that refuses a writer who ought to be allowed.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestSessionInDB, type TestSessionInDB } from '../helpers/test-session';

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function anonClient(): SupabaseClient {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function userClient(email: string): Promise<SupabaseClient> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('P1243: consent INSERT policies carry both conjuncts', () => {
  let alice: TestUser;
  let bob: TestUser;
  let aliceClient: SupabaseClient;
  let session: TestSessionInDB;

  test.beforeAll(async () => {
    alice = await createTestUser({ name: `P1243 Alice ${RUN}` });
    bob = await createTestUser({ name: `P1243 Bob ${RUN}` });
    aliceClient = await userClient(alice.email);
    session = await createTestSessionInDB(alice.user.id, 'Guest', { hostName: alice.name });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('session_consents').delete().in('user_id', [alice.user.id, bob.user.id]);
    await supabaseAdmin.from('terms_acceptances').delete().in('user_id', [alice.user.id, bob.user.id]);
    await session?.cleanup();
    if (alice) await deleteTestUser(alice.user.id);
    if (bob) await deleteTestUser(bob.user.id);
  });

  // -------------------------------------------------------------------------
  // Legitimate path — the false-positive measurement
  // -------------------------------------------------------------------------

  test('a live signed-in user records their own terms acceptance', async () => {
    const { error } = await aliceClient
      .from('terms_acceptances')
      .insert({ user_id: alice.user.id, terms_version: `v1.3-p1243-${RUN}` });
    expect(error, `legitimate terms acceptance was refused: ${error?.message}`).toBeNull();

    const { count } = await supabaseAdmin
      .from('terms_acceptances')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', alice.user.id);
    expect(count).toBe(1);
  });

  test('a live signed-in user records their own session consent', async () => {
    const { error } = await aliceClient
      .from('session_consents')
      .insert({ session_id: session.sessionId, user_id: alice.user.id, terms_version: `v1.3-p1243-${RUN}` });
    expect(error, `legitimate session consent was refused: ${error?.message}`).toBeNull();

    const { count } = await supabaseAdmin
      .from('session_consents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', alice.user.id);
    expect(count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // The P1235 conjunct — binding. Alice exists, so the P520 conjunct is satisfied
  // here and cannot be what produces the refusal.
  // -------------------------------------------------------------------------

  test('a live user cannot forge a terms acceptance naming somebody else', async () => {
    const { error } = await aliceClient
      .from('terms_acceptances')
      .insert({ user_id: bob.user.id, terms_version: `v1.3-forged-${RUN}` });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');

    const { count } = await supabaseAdmin
      .from('terms_acceptances')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', bob.user.id);
    expect(count).toBe(0);
  });

  test('a live user cannot forge a session consent naming somebody else', async () => {
    const { error } = await aliceClient
      .from('session_consents')
      .insert({ session_id: session.sessionId, user_id: bob.user.id, terms_version: `v1.3-forged-${RUN}` });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');

    const { count } = await supabaseAdmin
      .from('session_consents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', bob.user.id);
    expect(count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Boundary of this file
  // -------------------------------------------------------------------------
  // The POLICY TEXT itself (normalised pg_get_expr equality against a rendered reference
  // policy) is asserted by the migration's own DO block at apply time — the test harness has
  // no read-only SQL RPC, so it cannot re-read pg_policy from here. What is reachable from
  // here is the behavioural consequence of each conjunct, which is what the tests above and
  // the p520 stale-JWT test cover between them.
});
