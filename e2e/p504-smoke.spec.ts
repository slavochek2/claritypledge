/**
 * @file p504-smoke.spec.ts
 * @description Smoke tests for P504: Auto-generated banners for stories, points, profiles
 *
 * Fast regression detection: pages load without errors, banner areas render,
 * no console errors. Tests both with and without pre-seeded banners.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';
import { supabaseAdmin } from './helpers/supabase-admin';

const MOCK_BANNER_URL = 'https://storage.example.com/banners/test/p504-smoke.png';

interface Fixtures {
  user: TestUser;
  storyWithBanner: TestStory;
  storyNoBanner: TestStory;
  pointWithBanner: TestPoint;
  pointNoBanner: TestPoint;
}

async function buildFixtures(): Promise<Fixtures> {
  const user = await createTestUser({ name: 'P504Smoke' });

  const storyWithBanner = await createTestStory(user.user.id, {
    title: `P504 smoke story with banner ${Date.now()}`,
  });
  await supabaseAdmin
    .from('stories')
    .update({ banner_url: MOCK_BANNER_URL })
    .eq('id', storyWithBanner.id);

  const storyNoBanner = await createTestStory(user.user.id, {
    title: `P504 smoke story no banner ${Date.now()}`,
  });

  const pointWithBanner = await createTestPoint(user.user.id, {
    statement: `P504 smoke point with banner ${Date.now()}`,
  });
  await supabaseAdmin
    .from('points')
    .update({ banner_url: MOCK_BANNER_URL })
    .eq('id', pointWithBanner.id);

  const pointNoBanner = await createTestPoint(user.user.id, {
    statement: `P504 smoke point no banner ${Date.now()}`,
  });

  return { user, storyWithBanner, storyNoBanner, pointWithBanner, pointNoBanner };
}

async function cleanupFixtures(f: Fixtures) {
  if (f.pointNoBanner?.id) await deleteTestPoint(f.pointNoBanner.id);
  if (f.pointWithBanner?.id) await deleteTestPoint(f.pointWithBanner.id);
  if (f.storyNoBanner?.id) await deleteTestStory(f.storyNoBanner.id);
  if (f.storyWithBanner?.id) await deleteTestStory(f.storyWithBanner.id);
  if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
}

test.describe('P504: Smoke tests', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  // ── Story detail pages ─────────────────────────────────────────────────────

  test('story detail page loads without errors (with banner)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/story/${fixtures.storyWithBanner.id}`);
    await page.waitForLoadState('networkidle');

    // Page renders content
    await expect(page.locator('body')).toBeVisible();

    // Banner image is present
    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).toBeVisible({ timeout: 10000 });

    // No console errors (filter known noise)
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);
  });

  test('story detail page loads without errors (without banner)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/story/${fixtures.storyNoBanner.id}`);
    await page.waitForLoadState('networkidle');

    // Page renders content
    await expect(page.locator('body')).toBeVisible();

    // No banner image
    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).not.toBeAttached();

    // Gradient fallback or banner area should exist
    const bannerArea = page.locator('[role="img"][aria-label*="banner" i]');
    await expect(bannerArea).toBeVisible({ timeout: 10000 });

    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);
  });

  // ── Point detail pages ─────────────────────────────────────────────────────

  test('point detail page loads without errors (with banner)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/point/${fixtures.pointWithBanner.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).toBeVisible({ timeout: 10000 });

    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);
  });

  test('point detail page loads without errors (without banner)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/point/${fixtures.pointNoBanner.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);
  });

  // ── Profile page ───────────────────────────────────────────────────────────

  test('profile page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/p/${fixtures.user.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    // Profile name visible
    await expect(page.getByText('P504Smoke')).toBeVisible({ timeout: 10000 });

    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);
  });

  test('profile page with banner loads without errors', async ({ page }) => {
    // Pre-seed banner on profile
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: MOCK_BANNER_URL })
      .eq('id', fixtures.user.user.id);

    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/p/${fixtures.user.slug}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    const bannerImg = page.locator(`img[src="${MOCK_BANNER_URL}"]`);
    await expect(bannerImg).toBeVisible({ timeout: 10000 });

    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);

    // Cleanup
    await supabaseAdmin
      .from('profiles')
      .update({ banner_url: null })
      .eq('id', fixtures.user.user.id);
  });

  // ── OG endpoint ────────────────────────────────────────────────────────────

  test('OG endpoint returns valid response for story', async ({ request }) => {
    const response = await request.get(`/api/og?path=/story/${fixtures.storyWithBanner.id}`);
    // OG endpoint may return 200 or redirect — just ensure no 500
    expect(response.status()).toBeLessThan(500);
  });

  test('OG endpoint returns valid response for point', async ({ request }) => {
    const response = await request.get(`/api/og?path=/point/${fixtures.pointWithBanner.id}`);
    expect(response.status()).toBeLessThan(500);
  });

  test('OG endpoint returns valid response for profile', async ({ request }) => {
    const response = await request.get(`/api/og?path=/p/${fixtures.user.slug}`);
    expect(response.status()).toBeLessThan(500);
  });
});
