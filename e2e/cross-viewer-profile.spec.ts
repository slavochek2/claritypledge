/**
 * @file cross-viewer-profile.spec.ts
 * @description Smoke test: another user's profile shows correct point counts.
 *
 * Bug context: Viewing another user's profile showed "Points (0)" even though
 * they had positions. Self-viewing worked fine because a visibility filter is
 * skipped for self-views. This test verifies cross-viewer point visibility.
 *
 * Setup:
 *   - userA creates a point
 *   - userB (profile subject) takes a position on it
 *   - userC (viewer) navigates to userB's profile
 *
 * Assertion: The Points tab shows a count > 0, not "Points (0)".
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

test.describe('Cross-viewer profile: point counts visible to other users', () => {
  test('viewer sees Points (N > 0) on another user\'s profile', async ({ page }) => {
    let userA: TestUser | null = null; // point creator
    let userB: TestUser | null = null; // profile subject (has positions)
    let userC: TestUser | null = null; // viewer
    let point: TestPoint | null = null;

    try {
      // Setup: create users and data
      userA = await createTestUser({ name: 'CrossView Creator' });
      userB = await createTestUser({ name: 'CrossView Subject' });
      userC = await createTestUser({ name: 'CrossView Viewer' });

      // userA creates a point, userB takes a position on it
      point = await createTestPoint(userA.user.id, {
        statement: 'Cross-viewer smoke test: position visibility',
      });
      await createTestPosition(point.id, userB.user.id, 'agree');

      // userC logs in and views userB's profile
      await setTestSession(page, userC.email);
      await page.goto(`/p/${userB.slug}`);
      await page.waitForLoadState('networkidle');

      // The Points tab should show a count > 0, not "Points (0)"
      const pointsTab = page.getByRole('tab', { name: /points/i });
      await expect(pointsTab).toBeVisible({ timeout: 10000 });

      // Get the tab text — should be "Points (N)" where N > 0
      const tabText = await pointsTab.textContent();
      expect(tabText).not.toContain('Points (0)');

      // Click the tab and verify the point is actually listed
      await pointsTab.click();
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText('Cross-viewer smoke test: position visibility')
      ).toBeVisible({ timeout: 10000 });
    } finally {
      if (point?.id) await deleteTestPoint(point.id);
      if (userA?.user?.id) {
        try { await deleteTestUser(userA.user.id); } catch { /* cleanup */ }
      }
      if (userB?.user?.id) {
        try { await deleteTestUser(userB.user.id); } catch { /* cleanup */ }
      }
      if (userC?.user?.id) {
        try { await deleteTestUser(userC.user.id); } catch { /* cleanup */ }
      }
    }
  });
});
