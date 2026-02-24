/**
 * @file p418-banner-search-fallback.spec.ts
 * @description E2E tests for P418: Banner Search Fallback
 *
 * Tests:
 * - Regression: "New banner" with valid keywords still works (no search input shown)
 * - Failure path: when Unsplash returns no results, inline search input appears
 * - Custom search succeeds: input hides, banner updates in UI and DB
 * - Custom search fails: input stays, inline error message shown
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestEvent, deleteTestEvent, type TestEvent } from './helpers/test-event';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOCK_BANNER_URL = 'https://images.unsplash.com/photo-p418-test?w=1200&q=80';
const EMPTY_UNSPLASH_RESPONSE = { results: [], total: 0 };
const SUCCESSFUL_UNSPLASH_RESPONSE = {
  results: [
    {
      id: 'p418-custom-photo',
      urls: { regular: MOCK_BANNER_URL, full: MOCK_BANNER_URL },
      alt_description: 'Trail in the mountains',
    },
  ],
  total: 1,
};

test.describe('P418 — Banner Search Fallback', () => {
  test.setTimeout(45000);

  let host: TestUser;
  let event: TestEvent;

  test.beforeAll(async () => {
    host = await createTestUser({ name: 'P418 Banner Host' });
    event = await createTestEvent(host.user.id, undefined, { title: 'Trail Running Bangkok' });
  });

  test.afterAll(async () => {
    if (event?.id) await deleteTestEvent(event.id);
    if (host?.user?.id) await deleteTestUser(host.user.id);
  });

  test.afterEach(async () => {
    // Reset banner_url after each test
    await supabaseAdmin.from('events').update({ banner_url: null }).eq('id', event.id);
  });

  // ── Regression: happy path still works ────────────────────────────────────
  test('New banner with valid Unsplash result updates banner without showing search input', async ({ page }) => {
    await setTestSession(page, host.email);

    await page.route('**/api.unsplash.com/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUCCESSFUL_UNSPLASH_RESPONSE) })
    );

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new banner/i }).click();

    // Banner image appears
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).toBeVisible({ timeout: 10000 });

    // Search input should NOT appear (happy path)
    await expect(page.getByPlaceholder(/trail running/i)).not.toBeAttached();
    await expect(page.getByRole('button', { name: /search/i })).not.toBeAttached();
  });

  // ── Failure path: search input appears ────────────────────────────────────
  test('when Unsplash returns no results, inline search input appears below banner buttons', async ({ page }) => {
    await setTestSession(page, host.email);

    await page.route('**/api.unsplash.com/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_UNSPLASH_RESPONSE) })
    );

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /new banner/i }).click();

    // Search input should appear
    const searchInput = page.getByRole('textbox', { name: /search/i });
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Search button should appear
    await expect(page.getByRole('button', { name: /search/i })).toBeVisible({ timeout: 5000 });
  });

  // ── Search input not shown on page load ───────────────────────────────────
  test('search input is NOT shown on initial page load', async ({ page }) => {
    await setTestSession(page, host.email);

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('textbox', { name: /search/i })).not.toBeAttached();
  });

  // ── Custom search succeeds ─────────────────────────────────────────────────
  test('typing custom keywords and submitting updates banner and hides search input', async ({ page }) => {
    await setTestSession(page, host.email);

    // First call returns empty (triggers fallback), second returns result
    let callCount = 0;
    await page.route('**/api.unsplash.com/**', route => {
      callCount++;
      const response = callCount === 1 ? EMPTY_UNSPLASH_RESPONSE : SUCCESSFUL_UNSPLASH_RESPONSE;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    // Trigger failure
    await page.getByRole('button', { name: /new banner/i }).click();
    const searchInput = page.getByRole('textbox', { name: /search/i });
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Type and submit
    await searchInput.fill('trail running mountains');
    await page.getByRole('button', { name: /search/i }).click();

    // Banner updates
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).toBeVisible({ timeout: 10000 });

    // Search input hides on success
    await expect(page.getByRole('textbox', { name: /search/i })).not.toBeAttached({ timeout: 5000 });

    // DB updated
    const { data } = await supabaseAdmin
      .from('events')
      .select('banner_url')
      .eq('id', event.id)
      .single();
    expect(data?.banner_url).toBe(MOCK_BANNER_URL);
  });

  // ── Custom search fails ────────────────────────────────────────────────────
  test('when custom search also returns no results, input stays and inline error shown', async ({ page }) => {
    await setTestSession(page, host.email);

    // All Unsplash calls return empty
    await page.route('**/api.unsplash.com/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_UNSPLASH_RESPONSE) })
    );

    await page.goto(`/events/${event.slug}`);
    await page.waitForLoadState('networkidle');

    // Trigger failure
    await page.getByRole('button', { name: /new banner/i }).click();
    const searchInput = page.getByRole('textbox', { name: /search/i });
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Type gibberish and submit
    await searchInput.fill('xyzxyzxyz');
    await page.getByRole('button', { name: /search/i }).click();

    // Input should still be visible (not hidden)
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Inline error message shown (no photo found message)
    const errorMsg = page.getByText(/no photos found/i);
    await expect(errorMsg).toBeVisible({ timeout: 5000 });
  });
});
