/**
 * @file p268-position-display-integrity.spec.ts
 * @description P268: Regression tests for position display on detail page and story expanded view.
 *
 * Verifies that user position (Agree highlighted, count = 1) is correctly shown on:
 * - Surface A: /point/:id (detail page)
 * - Surface B: Profile → Stories tab, expanded points (QuotedPointCard)
 *
 * Setup: create test user, point, position (Agree), and story linking the point.
 * Cleanup: delete in FK-safe order (story_points via cascade, point, story, user).
 *
 * Button order on all surfaces: Disagree (nth 0) | Unsure (nth 1) | Agree (nth 2)
 * Use nth(2) to target Agree specifically — /agree/i also matches "Disagree".
 */

import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from './helpers/test-point';
import { createTestStory, linkStoryToPoint, deleteTestStory, type TestStory } from './helpers/test-story';

test.describe('P268: Position display — detail page + stories expanded', () => {
  let testUser: TestUser;
  let point: TestPoint;
  let story: TestStory;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P268 Test User' });
    point = await createTestPoint(testUser.user.id, {
      statement: 'P268 regression: position must show on all surfaces',
    });
    await createTestPosition(point.id, testUser.user.id, 'agree');
    story = await createTestStory(testUser.user.id, {
      content: 'P268 test story for position display regression.',
    });
    await linkStoryToPoint(story.id, point.id);
  });

  test.afterEach(async () => {
    // point CASCADE deletes story_points; delete point before story to avoid FK issues
    if (point?.id) await deleteTestPoint(point.id);
    if (story?.id) await deleteTestStory(story.id);
    if (testUser?.user?.id) {
      try {
        await deleteTestUser(testUser.user.id);
      } catch (err) {
        // Ignore DB-level cleanup errors (pre-existing infra issue)
        console.warn('[P268] deleteTestUser cleanup failed (non-blocking):', err);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Surface A — /point/:id (full mode, counts visible)
  // ─────────────────────────────────────────────────────────────────────────────

  test('A1: point detail page — Agree button highlighted on load', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    // Button order: Disagree (nth 0) | Unsure (nth 1) | Agree (nth 2)
    const agreeButton = page.locator('button[aria-pressed]').nth(2);
    await expect(agreeButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('A2: point detail page — Agree count is 1 (not 0) on load', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    // Button order: Disagree (nth 0) | Unsure (nth 1) | Agree (nth 2)
    // In full mode, count is visible: "Agree (1)"
    const agreeButton = page.locator('button[aria-pressed]').nth(2);
    await expect(agreeButton).toContainText('(1)');
  });

  test('A3: point detail page — still correct after page reload', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForLoadState('networkidle');

    const agreeButton = page.locator('button[aria-pressed]').nth(2);
    await expect(agreeButton).toHaveAttribute('aria-pressed', 'true');
    await expect(agreeButton).toContainText('(1)');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Surface B — Profile → Stories tab → expanded QuotedPointCard (compact mode)
  // Note: compact mode hides counts, so we only assert aria-pressed (not count)
  // ─────────────────────────────────────────────────────────────────────────────

  test('B1: stories tab expanded — Agree button highlighted in QuotedPointCard', async ({ page }) => {
    test.setTimeout(90000);
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    // Click "Stories" tab if not already active
    const storiesTab = page.getByRole('tab', { name: /stories/i });
    if (await storiesTab.isVisible()) {
      await storiesTab.click();
    }

    // Expand the story's linked points
    // Filter by text to avoid matching the user-avatar dropdown button (also button[aria-expanded])
    // Story expand button text: "1 point" — outer story card div[role="button"] has no aria-expanded
    const expandBtn = page.locator('button[aria-expanded]').filter({ hasText: /\d+ points?/i }).first();
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    // Wait for position buttons to appear (auth may resolve after networkidle)
    // Button order: Disagree (nth 0) | Unsure (nth 1) | Agree (nth 2)
    // QuotedPointCard uses compact mode — counts hidden, but aria-pressed still set
    await page.locator('button[aria-pressed]').nth(2).waitFor({ state: 'visible', timeout: 15000 });
    const agreeButton = page.locator('button[aria-pressed]').nth(2);
    await expect(agreeButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('B2: stories tab expanded — correct after collapse and re-expand', async ({ page }) => {
    test.setTimeout(90000);
    await setTestSession(page, testUser.email);
    await page.goto(`/p/${testUser.slug}`);
    await page.waitForLoadState('networkidle');

    const storiesTab = page.getByRole('tab', { name: /stories/i });
    if (await storiesTab.isVisible()) {
      await storiesTab.click();
    }

    // Filter by text to avoid matching the user-avatar dropdown button (also button[aria-expanded])
    const expandBtn = page.locator('button[aria-expanded]').filter({ hasText: /\d+ points?/i }).first();
    await expandBtn.click(); // expand
    await expandBtn.click(); // collapse
    await expandBtn.click(); // re-expand

    // Wait for position buttons to appear (auth may resolve after networkidle)
    await page.locator('button[aria-pressed]').nth(2).waitFor({ state: 'visible', timeout: 15000 });
    const agreeButton = page.locator('button[aria-pressed]').nth(2);
    await expect(agreeButton).toHaveAttribute('aria-pressed', 'true');
  });
});
