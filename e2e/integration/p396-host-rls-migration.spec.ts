/**
 * @file p396-host-rls-migration.spec.ts
 * @description MANDATORY integration tests for P396: clarity_sessions RLS tightening
 *
 * Verifies the three DB changes from the P396 migration:
 * 1. INSERT policy: only verified users (is_verified = true) can create sessions
 *    — previously WITH CHECK (true) allowed anyone to create a session
 * 2. UPDATE policy: `OR creator_profile_id IS NULL` branch removed
 *    — previously allowed anonymous callers to update any guest-created session
 * 3. joiner_name CHECK constraint: length ≤ 100 enforced at DB level
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level operations (bypasses RLS)
 * - anon client (no JWT): simulates unauthenticated caller
 * - verified user client (JWT): simulates authenticated, verified user
 * - unverified user client (JWT): simulates authenticated but unverified user
 *
 * If test 1 fails "anonymous INSERT succeeded": P396 migration not applied (INSERT policy still open).
 * If test 4 fails "anonymous UPDATE succeeded on NULL-creator session": OR branch not removed.
 * If test 5 fails "long joiner_name succeeded": CHECK constraint not added.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** Cleanup helper — deletes a session by ID if it was unexpectedly created. */
async function cleanupSession(id: string | undefined) {
  if (id) {
    await supabaseAdmin.from('clarity_sessions').delete().eq('id', id);
  }
}

test.describe('P396: clarity_sessions RLS — verified-only INSERT', () => {
  let verifiedUserId: string;
  let verifiedEmail: string;
  let unverifiedUserId: string;
  let unverifiedEmail: string;

  test.beforeAll(async () => {
    // Create a verified user
    verifiedEmail = generateTestEmail();
    const verified = await createTestUser({ email: verifiedEmail, name: 'P396 Verified Host' });
    verifiedUserId = verified.user.id;

    // Create an unverified user (auth session exists but is_verified = false in profile)
    unverifiedEmail = generateTestEmail();
    const unverified = await createTestUser({ email: unverifiedEmail, name: 'P396 Unverified Host' });
    unverifiedUserId = unverified.user.id;
    await supabaseAdmin
      .from('profiles')
      .update({ is_verified: false })
      .eq('id', unverifiedUserId);
  });

  test.afterAll(async () => {
    await deleteTestUser(verifiedUserId);
    await deleteTestUser(unverifiedUserId);
  });

  // ── 1. Anonymous caller is blocked from creating a session ─────────────────
  test('anonymous caller (no auth) cannot INSERT into clarity_sessions', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    let sessionId: string | undefined;
    try {
      const { data, error } = await anonClient
        .from('clarity_sessions')
        .insert({
          creator_name: 'Anonymous Intruder',
        })
        .select('id')
        .single();

      sessionId = data?.id;

      expect(
        error,
        'P396 migration not applied: anonymous caller should be blocked from creating a session.\n' +
        'Run: supabase db push'
      ).not.toBeNull();
    } finally {
      await cleanupSession(sessionId);
    }
  });

  // ── 2. Unverified user (has auth but is_verified = false) is blocked ────────
  test('unverified user (is_verified = false) cannot INSERT into clarity_sessions', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: unverifiedEmail,
      password: 'test-password-12345',
    });
    expect(signInError).toBeNull();

    const unverifiedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabaseAdmin.auth.signOut();

    let sessionId: string | undefined;
    try {
      const { data, error } = await unverifiedClient
        .from('clarity_sessions')
        .insert({
          creator_name: 'Unverified User',
          creator_profile_id: unverifiedUserId,
        })
        .select('id')
        .single();

      sessionId = data?.id;

      expect(
        error,
        'RLS should block unverified user from creating a session — is_verified check missing.'
      ).not.toBeNull();
    } finally {
      await cleanupSession(sessionId);
    }
  });

  // ── 3. Verified user can create a session ──────────────────────────────────
  test('verified user can INSERT into clarity_sessions', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: verifiedEmail,
      password: 'test-password-12345',
    });
    expect(signInError).toBeNull();

    const verifiedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    await supabaseAdmin.auth.signOut();

    let sessionId: string | undefined;
    try {
      const { data, error } = await verifiedClient
        .from('clarity_sessions')
        .insert({
          // P1097: the client neither sends nor reads back `code` — INSERT on the column is
          // revoked for client roles and SELECT was revoked by P1057; the server mints it.
          creator_name: 'Verified Host',
          creator_profile_id: verifiedUserId,
        })
        .select('id')
        .single();

      sessionId = data?.id;

      expect(
        error,
        `Verified user should be able to create a session: ${error?.message}`
      ).toBeNull();
      expect(data?.id).toBeTruthy();
    } finally {
      await cleanupSession(sessionId);
    }
  });
});

test.describe('P396: clarity_sessions UPDATE RLS — creator_profile_id IS NULL branch removed', () => {
  // ── 4. Anonymous caller cannot UPDATE a session where creator_profile_id IS NULL ──
  test('anonymous caller cannot UPDATE a legacy session with creator_profile_id IS NULL', async () => {
    // Create a legacy session with creator_profile_id IS NULL via admin (bypasses RLS)
    const code = `P396-LEGACY-${Date.now()}`;
    const { data: session, error: createError } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'Legacy Guest',
        // creator_profile_id: intentionally omitted (IS NULL)
      })
      .select('id')
      .single();

    expect(createError, `Failed to create legacy test session: ${createError?.message}`).toBeNull();
    const sessionId = session!.id;

    try {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { error } = await anonClient
        .from('clarity_sessions')
        .update({ joiner_name: 'Intruder' })
        .eq('id', sessionId);

      expect(
        error,
        'P396 migration not applied: anonymous caller should not be able to update a session where\n' +
        'creator_profile_id IS NULL. The `OR creator_profile_id IS NULL` branch must be removed.'
      ).not.toBeNull();
    } finally {
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
  });
});

test.describe('P396: clarity_sessions joiner_name length constraint', () => {
  // ── 5. joiner_name > 100 chars is rejected at DB level ────────────────────
  test('joiner_name exceeding 100 characters is rejected by DB CHECK constraint', async () => {
    const longName = 'x'.repeat(101); // 101 chars — one over the limit

    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `P396-LEN-${Date.now()}`,
        creator_name: 'Host',
        joiner_name: longName,
      });

    expect(
      error,
      'P396 migration not applied: joiner_name CHECK constraint (length ≤ 100) is missing.\n' +
      'A 101-character joiner_name should be rejected.'
    ).not.toBeNull();
  });

  test('joiner_name of exactly 100 characters is accepted', async () => {
    const maxName = 'x'.repeat(100); // exactly 100 chars — at the limit
    const code = `P396-100-${Date.now()}`;

    const { data, error } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code,
        creator_name: 'Host',
        joiner_name: maxName,
      })
      .select('id, joiner_name')
      .single();

    try {
      expect(error, `100-char joiner_name should be accepted: ${error?.message}`).toBeNull();
      expect(data?.joiner_name).toHaveLength(100);
    } finally {
      if (data?.id) await supabaseAdmin.from('clarity_sessions').delete().eq('id', data.id);
    }
  });
});
