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

      // Fill name and create meeting
      const nameInput = page.locator('input[placeholder="Enter your name"]');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('Test User');

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

      // Fill name and create meeting
      const nameInput = page.locator('input[placeholder="Enter your name"]');
      await expect(nameInput).toBeVisible();
      await nameInput.fill('Mobile Test User');

      // Click new meeting button
      await page.getByRole('button', { name: /new meeting/i }).click();

      // Wait for waiting screen
      await expect(page.getByText('Waiting for partner to join...')).toBeVisible({ timeout: 10000 });

      // ASSERTION: Banner should be visible
      await expectBannerVisible(page);
    });
  });

  test.describe('Banner Title Centering', () => {
    test('banner title is horizontally centered in viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/live');

      // Wait for page content to load
      await expect(page.getByRole('heading', { name: 'Clarity Meeting' })).toBeVisible();

      // Get the banner title element
      const bannerTitle = page.locator('.h-16.border-b span.text-sm.text-muted-foreground');
      await expect(bannerTitle).toBeVisible();

      // Get bounding box of the title
      const titleBox = await bannerTitle.boundingBox();
      expect(titleBox).not.toBeNull();

      if (titleBox) {
        // Calculate the center of the title
        const titleCenter = titleBox.x + titleBox.width / 2;

        // Calculate the center of the viewport
        const viewportCenter = 1024 / 2;

        // Title center should be within 20px of viewport center
        const tolerance = 20;
        expect(Math.abs(titleCenter - viewportCenter)).toBeLessThan(tolerance);
      }
    });

    test('banner title is centered on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/live');

      // Wait for page content to load
      await expect(page.getByRole('heading', { name: 'Clarity Meeting' })).toBeVisible();

      // Get the banner title element
      const bannerTitle = page.locator('.h-16.border-b span.text-sm.text-muted-foreground');
      await expect(bannerTitle).toBeVisible();

      // Get bounding box of the title
      const titleBox = await bannerTitle.boundingBox();
      expect(titleBox).not.toBeNull();

      if (titleBox) {
        // Calculate the center of the title
        const titleCenter = titleBox.x + titleBox.width / 2;

        // Calculate the center of the viewport
        const viewportCenter = 375 / 2;

        // Title center should be within 20px of viewport center
        const tolerance = 20;
        expect(Math.abs(titleCenter - viewportCenter)).toBeLessThan(tolerance);
      }
    });
  });

  test.describe('Banner Content', () => {
    test('start screen banner shows correct title', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/live');

      // Wait for page content to load - use the h1 specifically
      await expect(page.getByRole('heading', { name: 'Clarity Meeting' })).toBeVisible();

      // After fix: Banner title should match or be related to "Clarity Meeting"
      // The LiveSessionBanner shows title in center - find it in the banner area
      const bannerTitle = page.locator('.h-16.border-b span.text-sm.text-muted-foreground');
      await expect(bannerTitle).toBeVisible();
      await expect(bannerTitle).toContainText('Clarity Meeting');
    });

    test('waiting screen banner shows "Waiting for Partner"', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/live');

      // Create meeting
      const nameInput = page.locator('input[placeholder="Enter your name"]');
      await nameInput.fill('Test User');
      await page.getByRole('button', { name: /new meeting/i }).click();

      // Wait for waiting screen
      await expect(page.getByText('Waiting for partner to join...')).toBeVisible({ timeout: 10000 });

      // Banner title should be "Waiting for Partner" - find it in the banner area
      const bannerTitle = page.locator('.h-16.border-b span.text-sm.text-muted-foreground');
      await expect(bannerTitle).toContainText('Waiting for Partner');
    });
  });
});
