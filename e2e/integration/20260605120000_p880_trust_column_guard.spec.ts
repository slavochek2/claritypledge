/**
 * @file 20260605120000_p880_trust_column_guard.spec.ts
 * @description Migration integration/contract test for P880 (P270 rule).
 *
 * The reproduce canary (e2e/p880-reproduce.spec.ts) proves the guard trigger neutralizes
 * the three client write surfaces. This test proves the CONTRACTS of the two new
 * SECURITY DEFINER accessors the migration adds — the new code paths the client refactor
 * depends on — including their server-side gates:
 *
 *   - mark_self_verified() sets is_verified=true ONLY when the caller's email is confirmed
 *     (an anonymous/unconfirmed session, email_confirmed_at IS NULL, cannot self-verify).
 *   - set_my_pledge(true) requires the caller to already be verified; set_my_pledge(false)
 *     (withdrawal) always succeeds.
 *   - Both RPCs are authenticated-only (anon role denied — service_role bypasses GRANT,
 *     so the lock MUST be exercised with an anon-key client, per decisions.md 2026-05-31).
 *
 * State is arranged via supabaseAdmin (service_role bypasses the guard trigger by design),
 * and every assertion reads the persisted value back via service role.
 *
 * Runs against the TEST DB (gfjctyxqlwexxwsmkakq) via .env.test.local.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function makeUserClient(accessToken: string) {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

async function readTrust(id: string) {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('is_verified, has_pledged')
    .eq('id', id)
    .single();
  return data as { is_verified: boolean; has_pledged: boolean };
}

async function setTrust(id: string, is_verified: boolean, has_pledged: boolean) {
  // service_role bypasses the guard trigger — used only to arrange test state.
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ is_verified, has_pledged })
    .eq('id', id);
  if (error) throw new Error(`[P880 contract] arrange setTrust failed: ${error.message}`);
}

test.describe('P880: trust-column guard + server-controlled accessors', () => {
  test.describe.configure({ timeout: 60_000 });

  let user: TestUser;
  let userId: string;
  let userClient: SupabaseClient;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P880 Contract User' });
    userId = user.user.id;
    const signIn = makeAnonClient();
    const { data, error } = await signIn.auth.signInWithPassword({
      email: user.email,
      password: TEST_PASSWORD,
    });
    if (error || !data.session) throw new Error(`[P880 contract] sign-in failed: ${error?.message}`);
    userClient = makeUserClient(data.session.access_token);
  });

  test.afterAll(async () => {
    if (userId) await deleteTestUser(userId);
  });

  test('mark_self_verified: confirmed-email caller transitions is_verified false -> true', async () => {
    await setTrust(userId, false, false);

    const { data: ret, error } = await userClient.rpc('mark_self_verified');
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(ret, 'returns true for a confirmed-email caller').toBe(true);

    const after = await readTrust(userId);
    expect(after.is_verified, 'is_verified is now true').toBe(true);
  });

  test('mark_self_verified: an anonymous (unconfirmed) session CANNOT self-verify', async () => {
    // An anonymous auth session has email_confirmed_at IS NULL — the un-fakeable signal
    // the gate keys on. This is the /live-guest case the bug would have let self-promote.
    // The RPC return IS the observable boundary here: an anonymous user has no email, and
    // profiles.email is NOT NULL, so such a session cannot own a profile row to inspect —
    // the gate's job is to refuse the verification, which is what the false return proves.
    // (The DB end-state for a row that DOES exist + is verified is covered by the test
    // above and by the canary's Path-1/2/3 end-state assertions.)
    const anonAuth = makeAnonClient();
    const { data: signIn, error: signInErr } = await anonAuth.auth.signInAnonymously();
    expect(signInErr, `anonymous sign-in: ${signInErr?.message}`).toBeNull();
    expect(signIn.session, 'anonymous session established').not.toBeNull();
    const anonUserId = signIn.user!.id;

    try {
      const { data: ret, error } = await anonAuth.rpc('mark_self_verified');
      expect(error, `rpc error: ${error?.message}`).toBeNull();
      expect(ret, 'mark_self_verified refuses (returns false) for an unconfirmed caller').toBe(false);
    } finally {
      await supabaseAdmin.auth.admin.deleteUser(anonUserId).catch(() => {});
    }
  });

  test('set_my_pledge(true): blocked until the caller is verified', async () => {
    await setTrust(userId, false, false); // unverified

    const { data: ret, error } = await userClient.rpc('set_my_pledge', { p_pledged: true });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(ret, 'set_my_pledge(true) returns false when unverified').toBe(false);

    const after = await readTrust(userId);
    expect(after.has_pledged, 'has_pledged stays false when unverified').toBe(false);
  });

  test('set_my_pledge(true): succeeds once the caller is verified', async () => {
    await setTrust(userId, true, false); // verified, not pledged

    const { data: ret, error } = await userClient.rpc('set_my_pledge', { p_pledged: true });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(ret, 'set_my_pledge(true) returns true once verified').toBe(true);

    const after = await readTrust(userId);
    expect(after.has_pledged, 'has_pledged is now true').toBe(true);
  });

  test('set_my_pledge(false): withdrawal always succeeds for the owner', async () => {
    await setTrust(userId, true, true); // verified + pledged

    const { data: ret, error } = await userClient.rpc('set_my_pledge', { p_pledged: false });
    expect(error, `rpc error: ${error?.message}`).toBeNull();
    expect(ret, 'set_my_pledge(false) returns true').toBe(true);

    const after = await readTrust(userId);
    expect(after.has_pledged, 'has_pledged is now false (withdrawn)').toBe(false);
  });

  test('grant lock: anon role cannot execute mark_self_verified', async () => {
    const anon = makeAnonClient();
    const { error } = await anon.rpc('mark_self_verified');
    expect(error, 'anon must be denied execute on mark_self_verified').not.toBeNull();
  });

  test('grant lock: anon role cannot execute set_my_pledge', async () => {
    const anon = makeAnonClient();
    const { error } = await anon.rpc('set_my_pledge', { p_pledged: true });
    expect(error, 'anon must be denied execute on set_my_pledge').not.toBeNull();
  });
});
