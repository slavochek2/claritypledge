/**
 * @file p279-smoke.spec.ts
 * @description Smoke tests for P279 — Profile Subject Position Visibility
 *
 * Fast regression detection: verifies cross-user profile visits load without errors
 * and the profile subject's position badge is rendered on the Points tab.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  createTestPoint,
  createTestPosition,
  deleteTestPoint,
  type TestPoint,
} from './helpers/test-point';

test.describe('P279 Smoke Tests', () => {
  let userA: TestUser;
  let userB: TestUser;
  let point: TestPoint;

  test.beforeEach(async () => {
    userA = await createTestUser({ name: 'P279 Smoke Subject' });
    userB = await createTestUser({ name: 'P279 Smoke Visitor' });
    point = await createTestPoint(userA.user.id, {
      statement: 'P279 smoke: point with position',
    });
    await createTestPosition(point.id, userA.user.id, 'disagree');
  });

  test.afterEach(async () => {
    if (point?.id) await deleteTestPoint(point.id);
    if (userA?.user?.id) {
      try { await deleteTestUser(userA.user.id); } catch { /* non-blocking */ }
    }
    if (userB?.user?.id) {
      try { await deleteTestUser(userB.user.id); } catch { /* non-blocking */ }
    }
  });

  test('cross-user profile visit loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, userB.email);
    await page.goto(`/p/${userA.slug}`);
    await page.waitForLoadState('networkidle');

    // Page loads at correct URL
    await expect(page).toHaveURL(new RegExp(`/p/${userA.slug}`));

    // Profile heading visible
    await expect(page.getByRole('heading', { name: userA.name })).toBeVisible();

    // No console errors
    expect(consoleErrors).toHaveLength(0);
  });

  test('Points tab shows position badge without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, userB.email);
    await page.goto(`/p/${userA.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // Point appears
    await expect(page.getByText('P279 smoke: point with position')).toBeVisible({ timeout: 10000 });

    // Profile subject's 'disagree' renders as "Disagrees" PositionBadge
    await expect(page.getByText('Disagrees').first()).toBeVisible({ timeout: 10000 });

    // No console errors
    expect(consoleErrors).toHaveLength(0);
  });
});
