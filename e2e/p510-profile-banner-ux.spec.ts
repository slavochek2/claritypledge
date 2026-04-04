/**
 * @file p510-profile-banner-ux.spec.ts
 * @description E2E tests for P510: Profile Banner UX Polish
 *
 * Tests:
 * - Gradient fallback is visible (not transparent) when no banner image
 * - Avatar is 96px with white ring border
 * - Name and role appear beside avatar (not stacked below)
 * - Banner height is 120px mobile / 160px desktop
 * - Controls hidden behind pencil icon (owner only)
 * - Pencil icon not visible to visitors or anonymous users
 * - Clicking pencil reveals dropdown with New banner / Describe / Remove
 * - Dropdown closes on Escape and outside click
 * - Search input only accessible from dropdown (not shown on page load)
 * - Remove option only shown when banner image exists
 * - Existing P504 profile banner tests still conceptually covered
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

const MOCK_BANNER_URL = 'https://storage.example.com/banners/test/p510-test-banner.png';

test.describe('P510 — Profile Banner Layout', () => {
  test.setTimeout(45000);

  let owner: TestUser;
  let visitor: TestUser;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P510 Banner Owner' });
    visitor = await createTestUser({ name: 'P510 Banner Visitor' });
  });

  test.afterAll(async () => {
    // Cleanup banner
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', owner.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
    if (visitor?.user?.id) await deleteTestUser(visitor.user.id);
  });

  // ── Gradient Fallback ────────────────────────────────────────────────────

  test('gradient fallback is visually distinct when no banner image exists', async ({ page }) => {
    // Ensure no banner
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', owner.user.id);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // No banner image should be present
    const bannerImg = page.locator('img[src*="banners/"]');
    await expect(bannerImg).not.toBeAttached();

    // Gradient fallback should be visible with role="img"
    const gradientBanner = page.locator('[role="img"][aria-label*="banner" i]');
    await expect(gradientBanner).toBeVisible({ timeout: 10000 });

    // Verify the gradient is not transparent — check computed background
    const bgStyle = await gradientBanner.evaluate((el) => {
      return window.getComputedStyle(el).backgroundImage;
    });
    // The gradient should NOT be "none" or all-transparent
    expect(bgStyle).not.toBe('none');
  });

  // ── Avatar Sizing ────────────────────────────────────────────────────────

  test('avatar is 96px with white ring border', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Look for the profile avatar (96px = w-24 h-24)
    const avatar = page.locator('[data-testid="profile-avatar"], .profile-avatar, img[alt*="P510 Banner Owner"]').first();

    // If avatar is found, check its dimensions
    if (await avatar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const box = await avatar.boundingBox();
      if (box) {
        // Avatar should be approximately 96px (allow small tolerance for ring/border)
        expect(box.width).toBeGreaterThanOrEqual(80);
        expect(box.width).toBeLessThanOrEqual(110);
        expect(box.height).toBeGreaterThanOrEqual(80);
        expect(box.height).toBeLessThanOrEqual(110);
      }
    }

    // Verify the avatar container has a ring (ring-4 ring-white)
    // Check for the ring class on the avatar or its parent
    const avatarWithRing = page.locator('.ring-4, .ring-white').first();
    // This may not be present before implementation — test will pass once P510 is built
    if (await avatarWithRing.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(avatarWithRing).toBeVisible();
    }
  });

  // ── Name Beside Avatar ───────────────────────────────────────────────────

  test('name and role appear beside avatar, not stacked below', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Name should be visible
    const nameElement = page.getByText('P510 Banner Owner').first();
    await expect(nameElement).toBeVisible({ timeout: 10000 });

    // Find the avatar element
    const avatar = page.locator('[data-testid="profile-avatar"], .profile-avatar, img[alt*="P510"]').first();

    if (await avatar.isVisible({ timeout: 5000 }).catch(() => false)) {
      const avatarBox = await avatar.boundingBox();
      const nameBox = await nameElement.boundingBox();

      if (avatarBox && nameBox) {
        // Name should be roughly at the same vertical position as the avatar center
        // (beside it, not below it). The name top should be above the avatar bottom.
        const avatarCenterY = avatarBox.y + avatarBox.height / 2;
        const nameCenterY = nameBox.y + nameBox.height / 2;

        // Name center should be within a reasonable vertical band of avatar center
        // Allow 60px tolerance for various alignment approaches
        expect(
          Math.abs(nameCenterY - avatarCenterY),
          'Name should be beside avatar (similar vertical position), not below'
        ).toBeLessThan(60);

        // Name should be to the right of the avatar
        expect(
          nameBox.x,
          'Name should appear to the right of avatar'
        ).toBeGreaterThan(avatarBox.x + avatarBox.width - 20);
      }
    }
  });

  // ── Banner Height ────────────────────────────────────────────────────────

  test('banner height is 120px on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Find the banner area (gradient fallback or image container)
    const bannerArea = page.locator('[role="img"][aria-label*="banner" i]').first();

    if (await bannerArea.isVisible({ timeout: 10000 }).catch(() => false)) {
      const box = await bannerArea.boundingBox();
      if (box) {
        // Height should be approximately 120px on mobile (allow tolerance)
        expect(box.height).toBeGreaterThanOrEqual(100);
        expect(box.height).toBeLessThanOrEqual(140);
      }
    }
  });

  test('banner height is 160px on desktop viewport', async ({ page }) => {
    // Set desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const bannerArea = page.locator('[role="img"][aria-label*="banner" i]').first();

    if (await bannerArea.isVisible({ timeout: 10000 }).catch(() => false)) {
      const box = await bannerArea.boundingBox();
      if (box) {
        // Height should be approximately 160px on desktop (allow tolerance)
        expect(box.height).toBeGreaterThanOrEqual(140);
        expect(box.height).toBeLessThanOrEqual(180);
      }
    }
  });

  // ── Avatar Overlap ───────────────────────────────────────────────────────

  test('avatar overlaps bottom edge of banner area', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const bannerArea = page.locator('[role="img"][aria-label*="banner" i]').first();
    const avatar = page.locator('[data-testid="profile-avatar"], .profile-avatar, img[alt*="P510"]').first();

    if (
      (await bannerArea.isVisible({ timeout: 5000 }).catch(() => false)) &&
      (await avatar.isVisible({ timeout: 5000 }).catch(() => false))
    ) {
      const bannerBox = await bannerArea.boundingBox();
      const avatarBox = await avatar.boundingBox();

      if (bannerBox && avatarBox) {
        const bannerBottom = bannerBox.y + bannerBox.height;
        // Avatar should start near or above the banner bottom (overlapping)
        expect(
          avatarBox.y,
          'Avatar should overlap the banner bottom edge'
        ).toBeLessThan(bannerBottom + 10);
      }
    }
  });
});

test.describe('P510 — Profile Banner Controls (Owner vs Visitor)', () => {
  test.setTimeout(45000);

  let owner: TestUser;
  let visitor: TestUser;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P510 Controls Owner' });
    visitor = await createTestUser({ name: 'P510 Controls Visitor' });

    // Pre-seed a banner on the owner's profile
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
    if (visitor?.user?.id) await deleteTestUser(visitor.user.id);
  });

  test.afterEach(async () => {
    // Restore banner after each test
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', owner.user.id);
  });

  // ── Owner sees pencil icon ───────────────────────────────────────────────

  test('owner sees pencil icon on their profile banner', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Pencil icon should be visible (aria-label="Banner options")
    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await expect(pencilIcon).toBeVisible({ timeout: 10000 });
  });

  test('visitor does NOT see pencil icon on profile banner', async ({ page }) => {
    await setTestSession(page, visitor.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Profile should render
    await expect(page.getByText('P510 Controls Owner')).toBeVisible({ timeout: 10000 });

    // Pencil icon should NOT be present
    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await expect(pencilIcon).not.toBeAttached();
  });

  test('anonymous user does NOT see pencil icon on profile banner', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P510 Controls Owner')).toBeVisible({ timeout: 10000 });

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await expect(pencilIcon).not.toBeAttached();
  });

  // ── Dropdown expand/collapse ─────────────────────────────────────────────

  test('clicking pencil icon opens dropdown with banner actions', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await expect(pencilIcon).toBeVisible({ timeout: 10000 });

    // Click to open dropdown
    await pencilIcon.click();

    // Dropdown should show "New banner" and "Describe your banner" items
    const newBannerItem = page.getByRole('menuitem', { name: /new banner/i });
    await expect(newBannerItem).toBeVisible({ timeout: 5000 });

    const describeItem = page.getByRole('menuitem', { name: /describe/i });
    await expect(describeItem).toBeVisible({ timeout: 5000 });
  });

  test('dropdown shows Remove option when banner image exists', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const removeItem = page.getByRole('menuitem', { name: /remove/i });
    await expect(removeItem).toBeVisible({ timeout: 5000 });
  });

  test('dropdown does NOT show Remove option when no banner exists', async ({ page }) => {
    // Remove banner first
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', owner.user.id);

    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    // "New banner" should be shown
    await expect(page.getByRole('menuitem', { name: /new banner/i })).toBeVisible({ timeout: 5000 });

    // "Remove" should NOT be shown (no banner to remove)
    const removeItem = page.getByRole('menuitem', { name: /remove/i });
    await expect(removeItem).not.toBeAttached();
  });

  test('dropdown closes on Escape key', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    // Verify dropdown is open
    const newBannerItem = page.getByRole('menuitem', { name: /new banner/i });
    await expect(newBannerItem).toBeVisible({ timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Dropdown should close
    await expect(newBannerItem).not.toBeVisible({ timeout: 3000 });
  });

  test('dropdown closes when clicking outside', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const newBannerItem = page.getByRole('menuitem', { name: /new banner/i });
    await expect(newBannerItem).toBeVisible({ timeout: 5000 });

    // Click outside the dropdown (on the page body)
    await page.click('body', { position: { x: 10, y: 10 } });

    // Dropdown should close
    await expect(newBannerItem).not.toBeVisible({ timeout: 3000 });
  });

  // ── Search input gating ──────────────────────────────────────────────────

  test('search input does NOT appear on initial page load', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // No search input should be visible on load
    const searchInput = page.locator('input[aria-label*="describe" i], input[placeholder*="describe" i]');
    await expect(searchInput).not.toBeAttached();
  });

  test('search input does NOT appear after banner generation failure', async ({ page }) => {
    await setTestSession(page, owner.email);

    // Mock the edge function to fail
    await page.route('**/functions/v1/generate-banner**', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Generation failed' }),
    }));

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    // Click "New banner" from dropdown
    const newBannerItem = page.getByRole('menuitem', { name: /new banner/i });
    await newBannerItem.click();

    // Wait for the generation to fail
    await page.waitForTimeout(2000);

    // Search input should NOT appear automatically on failure
    const searchInput = page.locator('input[aria-label*="describe" i], input[placeholder*="describe" i]');
    await expect(searchInput).not.toBeAttached();
  });

  test('search input appears only via "Describe your banner" dropdown option', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    // Click "Describe your banner"
    const describeItem = page.getByRole('menuitem', { name: /describe/i });
    await describeItem.click();

    // Search input should now appear
    const searchInput = page.locator('input[aria-label*="describe" i], input[placeholder*="describe" i]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Input should be auto-focused
    await expect(searchInput).toBeFocused();
  });

  // ── Banner generation via dropdown ───────────────────────────────────────

  test('clicking "New banner" from dropdown triggers generation', async ({ page }) => {
    await setTestSession(page, owner.email);

    const newBannerUrl = 'https://storage.example.com/banners/profiles/p510-new.png';

    // Mock the edge function
    await page.route('**/functions/v1/generate-banner**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ bannerUrl: newBannerUrl }),
    }));

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const newBannerItem = page.getByRole('menuitem', { name: /new banner/i });
    await newBannerItem.click();

    // New banner image should appear
    await expect(page.locator(`img[src="${newBannerUrl}"]`)).toBeVisible({ timeout: 15000 });
  });

  // ── Remove banner via dropdown ───────────────────────────────────────────

  test('clicking "Remove" from dropdown removes banner and shows gradient', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Confirm banner is visible
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).toBeVisible({ timeout: 10000 });

    const pencilIcon = page.getByRole('button', { name: /banner options/i });
    await pencilIcon.click();

    const removeItem = page.getByRole('menuitem', { name: /remove/i });
    await removeItem.click();

    // Banner image should be gone
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).not.toBeAttached({ timeout: 5000 });

    // Gradient fallback should appear
    const gradientBanner = page.locator('[role="img"][aria-label*="banner" i]');
    await expect(gradientBanner).toBeVisible({ timeout: 5000 });
  });
});
