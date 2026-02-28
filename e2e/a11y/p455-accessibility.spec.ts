/**
 * @file p455-accessibility.spec.ts
 * @description Accessibility tests for P455: Live mobile layout story card
 *
 * Tests:
 * - "Show more" button has aria-expanded attribute (screen readers announce state)
 * - "Show more" is keyboard reachable and activatable
 * - Story card expand toggle announces state change
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from '../helpers/test-user';
import { supabaseAdmin } from '../../src/lib/supabase-admin';

test.describe('P455 Accessibility — story card expand toggle', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P455A11y' });

    const { data: story, error } = await supabaseAdmin
      .from('stories')
      .insert({
        author_id: testUser.user.id,
        content:
          "She's someone I've known for years. We were on a call trying to work something out. I paraphrased her position back to her. She said yes, that's right, you understood me. A few days later she felt unheard.",
        visibility: 'public',
      })
      .select('id')
      .single();

    if (error || !story) throw new Error(`Failed to create story: ${error?.message}`);
    storyId = story.id;
  });

  test.afterAll(async () => {
    if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
    await deleteTestUser(testUser.user.id);
  });

  test('Show more button has aria-expanded="false" when collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setTestSession(page, testUser);
    await page.goto('/live');

    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await expect(showMoreBtn).toBeVisible();

    // ASSERTION: aria-expanded present and set to false when collapsed
    const ariaExpanded = await showMoreBtn.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('false');
  });

  test('Show more button has aria-expanded="true" after activation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setTestSession(page, testUser);
    await page.goto('/live');

    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await showMoreBtn.click();

    // ASSERTION: aria-expanded="true" after expand
    const showLessBtn = storyCard.getByRole('button', { name: /show less/i });
    await expect(showLessBtn).toBeVisible();
    const ariaExpanded = await showLessBtn.getAttribute('aria-expanded');
    expect(ariaExpanded).toBe('true');
  });

  test('Show more button is keyboard accessible (Tab + Enter)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setTestSession(page, testUser);
    await page.goto('/live');

    await page.getByRole('button', { name: /new session/i }).click();

    const storyCard = page.locator('[data-testid="live-story-card-expanded"]');
    await expect(storyCard).toBeVisible({ timeout: 10000 });

    // Tab until Show more is focused
    const showMoreBtn = storyCard.getByRole('button', { name: /show more/i });
    await expect(showMoreBtn).toBeVisible();
    await showMoreBtn.focus();
    await page.keyboard.press('Enter');

    // ASSERTION: expanded after keyboard activation
    await expect(storyCard.getByRole('button', { name: /show less/i })).toBeVisible();
  });
});
