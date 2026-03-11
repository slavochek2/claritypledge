/**
 * @file p491-feed-smoke.spec.ts
 * @description P491: Smoke tests for the /feed page — verifies route loads,
 * no JS crashes, key UI elements present.
 *
 * Pattern: Navigate → check no console errors → check key content visible
 */

import { test, expect } from '@playwright/test';

test.describe('P491: Feed Page Smoke Tests', () => {
  test('feed page loads without JS errors (anonymous)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);

    // Feed page should have the "Feed" heading
    await expect(page.getByRole('heading', { name: /feed/i })).toBeVisible();
  });

  test('feed page shows Points and Stories tabs', async ({ page }) => {
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: /points/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /stories/i })).toBeVisible();
  });

  test('feed page with tag filter loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/feed?tag=fundraising');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);

    // Should show the active tag filter or empty state with tag name
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain('fundraising');
  });

  test('feed page with stories tab loads without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/feed?tab=stories');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);

    // Stories tab should be active
    const storiesTab = page.getByRole('tab', { name: /stories/i });
    await expect(storiesTab).toHaveAttribute('aria-selected', 'true');
  });

  test('/feed is accessible to anonymous users (no auth gate)', async ({ page }) => {
    // Ensure no redirect to login
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Should stay on /feed (not redirected to /auth/login)
    expect(page.url()).toContain('/feed');
  });
});
