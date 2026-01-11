/**
 * @file live-meeting-banners.spec.ts
 * @description B50: Tests to ensure LiveSessionBanner is present on all /live screens
 *
 * Prevention: These tests prevent future regressions where screens might
 * accidentally lose their banner during refactoring.
 */
import { test, expect } from '@playwright/test';

test.describe('B50: Live Meeting Banner Consistency', () => {
  /**
   * Helper to check for LiveSessionBanner presence.
   * The banner has a logo link to "/" and is in a h-16 border-b container.
   */
  async function expectBannerVisible(page: import('@playwright/test').Page) {
    // LiveSessionBanner contains the ClarityLogo which links to "/"
    // The logo is an SVG inside an anchor tag to "/"
    const logoLink = page.locator('a[href="/"]').first();

    // The banner should be at the top of the page
    await expect(logoLink).toBeVisible({ timeout: 5000 });

    // Verify banner is in the header area (top 80px of page)
    const box = await logoLink.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y).toBeLessThan(80); // Should be in top 80px
    }
  }

  test.describe('Desktop (1024x768)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
    });

    test('start screen (create/join) has banner', async ({ page }) => {
      await page.goto('/live');

      // Wait for page content to load - use the h1 specifically
      await expect(page.getByRole('heading', { name: 'Clarity Meeting' })).toBeVisible();

      // ASSERTION: Banner should be visible
      await expectBannerVisible(page);
    });

    test('waiting screen has banner', async ({ page }) => {
      await page.goto('/live');

      // Fill name and email (required for guest to create meeting)
      const nameInput = page.locator('input[placeholder="Enter your name"]');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('Test User');

      const emailInput = page.locator('input[placeholder="your@email.com"]');
      await emailInput.fill('test@example.com');

      // Check consent checkbox
      const consentCheckbox = page.locator('input[type="checkbox"]');
      await consentCheckbox.check();

      // Click new meeting button
      await page.getByRole('button', { name: /new meeting/i }).click();

      // Wait for waiting screen
      await expect(page.getByText('Waiting for partner to join...')).toBeVisible({ timeout: 10000 });

      // ASSERTION: Banner should be visible
      await expectBannerVisible(page);
    });

    test('join via link screen has banner', async ({ page }) => {
      // Navigate to a join link (code doesn't need to be valid for this test)
      await page.goto('/live/TESTCODE');

      // Wait for join screen to load - the banner title shows "Join Clarity Meeting"
      await expect(page.getByText('Join Clarity Meeting')).toBeVisible({ timeout: 5000 });

      // ASSERTION: Banner should be visible
      await expectBannerVisible(page);
    });
  });

  test.describe('Mobile (375x667)', () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
    });

    test('start screen has banner on mobile', async ({ page }) => {
      await page.goto('/live');

      // Wait for page content to load - use the h1 specifically
      await expect(page.getByRole('heading', { name: 'Clarity Meeting' })).toBeVisible();

      // ASSERTION: Banner should be visible
      await expectBannerVisible(page);
    });

    test('waiting screen has banner on mobile', async ({ page }) => {
      await page.goto('/live');

      // Fill name and email (required for guest to create meeting)
      const nameInput = page.locator('input[placeholder="Enter your name"]');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('Mobile Test User');

      const emailInput = page.locator('input[placeholder="your@email.com"]');
      await emailInput.fill('mobile@example.com');

      // Check consent checkbox
      const consentCheckbox = page.locator('input[type="checkbox"]');
      await consentCheckbox.check();

      // Click new meeting button
      await page.getByRole('button', { name: /new meeting/i }).click();

      // Wait for waiting screen
      await expect(page.getByText('Waiting for partner to join...')).toBeVisible({ timeout: 10000 });

      // ASSERTION: Banner should be visible
      await expectBannerVisible(page);
    });
  });

  test.describe('Banner Content', () => {
    test('start screen banner title is empty (no redundancy with h1)', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/live');

      // Wait for page content to load - use the h1 specifically
      await expect(page.getByRole('heading', { name: 'Clarity Meeting' })).toBeVisible();

      // Banner should exist but center title span should be empty (to avoid redundancy with h1)
      // Empty span is considered "hidden" by Playwright, so we check it exists and has no text
      const bannerTitle = page.locator('.h-16.border-b span.text-sm.text-muted-foreground');
      await expect(bannerTitle).toHaveCount(1); // Element exists
      await expect(bannerTitle).toHaveText(''); // But is empty
    });

    test('waiting screen banner title is empty (KISS - info is in page content)', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/live');

      // Fill name and email (required for guest to create meeting)
      const nameInput = page.locator('input[placeholder="Enter your name"]');
      await nameInput.fill('Test User');

      const emailInput = page.locator('input[placeholder="your@email.com"]');
      await emailInput.fill('test@example.com');

      // Check consent checkbox
      const consentCheckbox = page.locator('input[type="checkbox"]');
      await consentCheckbox.check();

      await page.getByRole('button', { name: /new meeting/i }).click();

      // Wait for waiting screen
      await expect(page.getByText('Waiting for partner to join...')).toBeVisible({ timeout: 10000 });

      // Banner title should be empty (KISS - the page content shows "Waiting for partner to join...")
      const bannerTitle = page.locator('.h-16.border-b span.text-sm.text-muted-foreground');
      await expect(bannerTitle).toHaveCount(1);
      await expect(bannerTitle).toHaveText('');
    });
  });
});
