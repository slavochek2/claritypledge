/**
 * @file content-detail-smoke.spec.ts
 * Smoke tests for content detail pages — verifies /story/:id and /point/:id
 * load without JS crashes using real DB fixtures.
 *
 * Pattern: create DB fixture → navigate anonymously → check no console errors
 * → check key content visible → cleanup.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory, type TestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';

test.describe('Content Detail Page Smoke Tests', () => {
  let author: TestUser;
  let story: TestStory;
  let point: TestPoint;

  test.beforeEach(async () => {
    author = await createTestUser({ name: 'Content Author' });
    story = await createTestStory(author.user.id, {
      title: 'Smoke Test Story',
      content: 'This story was created for smoke testing.',
    });
    point = await createTestPoint(author.user.id, {
      statement: 'Smoke test point statement',
    });
  });

  test.afterEach(async () => {
    if (point?.id) await deleteTestPoint(point.id);
    if (story?.id) await deleteTestStory(story.id);
    if (author?.user?.id) await deleteTestUser(author.user.id);
  });

  test('story detail page loads without JS errors (anonymous)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/story/${story.id}`);
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
    // Story page shows the story content (not title — stories don't have titles in UI)
    await expect(page.getByText(story.content)).toBeVisible();
  });

  test('point detail page loads without JS errors (anonymous)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
    await expect(page.getByText(point.statement)).toBeVisible();
  });
});
