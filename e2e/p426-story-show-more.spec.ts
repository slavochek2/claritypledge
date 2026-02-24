/**
 * @file p426-story-show-more.spec.ts
 * @description E2E tests for P426: Story "Show more" toggle
 *
 * Tests the inline expand/collapse toggle on profile story cards (StoryCardFull).
 * Live story card (LiveStoryCardExpanded) requires a full two-party session — covered
 * in UAT scenarios (features/uat/p426.md) rather than automated E2E.
 *
 * Tests:
 * - Long story shows truncated text with "Show more" button
 * - Clicking "Show more" expands to full text, button becomes "Show less"
 * - Clicking "Show less" collapses back to truncated view
 * - Short story (≤ 180 chars) shows full text with no toggle
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';

const LONG_STORY =
  'She\'s someone I\'ve known for years. Someone who matters to me. We were on a call ' +
  'trying to work something out — and I panicked. I said things I shouldn\'t have. ' +
  'Been carrying that guilt ever since. Not sure how to bring it up now.';

const SHORT_STORY = 'A quick note that fits in three lines easily.';

test.describe('P426 — Story Show More toggle (profile page)', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let longStoryId: string;
  let shortStoryId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P426StoryToggle' });
    const long = await createTestStory(testUser.user.id, { content: LONG_STORY });
    const short = await createTestStory(testUser.user.id, { content: SHORT_STORY });
    longStoryId = long.id;
    shortStoryId = short.id;
  });

  test.afterAll(async () => {
    await deleteTestStory(longStoryId);
    await deleteTestStory(shortStoryId);
    await deleteTestUser(testUser.user.id);
  });

  test('long story shows truncated text with "Show more"', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // "Show more" button visible on long story
    const showMore = page.getByRole('button', { name: /show more/i }).first();
    await expect(showMore).toBeVisible({ timeout: 10000 });

    // Full story text is NOT fully visible (truncated)
    const fullEndText = 'how to bring it up now.';
    await expect(page.getByText(fullEndText)).not.toBeVisible();
  });

  test('clicking "Show more" expands to full text and button becomes "Show less"', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    const showMore = page.getByRole('button', { name: /show more/i }).first();
    await expect(showMore).toBeVisible({ timeout: 10000 });
    await showMore.click();

    // Full text is now visible
    await expect(page.getByText('how to bring it up now.')).toBeVisible({ timeout: 5000 });

    // Button is now "Show less"
    await expect(page.getByRole('button', { name: /show less/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /show more/i }).first()).not.toBeVisible();
  });

  test('clicking "Show less" collapses back to truncated view', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Expand
    const showMore = page.getByRole('button', { name: /show more/i }).first();
    await expect(showMore).toBeVisible({ timeout: 10000 });
    await showMore.click();
    await expect(page.getByRole('button', { name: /show less/i }).first()).toBeVisible({ timeout: 5000 });

    // Collapse
    await page.getByRole('button', { name: /show less/i }).first().click();

    // "Show more" is back, full text hidden again
    await expect(page.getByRole('button', { name: /show more/i }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('how to bring it up now.')).not.toBeVisible();
  });

  test('short story shows full text with no "Show more" button', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Short story text is visible
    await expect(page.getByText(SHORT_STORY)).toBeVisible({ timeout: 10000 });

    // No "Show more" adjacent to the short story
    // (Other long stories may have "Show more", so we scope to the card)
    const shortStoryCard = page.locator('text=' + SHORT_STORY).locator('..').locator('..');
    await expect(shortStoryCard.getByRole('button', { name: /show more/i })).not.toBeVisible();
  });
});
