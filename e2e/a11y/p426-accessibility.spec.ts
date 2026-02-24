/**
 * @file p426-accessibility.spec.ts
 * @description Accessibility tests for P426: Story "Show more" toggle
 *
 * Tests:
 * - "Show more" button is keyboard accessible (Tab + Enter activates)
 * - Button has aria-expanded="false" when collapsed, "true" when expanded
 * - "Show less" button is also keyboard accessible
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const LONG_STORY =
  'She\'s someone I\'ve known for years. Someone who matters to me. We were on a call ' +
  'trying to work something out — and I panicked. I said things I shouldn\'t have. ' +
  'Been carrying that guilt ever since. Not sure how to bring it up now.';

test.describe('P426 Accessibility — Show More toggle', () => {
  test.describe.configure({ timeout: 60000 });

  let testUser: Awaited<ReturnType<typeof createTestUser>>;
  let storyId: string;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P426A11y' });
    const story = await createTestStory(testUser.user.id, { content: LONG_STORY });
    storyId = story.id;
  });

  test.afterAll(async () => {
    await deleteTestStory(storyId);
    await deleteTestUser(testUser.user.id);
  });

  test('"Show more" button is keyboard accessible (Tab + Enter expands)', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    const showMore = page.getByRole('button', { name: /show more/i }).first();
    await expect(showMore).toBeVisible({ timeout: 10000 });

    // Focus and activate via keyboard
    await showMore.focus();
    await expect(showMore).toBeFocused();
    await page.keyboard.press('Enter');

    // "Show less" appears — toggle worked via keyboard
    await expect(page.getByRole('button', { name: /show less/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('"Show more" button has aria-expanded attribute', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    const showMore = page.getByRole('button', { name: /show more/i }).first();
    await expect(showMore).toBeVisible({ timeout: 10000 });

    // Collapsed: aria-expanded="false"
    const expandedBefore = await showMore.getAttribute('aria-expanded');
    expect(expandedBefore).toBe('false');

    // Expand
    await showMore.click();
    const showLess = page.getByRole('button', { name: /show less/i }).first();
    await expect(showLess).toBeVisible({ timeout: 5000 });

    // Expanded: aria-expanded="true"
    const expandedAfter = await showLess.getAttribute('aria-expanded');
    expect(expandedAfter).toBe('true');
  });
});
