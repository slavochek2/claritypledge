/**
 * @file p686-badge-certificate.spec.ts
 *
 * E2E tests for P686: Badge certificate page (/p/:slug/badge)
 *
 * Tests:
 * - Page loads for user with badge points
 * - Progress bar shows correct N/9
 * - Verified points with dates, unverified points muted
 * - Certifier name links to their profile
 * - Point titles link to point detail pages
 * - Owner sees share controls + "Your Badge" banner
 * - 0 badge points → "Badge Not Found" (not-found screen)
 * - OG tags render correct meta preview content
 *
 * TODO: Update selectors once certificate page component is built.
 * Selectors marked with "// TODO: fill selector after implementation"
 * use text-based fallbacks that should work for most cases.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

const TOTAL_BADGE_POINTS = 9;

test.describe('P686: Badge certificate page', () => {
  test.describe.configure({ timeout: 40000 });

  let earner: TestUser;
  let certifier: TestUser;
  let unrelatedUser: TestUser;
  const pointIds: string[] = [];
  let sessionId: string;
  const badgePointIds: string[] = [];

  test.beforeAll(async () => {
    earner = await createTestUser({ name: 'P686 Cert Earner' });
    certifier = await createTestUser({ name: 'P686 Cert Certifier' });
    unrelatedUser = await createTestUser({ name: 'P686 Cert Visitor' });

    // Mark certifier
    await supabaseAdmin.from('profiles').update({ is_certifier: true }).eq('id', certifier.user.id);

    // Seed a stub session
    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `TC686${Date.now().toString().slice(-3)}`,
        creator_name: certifier.name,
        creator_profile_id: certifier.user.id,
        joiner_name: earner.name,
        joiner_profile_id: earner.user.id,
        live_state: { checksCount: 0 },
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    sessionId = session!.id;

    // Seed 3 badge points (partial progress: 3/9)
    for (let i = 0; i < 3; i++) {
      const point = await createTestPoint(certifier.user.id, {
        statement: `P686 certificate test point ${i + 1}`,
      });
      pointIds.push(point.id);

      const { data: bp } = await supabaseAdmin
        .from('badge_points')
        .insert({
          user_id: earner.user.id,
          point_id: point.id,
          verified_by: certifier.user.id,
          session_id: sessionId,
          position: 'agree',
          verified_at: new Date(Date.now() - i * 86400000).toISOString(), // staggered dates
        })
        .select('id')
        .single();
      badgePointIds.push(bp!.id);
    }
  });

  test.afterAll(async () => {
    // Cleanup: badge_points → session → points → users
    if (badgePointIds.length > 0) {
      await supabaseAdmin.from('badge_points').delete().in('id', badgePointIds);
    }
    if (sessionId) {
      await supabaseAdmin.from('story_verifications').delete().eq('session_id', sessionId);
      await supabaseAdmin.from('clarity_sessions').delete().eq('id', sessionId);
    }
    for (const pid of pointIds) await deleteTestPoint(pid);
    await supabaseAdmin.from('profiles').update({ is_certifier: false }).eq('id', certifier.user.id);
    await Promise.all([
      deleteTestUser(earner.user.id),
      deleteTestUser(certifier.user.id),
      deleteTestUser(unrelatedUser.user.id),
    ]);
  });

  test('badge certificate page loads for user with badge points', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/p/${earner.slug}/badge`));
    // Page should contain certificate heading
    await expect(page.getByText(/CLARITY BADGE/i)).toBeVisible({ timeout: 10000 });
  });

  test('progress bar shows correct N/9 count', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // Expect "3 / 9" hero display (3 badge points seeded; P873 hero format includes spaces)
    await expect(page.getByText(`3 / ${TOTAL_BADGE_POINTS}`)).toBeVisible({ timeout: 10000 });

    // Progress bar element exists with correct aria attributes
    // TODO: fill selector after implementation — exact aria-valuenow may differ
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeAttached({ timeout: 5000 });
    const valueNow = await progressBar.getAttribute('aria-valuenow');
    expect(Number(valueNow)).toBe(3);
    const valueMax = await progressBar.getAttribute('aria-valuemax');
    expect(Number(valueMax)).toBe(9);
  });

  test('verified points show with titles and dates', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // All 3 seeded points should appear as verified
    for (let i = 0; i < 3; i++) {
      await expect(
        page.getByText(`P686 certificate test point ${i + 1}`)
      ).toBeVisible({ timeout: 10000 });
    }

    // Verified points should show dates (format: e.g., "Apr 10, 2026")
    // TODO: fill selector after implementation — exact date format depends on component
    const verifiedDatePattern = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/;
    const dateEl = page.locator('text=' + verifiedDatePattern).first();
    await expect(dateEl).toBeAttached({ timeout: 5000 });
  });

  test('certifier name links to their profile', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // Certifier name should be visible as a link
    // TODO: fill selector after implementation — exact copy matches spec "Verified by [Name]."
    const certifierLink = page.getByRole('link', { name: certifier.name });
    await expect(certifierLink).toBeVisible({ timeout: 10000 });
    const href = await certifierLink.getAttribute('href');
    expect(href).toContain(`/p/${certifier.slug}`);
  });

  test('verified point titles link to point detail pages', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // First verified point title should link to /point/:id
    const firstPointLink = page.getByRole('link', { name: 'P686 certificate test point 1' });
    await expect(firstPointLink).toBeVisible({ timeout: 10000 });
    const href = await firstPointLink.getAttribute('href');
    expect(href).toMatch(/\/point\//);
  });

  test('owner sees "Your Badge" banner and share controls', async ({ page }) => {
    await setTestSession(page, earner.email);
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // Owner banner: "Your Badge"
    // TODO: fill selector after implementation
    await expect(page.getByText(/Your Badge/i)).toBeVisible({ timeout: 10000 });

    // Share controls: copy link, LinkedIn, WhatsApp, export image
    await expect(page.getByRole('button', { name: /share|copy link/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('visitor does NOT see share controls / owner banner', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // Owner banner should not appear for visitors
    await expect(page.getByText(/Your Badge/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('user with 0 badge points gets not-found screen', async ({ page }) => {
    await page.goto(`/p/${unrelatedUser.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation — "Badge Not Found" screen copy
    await expect(page.getByText(/Badge Not Found|No badge yet/i)).toBeVisible({ timeout: 10000 });
    // Certificate content must not appear
    await expect(page.getByText(/CLARITY BADGE/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('OG meta tags contain correct badge preview content', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // OG title should mention badge and N/9
    const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content');
    expect(ogTitle).toBeTruthy();
    // Must mention either the earner's name or "Clarity Badge"
    expect(ogTitle).toMatch(new RegExp(`${earner.name}|Clarity Badge`, 'i'));

    // OG description should mention points count
    const ogDesc = await page.getAttribute('meta[property="og:description"]', 'content');
    if (ogDesc) {
      // "calibrated on 3 of 9" or similar
      expect(ogDesc).toMatch(/3|clarity/i);
    }
  });

  test('back link navigates to profile page', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    const backLink = page.getByRole('link', { name: /back/i })
      .or(page.locator('[aria-label*="back" i]'))
      .first();
    await expect(backLink).toBeAttached({ timeout: 10000 });
    await backLink.click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(new RegExp(`/p/${earner.slug}`));
  });
});
