/**
 * @file live-page-auth-gate.spec.ts
 * @description P66: Auth gate tests for /live page
 *
 * Tests verify:
 * 1. Guests on /live are redirected to /signup
 * 2. Guests with join code (/live/ABC123) can still join
 * 3. Logged-in users can access /live and host meetings
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('P66: Live Page Auth Gate', () => {
  test.describe('Guest User (not logged in)', () => {
    test('redirects to /signup when visiting /live without join code', async ({ page }) => {
      // Guest visits /live directly
      await page.goto('/live');

      // Should be redirected to /signup
      await expect(page).toHaveURL('/signup');
    });

    test('can access /live/:code with a join code (invited guest)', async ({ page }) => {
      // Guest visits with a join code - should NOT be redirected
      // Using a fake code - the page will show "session not found" but won't redirect
      await page.goto('/live/TEST123');

      // Should stay on /live/TEST123 (not redirected to /signup)
      await expect(page).toHaveURL('/live/TEST123');

      // Should see the join form heading (even if session doesn't exist)
      await expect(page.getByRole('heading', { name: 'Join Clarity Meeting' })).toBeVisible();
    });
  });

  test.describe('Logged-in User', () => {
    let testUser: TestUser;

    test.beforeEach(async () => {
      // Create a test user for authenticated tests
      testUser = await createTestUser({ name: 'P66 Test User' });
    });

    test.afterEach(async () => {
      // Clean up test user
      if (testUser?.user?.id) {
        await deleteTestUser(testUser.user.id);
      }
    });

    test('can access /live and see hosting controls', async ({ page }) => {
      // Set up authenticated session
      await setTestSession(page, testUser.email);

      // Navigate to /live
      await page.goto('/live');

      // Should NOT be redirected - should stay on /live
      await expect(page).toHaveURL('/live');

      // Should see the "Start New Meeting" button (hosting control)
      const startButton = page.getByRole('button', { name: /new meeting/i });
      await expect(startButton).toBeVisible();
    });

    test('can also access /live/:code as logged-in user', async ({ page }) => {
      // Set up authenticated session
      await setTestSession(page, testUser.email);

      // Navigate to /live with a code
      await page.goto('/live/TEST456');

      // Should stay on the page (not redirected)
      await expect(page).toHaveURL('/live/TEST456');
    });
  });
});

test.describe('P66: Copy Updates', () => {
  test('navigation shows "Start a Clarity Meeting" (not "Try")', async ({ page }) => {
    await page.goto('/');

    // Check desktop navigation
    const navButton = page.locator('nav').getByRole('link', { name: /start a clarity meeting/i });
    await expect(navButton).toBeVisible();

    // Ensure old text is NOT present
    const oldText = page.locator('nav').getByRole('link', { name: /try a clarity meeting/i });
    await expect(oldText).not.toBeVisible();
  });
});
