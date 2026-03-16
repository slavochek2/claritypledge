/**
 * @file p504-banner-migration.spec.ts
 * @description Integration tests for P504: Auto-generated banners — DB migration verification
 *
 * P270 RULE: Mandatory for any feature adding a DB migration.
 *
 * Verifies:
 * 1. `banner_url` column exists on `stories`, `points`, and `profiles` tables
 * 2. `banner_generation_attempted` column exists on `profiles` table
 * 3. `banners` storage bucket exists with correct policies
 * 4. RLS: story author can update own story's banner_url
 * 5. RLS: story author cannot update another author's story's banner_url
 * 6. RLS: profile owner can update own banner_url
 * 7. RLS: profile owner cannot update another user's profile banner_url
 * 8. RLS: points have NO client-side UPDATE (update fails for any user)
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped JWT client: RLS assertions
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint, type TestPoint } from '../helpers/test-point';

test.describe('P504 Migration — banner_url columns + banners bucket', () => {
  test.setTimeout(45000);

  let userA: TestUser;
  let userB: TestUser;
  let storyA: TestStory;
  let pointA: TestPoint;
  let tokenA: string;
  let tokenB: string;

  test.beforeAll(async () => {
    userA = await createTestUser({ name: 'P504 Banner UserA' });
    userB = await createTestUser({ name: 'P504 Banner UserB' });

    storyA = await createTestStory(userA.user.id, {
      title: 'P504 Migration Test Story',
    });

    pointA = await createTestPoint(userA.user.id, {
      statement: 'P504 Migration Test Point',
    });

    // Get JWTs for RLS testing
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

    const clientA = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInA, error: errA } = await clientA.auth.signInWithPassword({
      email: userA.email,
      password: 'test-password-12345',
    });
    if (errA || !signInA?.session) throw new Error(`P504: Failed to sign in userA: ${errA?.message}`);
    tokenA = signInA.session.access_token;

    const clientB = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signInB, error: errB } = await clientB.auth.signInWithPassword({
      email: userB.email,
      password: 'test-password-12345',
    });
    if (errB || !signInB?.session) throw new Error(`P504: Failed to sign in userB: ${errB?.message}`);
    tokenB = signInB.session.access_token;
  });

  test.afterAll(async () => {
    if (pointA?.id) await deleteTestPoint(pointA.id);
    if (storyA?.id) await deleteTestStory(storyA.id);
    if (userA?.user?.id) await deleteTestUser(userA.user.id);
    if (userB?.user?.id) await deleteTestUser(userB.user.id);
  });

  // ── 1. Schema checks: columns exist ───────────────────────────────────────

  test('banner_url column exists on stories table', async () => {
    const { error } = await supabaseAdmin
      .from('stories')
      .select('banner_url')
      .limit(1);

    expect(
      error,
      'Migration not applied: "banner_url" missing from "stories". Run: ./scripts/migrate.sh'
    ).toBeNull();
  });

  test('banner_url column exists on points table', async () => {
    const { error } = await supabaseAdmin
      .from('points')
      .select('banner_url')
      .limit(1);

    expect(
      error,
      'Migration not applied: "banner_url" missing from "points". Run: ./scripts/migrate.sh'
    ).toBeNull();
  });

  test('banner_url column exists on profiles table', async () => {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('banner_url')
      .limit(1);

    expect(
      error,
      'Migration not applied: "banner_url" missing from "profiles". Run: ./scripts/migrate.sh'
    ).toBeNull();
  });

  test('banner_generation_attempted column exists on profiles table', async () => {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('banner_generation_attempted')
      .limit(1);

    expect(
      error,
      'Migration not applied: "banner_generation_attempted" missing from "profiles". Run: ./scripts/migrate.sh'
    ).toBeNull();
  });

  // ── 2. Default values ─────────────────────────────────────────────────────

  test('banner_url defaults to NULL for new stories', async () => {
    const { data, error } = await supabaseAdmin
      .from('stories')
      .select('id, banner_url')
      .eq('id', storyA.id)
      .single();

    expect(error).toBeNull();
    expect(data?.banner_url).toBeNull();
  });

  test('banner_url defaults to NULL for new points', async () => {
    const { data, error } = await supabaseAdmin
      .from('points')
      .select('id, banner_url')
      .eq('id', pointA.id)
      .single();

    expect(error).toBeNull();
    expect(data?.banner_url).toBeNull();
  });

  test('banner_generation_attempted defaults to FALSE for profiles', async () => {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, banner_generation_attempted')
      .eq('id', userA.user.id)
      .single();

    expect(error).toBeNull();
    expect(data?.banner_generation_attempted).toBe(false);
  });

  // ── 3. Storage bucket: banners ─────────────────────────────────────────────

  test('banners storage bucket exists', async () => {
    const { data, error } = await supabaseAdmin.storage.getBucket('banners');

    expect(error, 'Storage bucket "banners" does not exist. Run migration.').toBeNull();
    expect(data).toBeTruthy();
    expect(data?.public).toBe(true);
  });

  // ── 4. RLS: story author can update banner_url on own story ────────────────

  test('story author can update banner_url on their own story', async () => {
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${tokenA}` } } }
    );

    const testUrl = 'https://storage.example.com/banners/stories/test-rls-check.png';

    const { error } = await userClient
      .from('stories')
      .update({ banner_url: testUrl })
      .eq('id', storyA.id);

    expect(error, `RLS blocked author from updating story banner_url: ${error?.message}`).toBeNull();

    // Verify the update was applied
    const { data } = await supabaseAdmin
      .from('stories')
      .select('banner_url')
      .eq('id', storyA.id)
      .single();
    expect(data?.banner_url).toBe(testUrl);

    // Cleanup: reset to null
    await supabaseAdmin.from('stories').update({ banner_url: null }).eq('id', storyA.id);
  });

  // ── 5. RLS: non-author cannot update banner_url on another's story ─────────

  test('non-author cannot update banner_url on another user\'s story', async () => {
    const nonAuthorClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${tokenB}` } } }
    );

    const { error, data } = await nonAuthorClient
      .from('stories')
      .update({ banner_url: 'https://evil.example.com/injected.jpg' })
      .eq('id', storyA.id)
      .select('banner_url');

    // RLS silently filters: no error, but 0 rows updated
    expect(error, 'Unexpected error on cross-author story update').toBeNull();
    expect(data?.length ?? 0, 'RLS should prevent non-author from updating story banner_url').toBe(0);
  });

  // ── 6. RLS: profile owner can update banner_url on own profile ─────────────

  test('profile owner can update banner_url on their own profile', async () => {
    const ownerClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${tokenA}` } } }
    );

    const testUrl = 'https://storage.example.com/banners/profiles/test-rls-check.png';

    const { error } = await ownerClient
      .from('profiles')
      .update({ banner_url: testUrl })
      .eq('id', userA.user.id);

    expect(error, `RLS blocked owner from updating profile banner_url: ${error?.message}`).toBeNull();

    // Verify the update was applied
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('banner_url')
      .eq('id', userA.user.id)
      .single();
    expect(data?.banner_url).toBe(testUrl);

    // Cleanup: reset to null
    await supabaseAdmin.from('profiles').update({ banner_url: null }).eq('id', userA.user.id);
  });

  // ── 7. RLS: non-owner cannot update banner_url on another's profile ────────

  test('non-owner cannot update banner_url on another user\'s profile', async () => {
    const nonOwnerClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${tokenB}` } } }
    );

    const { error, data } = await nonOwnerClient
      .from('profiles')
      .update({ banner_url: 'https://evil.example.com/injected.jpg' })
      .eq('id', userA.user.id)
      .select('banner_url');

    // RLS silently filters: no error, but 0 rows updated
    expect(error, 'Unexpected error on cross-user profile update').toBeNull();
    expect(data?.length ?? 0, 'RLS should prevent non-owner from updating profile banner_url').toBe(0);
  });

  // ── 8. RLS: points have NO client-side UPDATE ──────────────────────────────

  test('authenticated user cannot update banner_url on points (no UPDATE policy)', async () => {
    const userClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${tokenA}` } } }
    );

    const { error, data } = await userClient
      .from('points')
      .update({ banner_url: 'https://example.com/hacked-point-banner.jpg' })
      .eq('id', pointA.id)
      .select('banner_url');

    // Points have NO UPDATE policy — update should return 0 rows (RLS filter)
    // or an explicit RLS error. Either way, the banner_url must not change.
    if (error) {
      // Explicit RLS error — this is also acceptable
      expect(error.code).toBeTruthy();
    } else {
      // No error but 0 rows updated — RLS silently filtered
      expect(data?.length ?? 0, 'Points should have no UPDATE policy — banner_url must not be writable from client').toBe(0);
    }

    // Verify banner_url was NOT changed via admin
    const { data: check } = await supabaseAdmin
      .from('points')
      .select('banner_url')
      .eq('id', pointA.id)
      .single();
    expect(check?.banner_url).toBeNull();
  });

  test('even the point creator cannot update banner_url on points', async () => {
    // The first_validator (creator) also cannot update — points are immutable from client
    const creatorClient = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.VITE_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${tokenA}` } } }
    );

    const { data } = await creatorClient
      .from('points')
      .update({ banner_url: 'https://example.com/creator-banner.jpg' })
      .eq('id', pointA.id)
      .select('banner_url');

    expect(data?.length ?? 0, 'Even point creator should not be able to update banner_url').toBe(0);
  });

  // ── 9. Service role CAN update point banner_url (edge function path) ───────

  test('service_role can update banner_url on points (edge function path)', async () => {
    const testUrl = 'https://storage.example.com/banners/points/service-role-test.png';

    const { error } = await supabaseAdmin
      .from('points')
      .update({ banner_url: testUrl })
      .eq('id', pointA.id);

    expect(error, `service_role should be able to update point banner_url: ${error?.message}`).toBeNull();

    const { data } = await supabaseAdmin
      .from('points')
      .select('banner_url')
      .eq('id', pointA.id)
      .single();
    expect(data?.banner_url).toBe(testUrl);

    // Cleanup
    await supabaseAdmin.from('points').update({ banner_url: null }).eq('id', pointA.id);
  });
});
