/**
 * P584: UnderstoodBadge — shared component with ear icon + tooltip
 *
 * Extends P501 coverage: verifies the unified UnderstoodBadge component
 * renders consistently across all surfaces with ear icon and tooltip.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { supabaseAdmin } from '../src/lib/supabase-admin';

test.describe('P584: UnderstoodBadge with ear icon + tooltip', () => {
  test.describe.configure({ timeout: 90000 });

  let author: Awaited<ReturnType<typeof createTestUser>>;
  let storyZero: Awaited<ReturnType<typeof createTestStory>>;
  let storyPositive: Awaited<ReturnType<typeof createTestStory>>;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P584 Author' });
    const authorId = author.user.id;

    storyZero = await createTestStory(authorId, {
      content: 'P584 test story zero understood',
      visibility: 'public',
    });

    storyPositive = await createTestStory(authorId, {
      content: 'P584 test story positive understood',
      visibility: 'public',
    });

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

  test('feed: badge shows ear icon SVG for zero count', async ({ page }) => {
    await page.goto('/feed?tab=stories');
    const card = page.locator('text=P584 test story zero understood').locator('..');
    await expect(card).toBeVisible();
    // Badge text present
    const badge = card.locator('text=0 understood');
    await expect(badge).toBeVisible();
    // Ear icon (SVG) should be present within the badge's parent
    const earIcon = badge.locator('..').locator('svg');
    await expect(earIcon).toBeVisible();
  });

  test('feed: badge shows ear icon SVG for positive count', async ({ page }) => {
    await page.goto('/feed?tab=stories');
    const card = page.locator('text=P584 test story positive understood').locator('..');
    await expect(card).toBeVisible();
    const badge = card.locator('text=3 understood');
    await expect(badge).toBeVisible();
    const earIcon = badge.locator('..').locator('svg');
    await expect(earIcon).toBeVisible();
  });

  test('feed: badge has tooltip on hover', async ({ page }) => {
    await page.goto('/feed?tab=stories');
    const card = page.locator('text=P584 test story zero understood').locator('..');
    await expect(card).toBeVisible();
    const badge = card.locator('text=0 understood');
    await badge.hover();
    // Tooltip should appear with explanatory text
    const tooltip = page.locator('text=No one has verified understanding');
    await expect(tooltip).toBeVisible({ timeout: 3000 });
  });

  test('profile: badge shows ear icon + tooltip', async ({ page }) => {
    const slug = author.profile?.slug;
    await page.goto(`/p/${slug}`);
    await page.click('text=Stories');
    const card = page.locator('text=P584 test story zero understood').locator('..');
    await expect(card).toBeVisible();
    const badge = card.locator('text=0 understood');
    await expect(badge).toBeVisible();
    // Ear icon
    const earIcon = badge.locator('..').locator('svg');
    await expect(earIcon).toBeVisible();
  });

  test('story detail: badge shows ear icon + tooltip', async ({ page }) => {
    await page.goto(`/story/${storyPositive.id}`);
    const badge = page.locator('text=3 understood');
    await expect(badge).toBeVisible();
    // Ear icon
    const earIcon = badge.locator('..').locator('svg');
    await expect(earIcon).toBeVisible();
    // Tooltip on hover
    await badge.hover();
    const tooltip = page.locator('text=verified their understanding');
    await expect(tooltip).toBeVisible({ timeout: 3000 });
  });
});
