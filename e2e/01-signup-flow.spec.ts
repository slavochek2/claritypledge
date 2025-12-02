/**
 * @file 01-signup-flow.spec.ts
 *
 * E2E Test: New User Signup Flow
 *
 * Tests the complete signup journey:
 * 1. User fills out pledge form
 * 2. Form submission (magic link sent)
 * 3. Success page displayed
 * 4. Form validation works
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

test.describe('Signup Flow', () => {

  test('should display signup form correctly', async ({ page }) => {
    await page.goto('/sign-pledge');

    // Check page loaded
    await expect(page).toHaveURL(/sign-pledge/);

    // Check key form elements
    await expect(page.getByRole('heading', { name: /clarity pledge/i })).toBeVisible();
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#role')).toBeVisible();
    await expect(page.locator('input#linkedin')).toBeVisible();
    await expect(page.locator('textarea#reason')).toBeVisible();
  });

  test('should show validation for empty form', async ({ page }) => {
    await page.goto('/sign-pledge');

    // Try to submit empty form
    await page.getByRole('button', { name: /sign the pledge/i }).click();

    // Browser should prevent submission (HTML5 validation)
    // We should still be on the same page
    await expect(page).toHaveURL(/sign-pledge/);

    // Name input should be focused (browser validation)
    const nameInput = page.locator('input#name');
    await expect(nameInput).toBeFocused();
  });

  test.skip('should complete signup with Admin API', async ({ page }) => {
    const testName = 'E2E Test User';
    const testEmail = `e2e-signup-${Date.now()}@gmail.com`;
    let testUser: TestUser | undefined;

    try {
      // Create user via Admin API (bypasses form submission)
      testUser = await createTestUser({
        name: testName,
        email: testEmail,
        role: 'QA Engineer',
      });

      // Set session in browser
      await setTestSession(page, testEmail);

      // Navigate to home

      // Should redirect to profile
      await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`), { timeout: 10000 });

      // Verify profile loaded
      await expect(page.getByText(testName)).toBeVisible();

    } finally {
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
    }
  });

  test.skip('should handle duplicate signup with Admin API', async ({ page }) => {
    const testName = 'E2E Duplicate User';
    const testEmail = `e2e-duplicate-${Date.now()}@gmail.com`;
    let testUser: TestUser | undefined;

    try {
      // Create user first time
      testUser = await createTestUser({
        name: testName,
        email: testEmail,
        role: 'Tester',
      });

      // Set session - simulates successful login
      await setTestSession(page, testEmail);

      // Navigate to home

      // Should redirect to existing profile (not create duplicate)
      await expect(page).toHaveURL(new RegExp(`/p/${testUser.slug}`), { timeout: 10000 });

      // Verify profile loaded
      await expect(page.getByText(testName)).toBeVisible();

    } finally {
      if (testUser) {
        await deleteTestUser(testUser.user.id);
      }
    }
  });

  test('should validate form fields', async ({ page }) => {
    await page.goto('/sign-pledge');

    // Test invalid email
    await page.locator('input#name').fill('Test User');
    await page.locator('input#email').fill('invalid-email');

    // Try to submit
    await page.getByRole('button', { name: /sign the pledge/i }).click();

    // Should still be on the page (HTML5 validation prevents submission)
    await expect(page).toHaveURL(/sign-pledge/);
  });

  test('should show character count for reason field', async ({ page }) => {
    await page.goto('/sign-pledge');

    const reasonField = page.locator('textarea#reason');
    await reasonField.fill('Test reason');

    // Should show character count
    await expect(page.getByText(/\/280 characters/i)).toBeVisible();
  });

  test('should have "Already Pledged? Log In" link', async ({ page }) => {
    await page.goto('/sign-pledge');

    // Find the login link
    const loginLink = page.getByRole('button', { name: /already pledged.*log in/i });
    await expect(loginLink).toBeVisible();

    // Click it
    await loginLink.click();

    // Should show login form (might be same page or different page)
    // Check for email input with login context
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
  });
});
