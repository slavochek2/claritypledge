/**
 * @file p402-points-tab.spec.ts
 * @description E2E tests for P402 — Profile Points Tab Shows Wrong Points
 *
 * Bug: The Points tab showed points the user CREATED (first_validator_id = user_id),
 * not points they have POSITIONS on. A user who positioned on 10 others' points saw
 * zero in their tab. A user who created points but had no positions still saw them.
 *
 * Fix: getPointsForProfileDisplay queries point_positions.user_id instead of
 * first_validator_id. getPointsWithUserPositions uses batch queries (no N+1).
 *
 * Test coverage:
 * C1: User positions on another user's point → appears in their Points tab
 * C2: User who created points but has no positions → Points tab is empty
 * C3: Tab count matches actual positions held
 * C4: profileSubjectPosition still renders the badge when a visitor views the tab
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  createTestPoint,
  createTestPosition,
  deleteTestPoint,
  type TestPoint,
} from './helpers/test-point';

test.describe('P402: Points tab — shows positions held, not points created', () => {
  /**
   * C1: User takes position on a point created by another user →
   *     that point appears in their own Points tab.
   *
   * Before fix: tab queried first_validator_id — point would only appear on
   *             the creator's tab (userA), never on the positioner's (userB).
   * After fix:  tab queries point_positions.user_id — point appears on userB's tab.
   */
  test('C1: positioned-on point from another user appears in own Points tab', async ({ page }) => {
    let userA: TestUser | null = null; // creator
    let userB: TestUser | null = null; // positioner
    let point: TestPoint | null = null;

    try {
      userA = await createTestUser({ name: 'P402 Creator' });
      userB = await createTestUser({ name: 'P402 Positioner' });

      // userA creates the point; userB takes a position on it
      point = await createTestPoint(userA.user.id, {
        statement: 'P402 C1: point created by A, positioned on by B',
      });
      await createTestPosition(point.id, userB.user.id, 'agree');

      // userB visits their own profile
      await setTestSession(page, userB.email);
      await page.goto(`/p/${userB.slug}`);
      await page.getByRole('tab', { name: /points/i }).click();
      await page.waitForLoadState('networkidle');

      // The point created by userA must appear in userB's Points tab
      await expect(
        page.getByText('P402 C1: point created by A, positioned on by B')
      ).toBeVisible({ timeout: 10000 });
    } finally {
      if (point?.id) await deleteTestPoint(point.id);
      if (userA?.user?.id) {
        try { await deleteTestUser(userA.user.id); } catch { /* non-blocking */ }
      }
      if (userB?.user?.id) {
        try { await deleteTestUser(userB.user.id); } catch { /* non-blocking */ }
      }
    }
  });

  /**
   * C2: User who created points but has NO positions on them →
   *     their Points tab is empty.
   *
   * Before fix: tab showed points where first_validator_id = user → non-empty (wrong).
   * After fix:  tab queries positions held → empty (correct).
   */
  test('C2: creator with no positions sees empty Points tab', async ({ page }) => {
    let creator: TestUser | null = null;
    let point: TestPoint | null = null;

    try {
      creator = await createTestUser({ name: 'P402 Creator No Positions' });

      // Creator creates a point but does NOT take a position on it
      point = await createTestPoint(creator.user.id, {
        statement: 'P402 C2: point created but no position taken',
      });

      // Creator views their own profile
      await setTestSession(page, creator.email);
      await page.goto(`/p/${creator.slug}`);
      await page.getByRole('tab', { name: /points/i }).click();
      await page.waitForLoadState('networkidle');

      // The point must NOT appear — creator has no position on it
      await expect(
        page.getByText('P402 C2: point created but no position taken')
      ).not.toBeVisible({ timeout: 5000 });

      // Tab should show an empty state or zero count — not the created point
      // Allow flexibility: some implementations show "No points yet" or blank
      // The key invariant is the specific point text is absent
    } finally {
      if (point?.id) await deleteTestPoint(point.id);
      if (creator?.user?.id) {
        try { await deleteTestUser(creator.user.id); } catch { /* non-blocking */ }
      }
    }
  });

  /**
   * C3: Tab count badge (if present) matches actual positions held.
   *
   * userB takes positions on 2 points. If a count badge renders on the Points tab,
   * it must show 2 (positions held), not 0 or some other number.
   */
  test('C3: Points tab count matches positions held', async ({ page }) => {
    let userA: TestUser | null = null;
    let userB: TestUser | null = null;
    let point1: TestPoint | null = null;
    let point2: TestPoint | null = null;

    try {
      userA = await createTestUser({ name: 'P402 C3 Creator' });
      userB = await createTestUser({ name: 'P402 C3 Positioner' });

      point1 = await createTestPoint(userA.user.id, {
        statement: 'P402 C3: first point to position on',
      });
      point2 = await createTestPoint(userA.user.id, {
        statement: 'P402 C3: second point to position on',
      });

      // userB takes positions on both points
      await createTestPosition(point1.id, userB.user.id, 'agree');
      await createTestPosition(point2.id, userB.user.id, 'disagree');

      // userB views their own profile
      await setTestSession(page, userB.email);
      await page.goto(`/p/${userB.slug}`);
      await page.waitForLoadState('networkidle');

      // Both positioned-on points must be visible in the Points tab
      await page.getByRole('tab', { name: /points/i }).click();
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText('P402 C3: first point to position on')
      ).toBeVisible({ timeout: 10000 });

      await expect(
        page.getByText('P402 C3: second point to position on')
      ).toBeVisible({ timeout: 10000 });

      // If a numeric badge is rendered on the tab, it must reflect 2 points
      // (not 0 — which would be the bug, and not some other count)
      const tabBadge = page.locator('[role="tab"]').filter({ hasText: /points/i })
        .locator('[data-count], .badge, .count').first();

      const hasBadge = await tabBadge.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasBadge) {
        const badgeText = await tabBadge.textContent();
        expect(Number(badgeText?.trim())).toBe(2);
      }
    } finally {
      if (point1?.id) await deleteTestPoint(point1.id);
      if (point2?.id) await deleteTestPoint(point2.id);
      if (userA?.user?.id) {
        try { await deleteTestUser(userA.user.id); } catch { /* non-blocking */ }
      }
      if (userB?.user?.id) {
        try { await deleteTestUser(userB.user.id); } catch { /* non-blocking */ }
      }
    }
  });

  /**
   * C4: profileSubjectPosition is still populated — visitor sees profile owner's
   *     position badge on points in the tab.
   *
   * After the fix, getPointsForProfileDisplay must still populate profileSubjectPosition
   * via getMyPositionsForPoints(pointIds, validatorId). This test confirms the badge
   * renders when a second user visits userB's profile.
   */
  test('C4: visitor sees profile subject position badge on positioned-on points', async ({ page }) => {
    let userA: TestUser | null = null; // creator
    let userB: TestUser | null = null; // positioner / profile subject
    let userC: TestUser | null = null; // visitor
    let point: TestPoint | null = null;

    try {
      userA = await createTestUser({ name: 'P402 C4 Creator' });
      userB = await createTestUser({ name: 'P402 C4 Subject' });
      userC = await createTestUser({ name: 'P402 C4 Visitor' });

      point = await createTestPoint(userA.user.id, {
        statement: 'P402 C4: visitor must see subject position badge',
      });

      // userB (profile subject) takes an 'agree' position
      await createTestPosition(point.id, userB.user.id, 'agree');

      // userC (visitor) views userB's profile
      await setTestSession(page, userC.email);
      await page.goto(`/p/${userB.slug}`);
      await page.getByRole('tab', { name: /points/i }).click();
      await page.waitForLoadState('networkidle');

      // Point appears on userB's tab
      await expect(
        page.getByText('P402 C4: visitor must see subject position badge')
      ).toBeVisible({ timeout: 10000 });

      // profileSubjectPosition renders as a PositionBadge — 'agree' → "Agrees"
      // Before fix: profileSubjectPosition could be absent if point source was wrong
      // After fix:  getMyPositionsForPoints(pointIds, validatorId) always runs
      await expect(page.getByText('Agrees').first()).toBeVisible({ timeout: 10000 });
    } finally {
      if (point?.id) await deleteTestPoint(point.id);
      if (userA?.user?.id) {
        try { await deleteTestUser(userA.user.id); } catch { /* non-blocking */ }
      }
      if (userB?.user?.id) {
        try { await deleteTestUser(userB.user.id); } catch { /* non-blocking */ }
      }
      if (userC?.user?.id) {
        try { await deleteTestUser(userC.user.id); } catch { /* non-blocking */ }
      }
    }
  });
});
