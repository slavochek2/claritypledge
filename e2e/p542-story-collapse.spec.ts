/**
 * @file p542-story-collapse.spec.ts
 * @description E2E tests for P542: Collapse stories behind chevron on point page position list
 *
 * Tests:
 * - All position holders render as compact rows (collapsed by default)
 * - Rows with stories show chevron + "story" indicator
 * - Clicking chevron expands story card with connecting line
 * - Expanded story card shows author header, role, date, text, understood count
 * - Clicking story card navigates to story detail
 * - Clicking chevron again collapses the region
 * - Accordion: expanding one collapses the previously expanded
 * - Viewer with story: chevron works same as others
 * - Viewer without story: "Add your story" CTA shown instead of chevron
 * - Compact rows (no story) unchanged — no chevron
 * - Profile pages unchanged (regression check)
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from './helpers/test-story';

test.describe('P542 — Collapse Stories Behind Chevron', () => {
  test.describe.configure({ timeout: 40000 });

  let pointOwner: TestUser;
  let holderWithStory1: TestUser;
  let holderWithStory2: TestUser;
  let holderNoStory: TestUser;
  let pointId: string;
  let storyId1: string;
  let storyId2: string;

  test.beforeAll(async () => {
    pointOwner = await createTestUser({ name: 'P542 Point Owner' });
    holderWithStory1 = await createTestUser({ name: 'P542 Story Holder A' });
    holderWithStory2 = await createTestUser({ name: 'P542 Story Holder B' });
    holderNoStory = await createTestUser({ name: 'P542 No Story' });

    const point = await createTestPoint(pointOwner.user.id, {
      statement: 'P542 test: async communication improves team productivity',
    });
    pointId = point.id;

    // All holders take "agree" position
    await createTestPosition(pointId, holderWithStory1.user.id, 'agree');
    await createTestPosition(pointId, holderWithStory2.user.id, 'agree');
    await createTestPosition(pointId, holderNoStory.user.id, 'agree');

    // Two holders have linked stories
    const story1 = await createTestStory(holderWithStory1.user.id, {
      content: 'Switching to async-first reduced our meeting load by 60 percent and boosted deep work.',
      visibility: 'public',
    });
    storyId1 = story1.id;
    await linkStoryToPoint(storyId1, pointId);

    const story2 = await createTestStory(holderWithStory2.user.id, {
      content: 'Our distributed team ships faster since adopting async standups over daily video calls.',
      visibility: 'public',
    });
    storyId2 = story2.id;
    await linkStoryToPoint(storyId2, pointId);
  });

  test.afterAll(async () => {
    // Cleanup order: stories → points → users
    if (storyId1) await deleteTestStory(storyId1);
    if (storyId2) await deleteTestStory(storyId2);
    if (pointId) await deleteTestPoint(pointId);
    if (holderWithStory1?.user?.id) await deleteTestUser(holderWithStory1.user.id);
    if (holderWithStory2?.user?.id) await deleteTestUser(holderWithStory2.user.id);
    if (holderNoStory?.user?.id) await deleteTestUser(holderNoStory.user.id);
    if (pointOwner?.user?.id) await deleteTestUser(pointOwner.user.id);
  });

  // ── Collapsed default state ──────────────────────────────────────────

  test('all position holders render as compact rows by default', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // All three holder names should be visible as compact rows
    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P542 Story Holder B')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P542 No Story')).toBeVisible({ timeout: 10000 });

    // Story text should NOT be visible (collapsed by default)
    await expect(page.getByText(/Switching to async-first/i)).not.toBeVisible();
    await expect(page.getByText(/Our distributed team ships faster/i)).not.toBeVisible();
  });

  test('rows with stories show chevron + "story" indicator', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — verify chevron icon and "story" text indicator are present
    // on rows for holderWithStory1 and holderWithStory2.
    // Suggested selectors:
    //   page.locator('[data-testid="story-chevron"]') or
    //   page.getByText('story').filter({ has: page.getByText('P542 Story Holder A') })
    // Verify: exactly 2 chevrons visible (two holders with stories)
  });

  test('compact rows without stories have no chevron', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 No Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — verify the row for "P542 No Story" does NOT have a chevron
    // or "story" indicator. It should look like a standard compact row
    // identical to current P411 behavior.
  });

  // ── Expand/collapse interaction ──────────────────────────────────────

  test('clicking chevron expands story card below with connecting line', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — click the chevron on holderWithStory1's row
    // Verify:
    //   1. Story text becomes visible: "Switching to async-first..."
    //   2. ThreadLine connecting line is rendered (data-testid="thread-line" or similar)
    //   3. Chevron rotates (aria-expanded="true")
  });

  test('expanded story card shows author header, role, date, text, understood count', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand holderWithStory1's story, then verify:
    //   1. Author name repeated in story card header
    //   2. Role text visible (e.g., "Test Engineer")
    //   3. Time ago text visible (e.g., "Xd ago")
    //   4. Story text: "Switching to async-first..."
    //   5. "understood" count visible (even if 0)
    //   6. Share button visible
  });

  test('clicking story card navigates to story detail page', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand holderWithStory1's story, then click the story card body
    // Verify: page navigates away from /point/{pointId} to /story/{storyId}
    // await expect(page).not.toHaveURL(`/point/${pointId}`, { timeout: 5000 });
  });

  test('clicking chevron again collapses the expanded story', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand holderWithStory1's story, verify text visible,
    // then click chevron again:
    //   1. Story text becomes hidden
    //   2. Chevron rotates back (aria-expanded="false")
    //   3. ThreadLine is removed
  });

  // ── Accordion behavior ───────────────────────────────────────────────

  test('expanding one story collapses the previously expanded (accordion)', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P542 Story Holder B')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand holderWithStory1's story:
    //   1. Verify "Switching to async-first..." is visible
    //   2. Click chevron on holderWithStory2's row
    //   3. Verify "Our distributed team ships faster..." is now visible
    //   4. Verify "Switching to async-first..." is no longer visible (collapsed)
    //   5. Only one story card visible at a time
  });

  // ── Viewer-specific behavior ─────────────────────────────────────────

  test('authenticated viewer with story: chevron works same as others', async ({ page }) => {
    await setTestSession(page, holderWithStory1.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Viewer's own row should have chevron + "story" indicator
    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — verify viewer's row has chevron, click it,
    // verify own story expands with same behavior as any other holder
  });

  test('authenticated viewer without story shows "Add your story" CTA', async ({ page }) => {
    await setTestSession(page, holderNoStory.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Viewer's row should show "Add your story" instead of chevron
    await expect(page.getByText('P542 No Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — verify "Add your story" CTA is visible on the viewer's row
    // Verify: no chevron on this row
    // Verify: clicking CTA navigates to /create?pointId={pointId}
    // await page.getByText(/add your story/i).click();
    // await expect(page).toHaveURL(/\/create\?pointId=/, { timeout: 5000 });
  });

  // ── Filter tabs interaction ──────────────────────────────────────────

  test('switching filter tabs resets expanded state', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand a story, then switch filter tab:
    //   1. Expand holderWithStory1's story
    //   2. Click a different filter tab (e.g., Disagree then back to Agree)
    //   3. Verify all stories are collapsed again (expandedHolderId reset to null)
  });

  // ── Profile page regression ──────────────────────────────────────────

  test('profile page stories tab is unchanged (regression)', async ({ page }) => {
    await page.goto(`/u/${holderWithStory1.slug}`);
    await page.waitForLoadState('networkidle');

    // Profile page should still show stories in their existing format
    // (no chevron/accordion pattern — that's point-page only)
    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — verify story content is visible on profile WITHOUT needing
    // to click any chevron. Profile pages use the existing stories tab layout.
    // The story text or a "Stories" tab should be directly accessible.
  });
});
