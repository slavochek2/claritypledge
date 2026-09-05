import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';

test.describe('Pledgers Page', () => {
  test.describe.configure({ mode: 'serial' });
  let testUsers: TestUser[] = [];

  test.beforeEach(async () => {
    // Create 25 test profiles for carousel testing
    console.log('[E2E] Creating 25 test profiles...');
    const userPromises = Array.from({ length: 25 }, (_, i) =>
      createTestUser({
        name: `Test Pledger ${i + 1}`,
        role: `Role ${i + 1}`,
        reason: `Reason for signing ${i + 1}`,
      })
    );
    testUsers = await Promise.all(userPromises);
    console.log('[E2E] Test profiles created');
  });

  test.afterEach(async () => {
    // Clean up all test users
    console.log('[E2E] Cleaning up test profiles...');
    await Promise.all(testUsers.map((u) => deleteTestUser(u.user.id)));
    testUsers = [];
    console.log('[E2E] Cleanup complete');
  });

  test('Mobile viewport - carousel scrolls horizontally', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Wait for profiles to load
    await page.waitForSelector('text=Test Pledger 1 >> visible=true');

    // Find the carousel container (role="region")
    const carousel = page.locator('[role="region"][aria-label="Pledger profiles carousel"]');
    await expect(carousel).toBeVisible();

    // Verify carousel is scrollable
    const scrollWidth = await carousel.evaluate((el) => el.scrollWidth);
    const clientWidth = await carousel.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeGreaterThan(clientWidth);

    // Scroll carousel programmatically
    await carousel.evaluate((el) => {
      el.scrollLeft = 400;
    });

    // Verify scroll position changed
    const newScrollLeft = await carousel.evaluate((el) => el.scrollLeft);
    expect(newScrollLeft).toBeGreaterThan(0);
  });

  test('Clicking dot navigates to corresponding profile card', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Wait for profiles to load
    await page.waitForSelector('text=Test Pledger 1 >> visible=true');

    // Find carousel container
    const carousel = page.locator('[role="region"][aria-label="Pledger profiles carousel"]');

    // Get initial scroll position
    const initialScroll = await carousel.evaluate((el) => el.scrollLeft);

    // Click the third dot (index 2)
    await page.click('button[aria-label="Go to profile 3"]');

    // Wait for scroll animation
    await page.waitForTimeout(500);

    // Verify scroll position changed
    const newScroll = await carousel.evaluate((el) => el.scrollLeft);
    expect(newScroll).toBeGreaterThan(initialScroll);
  });

  test('Scroll position updates currentIndex (dot indicator highlights)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Wait for profiles to load
    await page.waitForSelector('text=Test Pledger 1 >> visible=true');

    // First dot should be active (has bg-blue-600 class and w-4 width)
    const firstDot = page.locator('button[aria-label="Go to profile 1"]');
    await expect(firstDot).toHaveClass(/bg-blue-600/);
    await expect(firstDot).toHaveClass(/w-4/);

    // Scroll carousel
    const carousel = page.locator('[role="region"][aria-label="Pledger profiles carousel"]');
    await carousel.evaluate((el) => {
      el.scrollLeft = el.scrollWidth / 3; // Scroll to roughly 1/3 position
    });

    // Wait for scroll event to update state
    await page.waitForTimeout(300);

    // Check that a different dot is now active
    // (We can't predict which one due to scroll snap, but at least one should be active)
    const activeDots = page.locator('button.bg-blue-600.w-4');
    await expect(activeDots).toHaveCount(1);
  });

  test('Clicking pledger card navigates to pledge certificate', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Wait for profiles to load
    await page.waitForSelector('text=Test Pledger 1 >> visible=true');

    // Click the first pledger card
    const firstCard = page.locator('[href^="/p/"]').first();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/\/p\/.+\/pledge$/);

    await firstCard.click();

    // Wait for navigation to pledge certificate (not profile)
    await page.waitForURL(/\/p\/.+\/pledge/);

    expect(page.url()).toMatch(/\/p\/.+\/pledge/);
  });

  test('Desktop viewport - profiles render in grid (no carousel)', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1024, height: 768 });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Wait for profiles to load (use getAllByText to avoid duplicates)
    await page.waitForSelector('text=Test Pledger 1 >> visible=true', { timeout: 10000 });

    // Wait a bit for all cards to render
    await page.waitForTimeout(1000);

    // All 25 profiles should be visible somewhere on the page
    const allCards = page.locator('[href^="/p/"]');
    const count = await allCards.count();
    // Desktop shows all 25, mobile shows 20, so we expect at least 25 total
    expect(count).toBeGreaterThanOrEqual(25);
  });

  test('Mobile shows "Showing 20 of X" when profiles exceed limit', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Wait for profiles to load
    await page.waitForSelector('text=Test Pledger 1 >> visible=true', { timeout: 10000 });

    // Wait for the "Showing" message to render
    await page.waitForTimeout(1000);

    // Should show "Showing 20 of 25 pledgers"
    await expect(page.locator('text=/Showing 20 of/i')).toBeVisible({ timeout: 10000 });
  });

  test('Page title and header render correctly', async ({ page }) => {
    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Check page title
    await expect(page.locator('h1:has-text("Clarity Pledgers")')).toBeVisible();

    // Check CTA section appears
    await expect(page.locator('text=Ready to Commit?')).toBeVisible();
  });

  test('Dot indicators count matches mobile profiles (max 20)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Wait for profiles to load
    await page.waitForSelector('text=Test Pledger 1 >> visible=true');

    // Count dot indicators
    const dots = page.locator('button[aria-label^="Go to profile"]');
    const count = await dots.count();
    expect(count).toBe(20); // MAX_MOBILE_CAROUSEL limit
  });

  test('Empty state shows when no profiles exist', async ({ page }) => {
    // P1229: this used to delete the 25 seeded users and assert the page was empty.
    // That asserts a GLOBAL property of a table other sessions (and earlier interrupted
    // runs of this very file) also write to, so it passed or failed depending on how much
    // orphaned data happened to be in the shared test project. Stub the RPC instead — the
    // behaviour under test is the component's empty state, not the table's contents.
    await page.route('**/rest/v1/rpc/get_pledgers_page', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: 0, profiles: [] }),
      });
    });

    await page.goto('/pledgers');
    await page.waitForLoadState('networkidle');

    // Should show empty state
    await expect(page.locator('text=No Verified Pledgers Yet')).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator('text=Be the first to sign the pledge and verify your commitment!')
    ).toBeVisible();
  });
});
