/**
 * @file p621-unlink-point-detail.spec.ts
 * @description E2E tests for P621: Unlink button inside story card on point detail page
 *
 * Tests the unlink flow on /point/:id where the viewer's expanded story card
 * shows an unlink icon in the stats row (next to share button):
 * 1. Story author sees unlink button in their expanded story card
 * 2. Non-author does NOT see unlink button on another user's story
 * 3. Unlink flow: expand story → click unlink → confirm → story disappears
 * 4. Unlink flow: expand story → click unlink → cancel → story stays
 * 5. Point survives unlink (still exists, position intact)
 *
 * Test data setup: created directly via supabaseAdmin (bypasses RLS).
 * Single surface: point detail page (/point/:id).
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
import {
  createTestPoint,
  createTestPosition,
  deleteTestPoint,
} from './helpers/test-point';

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P621: Unlink on point detail — author visibility', () => {
  test.describe.configure({ timeout: 40000 });

  // ── 1. Story author sees unlink button in their expanded story card ───────
  test('story author sees unlink button after expanding their story', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P621 StoryAuthor' });

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'P621 unlink visibility test point',
      });
      pointId = point.id;

      await createTestPosition(pointId, authorUser.user.id, 'agree');

      const story = await createTestStory(authorUser.user.id, {
        content: 'Story that should show unlink button for its author on point detail',
        visibility: 'public',
      });
      storyId = story.id;
      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, authorUser.email);
      await page.goto(`/point/${pointId}`);
      await page.waitForLoadState('networkidle');

      // Author's position row should be visible
      await expect(page.getByText('P621 StoryAuthor')).toBeVisible({ timeout: 10000 });

      // "1 story" pill should be visible — click to expand
      const storyToggle = page.locator('[data-testid="story-toggle"]').first();
      await expect(storyToggle).toBeVisible({ timeout: 5000 });
      await storyToggle.click();

      // Story content should appear in expanded region
      await expect(
        page.getByText('Story that should show unlink button for its author on point detail')
      ).toBeVisible({ timeout: 10000 });

      // Unlink button should be visible in the stats row
      const unlinkButton = page.getByRole('button', { name: /unlink point from story/i });
      await expect(unlinkButton).toBeVisible({ timeout: 5000 });
      await expect(unlinkButton).toBeEnabled();
    } finally {
      if (storyId) await deleteTestStory(storyId);
      if (pointId) await deleteTestPoint(pointId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });

  // ── 2. Non-author does NOT see unlink button on another user's story ─────
  test('non-author does NOT see unlink button on another user\'s expanded story', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let viewerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P621 Owner' });
      viewerUser = await createTestUser({ name: 'P621 Viewer' });

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'P621 non-author visibility test point',
      });
      pointId = point.id;

      await createTestPosition(pointId, authorUser.user.id, 'agree');
      await createTestPosition(pointId, viewerUser.user.id, 'disagree');

      const story = await createTestStory(authorUser.user.id, {
        content: 'Story that should NOT show unlink to non-author viewer',
        visibility: 'public',
      });
      storyId = story.id;
      await linkStoryToPoint(storyId, pointId);

      // View as non-author
      await setTestSession(page, viewerUser.email);
      await page.goto(`/point/${pointId}`);
      await page.waitForLoadState('networkidle');

      // Author's position row should show "1 story" — expand it
      await expect(page.getByText('P621 Owner')).toBeVisible({ timeout: 10000 });
      const storyToggle = page.locator('[data-testid="story-toggle"]').first();
      await expect(storyToggle).toBeVisible({ timeout: 5000 });
      await storyToggle.click();

      // Story content should appear
      await expect(
        page.getByText('Story that should NOT show unlink to non-author viewer')
      ).toBeVisible({ timeout: 10000 });

      // Unlink button should NOT be visible
      await expect(
        page.getByRole('button', { name: /unlink point from story/i })
      ).not.toBeVisible({ timeout: 3000 });
    } finally {
      if (storyId) await deleteTestStory(storyId);
      if (pointId) await deleteTestPoint(pointId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
      if (viewerUser) await deleteTestUser(viewerUser.user.id);
    }
  });
});

test.describe('P621: Unlink on point detail — dialog flow', () => {
  test.describe.configure({ timeout: 50000 });

  // ── 3. Confirm unlink: story disappears from expanded region ─────────────
  test('confirm unlink removes story card from point detail', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P621 ConfirmUnlink' });

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'P621 confirm unlink test point',
      });
      pointId = point.id;

      await createTestPosition(pointId, authorUser.user.id, 'agree');

      const story = await createTestStory(authorUser.user.id, {
        content: 'Story to be unlinked from point via confirm dialog',
        visibility: 'public',
      });
      storyId = story.id;
      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, authorUser.email);
      await page.goto(`/point/${pointId}`);
      await page.waitForLoadState('networkidle');

      // Expand the story
      const storyToggle = page.locator('[data-testid="story-toggle"]').first();
      await expect(storyToggle).toBeVisible({ timeout: 10000 });
      await storyToggle.click();

      // Wait for story content to appear
      await expect(
        page.getByText('Story to be unlinked from point via confirm dialog')
      ).toBeVisible({ timeout: 10000 });

      // Click unlink button
      const unlinkButton = page.getByRole('button', { name: /unlink point from story/i });
      await unlinkButton.click();

      // Dialog should appear
      await expect(
        page.getByText('Unlink point from story?')
      ).toBeVisible({ timeout: 5000 });

      // Dialog body should explain the point survives
      await expect(
        page.getByText('The point will remain visible to others who have taken positions on it.')
      ).toBeVisible({ timeout: 3000 });

      // Click "Unlink" confirm button
      const confirmButton = page.getByRole('button', { name: /^Unlink$/i });
      await confirmButton.click();

      // Story card should disappear from the expanded region
      await expect(
        page.getByText('Story to be unlinked from point via confirm dialog')
      ).not.toBeVisible({ timeout: 10000 });

      // "1 story" pill should also disappear (no more linked stories)
      await expect(
        page.locator('[data-testid="story-toggle"]').filter({ hasText: 'story' })
      ).not.toBeVisible({ timeout: 5000 });
    } finally {
      if (storyId) await deleteTestStory(storyId);
      if (pointId) await deleteTestPoint(pointId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });

  // ── 4. Cancel unlink: story stays ────────────────────────────────────────
  test('cancel unlink keeps story card visible', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P621 CancelUnlink' });

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'P621 cancel unlink test point',
      });
      pointId = point.id;

      await createTestPosition(pointId, authorUser.user.id, 'agree');

      const story = await createTestStory(authorUser.user.id, {
        content: 'Story that should survive cancel in unlink dialog',
        visibility: 'public',
      });
      storyId = story.id;
      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, authorUser.email);
      await page.goto(`/point/${pointId}`);
      await page.waitForLoadState('networkidle');

      // Expand the story
      const storyToggle = page.locator('[data-testid="story-toggle"]').first();
      await expect(storyToggle).toBeVisible({ timeout: 10000 });
      await storyToggle.click();

      await expect(
        page.getByText('Story that should survive cancel in unlink dialog')
      ).toBeVisible({ timeout: 10000 });

      // Click unlink button
      const unlinkButton = page.getByRole('button', { name: /unlink point from story/i });
      await unlinkButton.click();

      // Dialog should appear
      await expect(
        page.getByText('Unlink point from story?')
      ).toBeVisible({ timeout: 5000 });

      // Click Cancel
      const cancelButton = page.getByRole('button', { name: /^Cancel$/i });
      await cancelButton.click();

      // Dialog should close
      await expect(
        page.getByText('Unlink point from story?')
      ).not.toBeVisible({ timeout: 3000 });

      // Story should still be visible
      await expect(
        page.getByText('Story that should survive cancel in unlink dialog')
      ).toBeVisible({ timeout: 3000 });
    } finally {
      if (storyId) await deleteTestStory(storyId);
      if (pointId) await deleteTestPoint(pointId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });

  // ── 5. Point survives unlink — position still intact ─────────────────────
  test('point and position remain intact after unlink from point detail', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P621 PointSurvives' });

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'P621 point that must survive unlink',
      });
      pointId = point.id;

      await createTestPosition(pointId, authorUser.user.id, 'agree');

      const story = await createTestStory(authorUser.user.id, {
        content: 'Story unlinked but point should survive on its page',
        visibility: 'public',
      });
      storyId = story.id;
      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, authorUser.email);
      await page.goto(`/point/${pointId}`);
      await page.waitForLoadState('networkidle');

      // Expand and unlink
      const storyToggle = page.locator('[data-testid="story-toggle"]').first();
      await expect(storyToggle).toBeVisible({ timeout: 10000 });
      await storyToggle.click();

      await expect(
        page.getByText('Story unlinked but point should survive on its page')
      ).toBeVisible({ timeout: 10000 });

      const unlinkButton = page.getByRole('button', { name: /unlink point from story/i });
      await unlinkButton.click();

      await expect(page.getByText('Unlink point from story?')).toBeVisible({ timeout: 5000 });

      const confirmButton = page.getByRole('button', { name: /^Unlink$/i });
      await confirmButton.click();

      // Story should disappear
      await expect(
        page.getByText('Story unlinked but point should survive on its page')
      ).not.toBeVisible({ timeout: 10000 });

      // Reload the point detail page — point should still exist
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Point statement should still be visible
      await expect(
        page.getByText('P621 point that must survive unlink')
      ).toBeVisible({ timeout: 10000 });

      // Author should still appear in the position list (position intact)
      await expect(page.getByText('P621 PointSurvives')).toBeVisible({ timeout: 5000 });
    } finally {
      if (storyId) await deleteTestStory(storyId);
      if (pointId) await deleteTestPoint(pointId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });
});
