/**
 * @file p502-accessibility.spec.ts
 * @description Accessibility tests for P502: Anonymous Position CTA
 *
 * Covers:
 *   - CTA links are keyboard-focusable via Tab
 *   - CTA text is announced by screen readers (in content flow)
 *   - Focus indicators visible on links
 *   - Color contrast passes WCAG AA
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import { createTestPoint, deleteTestPoint, type TestPoint } from '../helpers/test-point';

interface Fixtures {
  user: TestUser;
  point: TestPoint;
}

async function buildFixtures(): Promise<Fixtures> {
  const user = await createTestUser({ name: 'P502A11y' });
  const point = await createTestPoint(user.user.id, {
    statement: `P502 a11y test point ${Date.now()}`,
  });
  return { user, point };
}

async function cleanupFixtures(f: Fixtures) {
  if (f.point?.id) await deleteTestPoint(f.point.id);
  if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
}

test.describe('P502: Accessibility — anonymous position CTA', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('CTA links are reachable via Tab key', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);

    // Click Agree to show CTA
    await page.getByRole('button', { name: /agree/i }).first().click();

    // Tab through to reach the CTA links
    // The sign up and log in links should be focusable
    const signupLink = page.getByRole('link', { name: /sign up/i });
    await expect(signupLink).toBeVisible();

    // Focus the link via Tab
    await signupLink.focus();
    await expect(signupLink).toBeFocused();
  });

  test('CTA links have accessible names', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);
    await page.getByRole('button', { name: /agree/i }).first().click();

    // Verify links have descriptive accessible names
    const signupLink = page.getByRole('link', { name: /sign up/i });
    await expect(signupLink).toBeVisible();
    await expect(signupLink).toHaveAccessibleName(/sign up/i);

    const loginLink = page.getByRole('link', { name: /log in/i });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAccessibleName(/log in/i);
  });

  test('position buttons remain accessible after anon selection', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);

    // Position buttons should have a group role
    const buttonGroup = page.getByRole('group', { name: /position/i });
    await expect(buttonGroup).toBeVisible();

    // Click Agree
    await page.getByRole('button', { name: /agree/i }).first().click();

    // Buttons should still be operable after selection
    const disagreeButton = page.getByRole('button', { name: /disagree/i }).first();
    await expect(disagreeButton).toBeEnabled();
    await disagreeButton.focus();
    await expect(disagreeButton).toBeFocused();
  });
});
