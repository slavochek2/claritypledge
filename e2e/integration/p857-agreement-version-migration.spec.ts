/**
 * @file p857-agreement-version-migration.spec.ts
 * @description P857 integration test: agreement_version column migration.
 *
 * Verifies:
 * - Schema: agreement_version column exists on clarity_agreements
 * - Default: new rows without agreement_version get 'legacy'
 * - CHECK constraint: invalid values are rejected by the DB
 * - RLS: an authenticated user can insert a row they own and read back
 *   the agreement_version field
 *
 * Two-client pattern (mandatory per migration-template):
 * - supabaseAdmin: schema-level + default checks (bypasses RLS)
 * - user-scoped client: RLS write + read assertion
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';

const TABLE = 'clarity_agreements';
const COLUMN = 'agreement_version';
const EXPECTED_DEFAULT = 'legacy';

test.describe('P857: agreement_version column migration', () => {
  let testUserId: string;
  let testEmail: string;

  test.beforeAll(async () => {
    testEmail = generateTestEmail();
    const { user } = await createTestUser({ email: testEmail, name: 'P857-int User' });
    testUserId = user.id;
  });

  test.afterAll(async () => {
    if (testUserId) {
      // Clean up any agreements created during the test, then the user
      await supabaseAdmin
        .from(TABLE)
        .delete()
        .eq('creator_profile_id', testUserId);
      await deleteTestUser(testUserId);
    }
  });

  // ── 1. Schema check: column exists ────────────────────────────────────────
  test('agreement_version column exists in clarity_agreements', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select(COLUMN)
      .limit(1);

    expect(
      error,
      `Migration not applied: "${COLUMN}" missing from "${TABLE}". Run: ./scripts/migrate.sh`
    ).toBeNull();
  });

  // ── 2. Default value: omitting agreement_version → 'legacy' ───────────────
  test('new rows default to "legacy" when agreement_version is omitted', async () => {
    let rowId: string | undefined;
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({
          // Required NOT NULL columns (defaults handle: invitation_token, status, visibility)
          creator_profile_id: testUserId,
          partner_email: `partner-${Date.now()}@gmail.com`,
          terms_text: 'P857 default-value test row',
          // agreement_version intentionally omitted — DB default must apply
        })
        .select(`id, ${COLUMN}`)
        .single();

      rowId = data?.id;
      expect(error).toBeNull();
      expect(data?.[COLUMN]).toBe(EXPECTED_DEFAULT);
    } finally {
      if (rowId) {
        await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
      }
    }
  });

  // ── 3. CHECK constraint: invalid value is rejected ────────────────────────
  test('CHECK constraint rejects an invalid agreement_version value', async () => {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert({
        creator_profile_id: testUserId,
        partner_email: `partner-check-${Date.now()}@gmail.com`,
        terms_text: 'P857 CHECK constraint test',
        agreement_version: 'banana', // Invalid — not in ('legacy', '4')
      })
      .select('id')
      .single();

    // The DB CHECK constraint must reject this insert
    expect(error).not.toBeNull();
    expect(data).toBeNull();

    // Confirm it is a constraint violation (Postgres check violation = code 23514)
    // Supabase wraps this as a PostgREST error; the message contains the constraint name
    // or "check" in the details/message.
    expect(error?.message ?? error?.code ?? '').toMatch(/check|violat|23514/i);
  });

  // ── 4. RLS: authenticated user can insert + read back agreement_version ────
  test('authenticated user can write and read back agreement_version', async () => {
    // Sign in as the test user to get a JWT for the user-scoped client
    const { data: signIn, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({
        email: testEmail,
        password: 'test-password-12345',
      });
    expect(signInError).toBeNull();

    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${signIn!.session!.access_token}`,
          },
        },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    let rowId: string | undefined;
    try {
      const { data, error } = await userClient
        .from(TABLE)
        .insert({
          creator_profile_id: testUserId,
          partner_email: `partner-rls-${Date.now()}@gmail.com`,
          terms_text: 'P857 RLS test row',
          agreement_version: 'legacy', // Explicit valid value
        })
        .select(`id, ${COLUMN}`)
        .single();

      rowId = data?.id;
      expect(error, `RLS blocked insert: ${error?.message}`).toBeNull();
      expect(data?.[COLUMN]).toBe('legacy');
    } finally {
      if (rowId) {
        await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
      }
    }
  });

  // ── 5. Valid value '4' is accepted by the CHECK constraint ────────────────
  test('CHECK constraint accepts "4" as a valid agreement_version', async () => {
    let rowId: string | undefined;
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({
          creator_profile_id: testUserId,
          partner_email: `partner-v4-${Date.now()}@gmail.com`,
          terms_text: 'P857 v4 value acceptance test',
          agreement_version: '4',
        })
        .select(`id, ${COLUMN}`)
        .single();

      rowId = data?.id;
      expect(error).toBeNull();
      expect(data?.[COLUMN]).toBe('4');
    } finally {
      if (rowId) {
        await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
      }
    }
  });
});
