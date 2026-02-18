/**
 * INTEGRATION TEST TEMPLATE: DB Migration Verification
 *
 * Copy this file when a feature adds a new database column or table.
 * Rename to: e2e/integration/{feature}-migration.spec.ts
 *
 * Purpose: Verify the migration was applied and the column is accessible.
 * This catches the class of bug where code references a column that doesn't
 * exist in the DB schema cache (e.g., P160 `is_private` incident).
 *
 * TWO-CLIENT PATTERN (mandatory):
 * - supabaseAdmin: schema-level checks (bypasses RLS — proves column exists)
 * - user-scoped client: RLS assertions (proves users can actually read/write)
 *
 * Email convention: use e2e-test-{timestamp}@gmail.com prefix (see generateTestEmail)
 * NOT test-@ prefix (that prefix is used by cleanupAllTestUsers broadly)
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

// ─── CONFIGURE THESE FOR YOUR FEATURE ──────────────────────────────────────
const TABLE = 'clarity_sessions';         // Table the migration modifies
const COLUMN = 'example_column';          // New column added by migration
const EXPECTED_DEFAULT = false;           // Default value per migration SQL
// ────────────────────────────────────────────────────────────────────────────

test.describe('Migration: {feature} — {column} column', () => {
  let testUserId: string;
  let testEmail: string;

  test.beforeAll(async () => {
    testEmail = generateTestEmail();
    const { user } = await createTestUser({ email: testEmail });
    testUserId = user.id;
  });

  test.afterAll(async () => {
    // Clean up test user and any rows they created
    if (testUserId) {
      await supabaseAdmin.auth.admin.deleteUser(testUserId);
    }
  });

  // ── 1. Schema check: column exists (service role) ─────────────────────────
  test('column exists in table schema', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .limit(1);

    // If this fails with "column not found", the migration wasn't applied.
    expect(error, `Migration not applied: "${COLUMN}" missing from "${TABLE}". Run: supabase db push`).toBeNull();
  });

  // ── 2. Default value check: column has correct default (service role) ──────
  test('new rows get the correct default value', async () => {
    // Create a minimal row without setting the new column
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        // Provide required fields for the table here
        // Leave COLUMN out — we want to verify the DB default
      })
      .select(`id, ${COLUMN}`)
      .single();

    expect(error).toBeNull();
    expect(data?.[COLUMN]).toBe(EXPECTED_DEFAULT);

    // Cleanup
    if (data?.id) {
      await supabaseAdmin.from(TABLE).delete().eq('id', data.id);
    }
  });

  // ── 3. RLS check: users can read/write via their own session ──────────────
  test('authenticated user can set column value', async () => {
    // Get user JWT via sign in
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: testEmail,
      password: 'test-password-12345',
    });
    expect(signInError).toBeNull();

    // Create user-scoped client (respects RLS — this is the real test)
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } } }
    );

    // Attempt write as real user — fails if RLS blocks it
    const { data, error } = await userClient
      .from(TABLE)
      .insert({
        // Provide required fields for the table here
        [COLUMN]: !EXPECTED_DEFAULT, // Write non-default to confirm write works
      })
      .select(`id, ${COLUMN}`)
      .single();

    expect(error, `RLS blocked write to ${COLUMN}: ${error?.message}`).toBeNull();
    expect(data?.[COLUMN]).toBe(!EXPECTED_DEFAULT);

    // Cleanup
    if (data?.id) {
      await supabaseAdmin.from(TABLE).delete().eq('id', data.id);
    }
  });
});
