/**
 * @file p880-reproduce.spec.ts
 *
 * Canary + regression guard: an authenticated user must NOT be able to self-promote
 * their own trust/integrity fields (`profiles.is_verified` / `profiles.has_pledged`)
 * to `true` — which would earn the verified badge and the public pledger wall without
 * ever verifying email or completing the pledge flow.
 *
 * THREE independent client write surfaces are attacked here — all must be neutralized:
 *
 *   Path 1 — direct RLS UPDATE. The live profiles UPDATE policy (P571) only pinned
 *     is_test_account; the P880 guard trigger now also pins is_verified/has_pledged.
 *
 *   Path 2 — upsert_my_profile RPC (P877). Re-defined by P880 to never read these two
 *     columns from caller JSON.
 *
 *   Path 3 — delete-own-profile (20250117 DELETE policy) + a fresh direct INSERT
 *     (20260219 INSERT policy, no column scope). The P880 guard trigger forces new
 *     client-role rows to is_verified=false / has_pledged=false.
 *
 * Plus a POSITIVE proof that the legitimate server-controlled path still works: the
 * dedicated SECURITY DEFINER accessors `mark_self_verified()` + `set_my_pledge(true)`
 * DO set the columns for a verified caller (the actual changed code path).
 *
 * All assertions read the DB END-STATE back via the service role — they pass whether the
 * guard rejects the write (error) or silently drops the privilege columns (no-op); only
 * the persisted value matters.
 *
 * Pre-fix: the three attack tests FAILED (columns flipped to true).
 * Post-fix (migration 20260605120000_p880_trust_column_guard): they PASS.
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
    // A normal authenticated user. The per-test reset below forces the
    // unverified/un-pledged baseline we attack from.
    victim = await createTestUser({ name: 'P880 Self-Promote Victim' });
    victimId = victim.user.id;

    // Build a client scoped to the victim's own JWT — RLS applies (NOT service role).
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

  // Reset to the unverified, un-pledged baseline before each attack so the tests are
  // independent. Service role (supabaseAdmin) bypasses the guard trigger by design.
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

  test('Path 1: direct RLS UPDATE on is_verified / has_pledged is neutralized', async () => {
    const { error: updateError } = await victimClient
      .from('profiles')
      .update({ is_verified: true, has_pledged: true })
      .eq('id', victimId);
    console.log('[P880][path1] update error:', updateError?.message ?? '(none — write accepted)');

    const { data: after } = await supabaseAdmin
      .from('profiles')
      .select('is_verified, has_pledged')
      .eq('id', victimId)
      .single();
    console.log('[P880][path1] after:', JSON.stringify(after));

    expect(after?.is_verified, 'self-promoted is_verified via direct UPDATE — should stay false').toBe(false);
    expect(after?.has_pledged, 'self-promoted has_pledged via direct UPDATE — should stay false').toBe(false);
  });

  test('Path 2: upsert_my_profile RPC cannot set is_verified / has_pledged', async () => {
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

    expect(after?.is_verified, 'self-promoted is_verified via upsert_my_profile — should stay false').toBe(false);
    expect(after?.has_pledged, 'self-promoted has_pledged via upsert_my_profile — should stay false').toBe(false);
  });

  test('Path 3: delete-own-profile + direct INSERT cannot seed is_verified / has_pledged', async () => {
    // The attack: drop your own row (DELETE policy: email = auth.email()), then re-create
    // it via a direct INSERT (INSERT policy: auth.uid() = id) carrying is_verified=true.
    const { error: deleteError } = await victimClient
      .from('profiles')
      .delete()
      .eq('id', victimId);
    expect(deleteError, `[P880][path3] self-delete should be allowed: ${deleteError?.message}`).toBeNull();

    const { error: insertError } = await victimClient.from('profiles').insert({
      id: victimId,
      email: victim.email,
      name: victim.name,
      slug: victim.slug,
      avatar_color: '#4A90E2',
      accepted_terms_version: 'v1.4',
      is_verified: true,
      has_pledged: true,
    });
    console.log('[P880][path3] insert error:', insertError?.message ?? '(none — write accepted)');
    expect(insertError, `[P880][path3] re-insert of own row should succeed: ${insertError?.message}`).toBeNull();

    const { data: after } = await supabaseAdmin
      .from('profiles')
      .select('is_verified, has_pledged')
      .eq('id', victimId)
      .single();
    console.log('[P880][path3] after:', JSON.stringify(after));

    expect(after?.is_verified, 'self-promoted is_verified via delete+INSERT — should be false').toBe(false);
    expect(after?.has_pledged, 'self-promoted has_pledged via delete+INSERT — should be false').toBe(false);
  });

  test('Positive: the server-controlled accessors DO set the columns for a verified caller', async () => {
    // Proves the fix did not just lock everyone out — the legitimate path (the actual
    // changed code path) still flips the columns. The victim's email is confirmed
    // (createTestUser uses email_confirm: true), so mark_self_verified succeeds.
    const { data: verifiedRet, error: verifyError } = await victimClient.rpc('mark_self_verified');
    expect(verifyError, `[P880][positive] mark_self_verified error: ${verifyError?.message}`).toBeNull();
    expect(verifiedRet, 'mark_self_verified returns true for a confirmed-email caller').toBe(true);

    const { data: pledgeRet, error: pledgeError } = await victimClient.rpc('set_my_pledge', { p_pledged: true });
    expect(pledgeError, `[P880][positive] set_my_pledge error: ${pledgeError?.message}`).toBeNull();
    expect(pledgeRet, 'set_my_pledge returns true once verified').toBe(true);

    const { data: after } = await supabaseAdmin
      .from('profiles')
      .select('is_verified, has_pledged')
      .eq('id', victimId)
      .single();
    console.log('[P880][positive] after:', JSON.stringify(after));

    expect(after?.is_verified, 'mark_self_verified set is_verified=true').toBe(true);
    expect(after?.has_pledged, 'set_my_pledge(true) set has_pledged=true').toBe(true);
  });
});
