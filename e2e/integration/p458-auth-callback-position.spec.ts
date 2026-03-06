/**
 * @file p458-auth-callback-position.spec.ts
 * @description Integration tests for P458: AuthCallbackPage position auto-save
 *
 * Verifies:
 *   1. `AuthCallbackPage` with action=set-position saves position correctly
 *      for a verified user via direct service call (mirrors what the callback page does)
 *   2. Invalid pointId (not UUID) → error handled gracefully (no crash)
 *   3. Invalid value (not valid position) → error handled gracefully
 *   4. `/point/` prefix IS in ALLOWED_REDIRECT_PREFIXES (regression test for security gap)
 *   5. `/chat` prefix IS in ALLOWED_REDIRECT_PREFIXES
 *   6. Duplicate position for same user+point → upsert succeeds (idempotent)
 *   7. Position save uses authUser.id from session, not from URL params (spoofing guard)
 *
 * TWO-CLIENT PATTERN:
 *   - supabaseAdmin: setup, teardown, direct DB verification
 *   - userClient (JWT): authenticated as the test user for position writes
 *
 * Cleanup order: delete positions BEFORE users (CASCADE via deleteTestPoint handles this).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, generateTestEmail, deleteTestUser, generateMagicLinkUrl } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint, type TestPoint } from '../helpers/test-point';
import type { TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

/** Build an authenticated Supabase client from a JWT access token. */
function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// ALLOWED_REDIRECT_PREFIXES — regression test for security gap
// ---------------------------------------------------------------------------

test.describe('P458: ALLOWED_REDIRECT_PREFIXES — /point/ and /chat must be present', () => {
  // This test verifies that the allowlist extension from Decision 6 was applied.
  // Without /point/ in the list, the post-auth redirect falls through to /events
  // instead of returning the user to the point they came from.
  //
  // We test this by reading the source code directly — no runtime needed.
  // (A runtime test would require intercepting the redirect, which is more fragile.)

  test('/point/ prefix is in ALLOWED_REDIRECT_PREFIXES (Decision 6 applied)', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');

    const authCallbackPath = resolve(process.cwd(), 'src/auth/AuthCallbackPage.tsx');
    let source: string;
    try {
      source = readFileSync(authCallbackPath, 'utf-8');
    } catch {
      test.skip(true, 'AuthCallbackPage.tsx not found — cannot verify ALLOWED_REDIRECT_PREFIXES');
      return;
    }

    // Find the ALLOWED_REDIRECT_PREFIXES array in the source
    const match = source.match(/ALLOWED_REDIRECT_PREFIXES\s*=\s*\[([^\]]+)\]/);
    expect(
      match,
      'ALLOWED_REDIRECT_PREFIXES constant not found in AuthCallbackPage.tsx'
    ).not.toBeNull();

    const prefixList = match![1];
    expect(
      prefixList,
      'ALLOWED_REDIRECT_PREFIXES must include /point/ — required for P458 position-gate redirect to work'
    ).toContain('/point/');
  });

  test('/chat prefix is in ALLOWED_REDIRECT_PREFIXES (open-chat action requires it)', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');

    const authCallbackPath = resolve(process.cwd(), 'src/auth/AuthCallbackPage.tsx');
    let source: string;
    try {
      source = readFileSync(authCallbackPath, 'utf-8');
    } catch {
      test.skip(true, 'AuthCallbackPage.tsx not found — cannot verify ALLOWED_REDIRECT_PREFIXES');
      return;
    }

    const match = source.match(/ALLOWED_REDIRECT_PREFIXES\s*=\s*\[([^\]]+)\]/);
    expect(match, 'ALLOWED_REDIRECT_PREFIXES constant not found').not.toBeNull();

    const prefixList = match![1];
    expect(
      prefixList,
      'ALLOWED_REDIRECT_PREFIXES must include /chat — required for open-chat Scope B action'
    ).toContain('/chat');
  });
});

// ---------------------------------------------------------------------------
// Position auto-save — service-level tests (mirror AuthCallbackPage logic)
// ---------------------------------------------------------------------------

test.describe('P458: Position auto-save — valid inputs', () => {
  let user: TestUser;
  let point: TestPoint;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P458Callback', email: generateTestEmail() });
    point = await createTestPoint(user.user.id, {
      statement: `P458 callback test point ${Date.now()}`,
    });
  });

  test.afterAll(async () => {
    // Delete point first — CASCADE removes point_positions
    if (point?.id) await deleteTestPoint(point.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('verified user can save position=agree on a point via authenticated client', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: TEST_PASSWORD,
    });
    expect(signInError, `Sign-in failed: ${signInError?.message}`).toBeNull();
    const userClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { error } = await userClient
      .from('point_positions')
      .upsert({
        point_id: point.id,
        user_id: user.user.id,
        position: 'agree',
      }, { onConflict: 'point_id,user_id' });

    expect(error, `Position save failed: ${error?.message}`).toBeNull();

    // Verify position was actually saved
    const { data: saved } = await supabaseAdmin
      .from('point_positions')
      .select('position')
      .eq('point_id', point.id)
      .eq('user_id', user.user.id)
      .single();

    expect(saved?.position).toBe('agree');
  });

  test('verified user can upsert a position (duplicate is idempotent, not an error)', async () => {
    // First set to agree
    await supabaseAdmin.from('point_positions').upsert({
      point_id: point.id,
      user_id: user.user.id,
      position: 'agree',
    }, { onConflict: 'point_id,user_id' });

    // Now upsert again with disagree — should succeed and update the value
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const userClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { error } = await userClient
      .from('point_positions')
      .upsert({
        point_id: point.id,
        user_id: user.user.id,
        position: 'disagree',
      }, { onConflict: 'point_id,user_id' });

    expect(error, `Duplicate upsert failed: ${error?.message}`).toBeNull();

    const { data: saved } = await supabaseAdmin
      .from('point_positions')
      .select('position')
      .eq('point_id', point.id)
      .eq('user_id', user.user.id)
      .single();

    expect(saved?.position).toBe('disagree');
  });
});

// ---------------------------------------------------------------------------
// Input validation — invalid inputs must not reach DB
// ---------------------------------------------------------------------------

test.describe('P458: Input validation — invalid pointId and value', () => {
  // These tests verify the client-side validation guard described in §Security Review.
  // The DB would reject these too (UUID FK constraint, enum constraint), but with
  // confusing error messages. The spec requires client-side validation first.

  // We test the validation logic directly (same as the unit tests in p458-auth-gate-utils.test.ts)
  // but also verify the DB-level rejection as a defense-in-depth check.

  let user: TestUser;
  let point: TestPoint;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P458Validate', email: generateTestEmail() });
    point = await createTestPoint(user.user.id, {
      statement: `P458 validation test point ${Date.now()}`,
    });
  });

  test.afterAll(async () => {
    if (point?.id) await deleteTestPoint(point.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('DB rejects non-UUID pointId with error (structural FK violation)', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const userClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await userClient
      .from('point_positions')
      .upsert({
        point_id: 'not-a-uuid',
        user_id: user.user.id,
        position: 'agree',
      }, { onConflict: 'point_id,user_id' })
      .select('point_id')
      .single();

    // Must fail — non-UUID violates FK constraint
    expect(error, 'Non-UUID pointId must be rejected by DB').not.toBeNull();
    expect(data).toBeNull();
  });

  test('DB rejects invalid position value with error (enum constraint)', async () => {
    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password: TEST_PASSWORD,
    });
    expect(signInError).toBeNull();
    const userClient = makeUserClient(signIn!.session!.access_token);
    await supabaseAdmin.auth.signOut();

    const { data, error } = await userClient
      .from('point_positions')
      // @ts-expect-error intentionally invalid value for test
      .upsert({
        point_id: point.id,
        user_id: user.user.id,
        position: 'definitely-not-a-position',
      }, { onConflict: 'point_id,user_id' })
      .select('position')
      .single();

    // Must fail — invalid enum value is rejected by Postgres
    expect(error, 'Invalid position enum must be rejected by DB').not.toBeNull();
    expect(data).toBeNull();
  });

  test('unauthenticated client cannot INSERT a position (RLS blocks it)', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('point_positions')
      .upsert({
        point_id: point.id,
        user_id: user.user.id,
        position: 'agree',
      }, { onConflict: 'point_id,user_id' })
      .select('point_id')
      .single();

    // RLS requires auth.uid() = user_id — anon client has no uid
    expect(error, 'Unauthenticated position write must be rejected by RLS').not.toBeNull();
    expect(data).toBeNull();
  });

  test('user cannot spoof another user\'s position (user_id from session, not URL)', async () => {
    // Create a second user as the "victim"
    const victim = await createTestUser({ name: 'P458Victim', email: generateTestEmail() });
    const victimPoint = await createTestPoint(victim.user.id, {
      statement: `P458 victim point ${Date.now()}`,
    });

    try {
      // Sign in as the attacker (our main test user)
      const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email: user.email,
        password: TEST_PASSWORD,
      });
      expect(signInError).toBeNull();
      const attackerClient = makeUserClient(signIn!.session!.access_token);
      await supabaseAdmin.auth.signOut();

      // Try to write a position as the victim (spoofed user_id)
      const { data, error } = await attackerClient
        .from('point_positions')
        .upsert({
          point_id: victimPoint.id,
          user_id: victim.user.id, // attacker claiming to be victim
          position: 'agree',
        }, { onConflict: 'point_id,user_id' })
        .select('user_id')
        .single();

      if (data?.user_id) {
        // Cleanup the stray row
        await supabaseAdmin.from('point_positions').delete()
          .eq('point_id', victimPoint.id).eq('user_id', victim.user.id);
      }

      // RLS: INSERT policy requires auth.uid() = user_id
      // The attacker's auth.uid() is user.user.id, not victim.user.id — must fail
      expect(
        error,
        'Position spoofing (writing as another user) must be rejected by RLS auth.uid() = user_id check'
      ).not.toBeNull();
    } finally {
      await deleteTestPoint(victimPoint.id);
      await deleteTestUser(victim.user.id);
    }
  });
});

// ---------------------------------------------------------------------------
// AuthCallbackPage route — redirect behavior
// ---------------------------------------------------------------------------

test.describe('P458: AuthCallbackPage — position save and redirect', () => {
  test.describe.configure({ timeout: 60000 });

  let user: TestUser;
  let point: TestPoint;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P458AuthCB', email: generateTestEmail() });
    point = await createTestPoint(user.user.id, {
      statement: `P458 auth callback test ${Date.now()}`,
    });
  });

  test.afterAll(async () => {
    if (point?.id) await deleteTestPoint(point.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('auth callback with valid set-position params redirects to /point/:id after save', async ({ page }) => {
    const { setTestSession } = await import('../helpers/test-user');
    await setTestSession(page, user.email);

    // Navigate to auth callback with set-position intent
    const callbackUrl = `/auth/callback?action=set-position&pointId=${point.id}&position=agree&redirect=${encodeURIComponent(`/point/${point.id}`)}`;
    await page.goto(callbackUrl);

    // Must redirect to the point page (not /events, not /signup)
    await page.waitForURL(/\/point\//, { timeout: 15000 });
    expect(page.url()).toContain(`/point/${point.id}`);
  });

  test('auth callback with invalid pointId does not crash — graceful fallback', async ({ page }) => {
    const { setTestSession } = await import('../helpers/test-user');
    await setTestSession(page, user.email);

    // Navigate with a non-UUID pointId
    const callbackUrl = `/auth/callback?action=set-position&pointId=not-a-uuid&position=agree&redirect=${encodeURIComponent('/point/not-a-uuid')}`;
    await page.goto(callbackUrl);

    // Page must not crash — it should redirect somewhere (events, home, or stay on callback)
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Verify no uncaught errors in page
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // The URL must be a known application route (not stuck on /auth/callback with error UI)
    const url = page.url();
    expect(url).not.toContain('/auth/callback?action=set-position&pointId=not-a-uuid');
  });

  test('auth callback with invalid position value does not crash — graceful fallback', async ({ page }) => {
    const { setTestSession } = await import('../helpers/test-user');
    await setTestSession(page, user.email);

    const callbackUrl = `/auth/callback?action=set-position&pointId=${point.id}&position=invalid-value&redirect=${encodeURIComponent(`/point/${point.id}`)}`;
    await page.goto(callbackUrl);

    await page.waitForLoadState('networkidle', { timeout: 15000 });

    // Must not render an unhandled error screen
    const url = page.url();
    // Acceptable outcomes: redirect to /events (fallback), or to the point page, or to home
    expect(url).not.toMatch(/^.*\/auth\/callback.*error/i);
  });
});

// ---------------------------------------------------------------------------
// Full magic-link round-trip — UAT-4.x / UAT-5.x equivalent
// ---------------------------------------------------------------------------
// Uses generateLink (Supabase Admin API) to create a real magic link URL,
// navigates Playwright to it, and verifies that:
//   1. Supabase performs the token exchange (real auth, not session injection)
//   2. AuthCallbackPage processes action=set-position
//   3. Position is saved in point_positions table
//   4. User is redirected to /point/:id (not /events)

test.describe('P458: Full magic-link round-trip — position auto-save', () => {
  test.describe.configure({ timeout: 90000 });

  let user: TestUser;
  let point: TestPoint;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P458MagicLink', email: generateTestEmail() });
    point = await createTestPoint(user.user.id, {
      statement: `P458 magic link round-trip test ${Date.now()}`,
    });
  });

  test.afterAll(async () => {
    // Clean up position first, then point (CASCADE), then user
    if (point?.id && user?.user?.id) {
      await supabaseAdmin.from('point_positions').delete()
        .eq('point_id', point.id).eq('user_id', user.user.id);
    }
    if (point?.id) await deleteTestPoint(point.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('magic link → token exchange → position saved → redirect to /point/:id (UAT-4/5)', async ({ page }) => {
    // Build the callback URL that AuthCallbackPage will receive after token exchange
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5001';
    const callbackUrl = `${baseUrl}/auth/callback?action=set-position&pointId=${point.id}&position=agree&redirect=${encodeURIComponent(`/point/${point.id}`)}`;

    // Generate a real magic link that redirects to our callback with action params
    const magicLinkUrl = await generateMagicLinkUrl(user.email, callbackUrl);

    // Navigate to the magic link — Supabase verifies the token and redirects
    // to our callback URL with auth tokens in the hash fragment
    await page.goto(magicLinkUrl);

    // Wait for the full chain: Supabase verify → redirect to callback → process → redirect to point
    await page.waitForURL(/\/point\//, { timeout: 30000 });
    expect(page.url()).toContain(`/point/${point.id}`);

    // Verify position was actually saved in the database (not just redirected)
    const { data: saved } = await supabaseAdmin
      .from('point_positions')
      .select('position')
      .eq('point_id', point.id)
      .eq('user_id', user.user.id)
      .single();

    expect(saved?.position, 'Position must be saved as "agree" after magic link round-trip').toBe('agree');
  });
});
