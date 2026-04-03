/**
 * @file p633-unlink-story-detail.spec.ts
 * @description P633: Unlink button inside QuotedPoint on story detail page.
 *
 * Tests:
 * - Author sees unlink button on each linked point
 * - Non-author does NOT see unlink button
 * - Clicking unlink opens confirmation dialog
 * - Confirming unlink removes point from story
 * - Canceling dialog preserves point
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory, linkStoryToPoint, type TestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';

test.describe('P633: Unlink Point from Story Detail Page', () => {
  let author: TestUser;
  let viewer: TestUser;
  let story: TestStory;
  let point: TestPoint;

  test.beforeEach(async () => {
    author = await createTestUser({ name: 'Story Author P633' });
    viewer = await createTestUser({ name: 'Story Viewer P633' });
    point = await createTestPoint(author.user.id, {
      statement: 'P633 test point for unlink',
    });
    story = await createTestStory(author.user.id, {
      content: 'P633 test story with a linked point',
    });
    await linkStoryToPoint(story.id, point.id);
  });

  test.afterEach(async () => {
    if (point?.id) await deleteTestPoint(point.id);
    if (story?.id) await deleteTestStory(story.id);
    if (viewer?.user?.id) await deleteTestUser(viewer.user.id);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  test('author sees unlink button on linked point', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${story.id}`);
    await page.waitForLoadState('networkidle');

    // Expand points section if collapsed
    const expandButton = page.getByRole('button', { name: /expand|1 point/i });
    if (await expandButton.isVisible()) {
      await expandButton.click();
    }

    // Unlink button should be visible (use attribute selector per P621 lesson)
    const unlinkButton = page.locator('button[aria-label="Unlink point from story"]');
    await expect(unlinkButton).toBeVisible();
  });

  test('non-author does NOT see unlink button', async ({ page }) => {
    await setTestSession(page, viewer.email);
    await page.goto(`/story/${story.id}`);
    await page.waitForLoadState('networkidle');

    // Expand points section if collapsed
    const expandButton = page.getByRole('button', { name: /expand|1 point/i });
    if (await expandButton.isVisible()) {
      await expandButton.click();
    }

    // Unlink button should NOT exist
    const unlinkButton = page.locator('button[aria-label="Unlink point from story"]');
    await expect(unlinkButton).toHaveCount(0);
  });

  test('clicking unlink opens confirmation dialog', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${story.id}`);
    await page.waitForLoadState('networkidle');

    // Expand points section
    const expandButton = page.getByRole('button', { name: /expand|1 point/i });
    if (await expandButton.isVisible()) {
      await expandButton.click();
    }

    // Click unlink
    const unlinkButton = page.locator('button[aria-label="Unlink point from story"]');
    await unlinkButton.click();

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Unlink point from story?')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unlink' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('confirming unlink removes point from story', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${story.id}`);
    await page.waitForLoadState('networkidle');

    // Expand points section
    const expandButton = page.getByRole('button', { name: /expand|1 point/i });
    if (await expandButton.isVisible()) {
      await expandButton.click();
    }

    // Verify point text is visible
    await expect(page.getByText('P633 test point for unlink')).toBeVisible();

    // Click unlink
    const unlinkButton = page.locator('button[aria-label="Unlink point from story"]');
    await unlinkButton.click();

    // Confirm in dialog
    await page.getByRole('button', { name: 'Unlink' }).click();

    // Point should be removed — footer shows 0 points
    await expect(page.getByText('0 points')).toBeVisible();
  });

  test('canceling dialog preserves point', async ({ page }) => {
    await setTestSession(page, author.email);
    await page.goto(`/story/${story.id}`);
    await page.waitForLoadState('networkidle');

    // Expand points section
    const expandButton = page.getByRole('button', { name: /expand|1 point/i });
    if (await expandButton.isVisible()) {
      await expandButton.click();
    }

    // Click unlink
    const unlinkButton = page.locator('button[aria-label="Unlink point from story"]');
    await unlinkButton.click();

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Point should still be visible
    await expect(page.getByText('P633 test point for unlink')).toBeVisible();
  });
});
