/**
 * @file p279-profile-subject-position.spec.ts
 * @description E2E tests for P279 — Profile Subject's Position Never Shown to Visitors
 *
 * Bug: When User B visits User A's profile, User A's position on their own points
 * is invisible. The `positions` map in profile-page-v2.tsx was only populated with
 * the viewer's ID, never the profile subject's. The fix adds a third batch in
 * getPointsForProfileDisplay and getStoriesByAuthorWithPoints to load profileSubjectPosition,
 * then populates positions[profile.id] in the adaptation loop.
 *
 * Visual indicator: PointCardWithLinks renders "[Name] [PositionBadge]" above the quoted
 * point box (quote pattern) only when profileOwner.position is non-null. Before fix: absent.
 * After fix: profile subject's name + "Agrees" / "Disagrees" badge is visible.
 *
 * PositionBadge short labels: agree → "Agrees", disagree → "Disagrees", unsure → "Unsure"
 *
 * Button order on all surfaces: Disagree (nth 0) | Unsure (nth 1) | Agree (nth 2)
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
import {
  createTestStory,
  linkStoryToPoint,
  deleteTestStory,
  type TestStory,
} from './helpers/test-story';

// ─────────────────────────────────────────────────────────────────────────────
// Points tab — cross-user position visibility
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P279: Points tab — profile subject position visible to visitors', () => {
  let userA: TestUser; // profile subject
  let userB: TestUser; // visitor
  let point: TestPoint;

  test.beforeEach(async () => {
    userA = await createTestUser({ name: 'P279 Profile Subject' });
    userB = await createTestUser({ name: 'P279 Visitor' });
    point = await createTestPoint(userA.user.id, {
      statement: 'P279 test: profile subject position must be visible',
    });
    // User A takes an 'agree' position — this is what causes the point to appear on their profile
    await createTestPosition(point.id, userA.user.id, 'agree');
  });

  test.afterEach(async () => {
    // deleteTestPoint cascades point_positions and story_points
    if (point?.id) await deleteTestPoint(point.id);
    if (userA?.user?.id) {
      try { await deleteTestUser(userA.user.id); } catch { /* non-blocking */ }
    }
    if (userB?.user?.id) {
      try { await deleteTestUser(userB.user.id); } catch { /* non-blocking */ }
    }
  });

  test('C1: authenticated visitor sees profile subject position badge on Points tab', async ({ page }) => {
    await setTestSession(page, userB.email);
    await page.goto(`/p/${userA.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    // The point must appear on User A's profile
    await expect(
      page.getByText('P279 test: profile subject position must be visible')
    ).toBeVisible({ timeout: 10000 });

    // After fix: PositionBadge renders User A's 'agree' as "Agrees" above the quoted point box
    // Before fix: this text was absent — profileOwner.position was null, quote pattern did not render
    await expect(page.getByText('Agrees').first()).toBeVisible({ timeout: 10000 });
  });

  test('C2: self-view unchanged — profile subject still sees their own position badge', async ({ page }) => {
    // Regression: self-view must continue to work after the fix
    await setTestSession(page, userA.email);
    await page.goto(`/p/${userA.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('P279 test: profile subject position must be visible')
    ).toBeVisible({ timeout: 10000 });

    // Self-view: viewerIsSubject optimization — subject's position serves as both
    await expect(page.getByText('Agrees').first()).toBeVisible({ timeout: 10000 });
  });

  test('C4: both subject position badge and visitor interactive position are visible', async ({ page }) => {
    // User B also takes a position on the same point
    await createTestPosition(point.id, userB.user.id, 'disagree');

    await setTestSession(page, userB.email);
    await page.goto(`/p/${userA.slug}`);
    await page.getByRole('tab', { name: /points/i }).click();
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByText('P279 test: profile subject position must be visible')
    ).toBeVisible({ timeout: 10000 });

    // User A's 'agree' position badge renders above the quoted point box
    await expect(page.getByText('Agrees').first()).toBeVisible({ timeout: 10000 });

    // User B's 'disagree' shows on the interactive position buttons (aria-pressed="true")
    // Auth resolves asynchronously — allow extra time for positions to populate
    // Button order: Disagree (nth 0) | Unsure (nth 1) | Agree (nth 2)
    const disagreeButton = page.locator('button[aria-pressed]').nth(0);
    await expect(disagreeButton).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stories tab — author position on linked points
// ─────────────────────────────────────────────────────────────────────────────

test.describe('P279: Stories tab — author position visible on linked points', () => {
  let userA: TestUser;
  let userB: TestUser;
  let point: TestPoint;
  let story: TestStory;

  test.beforeEach(async () => {
    userA = await createTestUser({ name: 'P279 Story Author' });
    userB = await createTestUser({ name: 'P279 Story Visitor' });
    point = await createTestPoint(userA.user.id, {
      statement: 'P279 stories tab: author position on linked point',
    });
    await createTestPosition(point.id, userA.user.id, 'agree');
    story = await createTestStory(userA.user.id, {
      content: 'P279 test story for linked point position display',
    });
    await linkStoryToPoint(story.id, point.id);
  });

  test.afterEach(async () => {
    // deleteTestPoint cascades story_points; delete point before story to avoid FK issues
    if (point?.id) await deleteTestPoint(point.id);
    if (story?.id) await deleteTestStory(story.id);
    if (userA?.user?.id) {
      try { await deleteTestUser(userA.user.id); } catch { /* non-blocking */ }
    }
    if (userB?.user?.id) {
      try { await deleteTestUser(userB.user.id); } catch { /* non-blocking */ }
    }
  });

  test('C3: visitor sees author position badge on linked points in Stories tab', async ({ page }) => {
    test.setTimeout(90000);
    await setTestSession(page, userB.email);
    await page.goto(`/p/${userA.slug}`);
    await page.waitForLoadState('networkidle');

    // Stories tab is default — story card should be visible
    await expect(
      page.getByText('P279 test story for linked point position display')
    ).toBeVisible({ timeout: 10000 });

    // Expand the story's linked points
    // Filter by text to avoid matching the user-avatar dropdown (also button[aria-expanded])
    const expandBtn = page.locator('button[aria-expanded]').filter({ hasText: /\d+ points?/i }).first();
    await expect(expandBtn).toBeVisible({ timeout: 10000 });
    await expandBtn.click();

    // Point statement visible in expanded QuotedPoint
    await expect(
      page.getByText('P279 stories tab: author position on linked point')
    ).toBeVisible({ timeout: 10000 });

    // After fix: QuotedPoint renders "[userA.name] Agrees" via authorPosition from
    // getStoriesByAuthorWithPoints — which now loads the author's positions in a third batch
    await expect(page.getByText('Agrees').first()).toBeVisible({ timeout: 15000 });
  });
});
