/**
 * @file security-tighten-rls.spec.ts
 * @description Integration tests for migration 20260403120200_security_tighten_rls.sql
 *
 * Verifies three RLS policy tightenings:
 * 1. point_position_history INSERT — WITH CHECK (false) blocks all direct client writes
 * 2. clarity_feed_ideas SELECT — visibility = 'public' filter enforced (dead OR true removed)
 * 3. Legacy tables (clarity_demo_rounds, clarity_ideas) — unauthenticated INSERT blocked
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: service role for setup/teardown and schema assertions
 * - anon client (no auth header): to test unauthenticated access rejections
 * - user client: for authenticated assertions where needed
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

test.describe('Security RLS: point_position_history direct INSERT blocked', () => {
  let userId: string;
  let pointId: string;

  test.beforeAll(async () => {
    const user = await createTestUser({ name: 'Sec-RLS-PPH' });
    userId = user.user.id;

    // Insert a point to satisfy the FK constraint
    const { data: point, error: pointErr } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Security test point for position history RLS',
        first_validator_id: userId,
      })
      .select('id')
      .single();

    expect(pointErr).toBeNull();
    pointId = point!.id;
  });

  test.afterAll(async () => {
    if (pointId) {
      await supabaseAdmin.from('point_position_history').delete().eq('point_id', pointId);
      await supabaseAdmin.from('points').delete().eq('id', pointId);
    }
    await deleteTestUser(userId);
  });

  test('direct INSERT into point_position_history is blocked by RLS (WITH CHECK false)', async () => {
    // Service role bypasses RLS — we test via service role rpc-level check is not applicable here.
    // The policy applies to non-service_role clients. Use anon client with no JWT.
    const anonClient = makeAnonClient();

    const { error } = await anonClient
      .from('point_position_history')
      .insert({
        point_id: pointId,
        user_id: userId,
        position: 'agree',
        reasoning: 'Direct insert attempt — should be blocked',
      });

    // RLS WITH CHECK (false) must reject the insert
    expect(error).not.toBeNull();
    expect(error!.code).toMatch(/42501|PGRST301/); // RLS violation
  });

  test('service role can read point_position_history (trigger-written rows)', async () => {
    // Confirm the table is accessible via service role (trigger writes bypass RLS)
    const { error } = await supabaseAdmin
      .from('point_position_history')
      .select('id')
      .limit(1);

    expect(error).toBeNull();
  });
});

test.describe('Security RLS: clarity_feed_ideas visibility filter', () => {
  let privateIdeaId: string;
  let publicIdeaId: string;

  test.beforeAll(async () => {
    // Insert a private idea via service role (bypasses the SELECT policy — write test fixture)
    const { data: privateIdea, error: privateErr } = await supabaseAdmin
      .from('clarity_feed_ideas')
      .insert({
        content: 'Private idea — security RLS test',
        originator_name: 'Security Test',
        provenance_type: 'direct',
        visibility: 'private',
      })
      .select('id')
      .single();

    expect(privateErr).toBeNull();
    privateIdeaId = privateIdea!.id;

    // Insert a public idea
    const { data: publicIdea, error: publicErr } = await supabaseAdmin
      .from('clarity_feed_ideas')
      .insert({
        content: 'Public idea — security RLS test',
        originator_name: 'Security Test',
        provenance_type: 'direct',
        visibility: 'public',
      })
      .select('id')
      .single();

    expect(publicErr).toBeNull();
    publicIdeaId = publicIdea!.id;
  });

  test.afterAll(async () => {
    const ids = [privateIdeaId, publicIdeaId].filter(Boolean);
    if (ids.length > 0) {
      await supabaseAdmin.from('clarity_feed_ideas').delete().in('id', ids);
    }
  });

  test('private ideas are NOT returned via anon key (visibility = public only)', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient
      .from('clarity_feed_ideas')
      .select('id, visibility')
      .eq('id', privateIdeaId);

    expect(error).toBeNull();
    // RLS filters out private ideas — the query succeeds but returns 0 rows
    expect(data).toHaveLength(0);
  });

  test('public ideas ARE returned via anon key', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient
      .from('clarity_feed_ideas')
      .select('id, visibility')
      .eq('id', publicIdeaId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].visibility).toBe('public');
  });
});

test.describe('Security RLS: legacy tables block unauthenticated INSERT', () => {
  test('clarity_demo_rounds rejects unauthenticated INSERT', async () => {
    const anonClient = makeAnonClient();

    // Use a random UUID for session_id — RLS (auth.uid() IS NOT NULL) fires
    // before FK constraint evaluation, so the exact session doesn't matter.
    const { error } = await anonClient
      .from('clarity_demo_rounds')
      .insert({
        session_id: crypto.randomUUID(),
        level: 1,
        round_number: 1,
        speaker_name: 'Anon Speaker',
        listener_name: 'Anon Listener',
      });

    expect(error).not.toBeNull();
    // auth.uid() IS NOT NULL fails for unauthenticated user → RLS violation
    expect(error!.code).toMatch(/42501|PGRST301/);
  });

  test('clarity_ideas rejects unauthenticated INSERT', async () => {
    const anonClient = makeAnonClient();

    // Use a random UUID for session_id — RLS fires before FK check.
    const { error } = await anonClient
      .from('clarity_ideas')
      .insert({
        session_id: crypto.randomUUID(),
        content: 'Unauthenticated idea — should be blocked',
        author_name: 'Anon',
      });

    expect(error).not.toBeNull();
    expect(error!.code).toMatch(/42501|PGRST301/);
  });
});
