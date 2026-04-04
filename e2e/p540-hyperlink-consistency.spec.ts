/**
 * @file p540-hyperlink-consistency.spec.ts
 * @description E2E tests for P540: Hyperlink Consistency Across All Text Surfaces
 *
 * Tests:
 * - Story with raw URL renders as clickable link (new behavior)
 * - Story with markdown [text](url) renders as named link (migrated behavior)
 * - Point with raw URL renders as clickable link (new behavior)
 * - Point with markdown [text](url) renders as named link (migrated behavior)
 * - Bio with raw URL continues to work (regression)
 * - Bio with markdown [text](url) renders as named link (new behavior)
 * - All links use text-blue-500, not text-blue-600 (color consistency)
 * - Form hints visible on story creation, settings pages
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';

test.describe('P540 — Hyperlink Consistency', () => {
  test.setTimeout(45000);

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P540 Link User', role: 'Test Coach' });
  });

  test.afterAll(async () => {
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  // ── Bio: existing auto-URL behavior preserved ─────────────────────────────
  test('bio with raw URL renders as clickable link (regression)', async ({ page }) => {
    await supabaseAdmin
      .from('profiles')
      .update({ bio: 'linkedin.com/in/p540test' })
      .eq('id', user.user.id);

    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    const link = page.locator('a[href="https://linkedin.com/in/p540test"]');
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toHaveAttribute('target', '_blank');
  });

  // ── Bio: new markdown link support ─────────────────────────────────────────
  test('bio with [text](url) markdown renders as named link', async ({ page }) => {
    await supabaseAdmin
      .from('profiles')
      .update({ bio: 'Follow [my blog](https://example.com/blog) for updates' })
      .eq('id', user.user.id);

    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    const link = page.locator('a[href="https://example.com/blog"]');
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toHaveText('my blog');
  });

  // ── Stories: raw URL auto-detection (new behavior) ─────────────────────────
  // TODO: Requires creating a story with a raw URL via supabaseAdmin
  // and navigating to the story page to verify the URL is linkified.
  // Implementation depends on story creation helper — fill in during /dev.
  test.skip('story with raw URL renders as clickable link', async ({ page: _page }) => {
    // TODO: Create story with text containing "Check https://example.com"
    // Navigate to story page
    // Verify link with href https://example.com is visible
  });

  // ── Stories: markdown link (migrated behavior) ─────────────────────────────
  // TODO: Same pattern — create story with [text](url) markdown,
  // verify named link renders correctly after migration to linkifyText.
  test.skip('story with [text](url) renders as named link', async ({ page: _page }) => {
    // TODO: Create story with text containing "[read more](https://example.com/article)"
    // Navigate to story page
    // Verify link with text "read more" and correct href
  });

  // ── Color consistency ──────────────────────────────────────────────────────
  test('bio links use text-blue-500 class', async ({ page }) => {
    await supabaseAdmin
      .from('profiles')
      .update({ bio: 'Visit https://example.com' })
      .eq('id', user.user.id);

    await page.goto(`/p/${user.slug}`);
    await page.waitForLoadState('networkidle');

    const link = page.locator('a[href="https://example.com"]');
    await expect(link).toBeVisible({ timeout: 10000 });
    await expect(link).toHaveClass(/text-blue-500/);
    // Verify NO text-blue-600 (legacy LinkedText color)
    await expect(link).not.toHaveClass(/text-blue-600/);
  });

  // ── Form hints ─────────────────────────────────────────────────────────────
  test('settings page shows updated link hint with example syntax', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Should show the new hint with concrete example
    await expect(
      page.getByText(/paste urls/i)
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/click here/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('story creation page shows link hint', async ({ page }) => {
    await setTestSession(page, user.email);
    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    // Should show link hint below textarea
    await expect(
      page.getByText(/paste urls/i)
    ).toBeVisible({ timeout: 10000 });
  });

  // ── LinkedText removal verification ────────────────────────────────────────
  // This is verified by the build itself — if LinkedText is removed and
  // any import remains, TypeScript compilation fails. No E2E test needed.
});
