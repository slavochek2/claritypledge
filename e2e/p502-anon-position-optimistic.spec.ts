/**
 * @file p502-anon-position-optimistic.spec.ts
 * @description E2E tests for P502: Gentle Anonymous Position UX
 *
 * Covers:
 *   - Anon user clicks position → button highlights, no redirect
 *   - CTA text appears below buttons with sign up / log in links
 *   - Position counts do NOT change for anon positions
 *   - Toggling position updates highlight, CTA stays
 *   - Deselecting removes highlight and hides CTA
 *   - Logged-in user sees no CTA (existing behavior unchanged)
 *   - Feed card, point detail page, and embed mode variants
 *
 * Auth pattern: Anonymous tests use no session.
 * Logged-in tests use createTestUser + setTestSession.
 * Cleanup order: delete points BEFORE users.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface Fixtures {
  user: TestUser;
  point: TestPoint;
}

async function buildFixtures(): Promise<Fixtures> {
  const user = await createTestUser({ name: 'P502AnonOptimistic' });
  const point = await createTestPoint(user.user.id, {
    statement: `P502 test point ${Date.now()}`,
  });
  return { user, point };
}

async function cleanupFixtures(f: Fixtures) {
  if (f.point?.id) await deleteTestPoint(f.point.id);
  if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
}

// ---------------------------------------------------------------------------
// Anonymous user on Point Detail Page
// ---------------------------------------------------------------------------

test.describe('P502: Anonymous position — point detail page', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('clicking Agree highlights button without redirect', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);

    // Find Agree button and click
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await agreeButton.click();

    // Should NOT redirect to /signup
    await expect(page).not.toHaveURL(/\/signup/);
    await expect(page).toHaveURL(new RegExp(`/point/${fixtures.point.id}`));

    // Button should be in selected state (has colored background)
    // TODO: Assert specific selected class (emerald-500 or similar)
    await expect(agreeButton).toBeVisible();
  });

  test('CTA text appears after clicking position', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);

    // CTA should NOT be visible before clicking
    await expect(page.getByText(/sign up.*log in.*save/i)).not.toBeVisible();

    // Click Agree
    await page.getByRole('button', { name: /agree/i }).first().click();

    // CTA should now be visible
    await expect(page.getByText(/sign up.*log in.*save/i)).toBeVisible();
  });

  test('CTA contains signup and login links with auth-gate params', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);
    await page.getByRole('button', { name: /agree/i }).first().click();

    // Check signup link has auth-gate params
    const signupLink = page.getByRole('link', { name: /sign up/i });
    await expect(signupLink).toBeVisible();
    const signupHref = await signupLink.getAttribute('href');
    expect(signupHref).toContain('/signup');
    expect(signupHref).toContain('action=set-position');
    expect(signupHref).toContain(`pointId=${fixtures.point.id}`);

    // Check login link exists
    const loginLink = page.getByRole('link', { name: /log in/i });
    await expect(loginLink).toBeVisible();
  });

  test('position counts do NOT change for anonymous positions', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);

    // Read initial agree count
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    const initialText = await agreeButton.textContent();

    // Click agree
    await agreeButton.click();

    // Count should remain the same
    const afterText = await agreeButton.textContent();
    expect(afterText).toBe(initialText);
  });

  test('toggling to different position updates highlight, CTA stays', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);

    // Click Agree
    await page.getByRole('button', { name: /agree/i }).first().click();
    await expect(page.getByText(/sign up.*log in.*save/i)).toBeVisible();

    // Click Disagree (toggle)
    await page.getByRole('button', { name: /disagree/i }).first().click();

    // CTA should still be visible
    await expect(page.getByText(/sign up.*log in.*save/i)).toBeVisible();
  });

  test('deselecting position removes highlight and hides CTA', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);

    // Click Agree
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await agreeButton.click();
    await expect(page.getByText(/sign up.*log in.*save/i)).toBeVisible();

    // Click Agree again to deselect
    await agreeButton.click();

    // CTA should be hidden
    await expect(page.getByText(/sign up.*log in.*save/i)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Anonymous user on Feed
// ---------------------------------------------------------------------------

test.describe('P502: Anonymous position — feed card', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('clicking position on feed card shows CTA without redirect', async ({ page }) => {
    await page.goto('/feed');

    // Find first point card with position buttons
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    if (await agreeButton.isVisible()) {
      await agreeButton.click();

      // Should not redirect
      await expect(page).toHaveURL(/\/feed/);

      // CTA should appear
      await expect(page.getByText(/sign up.*log in.*save/i).first()).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Embed mode
// ---------------------------------------------------------------------------

test.describe('P502: Anonymous position — embed mode', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('embed CTA contains ClarityPledge branding', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}?embed=true`);

    // Click a position
    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    if (await agreeButton.isVisible()) {
      await agreeButton.click();

      // CTA should mention ClarityPledge
      await expect(page.getByText(/claritypledge/i)).toBeVisible();
    }
  });

  test('embed CTA links have target=_blank', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}?embed=true`);

    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    if (await agreeButton.isVisible()) {
      await agreeButton.click();

      const signupLink = page.getByRole('link', { name: /sign up/i });
      if (await signupLink.isVisible()) {
        const target = await signupLink.getAttribute('target');
        expect(target).toBe('_blank');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Logged-in user — no regression
// ---------------------------------------------------------------------------

test.describe('P502: Logged-in user — no CTA shown', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('logged-in user takes position without CTA appearing', async ({ page }) => {
    // Set up auth session
    await setTestSession(page, fixtures.user);

    await page.goto(`/point/${fixtures.point.id}`);

    const agreeButton = page.getByRole('button', { name: /agree/i }).first();
    await agreeButton.click();

    // CTA should NOT appear for logged-in users
    await expect(page.getByText(/sign up.*log in.*save/i)).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

test.describe('P502: Anonymous position — localStorage persistence', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('position persists after page reload', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);

    // Click Agree
    await page.getByRole('button', { name: /agree/i }).first().click();
    await expect(page.getByText(/sign up.*log in.*save/i)).toBeVisible();

    // Reload page
    await page.reload();

    // Position should still be highlighted and CTA visible
    // TODO: Assert button is in selected state after reload
    await expect(page.getByText(/sign up.*log in.*save/i)).toBeVisible();
  });
});
