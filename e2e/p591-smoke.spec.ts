/**
 * @file p591-smoke.spec.ts
 * @description Smoke tests for P591: Story Supporting Images
 *
 * Fast regression detection: pages load without errors, image renders when present,
 * no broken image tags when absent, no console errors, creation page has "Add image" button.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from './helpers/test-story';
import { supabaseAdmin } from '../src/lib/supabase-admin';

const MOCK_IMAGE_URL = 'https://storage.googleapis.com/claritypledge-story-images/test/p591-smoke.jpg';

interface Fixtures {
  user: TestUser;
  storyWithImage: TestStory;
  storyNoImage: TestStory;
}

async function buildFixtures(): Promise<Fixtures> {
  const user = await createTestUser({ name: 'P591Smoke' });

  const storyWithImage = await createTestStory(user.user.id, {
    title: `P591 smoke story with image ${Date.now()}`,
    content: 'Smoke test story with a supporting image.',
    visibility: 'public',
  });
  await supabaseAdmin
    .from('stories')
    .update({ image_url: MOCK_IMAGE_URL })
    .eq('id', storyWithImage.id);

  const storyNoImage = await createTestStory(user.user.id, {
    title: `P591 smoke story no image ${Date.now()}`,
    content: 'Smoke test story without any image.',
    visibility: 'public',
  });

  return { user, storyWithImage, storyNoImage };
}

async function cleanupFixtures(f: Fixtures) {
  if (f.storyNoImage?.id) await deleteTestStory(f.storyNoImage.id);
  if (f.storyWithImage?.id) await deleteTestStory(f.storyWithImage.id);
  if (f.user?.user?.id) await deleteTestUser(f.user.user.id);
}

test.describe('P591: Smoke tests', () => {
  let fixtures: Fixtures;

  test.beforeAll(async () => {
    fixtures = await buildFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures(fixtures);
  });

  // ── Story detail page loads ─────────────────────────────────────────────

  test('story detail page loads without errors (with image)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/story/${fixtures.storyWithImage.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    // Image element present with correct src
    const img = page.locator(`img[src="${MOCK_IMAGE_URL}"]`);
    await expect(img).toBeVisible({ timeout: 10000 });

    // No console errors (filter known noise)
    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);
  });

  test('story detail page loads without errors (without image)', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(`/story/${fixtures.storyNoImage.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    // No image element pointing to story-images bucket
    const img = page.locator('img[src*="claritypledge-story-images"]');
    await expect(img).not.toBeAttached();

    const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('net::'));
    expect(realErrors).toHaveLength(0);
  });

  // ── Story title is visible regardless of image ──────────────────────────

  test('story title is visible (with image)', async ({ page }) => {
    await page.goto(`/story/${fixtures.storyWithImage.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/P591 smoke story with image/)).toBeVisible({ timeout: 10000 });
  });

  test('story title is visible (without image)', async ({ page }) => {
    await page.goto(`/story/${fixtures.storyNoImage.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/P591 smoke story no image/)).toBeVisible({ timeout: 10000 });
  });

  // ── No layout shift from image area ─────────────────────────────────────

  test('story without image has no empty image placeholder', async ({ page }) => {
    await page.goto(`/story/${fixtures.storyNoImage.id}`);
    await page.waitForLoadState('networkidle');

    // No skeleton, no empty container for image
    const imageContainer = page.locator('[data-testid="story-image-container"]');
    await expect(imageContainer).not.toBeAttached();
  });

  // ── Story creation page has "Add image" button ──────────────────────────

  test('story creation page loads with "Add image" button', async ({ page }) => {
    await setTestSession(page, fixtures.user.email);

    await page.goto('/create');
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /add.*image/i });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
  });

  // ── Image does not break existing banner_url OG ─────────────────────────

  test('story with image still has correct page title', async ({ page }) => {
    await page.goto(`/story/${fixtures.storyWithImage.id}`);
    await page.waitForLoadState('networkidle');

    // Page should have the story title in the document title
    const pageTitle = await page.title();
    expect(pageTitle.toLowerCase()).toContain('p591');
  });
});
