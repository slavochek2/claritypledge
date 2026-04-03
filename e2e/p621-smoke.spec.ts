/**
 * @file p621-smoke.spec.ts
 * @description Smoke tests for P621: Unlink button inside story card on point detail page
 *
 * Fast regression tests: point detail page loads with linked story,
 * story expands via "1 story" pill, no console errors.
 * Does NOT test the full unlink flow (see p621-unlink-point-detail.spec.ts).
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';

test.describe('P621 Smoke — Point Detail with Linked Story', () => {
  test.describe.configure({ timeout: 30000 });

  let author: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeAll(async () => {
    author = await createTestUser({ name: 'P621 Smoke Author' });

    const point = await createTestPoint(author.user.id, {
      statement: 'P621 smoke: calibrated language prevents escalation',
    });
    pointId = point.id;

    await createTestPosition(pointId, author.user.id, 'agree');

    const story = await createTestStory(author.user.id, {
      content: 'My experience with calibrated language in high-stakes conversations.',
      visibility: 'public',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  test('point detail page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P621 smoke: calibrated language prevents escalation')).toBeVisible({
      timeout: 10000,
    });

    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('position holder with story shows "1 story" pill', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P621 Smoke Author')).toBeVisible({ timeout: 10000 });

    const storyToggle = page.locator('[data-testid="story-toggle"]').first();
    await expect(storyToggle).toBeVisible({ timeout: 5000 });
    await expect(storyToggle).toContainText('story');
  });

  test('clicking "1 story" pill expands the story card', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Story text should be hidden by default
    await expect(
      page.getByText('My experience with calibrated language in high-stakes conversations.')
    ).not.toBeVisible({ timeout: 3000 });

    // Click the "1 story" pill to expand
    const storyToggle = page.locator('[data-testid="story-toggle"]').first();
    await storyToggle.click();

    // Story content should now be visible
    await expect(
      page.getByText('My experience with calibrated language in high-stakes conversations.')
    ).toBeVisible({ timeout: 10000 });
  });
});
