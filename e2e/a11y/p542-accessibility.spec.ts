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

    // TODO: /dev — locate the chevron toggle element on the story holder's row
    // Verify: aria-expanded="false" when collapsed
    // Suggested: page.locator('[aria-expanded="false"]').filter({ hasText: /story/i })
    // or page.locator('[data-testid="story-toggle"]').first()
  });

  test('Enter key toggles expand/collapse on chevron', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — focus the chevron toggle, press Enter:
    //   1. Focus the row/chevron for holderWithStory
    //   2. Press Enter
    //   3. Verify aria-expanded="true"
    //   4. Verify story text becomes visible
    //   5. Press Enter again
    //   6. Verify aria-expanded="false"
    //   7. Verify story text hidden
  });

  test('Space key toggles expand/collapse on chevron', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — focus the chevron toggle, press Space:
    //   1. Focus the row/chevron for holderWithStory
    //   2. Press Space
    //   3. Verify aria-expanded="true"
    //   4. Press Space again
    //   5. Verify aria-expanded="false"
  });

  test('aria-controls points to expanded region with role="region"', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand the story, then verify:
    //   1. Chevron has aria-controls="story-{holderId}" attribute
    //   2. Expanded region has matching id="story-{holderId}"
    //   3. Expanded region has role="region"
    //   4. Expanded region has aria-label containing the holder's name
  });

  test('focus stays on chevron after expand (no focus steal)', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — focus the chevron, press Enter to expand:
    //   1. Focus the chevron toggle
    //   2. Press Enter to expand
    //   3. Verify: focus is still on the chevron (document.activeElement check)
    //   4. Focus should NOT have jumped into the story card
  });

  test('Tab order: chevron row → expanded story card → share → next row', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand story, then verify tab order:
    //   1. Focus the chevron toggle and expand
    //   2. Press Tab → focus should move to story card
    //   3. Press Tab → focus should move to "...more" link (if truncated) or Share button
    //   4. Press Tab → focus should move to next position row
    //   5. When collapsed, Tab should skip directly from chevron row to next row
  });

  test('Escape key collapses expanded story', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand story, press Escape:
    //   1. Focus chevron and expand
    //   2. Tab into the story card area
    //   3. Press Escape
    //   4. Verify: story collapses (aria-expanded="false")
    //   5. Verify: story text is no longer visible
  });

  test('focus returns to chevron on Escape from within expanded card', async ({ page }) => {
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('P542 A11y Has Story')).toBeVisible({ timeout: 10000 });

    // TODO: /dev — expand story, tab into card, press Escape:
    //   1. Focus chevron and expand
    //   2. Tab into the story card (or share button within it)
    //   3. Press Escape
    //   4. Verify: focus returns to the chevron row (not lost)
    //   5. Verify: the chevron row is the active element
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
