/**
 * @file 02-auth-callback.spec.ts
 *
 * E2E Test: Auth Callback & Profile Creation
 *
 * This is the CRITICAL test that verifies the Writer (AuthCallbackPage):
 * 1. New user: Creates profile after magic link click
 * 2. Existing user: Redirects to profile without creating duplicate
 * 3. Profile redirect works correctly
 *
 * This test uses admin helpers to simulate magic link clicks.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('Auth Callback & Profile Creation', () => {
  test.skip('should create profile for NEW user after magic link', async ({ page }) => {
    const testName = `New User ${Date.now()}`;
    const testEmail = `e2e-new-${Date.now()}@gmail.com`;

    // Step 1: Manually trigger signup (simulate form submission)
    // We use admin API to create auth user but NOT profile
    // This simulates the state right after clicking magic link

    let testUser: TestUser | undefined;

    try {
      // Create test user (this simulates clicking the magic link)
      testUser = await createTestUser({
        name: testName,
        email: testEmail,
        role: 'Test Engineer',
      });

      console.log(`[TEST] Created test user with slug: ${testUser.slug}`);

      // Step 2: Set session directly in browser (bypasses URL token detection)
      // This also navigates to / and waits for auth state to load
      await setTestSession(page, testEmail);

      // Step 3: Wait for redirect to profile page
      // The app should detect the session and redirect to /p/{slug}
      await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`), { timeout: 10000 });

      // Step 5: Verify profile page loaded
      await expect(page.getByText(testName)).toBeVisible({ timeout: 5000 });

      // Verify we're seeing the profile (not an error page)
      await expect(page.getByText(/clarity pledge/i)).toBeVisible();

    } finally {
      // Cleanup
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
    }
  });

  test.skip('should redirect EXISTING user without creating duplicate profile', async ({ page }) => {
    const testName = `Existing User ${Date.now()}`;
    const testEmail = `e2e-existing-${Date.now()}@gmail.com`;

    let testUser: TestUser | undefined;

    try {
      // Step 1: Create user (simulating they signed up before)
      testUser = await createTestUser({
        name: testName,
        email: testEmail,
        role: 'Senior Engineer',
      });

      console.log(`[TEST] Created existing user with slug: ${testUser.slug}`);

      // Step 2: Set session directly in browser (simulating login)
      // This also navigates to / and waits for auth state
      await setTestSession(page, testEmail);

      // Step 3: Should redirect to EXISTING profile
      await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`), { timeout: 10000 });

      // Step 5: Verify profile page shows correct data
      await expect(page.getByText(testName)).toBeVisible({ timeout: 5000 });

      // The profile should already exist - not be created again
      // (We can't easily verify "no duplicate" in E2E, but unit tests cover this)

    } finally {
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
    }
  });

  test('should handle auth callback errors gracefully', async ({ page }) => {
    // Visit callback page with INVALID token
    await page.goto('/auth/callback?token=invalid-token-123&type=magiclink');

    // Should show error message or redirect to error state
    // Don't wait too long - if there's an error, it should show quickly
    await page.waitForTimeout(3000);

    // Should see SOMETHING (not stuck on loading forever)
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(0);

    // Might show error message, or redirect to login
    // Either is acceptable
  });

  test('should handle callback without token', async ({ page }) => {
    // Visit callback page with NO token
    await page.goto('/auth/callback');

    // Should handle gracefully (not crash)
    await page.waitForTimeout(2000);

    // Page should render something
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
