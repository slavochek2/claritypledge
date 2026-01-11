import { test, expect } from '@playwright/test';

test.describe('Logo Navigation', () => {
  const pagesToTest = [
    { path: '/about', name: 'About page' },
    { path: '/pledgers', name: 'Pledgers page' },
    { path: '/sign-pledge', name: 'Sign Pledge page' },
    { path: '/manifesto', name: 'Manifesto page' },
    { path: '/live', name: 'Live Meeting page' },
  ];

  for (const { path, name } of pagesToTest) {
    test(`Logo on ${name} (${path}) navigates to home`, async ({ page }) => {
      // Navigate to the page
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');

      // Find the logo link (should link to "/")
      const logoLink = page.locator('a[href="/"]').filter({
        has: page.locator('svg'),
      }).first();

      // Verify logo exists and is visible
      await expect(logoLink).toBeVisible({ timeout: 5000 });

      // Click the logo
      await logoLink.click();

      // Verify we're on the home page
      await expect(page).toHaveURL('/');
    });
  }

  test('Logo on home page scrolls to top (does not navigate)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Scroll down the page
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);

    // Verify we scrolled
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    // Click the logo
    const logoLink = page.locator('a[href="/"]').filter({
      has: page.locator('svg'),
    }).first();
    await logoLink.click();

    // Wait for scroll animation
    await page.waitForTimeout(500);

    // Verify we're still on home but scrolled to top
    await expect(page).toHaveURL('/');
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeLessThan(scrollBefore);
  });
});
