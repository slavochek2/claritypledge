import { test, expect } from '@playwright/test';

test.describe('Manifesto Page Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/manifesto');
    await page.waitForLoadState('domcontentloaded');
  });

  test('has hamburger menu button (desktop)', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // Find hamburger menu button by aria-label
    const menuButton = page.getByRole('button', { name: /menu/i });
    await expect(menuButton).toBeVisible();
  });

  test('hamburger menu shows nav links when clicked (desktop)', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // Click hamburger menu
    const menuButton = page.getByRole('button', { name: /menu/i });
    await menuButton.click();

    // Verify nav links appear
    await expect(page.getByRole('menuitem', { name: 'Manifesto' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Pledgers' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'About' })).toBeVisible();
  });

  test('hamburger menu shows Log In for anonymous users (desktop)', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // Click hamburger menu
    const menuButton = page.getByRole('button', { name: /menu/i });
    await menuButton.click();

    // Verify Log In option appears for anonymous user
    await expect(page.getByRole('menuitem', { name: 'Log In' })).toBeVisible();
  });

  test('has hamburger menu button (mobile)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Find hamburger menu button
    const menuButton = page.getByRole('button', { name: /menu/i });
    await expect(menuButton).toBeVisible();
  });

  test('mobile menu shows nav links when opened', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Click hamburger menu
    const menuButton = page.getByRole('button', { name: /menu/i });
    await menuButton.click();

    // Verify nav links appear in mobile menu
    await expect(page.getByRole('link', { name: 'Manifesto' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pledgers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log In' })).toBeVisible();
  });

  test('keeps Contents button for table of contents (mobile)', async ({ page }) => {
    // Set mobile viewport where Contents button should be visible
    await page.setViewportSize({ width: 375, height: 667 });

    // The Contents button should still exist (article-specific functionality)
    const contentsButton = page.getByRole('button', { name: /contents/i });
    await expect(contentsButton).toBeVisible();
  });
});
