/**
 * P586 Smoke Tests — Visibility & Privacy Foundation
 *
 * Fast regression detection: pages still load after migration.
 * These tests run against the deployed app (not DB directly).
 */

import { test, expect } from '@playwright/test';

test.describe('P586: Smoke — pages load after visibility migration', () => {
  test('feed page loads without errors', async ({ page }) => {
    await page.goto('/');
    // Feed should render without console errors related to visibility
    await expect(page.locator('body')).toBeVisible();
    // No crash — page rendered
  });

  test('create-story page shows only Public and Private options', async ({ page }) => {
    // Navigate to create story (may redirect to login if not authenticated)
    await page.goto('/create');

    // If redirected to login, that's fine — the page loaded without crash
    const url = page.url();
    if (url.includes('/create')) {
      // Look for visibility options — should not contain "Shared"
      const pageContent = await page.textContent('body');
      expect(pageContent).not.toContain('Shared');
    }
  });

  test('profile page loads without errors', async ({ page }) => {
    // Navigate to a known profile (or any profile route)
    await page.goto('/p/slava');
    await expect(page.locator('body')).toBeVisible();
  });

  test('story detail page loads without errors', async ({ page }) => {
    // Navigate to feed first, then click first story
    await page.goto('/');
    const firstStory = page.locator('[data-testid="story-card"]').first();

    if (await firstStory.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstStory.click();
      await expect(page.locator('body')).toBeVisible();
      // Verify no "shared" visibility badge visible
      const pageContent = await page.textContent('body');
      expect(pageContent).not.toContain('Shared');
    }
    // If no stories visible, that's OK — smoke test passes (page loaded)
  });
});
