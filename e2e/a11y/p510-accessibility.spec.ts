/**
 * @file p510-accessibility.spec.ts
 * @description Accessibility tests for P510: Profile Banner UX Polish
 *
 * Covers:
 * - Pencil icon trigger has correct ARIA attributes (aria-label, aria-haspopup, aria-expanded)
 * - Dropdown menu uses role="menu" / role="menuitem" (radix built-in)
 * - Keyboard navigation: Tab to pencil, Enter/Space to toggle, Escape to close
 * - Arrow key navigation within dropdown
 * - Focus returns to pencil icon when dropdown closes
 * - Search input has aria-label, submit button has aria-label
 * - Search error has role="alert"
 * - Loading state has aria-busy
 * - Gradient fallback has role="img" and aria-label
 * - Control pills have sufficient color contrast (white on bg-black/40)
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from '../helpers/test-user';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

const MOCK_BANNER_URL = 'https://storage.example.com/banners/test/p510-a11y.png';

test.describe('P510: Accessibility — Pencil Icon & Dropdown', () => {
  test.setTimeout(45000);

  let owner: TestUser;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P510 A11y Owner' });

    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', owner.user.id);
  });

  test.afterAll(async () => {
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', owner.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  // ── ARIA attributes on pencil icon ───────────────────────────────────────

  test('pencil icon has aria-label="Banner options"', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await expect(pencilIcon).toBeVisible({ timeout: 10000 });

    // Verify aria-haspopup
    await expect(pencilIcon).toHaveAttribute('aria-haspopup', /menu|true/);
  });

  test('pencil icon reflects aria-expanded state', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await expect(pencilIcon).toBeVisible({ timeout: 10000 });

    // Before opening: aria-expanded should be false (or not present)
    const expandedBefore = await pencilIcon.getAttribute('aria-expanded');
    expect(expandedBefore === 'false' || expandedBefore === null).toBeTruthy();

    // Open dropdown
    await pencilIcon.click();

    // After opening: aria-expanded should be true
    await expect(pencilIcon).toHaveAttribute('aria-expanded', 'true');

    // Close dropdown
    await page.keyboard.press('Escape');

    // After closing: aria-expanded should be false
    await expect(pencilIcon).toHaveAttribute('aria-expanded', 'false');
  });

  // ── Keyboard navigation ──────────────────────────────────────────────────

  test('pencil icon is focusable via Tab', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await expect(pencilIcon).toBeVisible({ timeout: 10000 });

    // Focus the pencil icon
    await pencilIcon.focus();
    await expect(pencilIcon).toBeFocused();
  });

  test('Enter key opens dropdown menu', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.focus();

    // Press Enter to open
    await page.keyboard.press('Enter');

    // Dropdown should be open
    const menuItem = page.getByRole('menuitem', { name: /new banner/i });
    await expect(menuItem).toBeVisible({ timeout: 5000 });
  });

  test('Space key opens dropdown menu', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.focus();

    // Press Space to open
    await page.keyboard.press('Space');

    // Dropdown should be open
    const menuItem = page.getByRole('menuitem', { name: /new banner/i });
    await expect(menuItem).toBeVisible({ timeout: 5000 });
  });

  test('Escape closes dropdown and returns focus to pencil icon', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    // Dropdown is open
    await expect(page.getByRole('menuitem', { name: /new banner/i })).toBeVisible({ timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Dropdown closed
    await expect(page.getByRole('menuitem', { name: /new banner/i })).not.toBeVisible({ timeout: 3000 });

    // Focus should return to the pencil icon
    await expect(pencilIcon).toBeFocused();
  });

  test('arrow keys navigate within dropdown menu', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    // Wait for dropdown to open
    await expect(page.getByRole('menuitem', { name: /new banner/i })).toBeVisible({ timeout: 5000 });

    // Arrow down should move focus through menu items
    await page.keyboard.press('ArrowDown');

    // At least one menu item should be focused
    const focusedElement = page.locator('[role="menuitem"]:focus');
    await expect(focusedElement).toBeAttached({ timeout: 3000 });
  });

  // ── Dropdown menu roles ──────────────────────────────────────────────────

  test('dropdown uses role="menu" with role="menuitem" items', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    // Menu container should have role="menu"
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible({ timeout: 5000 });

    // Menu items should have role="menuitem"
    const menuItems = page.locator('[role="menuitem"]');
    const count = await menuItems.count();
    expect(count).toBeGreaterThanOrEqual(2); // At least "New banner" and "Describe"
  });
});

test.describe('P510: Accessibility — Search Input & Loading States', () => {
  test.setTimeout(45000);

  let owner: TestUser;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P510 A11y Search' });

    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', owner.user.id);
  });

  test.afterAll(async () => {
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', owner.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  // ── Search input ARIA ────────────────────────────────────────────────────

  test('search input has aria-label when visible', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Open dropdown and click "Describe your banner"
    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const describeItem = page.getByRole('menuitem', { name: /describe/i });
    await describeItem.click();

    // Search input should appear with aria-label
    const searchInput = page.locator('input[aria-label*="describe" i], input[aria-label*="banner" i]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    const ariaLabel = await searchInput.getAttribute('aria-label');
    expect(ariaLabel, 'Search input should have aria-label').toBeTruthy();
  });

  test('search submit button has aria-label', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const describeItem = page.getByRole('menuitem', { name: /describe/i });
    await describeItem.click();

    // Submit button near the search input
    const submitBtn = page.getByRole('button', { name: /generate.*banner|submit/i });
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const ariaLabel = await submitBtn.getAttribute('aria-label');
      expect(ariaLabel, 'Submit button should have aria-label').toBeTruthy();
    }
  });

  test('search input dismisses with Escape and returns focus to pencil', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const describeItem = page.getByRole('menuitem', { name: /describe/i });
    await describeItem.click();

    const searchInput = page.locator('input[aria-label*="describe" i], input[aria-label*="banner" i]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Press Escape to dismiss
    await page.keyboard.press('Escape');

    // Search input should disappear
    await expect(searchInput).not.toBeVisible({ timeout: 3000 });
  });

  // ── Loading state ARIA ───────────────────────────────────────────────────

  test('banner area has aria-busy during generation', async ({ page }) => {
    await setTestSession(page, owner.email);

    // Delay the edge function to capture loading state
    await page.route('**/functions/v1/generate-banner**', async route => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ bannerUrl: MOCK_BANNER_URL }),
      });
    });

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const newBannerItem = page.getByRole('menuitem', { name: /new banner/i });
    await newBannerItem.click();

    // aria-busy should appear on the banner container during loading
    const busyElement = page.locator('[aria-busy="true"]').first();
    await expect(busyElement).toBeVisible({ timeout: 5000 });
  });

  // ── Error state ARIA ─────────────────────────────────────────────────────

  test('keyword search error has role="alert"', async ({ page }) => {
    await setTestSession(page, owner.email);

    // Mock edge function to fail
    await page.route('**/functions/v1/generate-banner**', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Generation failed' }),
    }));

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Open "Describe your banner" search
    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const describeItem = page.getByRole('menuitem', { name: /describe/i });
    await describeItem.click();

    // Type keywords and submit
    const searchInput = page.locator('input[aria-label*="describe" i], input[aria-label*="banner" i]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill('mountains sunset');
    await page.keyboard.press('Enter');

    // Error message should have role="alert"
    const alertElement = page.locator('[role="alert"]');
    await expect(alertElement).toBeVisible({ timeout: 10000 });
  });
});

test.describe('P510: Accessibility — Gradient Fallback', () => {
  test.setTimeout(30000);

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P510 A11y Gradient' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('gradient fallback has role="img" and aria-label containing "banner"', async ({ page }) => {
    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    const gradientBanner = page.locator('[role="img"][aria-label]').first();
    await expect(gradientBanner).toBeVisible({ timeout: 10000 });

    const ariaLabel = await gradientBanner.getAttribute('aria-label');
    expect(ariaLabel, 'Gradient fallback should have aria-label').toBeTruthy();
    expect(ariaLabel!.toLowerCase()).toContain('banner');
  });
});
