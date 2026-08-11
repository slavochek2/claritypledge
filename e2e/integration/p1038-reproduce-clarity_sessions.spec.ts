/**
 * @file p1038-reproduce-clarity_sessions.spec.ts
 * @description Canary for P1038: clarity_sessions INSERT RLS policy does not bind
 * the creator column to auth.uid(). A verified user can insert a row naming a
 * DIFFERENT profile as creator_profile_id, and RLS lets it through.
 *
 * Root cause: 20260414100001_p703_letter_sourced_live.sql "5. Replace
 * clarity_sessions_verified_host_insert" checks `auth.uid() IS NOT NULL AND
 * is_verified = true` plus letter-sourced conditionals, but never
 * `creator_profile_id = auth.uid()` — unlike the sibling UPDATE policy
 * (`clarity_sessions_creator_update`, same table) which does bind it via
 * `auth.uid() IN (target_listener_id, creator_profile_id)`. Same asymmetry
 * shape as P1032 (stories/points) and P1034 (story_points). Detail (exploit
 * mechanics, live-verification evidence): .private/docs/security-log.md,
 * "2026-08-10 — clarity_sessions INSERT policy does not bind creator_profile_id".
 *
 * This test MUST FAIL until the fix adds the ownership predicate to the
 * INSERT policy.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeRoomCode() {
  // 6-char code matching the app's own generateRoomCode() shape closely enough
  // for the unique constraint — collisions are vanishingly unlikely in test runs.
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

test.describe('P1038: clarity_sessions INSERT — creator_profile_id impersonation', () => {
  let attacker: TestUser;
  let victim: TestUser;
  const createdSessionIds: string[] = [];

  test.beforeAll(async () => {
    attacker = await createTestUser({ email: generateTestEmail(), name: 'P1038 Attacker' });
    victim = await createTestUser({ email: generateTestEmail(), name: 'P1038 Victim' });
  });

  test.afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await supabaseAdmin.from('clarity_sessions').delete().in('id', createdSessionIds);
    }
    await deleteTestUser(attacker.user.id);
    await deleteTestUser(victim.user.id);
  });

  test('attacker cannot insert a session attributed to another profile', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const attackerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await attackerClient
      .from('clarity_sessions')
      .insert({
        code: makeRoomCode(),
        creator_name: 'P1038 canary',
        creator_profile_id: victim.user.id, // forged — not the caller's own id
        state: {},
      })
      .select('id, creator_profile_id')
      .single();

    if (data?.id) createdSessionIds.push(data.id);

    expect(
      error,
      `Expected RLS to reject an INSERT naming another profile as creator_profile_id, but it ` +
      `succeeded. Row ${data?.id} was created with creator_profile_id=${data?.creator_profile_id} ` +
      `(victim), inserted by attacker=${attacker.user.id}.`
    ).not.toBeNull();
  });

  test('positive control: attacker can insert a session attributed to themselves', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const attackerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await attackerClient
      .from('clarity_sessions')
      .insert({
        code: makeRoomCode(),
        creator_name: 'P1038 canary — legitimate',
        creator_profile_id: attacker.user.id,
        state: {},
      })
      .select('id, creator_profile_id')
      .single();

    if (data?.id) createdSessionIds.push(data.id);

    expect(error, `Self-attributed INSERT should succeed: ${error?.message}`).toBeNull();
    expect(data?.creator_profile_id).toBe(attacker.user.id);
  });

  test('positive control: attacker can insert a session with no creator_profile_id (NULL)', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const attackerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await attackerClient
      .from('clarity_sessions')
      .insert({
        code: makeRoomCode(),
        creator_name: 'P1038 canary — null creator',
        state: {},
      })
      .select('id, creator_profile_id')
      .single();

    if (data?.id) createdSessionIds.push(data.id);

    expect(error, `NULL creator_profile_id INSERT should still succeed (matches live client ` +
      `behavior in clarity-demo-page.tsx / clarity-chat-page.tsx): ${error?.message}`).toBeNull();
    expect(data?.creator_profile_id).toBeNull();
  });
});
