/**
 * @file p412-reviewer-position-removal-hides-point.spec.ts
 * @description Regression test for P412: Reviewer removing their own position should not
 * hide the owner's linked story points from the live session view.
 *
 * Bug: The filter in live-mode-view.tsx hid a point from the reviewer's view when
 * livePositions[reviewerName][pointId] === null. Since the reviewer's position status
 * should only affect their badge (not point visibility), the filter was incorrectly scoped.
 *
 * Fix: The hide-on-null filter is only applied for the story author (isAuthor=true).
 * For the reviewer (isAuthor=false), all owner-linked story points remain visible
 * regardless of the reviewer's livePositions state.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  deleteClaritySession,
} from './helpers/test-user';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';
import { waitForDBPresence, mockMicPermission } from './helpers/test-realtime';
import { completeLiveJoinIfPrompted } from './helpers/live-join';

// ─── Setup ───────────────────────────────────────────────────────────────────

async function setupTwoPartySession(
  ownerPage: Parameters<typeof mockMicPermission>[0],
  reviewerPage: Parameters<typeof mockMicPermission>[0],
  joinerUser: { email: string; name: string }
): Promise<string> {
  await ownerPage.goto('/live');
  await ownerPage.waitForLoadState('networkidle');
  await ownerPage.getByRole('button', { name: 'New session' }).click();
  await expect(ownerPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

  const shareLink = await ownerPage.getByTestId('share-link').textContent();
  const roomCode = shareLink!.split('/').pop()!;
  expect(roomCode).toHaveLength(6);

  await reviewerPage.goto(`/live/${roomCode}`);
  // Authenticated test users auto-join without the email form.
  // Try to find the email input with a short timeout; fill it only if it appears.
    // P1232: P396 removed the guest email input and the consent checkbox.
    // "Join Session" now renders only on the auto-join ERROR path, so an
    // unconditional click hangs; a guard keyed on the removed email input
    // is always false and skips the join entirely. See helpers/live-join.ts.
    await completeLiveJoinIfPrompted(reviewerPage);

  // Handle "Updated Terms" dialog — appears for both authenticated and anonymous users
  try {
    await reviewerPage.getByRole('button', { name: 'Continue' }).waitFor({ state: 'visible', timeout: 3000 });
    await reviewerPage.getByRole('button', { name: 'Continue' }).click();
  } catch {
    // No terms dialog — proceed
  }

  await waitForDBPresence('clarity_sessions', 'joiner_name', joinerUser.name, 'code', roomCode);
  return roomCode;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('P412: Reviewer removing position should not hide owner story points', () => {
  test.describe.configure({ timeout: 120000 });

  test('Reviewer removes their position — owner story point count stays at 2', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const reviewerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const reviewerPage = await reviewerContext.newPage();

    await mockMicPermission(ownerPage);
    await mockMicPermission(reviewerPage);

    let roomCode: string | null = null;
    let ownerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let reviewerUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    let storyId: string | null = null;
    let pointId1: string | null = null;
    let pointId2: string | null = null;

    try {
      const uniqueFragment = `P412Test${Date.now()}`;
      ownerUser = await createTestUser({ name: 'P412Owner' });
      reviewerUser = await createTestUser({ name: 'P412Reviewer' });

      // Owner has a story with 2 linked points
      const story = await createTestStory(ownerUser.user.id, {
        content: `${uniqueFragment}: two-point story for P412 regression`,
      });
      storyId = story.id;

      const point1 = await createTestPoint(ownerUser.user.id, {
        statement: `P412 first point ${Date.now()}`,
      });
      pointId1 = point1.id;

      const point2 = await createTestPoint(ownerUser.user.id, {
        statement: `P412 second point ${Date.now()}`,
      });
      pointId2 = point2.id;

      await linkStoryToPoint(storyId, pointId1);
      await linkStoryToPoint(storyId, pointId2);

      await setTestSession(ownerPage, ownerUser.email);
      await setTestSession(reviewerPage, reviewerUser.email);

      roomCode = await setupTwoPartySession(ownerPage, reviewerPage, reviewerUser);

      // Owner's session is ready
      await expect(
        ownerPage.getByRole('button', { name: `Does ${reviewerUser.name} understand you?` })
      ).toBeVisible({ timeout: 15000 });

      // Owner selects the story
      const searchInput = ownerPage.getByPlaceholder('Search your stories…');
      await expect(searchInput).toBeVisible({ timeout: 10000 });
      await searchInput.fill(uniqueFragment);
      await expect(ownerPage.getByRole('button', { name: new RegExp(uniqueFragment) })).toBeVisible({ timeout: 5000 });
      await ownerPage.getByRole('button', { name: new RegExp(uniqueFragment) }).click();

      // Owner sees story card with 2 points
      await expect(ownerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 5000 });

      // Reviewer sees the story card too (live_state propagated)
      await expect(reviewerPage.getByTestId('live-story-card-expanded')).toBeVisible({ timeout: 15000 });

      // Reviewer expands the points — should see "2 points"
      const reviewerExpandBtn = reviewerPage.getByRole('button', { name: /2 points/i });
      await expect(reviewerExpandBtn).toBeVisible({ timeout: 10000 });
      await reviewerExpandBtn.click();

      // Reviewer sets Agree on point 1
      const agreeBtn = reviewerPage
        .locator('button[aria-pressed]')
        .filter({ hasText: /^Agree/ })
        .first();
      await expect(agreeBtn).toBeVisible({ timeout: 5000 });
      await agreeBtn.click();
      await expect(agreeBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 3000 });

      // Reviewer removes the position (click same button again → shows confirmation dialog)
      await agreeBtn.click();
      await expect(reviewerPage.getByRole('button', { name: 'Remove position' })).toBeVisible({ timeout: 5000 });
      await reviewerPage.getByRole('button', { name: 'Remove position' }).click();

      // Wait for dialog to close
      await expect(reviewerPage.getByRole('button', { name: 'Remove position' })).not.toBeVisible({ timeout: 5000 });

      // ── REGRESSION ASSERTION ──────────────────────────────────────────────
      // Before fix: reviewer sees only 1 point (the filter hid the point)
      // After fix:  reviewer still sees both points (count stays at 2)
      await expect(reviewerPage.getByRole('button', { name: /2 points/i })).toBeVisible({ timeout: 5000 });

      // The Agree button on point 1 is now inactive (badge cleared — correct behavior)
      await expect(agreeBtn).toHaveAttribute('aria-pressed', 'false', { timeout: 3000 });

    } finally {
      await ownerContext.close();
      await reviewerContext.close();
      if (roomCode) await deleteClaritySession(roomCode);
      if (storyId) await deleteTestStory(storyId);
      if (pointId1) await deleteTestPoint(pointId1);
      if (pointId2) await deleteTestPoint(pointId2);
      if (ownerUser) await deleteTestUser(ownerUser.user.id);
      if (reviewerUser) await deleteTestUser(reviewerUser.user.id);
    }
  });
});
