/**
 * @file p1032-reproduce.spec.ts
 * @description Canary for P1032: stories/points INSERT RLS policies do not bind
 * the author column to auth.uid(). A verified user can insert a row naming a
 * DIFFERENT profile as author_id / first_validator_id, and RLS lets it through.
 *
 * Root cause: 20260325120000_p586_visibility_privacy_foundation.sql STEP 11
 * (stories INSERT) and STEP 20 (points INSERT) check `auth.uid() IS NOT NULL
 * AND is_verified = true` but never `author_id = auth.uid()` /
 * `first_validator_id = auth.uid()` — unlike the sibling UPDATE/DELETE
 * policies on the same tables, which do bind ownership.
 *
 * This test MUST FAIL until the fix adds the ownership predicate to both
 * INSERT policies.
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

test.describe('P1032: stories INSERT — author_id impersonation', () => {
  let attacker: TestUser;
  let victim: TestUser;
  const createdStoryIds: string[] = [];

  test.beforeAll(async () => {
    attacker = await createTestUser({ email: generateTestEmail(), name: 'P1032 Attacker' });
    victim = await createTestUser({ email: generateTestEmail(), name: 'P1032 Victim' });
  });

  test.afterAll(async () => {
    if (createdStoryIds.length > 0) {
      await supabaseAdmin.from('story_points').delete().in('story_id', createdStoryIds);
      await supabaseAdmin.from('stories').delete().in('id', createdStoryIds);
    }
    await deleteTestUser(attacker.user.id);
    await deleteTestUser(victim.user.id);
  });

  test('attacker cannot insert a story attributed to another profile', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const attackerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await attackerClient
      .from('stories')
      .insert({
        author_id: victim.user.id, // forged — not the caller's own id
        content: 'P1032 canary — this story was NOT written by the named author',
        visibility: 'public',
      })
      .select('id, author_id')
      .single();

    if (data?.id) createdStoryIds.push(data.id);

    expect(
      error,
      `Expected RLS to reject an INSERT naming another profile as author_id, but it succeeded. ` +
      `Row ${data?.id} was created with author_id=${data?.author_id} (victim), inserted by attacker=${attacker.user.id}.`
    ).not.toBeNull();
  });

  test('positive control: attacker can insert a story attributed to themselves', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const attackerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await attackerClient
      .from('stories')
      .insert({
        author_id: attacker.user.id,
        content: 'P1032 canary — legitimate self-authored story',
        visibility: 'public',
      })
      .select('id, author_id')
      .single();

    if (data?.id) createdStoryIds.push(data.id);

    expect(error, `Self-authored INSERT should succeed: ${error?.message}`).toBeNull();
    expect(data?.author_id).toBe(attacker.user.id);
  });
});

test.describe('P1032: points INSERT — first_validator_id impersonation', () => {
  let attacker: TestUser;
  let victim: TestUser;
  const createdPointIds: string[] = [];

  test.beforeAll(async () => {
    attacker = await createTestUser({ email: generateTestEmail(), name: 'P1032 Point Attacker' });
    victim = await createTestUser({ email: generateTestEmail(), name: 'P1032 Point Victim' });
  });

  test.afterAll(async () => {
    if (createdPointIds.length > 0) {
      await supabaseAdmin.from('point_positions').delete().in('point_id', createdPointIds);
      await supabaseAdmin.from('points').delete().in('id', createdPointIds);
    }
    await deleteTestUser(attacker.user.id);
    await deleteTestUser(victim.user.id);
  });

  test('attacker cannot insert a point attributed to another profile', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const attackerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await attackerClient
      .from('points')
      .insert({
        first_validator_id: victim.user.id, // forged — not the caller's own id
        statement: 'P1032 canary — this point was NOT first-validated by the named profile',
      })
      .select('id, first_validator_id')
      .single();

    if (data?.id) createdPointIds.push(data.id);

    expect(
      error,
      `Expected RLS to reject an INSERT naming another profile as first_validator_id, but it succeeded. ` +
      `Row ${data?.id} was created with first_validator_id=${data?.first_validator_id} (victim), inserted by attacker=${attacker.user.id}.`
    ).not.toBeNull();
  });

  test('positive control: attacker can insert a point attributed to themselves', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: attacker.email, password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const attackerClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await attackerClient
      .from('points')
      .insert({
        first_validator_id: attacker.user.id,
        statement: 'P1032 canary — legitimate self-validated point',
      })
      .select('id, first_validator_id')
      .single();

    if (data?.id) createdPointIds.push(data.id);

    expect(error, `Self-validated INSERT should succeed: ${error?.message}`).toBeNull();
    expect(data?.first_validator_id).toBe(attacker.user.id);
  });
});
