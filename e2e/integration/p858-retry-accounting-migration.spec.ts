/**
 * INTEGRATION TEST (P270 MANDATORY): P858 retry-accounting migration verification.
 *
 * Migration under test: supabase/migrations/<ts>_p858_transcription_retry_accounting.sql
 *   ALTER TABLE transcription_jobs
 *     ADD COLUMN attempts      INTEGER NOT NULL DEFAULT 0,
 *     ADD COLUMN max_attempts  INTEGER NOT NULL DEFAULT 3;
 *
 * Catches the class of bug where service code references a column that doesn't exist
 * in the DB schema cache (e.g. the P160 `is_private` incident).
 *
 * WHY THE TEMPLATE'S "authenticated user can set column" TEST IS OMITTED:
 *   `transcription_jobs` is SERVICE-ROLE-WRITE ONLY. Per
 *   supabase/migrations/20260313120000_p495_transcription_tables.sql (lines 66-96),
 *   RLS is enabled with ONLY a participant-SELECT policy and NO INSERT/UPDATE/DELETE
 *   policy for `authenticated`. Writes succeed solely via service_role (which bypasses
 *   RLS). So the template's "authenticated user writes a non-default value" scenario
 *   does not apply here — an authenticated user CANNOT write this table at all.
 *   We replace it with a participant-SELECT read check (the real user-facing RLS path).
 *
 * Run: npm run test:e2e -- p858
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

const TABLE = 'transcription_jobs';
const TEST_PASSWORD = 'test-password-12345';

// Prod session-code alphabet (no I/O/0/1) — matches src + test-letter-session helper.
const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateSessionCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)];
  }
  return code;
}

test.describe('Migration: P858 — transcription_jobs.attempts / max_attempts', () => {
  let testUserId: string;
  let testEmail: string;
  let sessionId: string;
  let sessionCode: string;
  const createdJobIds: string[] = [];

  test.beforeAll(async () => {
    // A participant user — used for both the FK-valid session and the RLS read check.
    testEmail = generateTestEmail();
    const { user } = await createTestUser({ email: testEmail, name: 'P858 Migration Test' });
    testUserId = user.id;

    // transcription_jobs.session_id and session_code are NOT NULL — create a real
    // clarity_sessions row owned by the test user (creator_profile_id drives the
    // participant-SELECT RLS policy).
    sessionCode = generateSessionCode();
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: sessionCode,
        creator_name: 'P858 Migration Test',
        creator_profile_id: testUserId,
      })
      .select('id, code')
      .single();
    expect(sessionError, `Failed to create clarity_sessions row: ${sessionError?.message}`).toBeNull();
    sessionId = session!.id;
  });

  test.afterAll(async () => {
    // Clean up in dependency order: jobs → session → user.
    for (const id of createdJobIds) {
      await supabaseAdmin.from(TABLE).delete().eq('id', id);
    }
    if (sessionId) {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
    if (testUserId) {
      await supabaseAdmin.auth.admin.deleteUser(testUserId);
    }
  });

  // ── 1. Schema check: both columns exist (service role) ──────────────────────
  test('attempts and max_attempts columns exist in schema', async () => {
    const { error } = await supabaseAdmin
      .from(TABLE)
      .select('attempts, max_attempts')
      .limit(1);
    expect(
      error,
      `Migration not applied: attempts/max_attempts missing from ${TABLE}. Run: ./scripts/migrate.sh`,
    ).toBeNull();
  });

  // ── 2. Default-value check: service-role insert gets attempts=0, max_attempts=3 ─
  test('new service-role-inserted row defaults to attempts=0, max_attempts=3', async () => {
    let rowId: string | undefined;
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLE)
        .insert({
          session_id: sessionId,       // NOT NULL
          session_code: sessionCode,   // NOT NULL
          // status defaults to 'pending'; attempts/max_attempts intentionally omitted
        })
        .select('id, attempts, max_attempts, status')
        .single();

      rowId = data?.id;
      if (rowId) createdJobIds.push(rowId);

      expect(error, `Service-role insert failed: ${error?.message}`).toBeNull();
      expect(data?.attempts).toBe(0);
      expect(data?.max_attempts).toBe(3);
      expect(data?.status).toBe('pending');
    } finally {
      if (rowId) await supabaseAdmin.from(TABLE).delete().eq('id', rowId);
    }
  });

  // ── 3. RLS read check: a SESSION PARTICIPANT can read the new columns ────────
  //  (Replaces the template's "authenticated user can set column" test — this table
  //   is service-role-write-only, so the only user-facing RLS path is participant SELECT.)
  test('session participant can read attempts/max_attempts via their own session', async () => {
    // Insert a job as service role (the only writer), owned by the test user's session.
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from(TABLE)
      .insert({ session_id: sessionId, session_code: sessionCode })
      .select('id, attempts, max_attempts')
      .single();
    expect(insertError, `Service-role insert failed: ${insertError?.message}`).toBeNull();
    const jobId = inserted!.id;
    createdJobIds.push(jobId);

    // Sign in as the participant and read via a user-scoped (RLS-respecting) client.
    const tempSignIn = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: signIn, error: signInError } = await tempSignIn.auth.signInWithPassword({
      email: testEmail,
      password: TEST_PASSWORD,
    });
    expect(signInError, `Sign-in failed: ${signInError?.message}`).toBeNull();

    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );

    const { data: readRow, error: readError } = await userClient
      .from(TABLE)
      .select('id, attempts, max_attempts')
      .eq('id', jobId)
      .single();

    expect(readError, `Participant SELECT blocked or column missing: ${readError?.message}`).toBeNull();
    expect(readRow?.id).toBe(jobId);
    expect(readRow?.attempts).toBe(0);       // participant sees the new columns
    expect(readRow?.max_attempts).toBe(3);
  });
});
