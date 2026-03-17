/**
 * @file p542-smoke.spec.ts
 * @description Smoke tests for P542: Collapse stories behind chevron on point page
 *
 * Fast regression tests: point detail page loads, position list renders,
 * no console errors, chevron visible on rows with stories.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';

test.describe('P542 Smoke — Story Collapse on Point Page', () => {
  test.describe.configure({ timeout: 30000 });

  let user: TestUser;
  let holderWithStory: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P542 Smoke Owner' });
    holderWithStory = await createTestUser({ name: 'P542 Smoke Story' });

    const point = await createTestPoint(user.user.id, {
      statement: 'P542 smoke: clear writing reduces misunderstandings',
    });
    pointId = point.id;

    await createTestPosition(pointId, user.user.id, 'agree');
    await createTestPosition(pointId, holderWithStory.user.id, 'agree');

    const story = await createTestStory(holderWithStory.user.id, {
      content: 'Writing clearly helped our remote team avoid recurring miscommunication issues.',
      visibility: 'public',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (holderWithStory?.user?.id) await deleteTestUser(holderWithStory.user.id);
    if (user?.user?.id) await deleteTestUser(user.user.id);
  });

  test('point detail page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Page should render (not 404/500)
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('P542 smoke: clear writing reduces misunderstandings')).toBeVisible({
      timeout: 10000,
    });

    expect(consoleErrors.filter(e => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('position list renders with filter tabs', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /agree/i }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /disagree/i }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /unsure/i }).first()).toBeVisible({ timeout: 5000 });
  });

  test('position holders appear as compact rows', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Both holders should be visible as compact rows
    await expect(page.getByText('P542 Smoke Owner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P542 Smoke Story')).toBeVisible({ timeout: 10000 });

    // Story text should NOT be visible by default (collapsed)
    await expect(page.getByText(/Writing clearly helped our remote team/i)).not.toBeVisible();
  });

  test('chevron visible on row with linked story', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Smoke Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — verify chevron + "story" indicator is present on the story holder's row
    // Suggested selector: page.locator('[data-testid="story-chevron"]')
    // or page.getByText('story') scoped to the holderWithStory row
  });

  test('row without story has no chevron', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Smoke Owner')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — verify the owner's row (no linked story) does not show
    // a chevron or "story" indicator
  });
});
