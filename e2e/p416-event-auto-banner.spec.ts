/**
 * @file p416-event-auto-banner.spec.ts
 * @description E2E tests for P416: Event auto-banner via Unsplash
 *
 * Tests:
 * - Banner image displays on event detail page when banner_url is set
 * - No image slot shown on event detail when banner_url is null (gradient only)
 * - Banner thumbnail displays on event card in events list
 * - Host sees Regenerate (🔄) and Remove (✕) buttons on detail page
 * - Non-host does NOT see Regenerate/Remove buttons
 * - Remove clears banner_url → gradient fallback shows
 * - After Remove, Regenerate still works (fetches new photo)
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOCK_BANNER_URL = 'https://images.unsplash.com/photo-p416-test-banner?w=1200&q=80';
const MOCK_UNSPLASH_RESPONSE = {
  results: [
    {
      id: 'p416-test-photo',
      urls: {
        regular: MOCK_BANNER_URL,
        full: MOCK_BANNER_URL,
      },
      alt_description: 'A scenic landscape',
    },
  ],
  total: 1,
};

test.describe('P416 — Event Auto-Banner', () => {
  test.setTimeout(45000);

  let host: TestUser;
  let nonHost: TestUser;
  let eventWithBanner: TestEvent;
  let eventNoBanner: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P416 Banner Host' });
    nonHost = await createTestUser({ name: 'P416 NonHost Viewer' });

    // Event with pre-seeded banner_url — use future datetime so it appears in the upcoming events list
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    eventWithBanner = await createTestEvent(host.user.id, tomorrow, {
      title: 'Morning Hike',
    });
    await supabaseAdmin
      .from('events')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', eventWithBanner.id);

    // Event without banner
    eventNoBanner = await createTestEvent(host.user.id, undefined, {
      title: 'Evening Walk',
    });
  });

  test.afterAll(async () => {
    if (eventWithBanner?.id) await deleteTestEvent(eventWithBanner.id);
    if (eventNoBanner?.id) await deleteTestEvent(eventNoBanner.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
    if (nonHost?.user?.id) await deleteTestUser(nonHost.user.id);
  });

  test.afterEach(async () => {
    // Restore banner on eventWithBanner after each test
    await supabaseAdmin
      .from('events')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', eventWithBanner.id);
  });

  // ── Display: banner shows on event detail ────────────────────────────────
  test('banner image displays on event detail page when banner_url is set', async ({ page }) => {
    await page.goto(`/events/${eventWithBanner.slug}`);
    await page.waitForLoadState('networkidle');

    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).toBeVisible({ timeout: 10000 });
  });

  // ── Display: no image shown when banner_url is null ──────────────────────
  test('no banner image shown when banner_url is null', async ({ page }) => {
    await page.goto(`/events/${eventNoBanner.slug}`);
    await page.waitForLoadState('networkidle');

    // No img pointing to Unsplash
    const unsplashImg = page.locator('img[src*="unsplash.com"]');
    await expect(unsplashImg).not.toBeAttached();
  });

  // ── Display: banner shows on event card in list ──────────────────────────
  test('banner thumbnail displays on event card in events list', async ({ page }) => {
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    // The event card for the event with banner should contain an img
    // Use slug-based href to avoid false matches when multiple "Morning Hike" test events exist
    const eventCard = page.locator(`[data-testid="event-card"][href*="${eventWithBanner.slug}"]`);

    // Wait for the card to be visible
    await expect(eventCard).toBeVisible({ timeout: 10000 });

    // The card should contain a banner image
    const bannerImg = eventCard.locator('img').first();
    await expect(bannerImg).toBeVisible({ timeout: 5000 });
    await expect(bannerImg).toHaveAttribute('src', MOCK_BANNER_URL);
  });

  // ── Host controls: Regenerate and Remove visible to host ─────────────────
  test('host sees Regenerate and Remove buttons on event detail', async ({ page }) => {
    await setTestSession(page, host.email);

    await page.goto(`/events/${eventWithBanner.slug}`);
    await page.waitForLoadState('networkidle');

    // Regenerate button (RefreshCw icon + "New banner" label)
    const regenerateBtn = page.getByRole('button', { name: /new banner/i });
    await expect(regenerateBtn).toBeVisible({ timeout: 10000 });

    // Remove button (X icon + "Remove banner" label)
    const removeBtn = page.getByRole('button', { name: /remove banner/i });
    await expect(removeBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Non-host controls: Regenerate and Remove NOT visible ─────────────────
  test('non-host does not see Regenerate or Remove buttons', async ({ page }) => {
    await setTestSession(page, nonHost.email);

    await page.goto(`/events/${eventWithBanner.slug}`);
    await page.waitForLoadState('networkidle');

    // Event detail renders (has the event title)
    await expect(page.getByRole('heading', { name: 'Morning Hike' })).toBeVisible({ timeout: 10000 });

    // No Regenerate or Remove buttons
    await expect(page.getByRole('button', { name: /new banner/i })).not.toBeAttached();
    await expect(page.getByRole('button', { name: /remove banner/i })).not.toBeAttached();
  });

  // ── Anonymous viewer: no Regenerate or Remove buttons ────────────────────
  test('anonymous user does not see Regenerate or Remove buttons', async ({ page }) => {
    await page.goto(`/events/${eventWithBanner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Morning Hike' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /new banner/i })).not.toBeAttached();
    await expect(page.getByRole('button', { name: /remove banner/i })).not.toBeAttached();
  });

  // ── Remove: clears banner, gradient shows ────────────────────────────────
  test('Remove clears banner and gradient fallback shows', async ({ page }) => {
    await setTestSession(page, host.email);

    // Intercept Unsplash so Remove doesn't depend on external API
    await page.route('**/api.unsplash.com/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_UNSPLASH_RESPONSE),
    }));

    await page.goto(`/events/${eventWithBanner.slug}`);
    await page.waitForLoadState('networkidle');

    // Confirm banner currently visible
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).toBeVisible({ timeout: 10000 });

    // Click Remove
    await page.getByRole('button', { name: /remove banner/i }).click();
    await page.waitForLoadState('networkidle');

    // Banner image is gone
    await expect(page.locator('img[src*="unsplash.com"]')).not.toBeAttached({ timeout: 5000 });

    // DB also updated to null
    const { data } = await supabaseAdmin
      .from('events')
      .select('banner_url')
      .eq('id', eventWithBanner.id)
      .single();
    expect(data?.banner_url).toBeNull();
  });

  // ── Regenerate after Remove: fetches new photo ───────────────────────────
  test('Regenerate works after banner has been removed', async ({ page }) => {
    // Start with no banner
    await supabaseAdmin
      .from('events')
      .update({ banner_url: null })
      .eq('id', eventWithBanner.id);

    await setTestSession(page, host.email);

    // Mock Unsplash to return a new photo
    const newBannerUrl = 'https://images.unsplash.com/photo-p416-regenerated?w=1200&q=80';
    await page.route('**/api.unsplash.com/**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [
          {
            id: 'p416-regen-photo',
            urls: { regular: newBannerUrl, full: newBannerUrl },
            alt_description: 'Regenerated landscape',
          },
        ],
        total: 1,
      }),
    }));

    await page.goto(`/events/${eventWithBanner.slug}`);
    await page.waitForLoadState('networkidle');

    // "New banner" button still present even without a banner
    const regenerateBtn = page.getByRole('button', { name: /new banner/i });
    await expect(regenerateBtn).toBeVisible({ timeout: 10000 });

    await regenerateBtn.click();

    // New banner image appears
    await expect(page.locator(`img[src="${newBannerUrl}"]`)).toBeVisible({ timeout: 10000 });
  });
});
