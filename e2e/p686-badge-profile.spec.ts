/**
 * @file p686-badge-profile.spec.ts
 *
 * E2E tests for P686: Profile badge display
 *
 * Tests:
 * - Checkmark appears on avatar when user has ≥1 badge point
 * - No checkmark when 0 badge points
 * - "See their badge (N/9)" link appears when user has badge
 * - Badge link navigates to /p/:slug/badge
 * - Both pledge ring AND badge checkmark coexist
 * - Owner sees "My badge (N/9)" (not "Their badge")
 * - Visitor sees "See their badge (N/9)"
 *
 * TODO: Update selectors once profile component is built.
 * hasBadge prop on GravatarAvatar and navigation cluster are
 * specified in UX Design section of the spec.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

const TOTAL_BADGE_POINTS = 9;

test.describe('P686: Profile badge display', () => {
  test.describe.configure({ timeout: 40000 });

  let badgeUser: TestUser;
  let noBadgeUser: TestUser;
  let certifier: TestUser;
  let pointId: string;
  let badgePointId: string;
  let sessionId: string;
  let pledgeUser: TestUser; // user with BOTH pledge and badge
  let pledgeBadgePointId: string;
  let pledgePointId: string;

  test.beforeAll(async () => {
    badgeUser = await createTestUser({ name: 'P686 Profile Badge User' });
    noBadgeUser = await createTestUser({ name: 'P686 Profile No Badge' });
    certifier = await createTestUser({ name: 'P686 Profile Certifier' });
    pledgeUser = await createTestUser({ name: 'P686 Pledge And Badge' });

    await supabaseAdmin.from('profiles').update({ is_certifier: true }).eq('id', certifier.user.id);

    // Create stub session
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `TP686${Date.now().toString().slice(-3)}`,
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

    // Seed badge point for badgeUser
    const point = await createTestPoint(certifier.user.id, { statement: 'P686 profile test point' });
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

    // Seed pledgeUser with BOTH a pledge (has_pledged = true) AND a badge point
    await supabaseAdmin.from('profiles')
      .update({ has_pledged: true })
      .eq('id', pledgeUser.user.id);

    const pledgePoint = await createTestPoint(certifier.user.id, { statement: 'P686 pledge+badge point' });
    pledgePointId = pledgePoint.id;
    const { data: pbp } = await supabaseAdmin
      .from('badge_points')
      .insert({
        user_id: pledgeUser.user.id,
        point_id: pledgePointId,
        verified_by: certifier.user.id,
        session_id: sessionId,
        position: 'strongly_agree',
        verified_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    pledgeBadgePointId = pbp!.id;
  });

  test.afterAll(async () => {
    if (badgePointId) await supabaseAdmin.from('badge_points').delete().eq('id', badgePointId);
    if (pledgeBadgePointId) await supabaseAdmin.from('badge_points').delete().eq('id', pledgeBadgePointId);
    if (sessionId) {
      await supabaseAdmin.from('story_verifications').delete().eq('session_id', sessionId);
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
    if (pointId) await deleteTestPoint(pointId);
    if (pledgePointId) await deleteTestPoint(pledgePointId);
    await supabaseAdmin.from('profiles').update({ has_pledged: false }).eq('id', pledgeUser.user.id);
    await supabaseAdmin.from('profiles').update({ is_certifier: false }).eq('id', certifier.user.id);
    await Promise.all([
      deleteTestUser(badgeUser.user.id),
      deleteTestUser(noBadgeUser.user.id),
      deleteTestUser(certifier.user.id),
      deleteTestUser(pledgeUser.user.id),
    ]);
  });

  test('checkmark appears on avatar when user has ≥1 badge point', async ({ page }) => {
    await page.goto(`/p/${badgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation — hasBadge prop renders checkmark icon at avatar bottom-right
    const checkmark = page
      .locator('[aria-label*="badge" i], [data-badge="true"], [class*="badge-check"]')
      .first();
    await expect(checkmark).toBeAttached({ timeout: 10000 });
    await expect(checkmark).toBeVisible({ timeout: 5000 });
  });

  test('no checkmark on avatar when user has 0 badge points', async ({ page }) => {
    await page.goto(`/p/${noBadgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: noBadgeUser.name })).toBeVisible({ timeout: 10000 });

    // TODO: fill selector after implementation
    const checkmark = page
      .locator('[aria-label*="badge" i], [data-badge="true"], [class*="badge-check"]')
      .first();
    await expect(checkmark).not.toBeAttached({ timeout: 3000 });
  });

  test('visitor sees "See their badge (N/9)" link when user has badge', async ({ page }) => {
    await page.goto(`/p/${badgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation — navigation cluster badge link
    const badgeLink = page.getByText(new RegExp(`See their badge.*\\d+/${TOTAL_BADGE_POINTS}`, 'i'))
      .or(page.getByText(new RegExp(`badge.*1/${TOTAL_BADGE_POINTS}`, 'i')));
    await expect(badgeLink.first()).toBeVisible({ timeout: 10000 });
  });

  test('badge link navigates to /p/:slug/badge', async ({ page }) => {
    await page.goto(`/p/${badgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation
    const badgeLink = page.getByRole('link', { name: new RegExp(`badge.*1/${TOTAL_BADGE_POINTS}`, 'i') })
      .or(page.getByRole('link', { name: /See their badge/i }))
      .first();

    await expect(badgeLink).toBeAttached({ timeout: 10000 });
    const href = await badgeLink.getAttribute('href');
    expect(href).toContain(`/p/${badgeUser.slug}/badge`);
  });

  test('owner sees "My badge (N/9)" instead of "See their badge"', async ({ page }) => {
    await setTestSession(page, badgeUser.email);
    await page.goto(`/p/${badgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation
    await expect(page.getByText(/My badge.*\d+\/9/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/See their badge/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('pledge ring and badge checkmark coexist (both states visible)', async ({ page }) => {
    await page.goto(`/p/${pledgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Pledge ring (blue ring — existing isPledger indicator)
    // TODO: fill selector after implementation — pledge ring has data-pledger or class*="ring"
    const pledgeRing = page.locator('[data-pledger="true"], [class*="pledge-ring"], [aria-label*="pledge" i]').first();
    await expect(pledgeRing).toBeAttached({ timeout: 10000 });

    // Badge checkmark
    const checkmark = page.locator('[aria-label*="badge" i], [data-badge="true"], [class*="badge-check"]').first();
    await expect(checkmark).toBeAttached({ timeout: 10000 });
  });

  test('user with neither pledge nor badge shows no badge link', async ({ page }) => {
    await page.goto(`/p/${noBadgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: noBadgeUser.name })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/See their badge/i)).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/My badge/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('clicking avatar checkmark navigates to badge certificate page', async ({ page }) => {
    await page.goto(`/p/${badgeUser.slug}`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation — checkmark is a clickable link/anchor
    const checkmark = page.locator('a[href*="/badge"], [data-badge="true"]').first();
    await expect(checkmark).toBeAttached({ timeout: 10000 });
    await checkmark.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/p/${badgeUser.slug}/badge`));
  });

  test('no badge link shown on profile of user without badge (clean state)', async ({ page }) => {
    await page.goto(`/p/${certifier.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: certifier.name })).toBeVisible({ timeout: 10000 });
    // Certifier has is_certifier=true but NO badge_points themselves
    await expect(page.getByText(/See their badge/i)).not.toBeVisible({ timeout: 3000 });
  });
});
