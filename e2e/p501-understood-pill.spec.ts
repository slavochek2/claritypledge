/**
 * P501: Unify "X understood" pill — always show, single field name
 *
 * Tests that the "X understood" pill is visible on all surfaces,
 * even when understoodCount is 0.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P501: Understood pill always visible', () => {
  test.describe.configure({ timeout: 90000 });

  let author: Awaited<ReturnType<typeof createTestUser>>;
  let storyZero: Awaited<ReturnType<typeof createTestStory>>;
  let storyPositive: Awaited<ReturnType<typeof createTestStory>>;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P501 Author' });
    const authorId = author.user.id;

    // Story with 0 understood (default)
    storyZero = await createTestStory(authorId, {
      content: 'P501 test story zero understood',
      visibility: 'public',
    });

    // Story with positive understood count
    storyPositive = await createTestStory(authorId, {
      content: 'P501 test story positive understood',
      visibility: 'public',
    });

    // Set understood_count = 3 on the positive story
    await supabaseAdmin
      .from('stories')
      .update({ understood_count: 3 })
      .eq('id', storyPositive.id);
  });

  test.afterAll(async () => {
    if (storyZero?.id) await deleteTestStory(storyZero.id);
    if (storyPositive?.id) await deleteTestStory(storyPositive.id);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  test('feed shows "0 verified" badge when count is zero', async ({ page }) => {
    await page.goto('/feed?tab=stories');
    // Find our test story card
    const card = page.locator('text=P501 test story zero understood').locator('..');
    await expect(card).toBeVisible();
    // The "0 verified" badge should be present (P584: relabeled from "understood")
    const pill = card.locator('text=0 verified');
    await expect(pill).toBeVisible();
  });

  test('feed shows "3 verified" badge when count is positive', async ({ page }) => {
    await page.goto('/feed?tab=stories');
    const card = page.locator('text=P501 test story positive understood').locator('..');
    await expect(card).toBeVisible();
    const pill = card.locator('text=3 verified');
    await expect(pill).toBeVisible();
  });

  test('profile stories tab shows "0 verified" badge', async ({ page }) => {
    const slug = author.profile?.slug;
    await page.goto(`/p/${slug}`);
    // Switch to stories tab
    await page.click('text=Stories');
    const card = page.locator('text=P501 test story zero understood').locator('..');
    await expect(card).toBeVisible();
    const pill = card.locator('text=0 verified');
    await expect(pill).toBeVisible();
  });

  test('story detail page shows "0 verified" badge', async ({ page }) => {
    await page.goto(`/story/${storyZero.id}`);
    const pill = page.locator('text=0 verified');
    await expect(pill).toBeVisible();
  });

  test('story detail page shows "3 verified" badge', async ({ page }) => {
    await page.goto(`/story/${storyPositive.id}`);
    const pill = page.locator('text=3 verified');
    await expect(pill).toBeVisible();
  });
});
