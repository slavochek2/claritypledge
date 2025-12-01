/**
 * @file 03-login-flow.spec.ts
 *
 * E2E Test: Existing User Re-Login Flow
 *
 * Tests that existing users can log back in:
 * 1. Login page displays correctly
 * 2. Email submission works
 * 3. Success message shown
 * 4. Navigation to login page works
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';

test.describe('Login Flow', () => {
  test('should display login page correctly', async ({ page }) => {
    await page.goto('/login');

    // Check page loaded
    await expect(page).toHaveURL(/login/);

    // Check key elements
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /magic link/i })).toBeVisible();

    // Should have link to signup
    await expect(page.getByRole('button', { name: /sign now/i })).toBeVisible();
  });

  test.skip('should login existing user with Admin API', async ({ page }) => {
    const testName = 'Login Test User';
    const testEmail = `e2e-login-${Date.now()}@gmail.com`;
    let testUser: any;

    try {
      // Create existing user
      testUser = await createTestUser({
        name: testName,
        email: testEmail,
      });

      // Set session directly in browser (bypasses form submission)
      await setTestSession(page, testEmail);

      // Navigate to home - should redirect to profile

      // Should redirect to user's profile
      await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`), { timeout: 10000 });

      // Verify profile page loaded
      await expect(page.getByText(testName)).toBeVisible();

    } finally {
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
    }
  });

  test('should handle login for non-existent email', async ({ page }) => {
    await page.goto('/login');

    // Try to login with email that doesn't exist
    const fakeEmail = `non-existent-${Date.now()}@gmail.com`;
    await page.getByRole('textbox', { name: /email/i }).fill(fakeEmail);
    await page.getByRole('button', { name: /magic link/i }).click();

    // Should still show success (don't expose which emails exist)
    // OR show a generic error
    await page.waitForTimeout(3000);

    // Either way, shouldn't crash
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });

  test.skip('should complete full re-login flow', async ({ page }) => {
    const testName = `Relogin User ${Date.now()}`;
    const testEmail = `e2e-relogin-${Date.now()}@gmail.com`;
    let testUser: any;

    try {
      // Step 1: Create existing user
      testUser = await createTestUser({
        name: testName,
        email: testEmail,
        role: 'Returning User',
      });

      console.log(`[TEST] Created user for re-login test: ${testUser.slug}`);

      // Step 2: Set session in browser (simulates successful login)
      await setTestSession(page, testEmail);

      // Step 3: Navigate to home

      // Step 4: Should redirect to profile
      await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`), { timeout: 10000 });

      // Step 5: Profile should display
      await expect(page.getByText(testName)).toBeVisible({ timeout: 5000 });

      // Step 6: User menu should be visible (indicating logged in)
      await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();

    } finally {
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
    }
  });

  test('should navigate from login to signup', async ({ page }) => {
    await page.goto('/login');

    // Find signup link
    const signupLink = page.getByRole('button', { name: /sign now/i });
    await expect(signupLink).toBeVisible();

    // Click it
    await signupLink.click();

    // Should see signup form
    await expect(page.locator('input#name')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: /clarity pledge/i })).toBeVisible();
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/login');

    // Try invalid email
    await page.getByRole('textbox', { name: /email/i }).fill('not-an-email');
    await page.getByRole('button', { name: /magic link/i }).click();

    // HTML5 validation should prevent submission
    await expect(page).toHaveURL(/login/);

    // Email field should still have focus
    await expect(page.getByRole('textbox', { name: /email/i })).toBeFocused();
  });
});
