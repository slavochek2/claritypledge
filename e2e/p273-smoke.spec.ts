/**
 * @file p273-smoke.spec.ts
 * @description Smoke tests for P273: Verification gate
 *
 * Fast regression checks — verifies that:
 * - The create-story page loads without errors for an authenticated user
 * - The story detail page loads without errors
 *
 * These run in CI on every push and catch regressions quickly.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';

test.describe('P273 Smoke: Verification gate pages load', () => {
  test.describe.configure({ timeout: 30000 });

  test('/create page loads without errors for authenticated user', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    try {
      testUser = await createTestUser({ name: 'P273 Smoke User' });
      await setTestSession(page, testUser.email);

      await page.goto('/create');
      await page.waitForLoadState('networkidle');

      // Page must render — a textarea or heading should be visible
      await expect(
        page.getByRole('textbox').first()
      ).toBeVisible({ timeout: 10000 });

      // No uncaught JS errors
      const appErrors = consoleErrors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  test('/story/:id page loads without errors', async ({ page }) => {
    let storyOwner: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    try {
      storyOwner = await createTestUser({ name: 'P273 Smoke Story Owner' });
      const story = await createTestStory(storyOwner.user.id, {
        content: 'P273 smoke test story',
      });
      storyId = story.id;

      await setTestSession(page, storyOwner.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Page must render without 404/500 text
      await expect(page.getByText(/page not found|server error/i)).not.toBeVisible();

      const appErrors = consoleErrors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      if (storyId) await deleteTestStory(storyId);
      if (storyOwner) await deleteTestUser(storyOwner.user.id);
    }
  });
});
