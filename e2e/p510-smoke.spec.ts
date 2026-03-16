/**
 * @file p510-smoke.spec.ts
 * @description Smoke tests for P510: Profile Banner UX Polish
 *
 * Fast regression detection: profile page loads without errors for owner, visitor,
 * and anonymous users. Banner area renders correctly with and without a banner image.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOCK_BANNER_URL = 'https://storage.example.com/banners/test/p510-smoke.png';

function setupErrorCollector(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]|favicon/i)) {
      errors.push(msg.text());
    }
  });
  return errors;
}

test.describe('P510 Smoke Tests', () => {
  test.setTimeout(45000);

  let owner: TestUser;
  let visitor: TestUser;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P510Smoke' });
    visitor = await createTestUser({ name: 'P510SmokeVisitor' });
  });

  test.afterAll(async () => {
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', owner.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
    if (visitor?.user?.id) await deleteTestUser(visitor.user.id);
  });

  // ── Profile page loads ───────────────────────────────────────────────────

  test('profile page loads without errors (anonymous, no banner)', async ({ page }) => {
    const errors = setupErrorCollector(page);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P510Smoke')).toBeVisible({ timeout: 10000 });

    expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('profile page loads without errors (anonymous, with banner)', async ({ page }) => {
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', owner.user.id);

    const errors = setupErrorCollector(page);

    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P510Smoke')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).toBeVisible({ timeout: 10000 });

    expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);

    // Cleanup
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', owner.user.id);
  });

  test('profile page loads without errors (owner view)', async ({ page }) => {
    const errors = setupErrorCollector(page);

    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P510Smoke')).toBeVisible({ timeout: 10000 });

    expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  test('profile page loads without errors (visitor view)', async ({ page }) => {
    const errors = setupErrorCollector(page);

    await setTestSession(page, visitor.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P510Smoke')).toBeVisible({ timeout: 10000 });

    expect(errors, `Console errors: ${errors.join('\n')}`).toHaveLength(0);
  });

  // ── Banner area renders ──────────────────────────────────────────────────

  test('gradient fallback renders when no banner image', async ({ page }) => {
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Gradient fallback should be present
    const gradientBanner = page.locator('[role="img"][aria-label*="banner" i]');
    await expect(gradientBanner).toBeVisible({ timeout: 10000 });
  });

  test('no search input visible on initial load (owner view)', async ({ page }) => {
    await setTestSession(page, owner.email);
    await page.goto(`/p/${owner.slug}`);
    await page.waitForLoadState('networkidle');

    // Search input should NOT appear on page load
    const searchInput = page.locator('input[aria-label*="describe" i], input[placeholder*="describe" i]');
    await expect(searchInput).not.toBeAttached();
  });
});
