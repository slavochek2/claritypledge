/**
 * @file p407-smoke.spec.ts
 * @description Smoke tests for P407: Unify Story Detail Points — Remove Duplicate List, Add Author Unlink to Card
 *
 * Fast regression checks:
 * 1. Story detail page loads without JS errors for authenticated user
 * 2. Story detail page loads without JS errors for unauthenticated visitor (public story)
 * 3. Points section is visible when story has linked points
 *
 * These catch regressions where:
 * - The /story/:id route is broken
 * - Points section fails to render after P407 changes
 * - Duplicate point list was accidentally re-introduced
 * - Console errors thrown during auto-expand of points
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
} from './helpers/test-user';
import {
  createTestStory,
  linkStoryToPoint,
  deleteTestStory,
} from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

test.describe('P407 Smoke: Story Detail Points', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 1. Story detail loads without JS errors (authenticated) ───────────────
  test('story detail page loads without uncaught JS errors for authenticated user', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    try {
      testUser = await createTestUser({ name: 'P407 Smoke AuthUser' });

      const story = await createTestStory(testUser.user.id, {
        title: 'P407 Smoke Story',
        content: 'Smoke test story with linked points',
        visibility: 'public',
      });
      storyId = story.id;

      const point = await createTestPoint(testUser.user.id, {
        statement: 'Smoke test point for P407',
      });
      pointId = point.id;

      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, testUser.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Story content should be visible
      await expect(
        page.getByText('Smoke test story with linked points')
      ).toBeVisible({ timeout: 10000 });

      // No uncaught JS errors
      const appErrors = consoleErrors.filter(
        e => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 2. Story detail loads without JS errors (unauthenticated, public) ─────
  test('story detail page loads without uncaught JS errors for unauthenticated visitor', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    try {
      authorUser = await createTestUser({ name: 'P407 Smoke AnonAuthor' });

      const story = await createTestStory(authorUser.user.id, {
        title: 'P407 Smoke Public Story',
        content: 'Public story visible without login',
        visibility: 'public',
      });
      storyId = story.id;

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'Public point for anon smoke test',
      });
      pointId = point.id;

      await linkStoryToPoint(storyId, pointId);

      // No session — visit as unauthenticated user
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Story should be visible
      await expect(
        page.getByText('Public story visible without login')
      ).toBeVisible({ timeout: 10000 });

      // No uncaught JS errors
      const appErrors = consoleErrors.filter(
        e => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });

  // ── 3. Points section visible when story has linked points ─────────────────
  test('points section is visible when story has linked points', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      testUser = await createTestUser({ name: 'P407 Smoke PointsVisible' });

      const story = await createTestStory(testUser.user.id, {
        title: 'P407 Points Visible Smoke',
        content: 'Story to confirm points section renders',
        visibility: 'public',
      });
      storyId = story.id;

      const point = await createTestPoint(testUser.user.id, {
        statement: 'A point that must be visible in the story card',
      });
      pointId = point.id;

      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, testUser.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // The linked point text should be visible in the card (auto-expanded)
      await expect(
        page.getByText('A point that must be visible in the story card')
      ).toBeVisible({ timeout: 10000 });

      // The points count label should appear in the card footer
      await expect(
        page.getByText(/1 point/i)
      ).toBeVisible({ timeout: 5000 });
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});
