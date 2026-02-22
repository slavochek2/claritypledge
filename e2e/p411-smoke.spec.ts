/**
 * @file p411-smoke.spec.ts
 * @description Smoke tests for P411: Position breakdown — show linked stories per holder
 *
 * Fast regression tests: point detail page loads, no console errors,
 * position breakdown section renders.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';

test.describe('P411 Smoke — Point Detail Page', () => {
  test.describe.configure({ timeout: 30000 });

  let user: TestUser;
  let pointId: string;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P411 Smoke User' });
    const point = await createTestPoint(user.user.id, {
      statement: 'P411 smoke: knowledge workers should set their own hours',
    });
    pointId = point.id;
    await createTestPosition(pointId, user.user.id, 'agree');
  });

  test.afterAll(async () => {
    if (pointId) await deleteTestPoint(pointId);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('point detail page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Page should render (not 404/500)
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('P411 smoke: knowledge workers should set their own hours')).toBeVisible({
      timeout: 10000,
    });

    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('position breakdown section renders with filter tabs', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Filter tabs should be present
    await expect(page.getByText(/filter by position/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /agree/i }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /disagree/i }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /unsure/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('position holder appears in breakdown', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P411 Smoke User')).toBeVisible({ timeout: 10000 });
  });

  test('unknown point id shows not found state', async ({ page }) => {
    await page.goto('/point/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText(/not found/i).or(page.getByText(/point not found/i))
    ).toBeVisible({ timeout: 10000 });
  });
});
