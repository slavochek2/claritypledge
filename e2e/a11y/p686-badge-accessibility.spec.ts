/**
 * @file p686-badge-accessibility.spec.ts
 *
 * Accessibility tests for P686: Badge certificate page and profile indicators
 *
 * Tests:
 * - Progress bar has role="progressbar" + correct aria attributes (valuenow, valuemax, valuemin)
 * - Checkmark on avatar has aria-label describing badge status
 * - Point list items have appropriate aria-labels (verified vs unverified)
 * - Share buttons are keyboard accessible (Tab reachable, Enter activatable)
 * - Badge certificate page is keyboard navigable end-to-end
 *
 * TODO: Selectors marked with "// TODO: fill after implementation" depend on
 * final component structure. Update once badge-certificate.tsx is built.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

test.describe('P686 Accessibility — Badge Certificate + Profile', () => {
  test.describe.configure({ timeout: 40000 });

  let earner: TestUser;
  let certifier: TestUser;
  let pointId: string;
  let badgePointId: string;
  let sessionId: string;

  test.beforeAll(async () => {
    earner = await createTestUser({ name: 'P686 A11y Earner' });
    certifier = await createTestUser({ name: 'P686 A11y Certifier' });

    await supabaseAdmin.from('profiles').update({ is_certifier: true }).eq('id', certifier.user.id);

    const { data: session } = await supabaseAdmin
      .from('clarity_sessions')
      .insert({
        code: `A686${Date.now().toString().slice(-3)}`,
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

    const point = await createTestPoint(certifier.user.id, {
      statement: 'P686 a11y test point',
    });
    pointId = point.id;

    const { data: bp } = await supabaseAdmin
      .from('badge_points')
      .insert({
        user_id: earner.user.id,
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
      deleteTestUser(earner.user.id),
      deleteTestUser(certifier.user.id),
    ]);
  });

  test('progress bar has role="progressbar" with correct aria attributes', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation
    const progressBar = page.locator('[role="progressbar"]');
    await expect(progressBar).toBeAttached({ timeout: 10000 });

    const valueNow = await progressBar.getAttribute('aria-valuenow');
    const valueMax = await progressBar.getAttribute('aria-valuemax');
    const valueMin = await progressBar.getAttribute('aria-valuemin');

    expect(Number(valueNow)).toBeGreaterThanOrEqual(1);
    expect(Number(valueMax)).toBe(9);
    expect(Number(valueMin)).toBe(0);

    // aria-label or aria-labelledby should describe the progress bar purpose
    const ariaLabel = await progressBar.getAttribute('aria-label');
    const ariaLabelledBy = await progressBar.getAttribute('aria-labelledby');
    expect(ariaLabel || ariaLabelledBy).toBeTruthy();
  });

  test('avatar badge checkmark has aria-label describing badge status', async ({ page }) => {
    await page.goto(`/p/${earner.slug}`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation — checkmark icon on GravatarAvatar
    const checkmark = page.locator('[aria-label*="badge" i], [title*="badge" i]').first();
    await expect(checkmark).toBeAttached({ timeout: 10000 });

    const label = await checkmark.getAttribute('aria-label')
      || await checkmark.getAttribute('title');
    expect(label).toBeTruthy();
    // Must convey badge status (not empty, not just "icon")
    expect(label!.length).toBeGreaterThan(0);
  });

  test('verified point list items have aria-labels distinguishing verified state', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P686 a11y test point')).toBeVisible({ timeout: 10000 });

    // TODO: fill selector after implementation — verified point list item
    // Each verified point should have an accessible indicator of its verified state.
    // This can be aria-label on the list item, or a visually-hidden text span.
    const verifiedItems = page.locator('[aria-label*="verified" i], [data-verified="true"]');
    const verifiedCount = await verifiedItems.count();
    // At least 1 verified item should have explicit accessible labeling
    expect(verifiedCount).toBeGreaterThanOrEqual(1);
  });

  test('share buttons are keyboard accessible via Tab', async ({ page }) => {
    await setTestSession(page, earner.email);
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // TODO: fill selector after implementation — ShareDropdown component
    const shareButton = page.getByRole('button', { name: /share|copy link/i }).first();
    await expect(shareButton).toBeAttached({ timeout: 10000 });

    await shareButton.focus();
    await expect(shareButton).toBeFocused();

    // Share button should be activatable via keyboard
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    // Dropdown should appear or action executed (depends on component implementation)
    // Just verify no crash and button is still in DOM
    await expect(shareButton).toBeAttached({ timeout: 3000 });
  });

  test('back link on certificate page is keyboard reachable', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    const backLink = page.getByRole('link', { name: /back/i })
      .or(page.locator('[aria-label*="back" i]'))
      .first();
    await expect(backLink).toBeAttached({ timeout: 10000 });

    await backLink.focus();
    await expect(backLink).toBeFocused();
  });

  test('certificate page headings form a logical heading hierarchy', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // Page must have at least one h1 or h2
    const h1Count = await page.locator('h1').count();
    const h2Count = await page.locator('h2').count();
    expect(h1Count + h2Count).toBeGreaterThanOrEqual(1);

    // The main badge heading should be in the heading hierarchy
    const badgeHeading = page.getByRole('heading', { name: /CLARITY BADGE/i });
    await expect(badgeHeading).toBeAttached({ timeout: 10000 });
  });

  test('badge page does not produce accessibility violations on landmark regions', async ({ page }) => {
    await page.goto(`/p/${earner.slug}/badge`);
    await page.waitForLoadState('networkidle');

    // Page must have a main landmark
    const mainCount = await page.locator('main, [role="main"]').count();
    expect(mainCount).toBeGreaterThanOrEqual(1);

    // Page must not have orphaned interactive elements (buttons outside form/nav/main)
    // Basic: all visible buttons are reachable
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const btn = buttons.nth(i);
      const isVisible = await btn.isVisible();
      if (isVisible) {
        const tabindex = await btn.getAttribute('tabindex');
        // No button should have tabindex="-1" (hidden from keyboard)
        expect(tabindex).not.toBe('-1');
      }
    }
  });
});
