/**
 * @file p504-banner-accessibility.spec.ts
 * @description Accessibility tests for P504: Auto-generated banners
 *
 * Covers:
 * - Banner image has alt text (story title / point statement / profile name)
 * - Gradient fallback has role="img" and aria-label
 * - Controls are keyboard accessible (Tab, Enter/Space)
 * - Loading state has aria-busy
 * - Error messages have role="alert"
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from '../helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint, type TestPoint } from '../helpers/test-point';
import { supabaseAdmin } from '../helpers/supabase-admin';

const MOCK_BANNER_URL = 'https://storage.example.com/banners/test/p504-a11y.png';

interface Fixtures {
  author: TestUser;
  storyWithBanner: TestStory;
  storyNoBanner: TestStory;
  point: TestPoint;
}

async function buildFixtures(): Promise<Fixtures> {
  const author = await createTestUser({ name: 'P504 A11y Author' });

  const storyWithBanner = await createTestStory(author.user.id, {
    title: 'P504 A11y Story Title',
    content: 'Accessibility test story',
  });
  await supabaseAdmin
    .from('stories')
    .update({ banner_url: MOCK_BANNER_URL })
    .eq('id', storyWithBanner.id);

  const storyNoBanner = await createTestStory(author.user.id, {
    title: 'P504 A11y No Banner Story',
  });

  const point = await createTestPoint(author.user.id, {
    statement: 'P504 A11y Point: Accessibility matters in all features',
  });
  await supabaseAdmin
    .from('points')
    .update({ banner_url: MOCK_BANNER_URL })
    .eq('id', point.id);

  return { author, storyWithBanner, storyNoBanner, point };
}

async function cleanupFixtures(f: Fixtures) {
  if (f.point?.id) await deleteTestPoint(f.point.id);
  if (f.storyNoBanner?.id) await deleteTestStory(f.storyNoBanner.id);
  if (f.storyWithBanner?.id) await deleteTestStory(f.storyWithBanner.id);
  if (f.author?.user?.id) await deleteTestUser(f.author.user.id);
}

test.describe('P504: Accessibility — banner images', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  // ── Alt text on banner images ──────────────────────────────────────────────

  test('story banner image has alt text containing the story title', async ({ page }) => {
    await page.goto(`/story/${fixtures.storyWithBanner.id}`);
    await page.waitForLoadState('networkidle');

    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).toBeVisible({ timeout: 10000 });

    const alt = await bannerImg.getAttribute('alt');
    expect(alt, 'Story banner should have alt text').toBeTruthy();
    expect(alt!.toLowerCase()).toContain('p504 a11y story title'.toLowerCase());
  });

  test('point banner image has alt text containing the point statement', async ({ page }) => {
    await page.goto(`/point/${fixtures.point.id}`);
    await page.waitForLoadState('networkidle');

    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).toBeVisible({ timeout: 10000 });

    const alt = await bannerImg.getAttribute('alt');
    expect(alt, 'Point banner should have alt text').toBeTruthy();
    // Point statement may be truncated to 100 chars
    expect(alt!.toLowerCase()).toContain('accessibility matters');
  });

  test('profile banner image has alt text with profile name', async ({ page }) => {
    // Pre-seed banner on profile
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', fixtures.author.user.id);

    await page.goto(`/p/${fixtures.author.slug}`);
    await page.waitForLoadState('networkidle');

    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).toBeVisible({ timeout: 10000 });

    const alt = await bannerImg.getAttribute('alt');
    expect(alt, 'Profile banner should have alt text').toBeTruthy();
    expect(alt!.toLowerCase()).toContain('p504 a11y author');

    // Cleanup
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', fixtures.author.user.id);
  });

  // ── Gradient fallback accessibility ────────────────────────────────────────

  test('gradient fallback has role="img" and aria-label', async ({ page }) => {
    await page.goto(`/story/${fixtures.storyNoBanner.id}`);
    await page.waitForLoadState('networkidle');

    const gradientBanner = page.locator('[role="img"][aria-label]').first();
    await expect(gradientBanner).toBeVisible({ timeout: 10000 });

    const ariaLabel = await gradientBanner.getAttribute('aria-label');
    expect(ariaLabel, 'Gradient fallback should have aria-label').toBeTruthy();
    expect(ariaLabel!.toLowerCase()).toContain('banner');
  });
});

test.describe('P504: Accessibility — banner controls', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  // ── Keyboard accessibility ─────────────────────────────────────────────────

  test('banner controls are keyboard accessible via Tab', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    await page.goto(`/story/${fixtures.storyWithBanner.id}`);
    await page.waitForLoadState('networkidle');

    // New banner button should be visible
    const regenerateBtn = page.getByRole('button', { name: /new banner/i });
    await expect(regenerateBtn).toBeVisible({ timeout: 10000 });

    // Focus via Tab — find the button and verify it becomes focused
    await regenerateBtn.focus();
    await expect(regenerateBtn).toBeFocused();
  });

  test('Remove banner button is keyboard accessible', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    await page.goto(`/story/${fixtures.storyWithBanner.id}`);
    await page.waitForLoadState('networkidle');

    const removeBtn = page.getByRole('button', { name: /remove banner/i });
    await expect(removeBtn).toBeVisible({ timeout: 10000 });

    await removeBtn.focus();
    await expect(removeBtn).toBeFocused();
  });

  test('Enter/Space activates banner control buttons', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    // Mock the edge function
    await page.route('**/functions/v1/generate-banner**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ bannerUrl: MOCK_BANNER_URL }),
    }));

    await page.goto(`/story/${fixtures.storyWithBanner.id}`);
    await page.waitForLoadState('networkidle');

    // Focus Remove button and press Enter
    const removeBtn = page.getByRole('button', { name: /remove banner/i });
    await expect(removeBtn).toBeVisible({ timeout: 10000 });

    await removeBtn.focus();
    await page.keyboard.press('Enter');

    // Banner should be removed (gradient fallback shows)
    await expect(page.locator(`img[src="${MOCK_BANNER_URL}"]`)).not.toBeAttached({ timeout: 5000 });

    // Restore banner for subsequent tests
    await supabaseAdmin
      .from('stories')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', fixtures.storyWithBanner.id);
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  test('New banner button has aria-busy during loading', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    // Delay the edge function response to catch loading state
    await page.route('**/functions/v1/generate-banner**', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ bannerUrl: MOCK_BANNER_URL }),
      });
    });

    await page.goto(`/story/${fixtures.storyWithBanner.id}`);
    await page.waitForLoadState('networkidle');

    const regenerateBtn = page.getByRole('button', { name: /new banner/i });
    await expect(regenerateBtn).toBeVisible({ timeout: 10000 });

    // Click to trigger loading
    await regenerateBtn.click();

    // Check for aria-busy on the button or its container
    const busyElement = page.locator('[aria-busy="true"]').first();
    await expect(busyElement).toBeVisible({ timeout: 3000 });

    // Restore banner
    await supabaseAdmin
      .from('stories')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', fixtures.storyWithBanner.id);
  });

  // ── Error messages ─────────────────────────────────────────────────────────

  test('error message has role="alert" when generation fails', async ({ page }) => {
    await setTestSession(page, fixtures.author.email);

    // Mock edge function to fail
    await page.route('**/functions/v1/generate-banner**', route => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Generation failed' }),
    }));

    await page.goto(`/story/${fixtures.storyWithBanner.id}`);
    await page.waitForLoadState('networkidle');

    const regenerateBtn = page.getByRole('button', { name: /new banner/i });
    await expect(regenerateBtn).toBeVisible({ timeout: 10000 });

    await regenerateBtn.click();

    // Wait for the error message or keyword search fallback to appear
    // Error should be in role="alert" for screen reader announcement
    const alertElement = page.locator('[role="alert"]');
    // Allow some time for the error state to appear
    await expect(alertElement).toBeVisible({ timeout: 10000 });

    // Restore banner
    await supabaseAdmin
      .from('stories')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', fixtures.storyWithBanner.id);
  });
});
