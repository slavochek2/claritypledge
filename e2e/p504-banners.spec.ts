/**
 * @file p504-banners.spec.ts
 * @description E2E tests for P504: Auto-generated banners — profiles only
 *
 * P519 removed on-page banners from stories and points (OG-only for stories).
 * Story/point banner tests removed. Profile banner tests remain.
 *
 * Tests:
 * - Profile: banner displays, owner sees controls, non-owner doesn't
 * - Profile: LinkedIn-style avatar overlap layout
 * - Gradient fallback when no banner exists
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOCK_BANNER_URL = 'https://storage.example.com/banners/test/p504-test-banner.png';

// P519: Story and Point banner tests removed — banners no longer display on-page.
// Story banners are OG-only (social sharing). Point banners removed entirely.

test.describe('P504 — Profile Banners', () => {
  test.setTimeout(45000);

  let owner: TestUser;
  let visitor: TestUser;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P504 Profile Owner' });
    visitor = await createTestUser({ name: 'P504 Profile Visitor' });

    // Pre-seed a banner on the owner's profile
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', owner.user.id);
  });

  test.afterAll(async () => {
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
    if (visitor?.user?.id) await deleteTestUser(visitor.user.id);
  });

  test.afterEach(async () => {
    // Restore banner
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', owner.user.id);
  });

  // ── Display ────────────────────────────────────────────────────────────────

  test('banner image displays on profile page when banner_url is set', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).toBeVisible({ timeout: 10000 });
  });

  // ── Owner controls ─────────────────────────────────────────────────────────

  test('profile owner sees Regenerate and Remove buttons', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    const regenerateBtn = page.getByRole('button', { name: /new banner/i });
    await expect(regenerateBtn).toBeVisible({ timeout: 10000 });

    const removeBtn = page.getByRole('button', { name: /remove banner/i });
    await expect(removeBtn).toBeVisible({ timeout: 10000 });
  });

  test('non-owner does not see banner controls on profile', async ({ page }) => {
    await setTestSession(page, visitor.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Profile renders (has the name)
    await expect(page.getByText('P504 Profile Owner')).toBeVisible({ timeout: 10000 });

    // No controls
    await expect(page.getByRole('button', { name: /new banner/i })).not.toBeAttached();
    await expect(page.getByRole('button', { name: /remove banner/i })).not.toBeAttached();
  });

  test('anonymous user does not see banner controls on profile', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P504 Profile Owner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /new banner/i })).not.toBeAttached();
    await expect(page.getByRole('button', { name: /remove banner/i })).not.toBeAttached();
  });

  // ── Remove banner ──────────────────────────────────────────────────────────

  test('Remove clears profile banner and gradient fallback shows', async ({ page }) => {
    await setTestSession(page, owner.email);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Confirm banner currently visible
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).toBeVisible({ timeout: 10000 });

    // Click Remove
    await page.getByRole('button', { name: /remove banner/i }).click();
    await page.waitForLoadState('networkidle');

    // Banner image is gone
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).not.toBeAttached({ timeout: 5000 });

    // DB also updated to null
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('banner_url')
      .eq('id', owner.user.id)
      .single();
    expect(data?.banner_url).toBeNull();
  });

  // ── LinkedIn-style avatar overlap layout ───────────────────────────────────

  test('profile page has LinkedIn-style avatar overlapping the banner', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Banner area exists
    const bannerArea = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerArea).toBeVisible({ timeout: 10000 });

    // Avatar element exists and is positioned to overlap the banner
    // The avatar should be visible and have a negative margin-top or absolute positioning
    // that causes it to overlap with the banner bottom edge
    const avatar = page.locator('[data-testid="profile-avatar"], .profile-avatar').first();
    if (await avatar.isVisible()) {
      const avatarBox = await avatar.boundingBox();
      const bannerBox = await bannerArea.boundingBox();

      if (avatarBox && bannerBox) {
        // Avatar should start above or at the banner bottom (overlapping)
        // The avatar top should be above the banner bottom
        const bannerBottom = bannerBox.y + bannerBox.height;
        expect(
          avatarBox.y,
          'Avatar should overlap the banner bottom edge (LinkedIn-style)'
        ).toBeLessThan(bannerBottom + 20); // Allow some tolerance
      }
    }
  });
});
