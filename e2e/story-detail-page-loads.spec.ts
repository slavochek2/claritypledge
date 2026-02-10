/**
 * @file story-detail-page-loads.spec.ts
 * @description E2E test for P140 - Story detail page loading and refresh
 *
 * Regression test for bug where story pages failed to load after refresh
 * due to undefined setPositionLoading state variable.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';

test.describe('Story Detail Page - Basic Loading', () => {
  let testUser: TestUser;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'Test User' });
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('story page loads without errors after refresh', async ({ page }) => {
    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Create a story first
    await page.goto('/create');
    const storyContent = 'Test story for refresh validation';
    await page.locator('textarea#story-content').fill(storyContent);
    await page.getByRole('button', { name: /save story/i }).click();

    // Wait for redirect to story detail
    await expect(page).toHaveURL(/\/story\/[a-f0-9-]+/, { timeout: 15000 });

    // Verify initial load
    await expect(page.getByText(storyContent)).toBeVisible();

    // REFRESH the page (this is what triggered the P140 bug)
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should NOT show error message (regression check for P140)
    await expect(page.getByText('Failed to load story')).not.toBeVisible();

    // Should show story content
    await expect(page.getByText(storyContent)).toBeVisible();
  });

  test('story page with points loads correctly after refresh', async ({ page }) => {
    // Set up authenticated session
    await setTestSession(page, testUser.email);
    await page.waitForLoadState('networkidle');

    // Create a story with points
    await page.goto('/create');
    const storyContent = 'Story with points for position data loading test';
    await page.locator('textarea#story-content').fill(storyContent);
    await page.getByRole('button', { name: /save story/i }).click();

    await expect(page).toHaveURL(/\/story\/[a-f0-9-]+/, { timeout: 15000 });

    // Add a point (triggers position data fetching)
    const pointTextarea = page.locator('textarea[placeholder="State your point..."]');
    await pointTextarea.fill('Test point for position data');
    await page.getByRole('button', { name: /add point/i }).click();
    await expect(page.getByText('Test point for position data')).toBeVisible({ timeout: 20000 });

    // Refresh - this should trigger position data loading without errors
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should NOT show error (P140 bug was in position data loading code)
    await expect(page.getByText('Failed to load story')).not.toBeVisible();

    // Should show story and point
    await expect(page.getByText(storyContent)).toBeVisible();
    await expect(page.getByText('Test point for position data')).toBeVisible();
  });
});
