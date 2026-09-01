/**
 * @file p411-accessibility.spec.ts
 * @description Accessibility tests for P411: Position breakdown — show linked stories per holder
 *
 * Tests:
 * - Story cards in position breakdown are keyboard reachable and activatable
 * - Compact rows (no story) are keyboard reachable (role="button")
 * - Ear badge has accessible text (title or aria-label)
 * - Position badges have text content (not color-only)
 * - Filter tabs are keyboard accessible
 *
 * P1217 RETIREMENT NOTE (2026-09-01): P542 (changes: p411) collapsed the story card
 * behind a chevron — "all position holders render as compact rows by default". The
 * 'story card in position breakdown is keyboard reachable' test required the story text
 * to be visible without expanding anything, so it was deleted. Its successor is
 * e2e/a11y/p542-accessibility.spec.ts 'Tab order: chevron row -> expanded story card ->
 * share -> next row'. The filter-tab and compact-row tests kept here are duplicated by
 * that same file ('filter tabs remain keyboard accessible', 'compact row (no story)
 * remains keyboard-activatable for profile navigation'); the position-badge text check
 * is not, which is why this file is split rather than deleted.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from '../helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from '../helpers/test-story';

test.describe('P411 Accessibility — Position Breakdown', () => {
  test.describe.configure({ timeout: 40000 });

  let holder: TestUser;
  let noStoryHolder: TestUser;
  let owner: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P411 A11y Owner' });
    holder = await createTestUser({ name: 'P411 A11y Holder' });
    noStoryHolder = await createTestUser({ name: 'P411 A11y NoStory' });

    const point = await createTestPoint(owner.user.id, {
      statement: 'P411 a11y: open offices hurt deep work',
    });
    pointId = point.id;

    await createTestPosition(pointId, holder.user.id, 'agree');
    await createTestPosition(pointId, noStoryHolder.user.id, 'disagree');

    const story = await createTestStory(holder.user.id, {
      content: 'Open offices significantly reduced my ability to focus on complex tasks.',
      visibility: 'public',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (holder?.user?.id) await deleteTestUser(holder.user.id);
    if (noStoryHolder?.user?.id) await deleteTestUser(noStoryHolder.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  test('filter tabs are keyboard accessible (Tab + Enter)', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Find the Agree filter tab button
    const agreeTab = page.getByRole('button', { name: /agree/i }).first();
    await expect(agreeTab).toBeVisible({ timeout: 10000 });

    await agreeTab.focus();
    await expect(agreeTab).toBeFocused();

    // Activate with Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Should filter to only agree holders
    await expect(page.getByText('P411 A11y Holder')).toBeVisible({ timeout: 5000 });
  });

  test('compact row (no story) has role="button" and is keyboard activatable', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P411 A11y NoStory')).toBeVisible({ timeout: 10000 });

    // The compact row should have role="button" (current PositionHolderCard implementation)
    const compactRow = page.getByRole('button').filter({ hasText: 'P411 A11y NoStory' }).first();
    await expect(compactRow).toBeAttached({ timeout: 5000 });

    // Should be focusable
    await compactRow.focus();
    await expect(compactRow).toBeFocused();

    // Enter should activate navigation
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Should navigate to the user's profile
    await expect(page).not.toHaveURL(`/point/${pointId}`, { timeout: 5000 });
  });

  test('position badge has non-empty text content (not color-only)', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P411 A11y Holder')).toBeVisible({ timeout: 10000 });

    // Position badge should have visible text (e.g. "Agree", "Disagree", "Unsure")
    // so screen readers can announce position without relying on color alone
    const positionBadgeText = await page
      .getByText(/^(Agree|Disagree|Unsure|Strongly Agree|Somewhat Agree|Strongly Disagree|Somewhat Disagree)$/i)
      .first()
      .textContent();

    expect(positionBadgeText?.trim().length).toBeGreaterThan(0);
  });
});
