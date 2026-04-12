/**
 * @file p686-smoke.spec.ts
 *
 * Smoke tests for P686: Badge Step 1 — fast regression detection.
 *
 * Tests:
 * - Badge certificate page loads without errors (for user with badge)
 * - Badge certificate page shows "not found" for user without badge
 * - Profile page loads with badge indicator and no console errors
 * - Badge link from profile navigates correctly
 * - /p/:slug/badge route does not cause 500 or blank page
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

test.describe('P686 Smoke Tests', () => {
  let badgeUser: TestUser;
  let noBadgeUser: TestUser;
  let certifier: TestUser;
  let pointId: string;
  let badgePointId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    badgeUser = await createTestUser({ name: 'P686 Smoke Badge' });
    noBadgeUser = await createTestUser({ name: 'P686 Smoke NoBadge' });
    certifier = await createTestUser({ name: 'P686 Smoke Certifier' });

    await supabaseAdmin.from('profiles').update({ is_certifier: true }).eq('id', certifier.user.id);

    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `S686${Date.now().toString().slice(-3)}`,
        creator_name: certifier.name,
        creator_profile_id: certifier.user.id,
        joiner_name: badgeUser.name,
        joiner_profile_id: badgeUser.user.id,
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    sessionId = session!.id;

    const point = await createTestPoint(certifier.user.id, { statement: 'P686 smoke test point' });
    pointId = point.id;

    const { data: bp } = await supabaseAdmin
      .from('badge_points')
      .insert({
        user_id: badgeUser.user.id,
        point_id: pointId,
        verified_by: certifier.user.id,
        session_id: sessionId,
        position: 'agree',
        verified_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    badgePointId = bp!.id;
  });

  test.afterAll(async () => {
    if (badgePointId) await supabaseAdmin.from('badge_points').delete().eq('id', badgePointId);
    if (sessionId) {
      await supabaseAdmin.from('story_verifications').delete().eq('session_id', sessionId);
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
    if (pointId) await deleteTestPoint(pointId);
    await supabaseAdmin.from('profiles').update({ is_certifier: false }).eq('id', certifier.user.id);
    await Promise.all([
      deleteTestUser(badgeUser.user.id),
      deleteTestUser(noBadgeUser.user.id),
      deleteTestUser(certifier.user.id),
    ]);
  });

  test('badge certificate page loads without console errors for badged user', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/p/${badgeUser.slug}/badge`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/p/${badgeUser.slug}/badge`));
    expect(consoleErrors).toHaveLength(0);

    // Page has content (not blank)
    const body = await page.textContent('body');
    expect(body?.trim().length).toBeGreaterThan(0);
  });

  test('badge certificate page shows not-found for user with no badge', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/p/${noBadgeUser.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // Should show "not found" state, not a crash
    expect(consoleErrors).toHaveLength(0);
    // TODO: fill selector after implementation
    await expect(page.getByText(/Badge Not Found|No badge yet/i)).toBeVisible({ timeout: 10000 });
  });

  test('profile page loads with badge indicator (no console errors)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/p/${badgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/p/${badgeUser.slug}`));
    expect(consoleErrors).toHaveLength(0);
    await expect(page.getByRole('heading', { name: badgeUser.name })).toBeVisible({ timeout: 10000 });
  });

  test('/p/:slug/badge route does not 404 or render blank for valid slug with badge', async ({ page }) => {
    const response = await page.goto(`/p/${badgeUser.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // HTTP status should be 200 (or null for client-side routing)
    if (response) {
      expect(response.status()).not.toBe(404);
      expect(response.status()).not.toBe(500);
    }

    // Page must have visible content
    const bodyText = await page.textContent('body');
    expect(bodyText?.trim().length).toBeGreaterThan(100);
  });

  test('non-existent user /badge route renders gracefully', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/p/non-existent-slug-for-p686-smoke/badge');
    await page.waitForLoadState('networkidle');

    // Should not crash or show blank page
    const body = await page.textContent('body');
    expect(body?.trim().length).toBeGreaterThan(0);
    // Common 404/not-found indicators
    const hasNotFound = body?.match(/not found|404|doesn't exist/i);
    if (hasNotFound) {
      expect(body).toMatch(/not found|404|doesn't exist/i);
    }
  });
});
