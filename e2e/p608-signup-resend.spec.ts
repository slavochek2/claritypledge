/**
 * @file p608-signup-resend.spec.ts
 *
 * E2E Test: P608 — Signup page resend magic link
 *
 * Tests the "Check Your Email" confirmation state after signup form submission,
 * including the resend button and "Use Different Email" flow.
 *
 * Note: PKCE flow verification is in UAT (requires real email delivery check).
 * Note: auth_method analytics property is verified via UAT + Mixpanel.
 */

import { test, expect } from '@playwright/test';

test.describe('P608: Signup Resend Magic Link', () => {

  test('should show resend button after form submission', async ({ page }) => {
    await page.goto('/signup');

    // Fill form
    await page.getByLabel(/full name/i).fill('Test Resend User');
    await page.getByLabel(/email/i).fill('test-resend@example.com');

    // Accept terms
    await page.getByRole('checkbox').click();

    // Submit form — intercept the API call to avoid actual email sending
    await page.route('**/auth/v1/magiclink', async (route) => {
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.getByRole('button', { name: /create account/i }).click();

    // Should show confirmation state
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    await expect(page.getByText('test-resend@example.com')).toBeVisible();

    // Should show resend button
    await expect(page.getByRole('button', { name: /resend/i })).toBeVisible();

    // Should still show "Use Different Email" button
    await expect(page.getByRole('button', { name: /use different email/i })).toBeVisible();
  });

  test('should return to form when clicking "Use Different Email"', async ({ page }) => {
    await page.goto('/signup');

    // Fill and submit
    await page.getByLabel(/full name/i).fill('Test Different Email');
    await page.getByLabel(/email/i).fill('test-different@example.com');
    await page.getByRole('checkbox').click();

    await page.route('**/auth/v1/magiclink', async (route) => {
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.getByRole('button', { name: /create account/i }).click();

    // Wait for confirmation state
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    // Click "Use Different Email"
    await page.getByRole('button', { name: /use different email/i }).click();

    // Should return to form
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();
    await expect(page.getByLabel(/full name/i)).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('should show success state after clicking resend', async ({ page }) => {
    await page.goto('/signup');

    // Fill and submit
    await page.getByLabel(/full name/i).fill('Test Resend Click');
    await page.getByLabel(/email/i).fill('test-resend-click@example.com');
    await page.getByRole('checkbox').click();

    // Intercept both the initial and resend magic link calls
    await page.route('**/auth/v1/magiclink', async (route) => {
      await route.fulfill({ status: 200, body: '{}' });
    });

    await page.getByRole('button', { name: /create account/i }).click();

    // Wait for confirmation state
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    // Click resend
    await page.getByRole('button', { name: /resend/i }).click();

    // Should show success feedback (check icon + "sent" text)
    // TODO: Verify exact success UI after resend button is implemented
    await expect(page.getByText(/sent|resent/i)).toBeVisible({ timeout: 5000 });
  });
});
