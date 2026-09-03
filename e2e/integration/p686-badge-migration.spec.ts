/**
 * INTEGRATION TEST: P686 — badge_points table + is_certifier migration
 *
 * Verifies:
 * 1. badge_points table exists with all required columns
 * 2. is_certifier column exists on profiles
 * 3. Public SELECT on badge_points is allowed (certificate page reads without auth)
 * 4. INSERT requires verified_by = auth.uid() AND is_certifier = true
 * 5. UPDATE on badge_points is denied
 * 6. DELETE on badge_points is denied
 * 7. UNIQUE constraint on (user_id, point_id) — ON CONFLICT DO NOTHING semantics
 * 8. Certifier flag can be set via service_role (admin seeding pattern)
 *
 * TWO-CLIENT PATTERN:
 *   supabaseAdmin — schema probes, seed, and constraint tests
 *   anonClient    — RLS: public SELECT check
 *   certifierClient — RLS: INSERT as certifier
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';

test.describe('P686: badge_points migration + RLS', () => {
  let earnerId: string;
  let certifierId: string;
  let certifierEmail: string;
  let pointId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    // Create two test users: one earner, one certifier
    const earner = await createTestUser({ name: 'P686-int Earner' });
    earnerId = earner.user.id;

    const certifier = await createTestUser({ name: 'P686-int Certifier' });
    certifierId = certifier.user.id;
    certifierEmail = certifier.email;

    // Seed is_certifier = true on the certifier
    await supabaseAdmin
      .from('profiles')
      .update({ is_certifier: true })
      .eq('id', certifierId);

    // Create a stub point for FK reference
    const { data: point } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P686 integration test point',
        first_validator_id: certifierId,
        system_tags: ['understanding'],
      })
      .select('id')
      .single();
    pointId = point!.id;

    // Create a stub session for FK reference
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `T686${Date.now().toString().slice(-4)}`,
        creator_name: 'P686 Certifier',
        creator_profile_id: certifierId,
        joiner_name: 'P686 Earner',
        joiner_profile_id: earnerId,
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    sessionId = session!.id;
  });

  test.afterAll(async () => {
    // Clean up in FK-safe order: badge_points → session → point → users
    await supabaseAdmin.from('badge_points').delete().in('user_id', [earnerId, certifierId]);
    if (sessionId) {
      await supabaseAdmin.from('story_verifications').delete().eq('session_id', sessionId);
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
    if (pointId) await supabaseAdmin.from('points').delete().eq('id', pointId);
    await Promise.all([
      deleteTestUser(earnerId),
      deleteTestUser(certifierId),
    ]);
  });

  // ── 1. Schema: badge_points table and all columns exist ────────────────────
  test('badge_points table exists with all required columns', async () => {
    const { error } = await supabaseAdmin
      .from('badge_points')
      .select('id, user_id, point_id, story_id, verified_by, session_id, position, verified_at, created_at')
      .limit(1);

    expect(
      error,
      'Migration not applied: "badge_points" table missing or column absent. Run: supabase db push',
    ).toBeNull();
  });

  // ── 2. Schema: is_certifier column exists on profiles ─────────────────────
  test('is_certifier column exists on profiles table', async () => {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('is_certifier')
      .limit(1);

    expect(
      error,
      'Migration not applied: "is_certifier" missing from "profiles". Run: supabase db push',
    ).toBeNull();
  });

  // ── 3. is_certifier can be set to true via service_role ───────────────────
  test('is_certifier flag can be set on a profile via admin', async () => {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('is_certifier')
      .eq('id', certifierId)
      .single();

    expect(error).toBeNull();
    expect(data?.is_certifier).toBe(true);
  });

  // ── 4. RLS: anon client can SELECT from badge_points (public certificate) ─
  test('anon client can SELECT badge_points rows (public read RLS)', async () => {
    // First insert a row as admin so there's something to select
    const { data: inserted } = await supabaseAdmin
      .from('badge_points')
      .insert({
        user_id: earnerId,
        point_id: pointId,
        verified_by: certifierId,
        session_id: sessionId,
        position: 'agree',
        verified_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const badgeId = inserted!.id;

    try {
      const anonClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
      );
      const { data, error } = await anonClient
        .from('badge_points')
        .select('id, user_id, point_id')
        .eq('id', badgeId);

      expect(error).toBeNull();
      // Public SELECT should return the row
      expect(data?.length).toBeGreaterThanOrEqual(1);
      expect(data?.[0]?.id).toBe(badgeId);
    } finally {
      await supabaseAdmin.from('badge_points').delete().eq('id', badgeId);
    }
  });

  // ── 5. RLS: certifier client can INSERT (verified_by = auth.uid() + is_certifier) ─
  test('certifier can INSERT a badge_point (RLS allows when verified_by = uid and is_certifier = true)', async () => {
    // Sign in as certifier
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn } = await tempClient.auth.signInWithPassword({
      email: certifierEmail,
      password: TEST_PASSWORD,
    });
    const certifierClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${signIn.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Use a different point to avoid UNIQUE conflict from test 4 cleanup race
    const { data: stub } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P686 RLS INSERT test point',
        first_validator_id: certifierId,
      })
      .select('id')
      .single();
    const stubPointId = stub!.id;

    try {
      const { data, error } = await certifierClient
        .from('badge_points')
        .insert({
          user_id: earnerId,
          point_id: stubPointId,
          verified_by: certifierId,
          session_id: sessionId,
          position: 'agree',
          verified_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      expect(error, `Certifier INSERT blocked by RLS: ${error?.message}`).toBeNull();
      expect(data?.id).toBeTruthy();
    } finally {
      await supabaseAdmin.from('badge_points').delete().eq('point_id', stubPointId);
      await supabaseAdmin.from('points').delete().eq('id', stubPointId);
    }
  });

  // ── 6. RLS: non-certifier cannot INSERT a badge_point ────────────────────
  test('non-certifier cannot INSERT a badge_point (RLS blocks)', async () => {
    // Earner is NOT a certifier — their insert should be blocked
    const { data: earnerAuthData } = await supabaseAdmin.auth.admin.getUserById(earnerId);
    const earnerEmail = earnerAuthData.user?.email ?? '';

    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn } = await tempClient.auth.signInWithPassword({
      email: earnerEmail,
      password: TEST_PASSWORD,
    });
    const earnerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${signIn.session!.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: stubPoint } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P686 non-certifier RLS test',
        first_validator_id: certifierId,
      })
      .select('id')
      .single();
    const stubPointId = stubPoint!.id;

    try {
      const { error } = await earnerClient
        .from('badge_points')
        .insert({
          user_id: earnerId,
          point_id: stubPointId,
          verified_by: earnerId,        // non-certifier trying to self-certify
          session_id: sessionId,
          position: 'agree',
          verified_at: new Date().toISOString(),
        });

      // RLS should block: expect an error (not null)
      expect(error).not.toBeNull();
    } finally {
      await supabaseAdmin.from('badge_points').delete().eq('point_id', stubPointId);
      await supabaseAdmin.from('points').delete().eq('id', stubPointId);
    }
  });

  // ── 7. UNIQUE constraint: duplicate (user_id, point_id) → row count stays 1 ─
  test('UNIQUE(user_id, point_id) — duplicate insert via ON CONFLICT does nothing', async () => {
    const { data: stubPoint } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'P686 UNIQUE constraint test point',
        first_validator_id: certifierId,
      })
      .select('id')
      .single();
    const stubPointId = stubPoint!.id;

    try {
      // First insert
      await supabaseAdmin.from('badge_points').insert({
        user_id: earnerId,
        point_id: stubPointId,
        verified_by: certifierId,
        session_id: sessionId,
        position: 'agree',
        verified_at: new Date().toISOString(),
      });

      // Second insert — same (user_id, point_id) — should do nothing, not error
      const { error: conflictError } = await supabaseAdmin
        .from('badge_points')
        .insert({
          user_id: earnerId,
          point_id: stubPointId,
          verified_by: certifierId,
          session_id: sessionId,
          position: 'strongly_agree',   // different position — but same key
          verified_at: new Date().toISOString(),
        });

      // ON CONFLICT DO NOTHING should not raise an error at the DB level.
      // Note: PostgREST may return a 409 or null depending on configuration;
      // adjust this assertion to match actual behavior observed after migration.
      // The key invariant is: row count remains 1.
      const { data: rows } = await supabaseAdmin
        .from('badge_points')
        .select('id')
        .eq('user_id', earnerId)
        .eq('point_id', stubPointId);

      expect(rows?.length).toBe(1);
      void conflictError; // expected behavior varies by PostgREST version
    } finally {
      await supabaseAdmin.from('badge_points').delete().eq('point_id', stubPointId);
      await supabaseAdmin.from('points').delete().eq('id', stubPointId);
    }
  });

  // ── 8. No UPDATE or DELETE on badge_points via anon ──────────────────────
  test('anon client cannot UPDATE or DELETE badge_points rows', async () => {
    const { data: inserted } = await supabaseAdmin
      .from('badge_points')
      .insert({
        user_id: earnerId,
        point_id: pointId,
        verified_by: certifierId,
        session_id: sessionId,
        position: 'agree',
        verified_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    const badgeId = inserted!.id;

    try {
      const anonClient = createClient(
        process.env.VITE_SUPABASE_URL!,
        process.env.VITE_SUPABASE_ANON_KEY!,
      );

      const { error: updateError } = await anonClient
        .from('badge_points')
        .update({ position: 'strongly_agree' })
        .eq('id', badgeId);

      const { error: deleteError } = await anonClient
        .from('badge_points')
        .delete()
        .eq('id', badgeId);

      // Both operations should be blocked by RLS (no update/delete policy)
      expect(updateError).not.toBeNull();
      expect(deleteError).not.toBeNull();
    } finally {
      await supabaseAdmin.from('badge_points').delete().eq('id', badgeId);
    }
  });
});
