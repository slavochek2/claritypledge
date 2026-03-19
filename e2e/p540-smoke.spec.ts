/**
 * @file p540-smoke.spec.ts
 * @description Smoke tests for P540: Hyperlink Consistency
 *
 * Verifies all pages that render links still load without errors
 * after migrating from LinkedText to linkifyText.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';

test.describe('P540 — Smoke Tests', () => {
  test.setTimeout(30000);

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P540 Smoke User' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('profile page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
    await expect(page.locator('body')).not.toHaveText(/error/i);
  });

  test('settings page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    // Settings requires auth — but smoke test just checks page doesn't crash
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Page should load (may redirect to auth, which is fine)
    expect(errors).toHaveLength(0);
  });

  test('story creation page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
  });

  test('feed page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    expect(errors).toHaveLength(0);
  });
});
