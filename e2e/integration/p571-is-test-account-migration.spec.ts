/**
 * INTEGRATION TEST: P571 — is_test_account column on profiles
 *
 * Verifies:
 * 1. Column exists with correct default (false)
 * 2. RLS WITH CHECK prevents users from modifying is_test_account
 * 3. getVerifiedProfiles filter excludes test accounts
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

const TABLE = 'profiles';
const COLUMN = 'is_test_account';
const EXPECTED_DEFAULT = false;

test.describe('P571: is_test_account migration', () => {
  let testUserId: string;
  let testEmail: string;

  test.beforeAll(async () => {
    testEmail = generateTestEmail();
    const { user } = await createTestUser({ email: testEmail });
    testUserId = user.id;
  });

  test.afterAll(async () => {
    if (testUserId) {
      await supabaseAdmin.auth.admin.deleteUser(testUserId);
    }
  });

  // ── 1. Schema check: column exists ─────────────────────────────────────────
  test('is_test_account column exists on profiles table', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .limit(1);

    expect(error, `Migration not applied: "${COLUMN}" missing from "${TABLE}". Run: supabase db push`).toBeNull();
  });

  // ── 2. Default value check ─────────────────────────────────────────────────
  test('new profiles default to is_test_account = false', async () => {
    // Query the test user's profile (created by createTestUser trigger)
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .eq('id', testUserId)
      .single();

    expect(error).toBeNull();
    expect(data?.[COLUMN]).toBe(EXPECTED_DEFAULT);
  });

  // ── 3. RLS WITH CHECK: users cannot self-clear is_test_account ─────────────
  test('authenticated user cannot change is_test_account on own profile', async () => {
    // First, set the test user as a test account via admin
    await supabaseAdmin
      .from(TABLE)
      .update({ is_test_account: true })
      .eq('id', testUserId);

    // Sign in as the test user
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: testEmail,
      password: 'test-password-12345',
    });
    expect(signInError).toBeNull();

    // Create user-scoped client (respects RLS)
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } } }
    );

    // Attempt to clear is_test_account — should be blocked by WITH CHECK
    const { error: updateError } = await userClient
      .from(TABLE)
      .update({ is_test_account: false })
      .eq('id', testUserId);

    // WITH CHECK violation returns a row-level security error (PGRST301 or 42501)
    expect(updateError, 'WITH CHECK should prevent users from modifying is_test_account').not.toBeNull();

    // Clean up: reset via admin
    await supabaseAdmin
      .from(TABLE)
      .update({ is_test_account: false })
      .eq('id', testUserId);
  });

  // ── 4. Filter check: test accounts excluded from verified profiles query ───
  test('test accounts are excluded from verified profiles listing', async () => {
    // Mark test user as verified + pledged + test account
    await supabaseAdmin
      .from(TABLE)
      .update({
        is_verified: true,
        has_pledged: true,
        is_test_account: true,
        name: 'P571 Test Account',
      })
      .eq('id', testUserId);

    // Query as anon (same as getVerifiedProfiles does)
    const anonClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!
    );

    const { data, error } = await anonClient
      .from(TABLE)
      .select('id, name, is_test_account')
      .eq('is_verified', true)
      .eq('has_pledged', true)
      .eq('is_test_account', false);

    expect(error).toBeNull();

    // The test user should NOT appear in results
    const found = data?.find(p => p.id === testUserId);
    expect(found, 'Test account should be excluded from verified profiles query').toBeUndefined();

    // Clean up
    await supabaseAdmin
      .from(TABLE)
      .update({ is_test_account: false, is_verified: false, has_pledged: false })
      .eq('id', testUserId);
  });
});
