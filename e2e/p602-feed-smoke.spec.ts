/**
 * @file p602-feed-smoke.spec.ts
 * Smoke tests for P602: Verify feed page loads with new filter controls.
 */

import { test, expect } from '@playwright/test';

test.describe('P602: Feed Smoke Tests', () => {
  test('feed page loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/feed');
    await page.waitForSelector('[role="tabpanel"]');

    // No console errors
    expect(consoleErrors).toHaveLength(0);

    // Main heading visible
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

    // Tab bar visible
    await expect(page.getByRole('tab', { name: 'Points' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Stories' })).toBeVisible();
  });

  test('feed with multi-tag URL loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/feed?tag=understanding,motivation&sort=oldest&version=latest');
    await page.waitForSelector('[role="tabpanel"]');

    expect(consoleErrors).toHaveLength(0);
  });
});
