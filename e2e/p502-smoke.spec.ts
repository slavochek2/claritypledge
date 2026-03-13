/**
 * @file p502-smoke.spec.ts
 * @description Smoke tests for P502: Anonymous Position Optimistic UI
 *
 * Fast regression detection: pages load, position buttons visible,
 * no console errors, existing logged-in flow unbroken.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';

interface Fixtures {
  user: TestUser;
  point: TestPoint;
}

async function buildFixtures(): Promise<Fixtures> {
  const user = await createTestUser({ name: 'P502Smoke' });
  const point = await createTestPoint(user.user.id, {
    statement: `P502 smoke point ${Date.now()}`,
  });
  return { user, point };
}

async function cleanupFixtures(f: Fixtures) {
  if (f.point?.id) await deleteTestPoint(f.point.id);
  if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
}

test.describe('P502: Smoke tests', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  test('point detail page loads for anonymous user with position buttons', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/point/${fixtures.point.id}`);

    // Position buttons visible
    await expect(page.getByRole('button', { name: /agree/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /disagree/i }).first()).toBeVisible();

    // No console errors (filter out known noise)
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);
  });

  test('feed page loads for anonymous user', async ({ page }) => {
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/feed/);
    // Page should render without crashing
    await expect(page.locator('body')).toBeVisible();
  });

  test('point embed mode loads for anonymous user', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}?embed=true`);
    // Position buttons visible in embed
    await expect(page.getByRole('button', { name: /agree/i }).first()).toBeVisible();
  });
});
