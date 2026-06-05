/**
 * @file p880-reproduce.spec.ts
 *
 * Canary: an authenticated user can self-promote their own trust/integrity
 * fields (`profiles.is_verified` / `profiles.has_pledged`) to `true` — earning
 * the verified badge and the public pledger wall without ever verifying email
 * or completing the pledge flow.
 *
 * Two independent write surfaces, neither alone closed by a fix to the other:
 *
 *   Path 1 — direct RLS UPDATE. The live profiles UPDATE policy (P571,
 *     20260322120000_p571_is_test_account.sql) WITH CHECK guards ONLY
 *     `is_test_account`. `is_verified` / `has_pledged` are unconstrained, so a
 *     self-targeted UPDATE on those columns passes.
 *
 *   Path 2 — upsert_my_profile RPC (P877,
 *     20260602160000_p877_profiles_pii_column_grants.sql:326,328). Its
 *     ON CONFLICT DO UPDATE writes is_verified/has_pledged straight from
 *     caller-supplied JSON. It forces id = auth.uid() but does not strip these
 *     privilege fields.
 *
 * Invariant under test: a write originating from a client-supplied payload must
 * NOT be able to transition is_verified / has_pledged to true. Those transitions
 * happen only through a server-controlled path (email verification, pledge flow).
 *
 * These tests assert the DB END-STATE (read back via service role), so they pass
 * regardless of whether the eventual fix rejects the write (error) or silently
 * drops the privilege columns (no-op) — only the persisted value matters.
 *
 * Both tests MUST FAIL until the bug is fixed (today: the columns flip to true).
 *
 * Runs against the TEST DB (gfjctyxqlwexxwsmkakq) via .env.test.local.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from './helpers/test-user';

test.describe('Canary P880: authenticated user cannot self-promote is_verified / has_pledged', () => {
  test.describe.configure({ timeout: 60_000 });

  let victim: TestUser;
  let victimId: string;
  let victimClient: SupabaseClient;

  test.beforeAll(async () => {
    // A normal authenticated user. createTestUser seeds is_verified=true; the
    // per-test reset below forces the unverified/un-pledged baseline we attack from.
    victim = await createTestUser({ name: 'P880 Self-Promote Victim' });
    victimId = victim.user.id;

    // Build a client scoped to the victim's own JWT — RLS applies (NOT service role).
    // Same pattern createTestUser uses internally.
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const signInClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInData, error: signInError } = await signInClient.auth.signInWithPassword({
      email: victim.email,
      password: TEST_PASSWORD,
    });
    if (signInError || !signInData.session) {
      throw new Error(`[P880] Failed to sign in victim: ${signInError?.message}`);
    }
    victimClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  test.afterAll(async () => {
    if (victimId) await deleteTestUser(victimId);
  });

  // Reset to the unverified, un-pledged baseline before each attack so the tests
  // are independent and each starts from is_verified=false / has_pledged=false.
  test.beforeEach(async () => {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ is_verified: false, has_pledged: false })
      .eq('id', victimId);
    if (error) throw new Error(`[P880] Baseline reset failed: ${error.message}`);

    const { data: baseline } = await supabaseAdmin
      .from('profiles')
      .select('is_verified, has_pledged')
      .eq('id', victimId)
      .single();
    expect(baseline?.is_verified, 'baseline is_verified should be false').toBe(false);
    expect(baseline?.has_pledged, 'baseline has_pledged should be false').toBe(false);
  });

  test('Path 1: direct RLS UPDATE on is_verified / has_pledged is rejected', async () => {
    // The attack: a logged-in user writes the trust columns on their own row.
    const { error: updateError } = await victimClient
      .from('profiles')
      .update({ is_verified: true, has_pledged: true })
      .eq('id', victimId);
    console.log('[P880][path1] update error:', updateError?.message ?? '(none — write accepted)');

    // End-state is the source of truth. Read back as service role.
    const { data: after } = await supabaseAdmin
      .from('profiles')
      .select('is_verified, has_pledged')
      .eq('id', victimId)
      .single();
    console.log('[P880][path1] after:', JSON.stringify(after));

    expect(
      after?.is_verified,
      'self-promoted is_verified via direct UPDATE — should stay false',
    ).toBe(false);
    expect(
      after?.has_pledged,
      'self-promoted has_pledged via direct UPDATE — should stay false',
    ).toBe(false);
  });

  test('Path 2: upsert_my_profile RPC cannot set is_verified / has_pledged', async () => {
    // The attack: same caller, via the SECURITY DEFINER write accessor. Identity
    // fields are passed through so the ONLY malicious delta is the trust columns.
    const { error: rpcError } = await victimClient.rpc('upsert_my_profile', {
      p_data: {
        email: victim.email,
        name: victim.name,
        slug: victim.slug,
        is_verified: true,
        has_pledged: true,
      },
    });
    console.log('[P880][path2] rpc error:', rpcError?.message ?? '(none — write accepted)');

    const { data: after } = await supabaseAdmin
      .from('profiles')
      .select('is_verified, has_pledged')
      .eq('id', victimId)
      .single();
    console.log('[P880][path2] after:', JSON.stringify(after));

    expect(
      after?.is_verified,
      'self-promoted is_verified via upsert_my_profile — should stay false',
    ).toBe(false);
    expect(
      after?.has_pledged,
      'self-promoted has_pledged via upsert_my_profile — should stay false',
    ).toBe(false);
  });
});
