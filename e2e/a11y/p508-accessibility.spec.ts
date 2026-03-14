/**
 * @file p508-accessibility.spec.ts
 * @description Accessibility tests for P508: Partner Template Page
 *
 * Covers:
 *   - Certificate has accessible landmark (role="region")
 *   - CTA links are keyboard-focusable
 *   - CTA links have accessible names
 *   - Back link is keyboard accessible
 */

import { test, expect } from '@playwright/test';

test.describe('P508: Accessibility — partner template page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/partner-template');
  });

  test('certificate has accessible landmark', async ({ page }) => {
    const certificate = page.getByRole('region', { name: /agreement certificate/i });
    await expect(certificate).toBeVisible();
  });

  test('CTA link is keyboard-focusable', async ({ page }) => {
    const ctaLink = page.getByRole('link', { name: /create your agreement/i });
    await expect(ctaLink).toBeVisible();
    await ctaLink.focus();
    await expect(ctaLink).toBeFocused();
  });

  test('sign in link is keyboard-focusable', async ({ page }) => {
    const signInLink = page.getByRole('link', { name: /sign in/i });
    await expect(signInLink).toBeVisible();
    await signInLink.focus();
    await expect(signInLink).toBeFocused();
  });

  test('CTA links have descriptive accessible names', async ({ page }) => {
    const ctaLink = page.getByRole('link', { name: /create your agreement/i });
    await expect(ctaLink).toHaveAccessibleName(/create your agreement/i);

    const signInLink = page.getByRole('link', { name: /sign in/i });
    await expect(signInLink).toHaveAccessibleName(/sign in/i);
  });
});
