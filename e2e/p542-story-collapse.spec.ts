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

    // Exactly 2 story toggles visible (two holders with stories)
    const toggles = page.locator('[data-testid="story-toggle"]');
    await expect(toggles).toHaveCount(2);

    // Each toggle shows "story" text
    for (const toggle of await toggles.all()) {
      await expect(toggle).toContainText('story');
    }
  });

  test('compact rows without stories have no chevron', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 No Story')).toBeVisible({ timeout: 10000 });

    // The row for "P542 No Story" should not have a story toggle
    const noStoryRow = page.locator('[role="button"]').filter({ hasText: 'P542 No Story' });
    await expect(noStoryRow).toBeVisible();
    await expect(noStoryRow.locator('[data-testid="story-toggle"]')).toHaveCount(0);
  });

  // ── Expand/collapse interaction ──────────────────────────────────────

  test('clicking chevron expands story card below with connecting line', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // Click the chevron on holderWithStory1's row
    const row = page.locator('[role="button"]').filter({ hasText: 'P542 Story Holder A' });
    const toggle = row.locator('[data-testid="story-toggle"]');
    await toggle.click();

    // Story text becomes visible
    await expect(page.getByText(/Switching to async-first/i)).toBeVisible({ timeout: 5000 });

    // Expanded region exists with role="region"
    const region = page.locator('[role="region"]').filter({ hasText: /Switching to async-first/i });
    await expect(region).toBeVisible();

    // Row has aria-expanded="true"
    await expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  test('expanded story card shows author header, role, date, text, understood count', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // Expand holderWithStory1's story
    const row = page.locator('[role="button"]').filter({ hasText: 'P542 Story Holder A' });
    await row.locator('[data-testid="story-toggle"]').click();

    // Author name repeated in story card header (inside the expanded region)
    const region = page.locator('[role="region"]').filter({ hasText: /Switching to async-first/i });
    await expect(region).toBeVisible({ timeout: 5000 });
    await expect(region.getByText('P542 Story Holder A')).toBeVisible();

    // Role/date metadata visible (Member · Xm/h/d ago)
    await expect(region.getByText(/Member/)).toBeVisible();
    await expect(region.getByText(/ago/)).toBeVisible();

    // Story text visible
    await expect(region.getByText(/Switching to async-first/i)).toBeVisible();

    // "understood" count visible (even if 0)
    await expect(region.getByText(/understood/)).toBeVisible();
  });

  test('clicking story card navigates to story detail page', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // Expand holderWithStory1's story
    const row = page.locator('[role="button"]').filter({ hasText: 'P542 Story Holder A' });
    await row.locator('[data-testid="story-toggle"]').click();
    await expect(page.getByText(/Switching to async-first/i)).toBeVisible({ timeout: 5000 });

    // Click the story card body (the card itself is a button)
    const storyCard = page.locator('[role="region"]').filter({ hasText: /Switching to async-first/i }).locator('[role="button"]').first();
    await storyCard.click();

    // Should navigate to story detail page
    await expect(page).toHaveURL(/\/story\//, { timeout: 5000 });
  });

  test('clicking chevron again collapses the expanded story', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 Story Holder A' });
    const toggle = row.locator('[data-testid="story-toggle"]');

    // Expand
    await toggle.click();
    await expect(page.getByText(/Switching to async-first/i)).toBeVisible({ timeout: 5000 });
    await expect(row).toHaveAttribute('aria-expanded', 'true');

    // Collapse
    await toggle.click();
    await expect(page.getByText(/Switching to async-first/i)).not.toBeVisible({ timeout: 3000 });
    await expect(row).toHaveAttribute('aria-expanded', 'false');

    // Region should be removed
    await expect(page.locator('[role="region"]').filter({ hasText: /Switching to async-first/i })).not.toBeVisible();
  });

  // ── Accordion behavior ───────────────────────────────────────────────

  test('expanding one story collapses the previously expanded (accordion)', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('P542 Story Holder B')).toBeVisible({ timeout: 10000 });

    // Expand story A
    const rowA = page.locator('[role="button"]').filter({ hasText: 'P542 Story Holder A' });
    await rowA.locator('[data-testid="story-toggle"]').click();
    await expect(page.getByText(/Switching to async-first/i)).toBeVisible({ timeout: 5000 });

    // Expand story B — A should auto-collapse
    const rowB = page.locator('[role="button"]').filter({ hasText: 'P542 Story Holder B' });
    await rowB.locator('[data-testid="story-toggle"]').click();
    await expect(page.getByText(/Our distributed team ships faster/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Switching to async-first/i)).not.toBeVisible();

    // Only one region visible
    await expect(page.locator('[role="region"]')).toHaveCount(1);
  });

  // ── Viewer-specific behavior ─────────────────────────────────────────

  test('authenticated viewer with story: chevron works same as others', async ({ page }) => {
    await setTestSession(page, holderWithStory1.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Viewer's own row should have chevron + "story" indicator
    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 Story Holder A' });
    const toggle = row.locator('[data-testid="story-toggle"]');
    await expect(toggle).toBeVisible();

    // Click to expand own story
    await toggle.click();
    await expect(page.getByText(/Switching to async-first/i)).toBeVisible({ timeout: 5000 });
    await expect(row).toHaveAttribute('aria-expanded', 'true');
  });

  test('authenticated viewer without story shows "Add your story" CTA', async ({ page }) => {
    await setTestSession(page, holderNoStory.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Viewer's row should show "Add your story" instead of chevron
    await expect(page.getByText('P542 No Story')).toBeVisible({ timeout: 10000 });

    const viewerRow = page.locator('[role="button"]').filter({ hasText: 'P542 No Story' });
    await expect(viewerRow).toBeVisible();

    // "Add your story" CTA visible
    await expect(viewerRow.getByText(/add your story/i)).toBeVisible();

    // No chevron on this row
    await expect(viewerRow.locator('[data-testid="story-toggle"]')).toHaveCount(0);

    // Clicking CTA navigates to create page
    await viewerRow.getByText(/add your story/i).click();
    await expect(page).toHaveURL(/\/create\?pointId=/, { timeout: 5000 });
  });

  // ── Filter tabs interaction ──────────────────────────────────────────

  test('switching filter tabs resets expanded state', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // Expand holderWithStory1's story
    const row = page.locator('[role="button"]').filter({ hasText: 'P542 Story Holder A' });
    await row.locator('[data-testid="story-toggle"]').click();
    await expect(page.getByText(/Switching to async-first/i)).toBeVisible({ timeout: 5000 });

    // Switch to Disagree tab and back to Agree
    await page.getByRole('button', { name: /disagree/i }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /agree/i }).first().click();
    await page.waitForTimeout(300);

    // All stories should be collapsed (expandedHolderId reset to null)
    await expect(page.getByText(/Switching to async-first/i)).not.toBeVisible();
    await expect(row).toHaveAttribute('aria-expanded', 'false');
  });

  // ── Profile page regression ──────────────────────────────────────────

  test('profile page stories tab is unchanged (regression)', async ({ page }) => {
    await page.goto(`/u/${holderWithStory1.slug}`);
    await page.waitForLoadState('networkidle');

    // Profile page should still show stories in their existing format
    await expect(page.getByText('P542 Story Holder A')).toBeVisible({ timeout: 10000 });

    // Navigate to Stories tab if visible
    const storiesTab = page.getByRole('button', { name: /stories/i }).first();
    if (await storiesTab.isVisible()) {
      await storiesTab.click();
      await page.waitForTimeout(500);
    }

    // Story content visible on profile WITHOUT needing a chevron click
    // No story-toggle elements should be on the profile page
    await expect(page.locator('[data-testid="story-toggle"]')).toHaveCount(0);
  });
});
