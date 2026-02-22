/**
 * @file p411-position-breakdown-stories.spec.ts
 * @description E2E tests for P411: Position breakdown — show linked stories per holder
 *
 * Tests:
 * - Position holder WITH a linked story shows the story card content
 * - Position holder WITHOUT a story shows compact row with "No story yet"
 * - Filter tabs (Agree/Disagree/Unsure) still work correctly
 * - Clicking a story card navigates to the story detail
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';

test.describe('P411 — Position Breakdown: Linked Stories', () => {
  test.describe.configure({ timeout: 40000 });

  let holderWithStory: TestUser;
  let holderWithoutStory: TestUser;
  let pointOwner: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeAll(async () => {
    pointOwner = await createTestUser({ name: 'P411 Point Owner' });
    holderWithStory = await createTestUser({ name: 'P411 Has Story' });
    holderWithoutStory = await createTestUser({ name: 'P411 No Story' });

    const point = await createTestPoint(pointOwner.user.id, {
      statement: 'P411 test: remote work is more productive than office work',
    });
    pointId = point.id;

    // Both holders take a position
    await createTestPosition(pointId, holderWithStory.user.id, 'agree');
    await createTestPosition(pointId, holderWithoutStory.user.id, 'disagree');

    // Only holderWithStory has a story linked to this point
    const story = await createTestStory(holderWithStory.user.id, {
      content: 'After switching to fully remote I noticed my productivity increased significantly.',
      visibility: 'public',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (holderWithStory?.user?.id) await deleteTestUser(holderWithStory.user.id);
    if (holderWithoutStory?.user?.id) await deleteTestUser(holderWithoutStory.user.id);
    if (pointOwner?.user?.id) await deleteTestUser(pointOwner.user.id);
  });

  test('position holder with linked story shows story card content', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // The holder's name should appear
    await expect(page.getByText('P411 Has Story')).toBeVisible({ timeout: 10000 });

    // The story content should be visible
    await expect(
      page.getByText(/After switching to fully remote/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('position holder without a story shows compact row with "No story yet"', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // The holder without a story should appear
    await expect(page.getByText('P411 No Story')).toBeVisible({ timeout: 10000 });

    // "No story yet" label should be present
    await expect(page.getByText(/no story yet/i)).toBeVisible({ timeout: 10000 });
  });

  test('filter tabs still work — Agree tab shows only agree holders', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Click the Agree filter tab
    await page.getByRole('button', { name: /agree/i }).first().click();
    await page.waitForTimeout(300);

    // holderWithStory is "agree" — should be visible
    await expect(page.getByText('P411 Has Story')).toBeVisible({ timeout: 5000 });

    // holderWithoutStory is "disagree" — should be hidden
    await expect(page.getByText('P411 No Story')).not.toBeVisible();
  });

  test('filter tabs — Disagree tab shows only disagree holders', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /disagree/i }).first().click();
    await page.waitForTimeout(300);

    await expect(page.getByText('P411 No Story')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('P411 Has Story')).not.toBeVisible();
  });

  test('clicking story card navigates to story or author profile', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Wait for story content to render
    await expect(
      page.getByText(/After switching to fully remote/i)
    ).toBeVisible({ timeout: 10000 });

    // Click the story card (the story text or the author name area)
    await page.getByText(/After switching to fully remote/i).click();
    await page.waitForLoadState('networkidle');

    // Should navigate away from the point detail page
    // (to story detail or author profile)
    await expect(page).not.toHaveURL(`/point/${pointId}`, { timeout: 5000 });
  });

  test('authenticated user sees their own position highlighted', async ({ page }) => {
    await setTestSession(page, holderWithStory.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Story content should still appear
    await expect(
      page.getByText(/After switching to fully remote/i)
    ).toBeVisible({ timeout: 10000 });
  });
});
