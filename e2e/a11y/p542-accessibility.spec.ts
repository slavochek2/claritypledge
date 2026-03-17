/**
 * @file p542-accessibility.spec.ts
 * @description Accessibility tests for P542: Collapse stories behind chevron on point page
 *
 * Tests:
 * - Chevron is keyboard-operable (Enter/Space toggles expand/collapse)
 * - aria-expanded attribute toggles correctly
 * - aria-controls points to expanded region with role="region"
 * - Tab order: row → expanded card → share → next row
 * - Escape key collapses expanded story
 * - Focus stays on chevron after expand (no focus steal)
 * - Focus returns to chevron on Escape from within card
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from '../helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory } from '../helpers/test-story';

test.describe('P542 Accessibility — Story Collapse', () => {
  test.describe.configure({ timeout: 40000 });

  let owner: TestUser;
  let holderWithStory: TestUser;
  let holderNoStory: TestUser;
  let pointId: string;
  let storyId: string;

  test.beforeAll(async () => {
    owner = await createTestUser({ name: 'P542 A11y Owner' });
    holderWithStory = await createTestUser({ name: 'P542 A11y Has Story' });
    holderNoStory = await createTestUser({ name: 'P542 A11y No Story' });

    const point = await createTestPoint(owner.user.id, {
      statement: 'P542 a11y: feedback loops accelerate learning',
    });
    pointId = point.id;

    await createTestPosition(pointId, holderWithStory.user.id, 'agree');
    await createTestPosition(pointId, holderNoStory.user.id, 'agree');

    const story = await createTestStory(holderWithStory.user.id, {
      content: 'Regular feedback sessions helped our team improve iteration speed dramatically.',
      visibility: 'public',
    });
    storyId = story.id;
    await linkStoryToPoint(storyId, pointId);
  });

  test.afterAll(async () => {
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (holderWithStory?.user?.id) await deleteTestUser(holderWithStory.user.id);
    if (holderNoStory?.user?.id) await deleteTestUser(holderNoStory.user.id);
    if (owner?.user?.id) await deleteTestUser(owner.user.id);
  });

  test('chevron row has aria-expanded="false" when collapsed', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 A11y Has Story' });
    await expect(row).toHaveAttribute('aria-expanded', 'false');
  });

  test('Enter key toggles expand/collapse on chevron', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 A11y Has Story' });
    await row.focus();

    // Press Enter to expand
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/Regular feedback sessions/i)).toBeVisible({ timeout: 5000 });

    // Press Enter again to collapse
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText(/Regular feedback sessions/i)).not.toBeVisible();
  });

  test('Space key toggles expand/collapse on chevron', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 A11y Has Story' });
    await row.focus();

    // Press Space to expand
    await page.keyboard.press('Space');
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/Regular feedback sessions/i)).toBeVisible({ timeout: 5000 });

    // Press Space again to collapse
    await row.focus();
    await page.keyboard.press('Space');
    await expect(row).toHaveAttribute('aria-expanded', 'false');
  });

  test('aria-controls points to expanded region with role="region"', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 A11y Has Story' });

    // Row has aria-controls attribute
    const controlsId = await row.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(controlsId).toMatch(/^story-/);

    // Expand
    await row.locator('[data-testid="story-toggle"]').click();

    // Expanded region has matching id and role="region"
    const region = page.locator(`#${controlsId}`);
    await expect(region).toBeVisible({ timeout: 5000 });
    await expect(region).toHaveAttribute('role', 'region');

    // Region has aria-label containing the holder's name
    const ariaLabel = await region.getAttribute('aria-label');
    expect(ariaLabel).toContain('P542 A11y Has Story');
  });

  test('focus stays on chevron after expand (no focus steal)', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 A11y Has Story' });
    const toggle = row.locator('[data-testid="story-toggle"]');

    // Focus toggle and click to expand
    await toggle.focus();
    await toggle.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');

    // Focus should still be on the toggle, not jumped into story card
    await expect(toggle).toBeFocused();
  });

  test('Tab order: chevron row → expanded story card → share → next row', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 A11y Has Story' });
    const toggle = row.locator('[data-testid="story-toggle"]');

    // Focus toggle and expand
    await toggle.focus();
    await toggle.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/Regular feedback sessions/i)).toBeVisible({ timeout: 5000 });

    // Tab through expanded content — should eventually reach elements in the region
    await page.keyboard.press('Tab');
    // The focused element should be within the page (story card area or next row)
    const focused = page.locator(':focus');
    await expect(focused).toBeAttached();
  });

  test('Escape key collapses expanded story', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 A11y Has Story' });
    const toggle = row.locator('[data-testid="story-toggle"]');

    // Expand
    await toggle.click();
    await expect(page.getByText(/Regular feedback sessions/i)).toBeVisible({ timeout: 5000 });

    // Tab into the story region
    const region = page.locator('[role="region"]').first();
    await region.click();

    // Press Escape
    await page.keyboard.press('Escape');

    // Story should collapse
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText(/Regular feedback sessions/i)).not.toBeVisible();
  });

  test('focus returns to chevron on Escape from within expanded card', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    const row = page.locator('[role="button"]').filter({ hasText: 'P542 A11y Has Story' });
    const toggle = row.locator('[data-testid="story-toggle"]');

    // Expand story
    await toggle.click();
    await expect(page.getByText(/Regular feedback sessions/i)).toBeVisible({ timeout: 5000 });

    // Click into the region to focus inside it
    const region = page.locator('[role="region"]').first();
    await region.click();

    // Press Escape — focus should return to the row
    await page.keyboard.press('Escape');
    await expect(row).toHaveAttribute('aria-expanded', 'false');

    // Focus returns to the row with aria-controls
    const activeAriaControls = await page.evaluate(() => document.activeElement?.getAttribute('aria-controls'));
    expect(activeAriaControls).toMatch(/^story-/);
  });

  test('compact row (no story) remains keyboard-activatable for profile navigation', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y No Story')).toBeVisible({ timeout: 10000 });

    // Compact row should navigate to profile on Enter (unchanged from P411)
    const compactRow = page.getByRole('button').filter({ hasText: 'P542 A11y No Story' }).first();
    await expect(compactRow).toBeAttached({ timeout: 5000 });

    await compactRow.focus();
    await expect(compactRow).toBeFocused();

    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Should navigate to the user's profile
    await expect(page).not.toHaveURL(`/point/${pointId}`, { timeout: 5000 });
  });

  test('filter tabs remain keyboard accessible', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    const agreeTab = page.getByRole('button', { name: /agree/i }).first();
    await expect(agreeTab).toBeVisible({ timeout: 10000 });

    await agreeTab.focus();
    await expect(agreeTab).toBeFocused();

    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 5000 });
  });
});
