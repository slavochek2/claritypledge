/**
 * @file p616-unlink-point.spec.ts
 * @description E2E tests for P616: Unlink Point from Story
 *
 * Tests the unlink button and confirmation dialog on the story detail page:
 * 1. Author sees unlink button on linked points
 * 2. Non-author does NOT see unlink button
 * 3. Unlink flow: click → dialog → confirm → point removed
 * 4. Unlink flow: click → dialog → cancel → point stays
 * 5. Point survives unlink (still exists on its own detail page)
 *
 * Test data setup: created directly via supabaseAdmin (bypasses RLS).
 * BR-1 (RemovePositionDialog fix) is already shipped — not tested here.
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

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P616: Unlink point — author visibility', () => {
  test.describe.configure({ timeout: 40000 });

  // ── 1. Author sees unlink button on linked points ─────────────────────────
  test('author sees unlink button on each linked point', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P616 UnlinkAuthor' });

      const story = await createTestStory(authorUser.user.id, {
        title: 'P616 Unlink Visibility Story',
        content: 'Story for testing unlink button visibility',
        visibility: 'public',
      });
      storyId = story.id;

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'Point that should show unlink button for author',
      });
      pointId = point.id;

      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, authorUser.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Wait for the point to be visible
      await expect(
        page.getByText('Point that should show unlink button for author')
      ).toBeVisible({ timeout: 10000 });

      // Unlink button should be visible (aria-label matches tooltip text)
      const unlinkButton = page.getByRole('button', { name: /unlink point from story/i });
      await expect(unlinkButton).toBeVisible({ timeout: 5000 });

      // Verify it's a button element (keyboard accessible)
      await expect(unlinkButton).toBeEnabled();
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });

  // ── 2. Non-author does NOT see unlink button ──────────────────────────────
  test('non-author does NOT see unlink button', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let viewerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P616 StoryOwner' });
      viewerUser = await createTestUser({ name: 'P616 NonAuthorViewer' });

      const story = await createTestStory(authorUser.user.id, {
        title: 'P616 Non-Author Unlink Story',
        content: 'Story for testing unlink button hidden from non-author',
        visibility: 'public',
      });
      storyId = story.id;

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'Point without unlink button for non-author',
      });
      pointId = point.id;

      await linkStoryToPoint(storyId, pointId);

      // View as non-author
      await setTestSession(page, viewerUser.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Point should be visible (public story)
      await expect(
        page.getByText('Point without unlink button for non-author')
      ).toBeVisible({ timeout: 10000 });

      // Unlink button should NOT be visible
      await expect(
        page.getByRole('button', { name: /unlink point from story/i })
      ).not.toBeVisible({ timeout: 3000 });
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
      if (viewerUser) await deleteTestUser(viewerUser.user.id);
    }
  });
});

test.describe('P616: Unlink point — dialog flow', () => {
  test.describe.configure({ timeout: 50000 });

  // ── 3. Unlink flow: click → dialog → confirm → point removed ─────────────
  test('unlink flow: confirm removes point from story', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P616 UnlinkConfirm' });

      const story = await createTestStory(authorUser.user.id, {
        title: 'P616 Confirm Unlink Story',
        content: 'Story for testing unlink confirmation flow',
        visibility: 'public',
      });
      storyId = story.id;

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'Point to be unlinked via confirm dialog',
      });
      pointId = point.id;

      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, authorUser.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Wait for point to be visible
      await expect(
        page.getByText('Point to be unlinked via confirm dialog')
      ).toBeVisible({ timeout: 10000 });

      // Click unlink button
      const unlinkButton = page.getByRole('button', { name: /unlink point from story/i });
      await unlinkButton.click();

      // Dialog should appear with correct title
      await expect(
        page.getByText('Unlink point from story?')
      ).toBeVisible({ timeout: 5000 });

      // Dialog body should explain the point survives
      await expect(
        page.getByText('The point will remain visible to others who have taken positions on it.')
      ).toBeVisible({ timeout: 3000 });

      // Point preview should be shown in dialog (truncated statement)
      await expect(
        page.getByText(/Point to be unlinked via confirm dialog/)
      ).toHaveCount(2, { timeout: 3000 }); // one in the list, one in the dialog preview

      // Click "Unlink" confirm button
      const confirmButton = page.getByRole('button', { name: /^Unlink$/i });
      await confirmButton.click();

      // Point should disappear from the story detail page
      await expect(
        page.getByText('Point to be unlinked via confirm dialog')
      ).not.toBeVisible({ timeout: 10000 });

      // Success toast
      await expect(
        page.getByText('Point unlinked from story.')
      ).toBeVisible({ timeout: 5000 });
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });

  // ── 4. Unlink flow: click → dialog → cancel → point stays ────────────────
  test('unlink flow: cancel keeps point in story', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P616 UnlinkCancel' });

      const story = await createTestStory(authorUser.user.id, {
        title: 'P616 Cancel Unlink Story',
        content: 'Story for testing unlink cancel flow',
        visibility: 'public',
      });
      storyId = story.id;

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'Point that should survive cancel',
      });
      pointId = point.id;

      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, authorUser.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Wait for point
      await expect(
        page.getByText('Point that should survive cancel')
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

      // Point should still be visible
      await expect(
        page.getByText('Point that should survive cancel')
      ).toBeVisible({ timeout: 3000 });
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });

  // ── 5. Point survives unlink — still accessible on its own page ───────────
  test('point still exists on its detail page after unlink', async ({ page }) => {
    let authorUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      authorUser = await createTestUser({ name: 'P616 PointSurvives' });

      const story = await createTestStory(authorUser.user.id, {
        title: 'P616 Point Survives Story',
        content: 'Story for testing point survives after unlink',
        visibility: 'public',
      });
      storyId = story.id;

      const point = await createTestPoint(authorUser.user.id, {
        statement: 'Point that must survive after being unlinked',
      });
      pointId = point.id;

      await linkStoryToPoint(storyId, pointId);

      await setTestSession(page, authorUser.email);
      await page.goto(`/story/${storyId}`);
      await page.waitForLoadState('networkidle');

      // Wait for point to be visible
      await expect(
        page.getByText('Point that must survive after being unlinked')
      ).toBeVisible({ timeout: 10000 });

      // Unlink the point
      const unlinkButton = page.getByRole('button', { name: /unlink point from story/i });
      await unlinkButton.click();

      await expect(
        page.getByText('Unlink point from story?')
      ).toBeVisible({ timeout: 5000 });

      const confirmButton = page.getByRole('button', { name: /^Unlink$/i });
      await confirmButton.click();

      // Wait for point to disappear from story
      await expect(
        page.getByText('Point that must survive after being unlinked')
      ).not.toBeVisible({ timeout: 10000 });

      // Navigate to the point detail page — point should still exist
      await page.goto(`/point/${pointId}`);
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText('Point that must survive after being unlinked')
      ).toBeVisible({ timeout: 10000 });
    } finally {
      if (pointId) await deleteTestPoint(pointId);
      if (storyId) await deleteTestStory(storyId);
      if (authorUser) await deleteTestUser(authorUser.user.id);
    }
  });
});
