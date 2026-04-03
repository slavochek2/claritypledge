/**
 * @file p633-smoke.spec.ts
 * @description P633: Smoke test — story detail page loads with linked points visible.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory, linkStoryToPoint, type TestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';

test.describe('P633 Smoke: Story Detail with Linked Points', () => {
  let author: TestUser;
  let story: TestStory;
  let point: TestPoint;

  test.beforeEach(async () => {
    author = await createTestUser({ name: 'Smoke Author P633' });
    point = await createTestPoint(author.user.id, {
      statement: 'P633 smoke test point',
    });
    story = await createTestStory(author.user.id, {
      content: 'P633 smoke test story content',
    });
    await linkStoryToPoint(story.id, point.id);
  });

  test.afterEach(async () => {
    if (point?.id) await deleteTestPoint(point.id);
    if (story?.id) await deleteTestStory(story.id);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  test('story detail page loads and shows linked point', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/story/${story.id}`);
    await page.waitForLoadState('networkidle');

    // No JS errors
    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);

    // Story content visible
    await expect(page.getByText('P633 smoke test story content')).toBeVisible();

    // Points section shows count
    await expect(page.getByText('1 point')).toBeVisible();
  });
});
