/**
 * @file p414-smoke.spec.ts
 * @description Smoke tests for P414: Profile bio
 *
 * Fast regression: profile page and settings page load without errors.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

test.describe('P414 Smoke — Profile Bio', () => {
  test.setTimeout(30000);

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P414 Smoke User' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('profile page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P414 Smoke User')).toBeVisible({ timeout: 10000 });
    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('settings page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    await expect(page.getByLabel(/bio/i)).toBeVisible({ timeout: 10000 });
    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
