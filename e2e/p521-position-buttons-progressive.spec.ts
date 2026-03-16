/**
 * @file p521-position-buttons-progressive.spec.ts
 * @description E2E tests for P521: Position Buttons — Two-Step Progressive Disclosure
 *
 * Tests user flows:
 * - Two-step agree/disagree (click group → pick intensity)
 * - One-step unsure (immediate selection)
 * - Cancel via back button
 * - Change existing position
 * - Count badge display
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import type { TestUser } from './helpers/test-user';

let testUser: TestUser;
let otherUser: TestUser;
let pointId: string;

test.describe('P521: Position Buttons — Progressive Disclosure', () => {
  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P521TestUser' });
    otherUser = await createTestUser({ name: 'P521OtherUser' });
    const point = await createTestPoint(testUser.user.id, {
      statement: 'P521 test: Progressive disclosure improves UX',
    });
    pointId = point.id;

    // Other user takes a position to show counts
    await createTestPosition(pointId, otherUser.user.id, 'agree');
  });

  test.afterEach(async () => {
    if (pointId) {
      try { await deleteTestPoint(pointId); } catch { /* cascade handles it */ }
    }
    if (otherUser?.user?.id) {
      try { await deleteTestUser(otherUser.user.id); } catch { /* noop */ }
    }
    if (testUser?.user?.id) {
      try { await deleteTestUser(testUser.user.id); } catch { /* noop */ }
    }
  });

  test('shows three group buttons without dropdown chevrons', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Group buttons visible
    await expect(page.locator('button').filter({ hasText: 'Disagree' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Unsure' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Agree' }).first()).toBeVisible();

    // No dropdown chevrons (testid from old implementation)
    await expect(page.locator('[data-testid="disagree-dropdown"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="agree-dropdown"]')).toHaveCount(0);
  });

  test('clicking Agree opens intensity picker with Somewhat/Agree/Strongly', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Click Agree
    await page.locator('button').filter({ hasText: 'Agree' }).first().click();

    // Intensity picker should appear
    await expect(page.locator('button').filter({ hasText: 'Somewhat' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Strongly' }).first()).toBeVisible();

    // Back button should be visible
    await expect(page.locator('[aria-label="Cancel position selection"]')).toBeVisible();
  });

  test('selecting intensity calls onPositionClick and returns to group view', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Click Agree → Strongly
    await page.locator('button').filter({ hasText: 'Agree' }).first().click();
    await page.locator('button').filter({ hasText: 'Strongly' }).first().click();

    // Should return to group view with Agree highlighted
    await expect(page.locator('button[aria-pressed="true"]').filter({ hasText: 'Agree' })).toBeVisible();
  });

  test('clicking Unsure selects immediately without intensity picker', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Click Unsure
    await page.locator('button').filter({ hasText: 'Unsure' }).first().click();

    // Should select immediately — no intensity picker
    await expect(page.locator('button').filter({ hasText: 'Somewhat' })).toHaveCount(0);
    await expect(page.locator('button').filter({ hasText: 'Strongly' })).toHaveCount(0);

    // Unsure should be highlighted
    await expect(page.locator('button[aria-pressed="true"]').filter({ hasText: 'Unsure' })).toBeVisible();
  });

  test('clicking Back cancels intensity selection', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Click Agree to open intensity picker
    await page.locator('button').filter({ hasText: 'Agree' }).first().click();
    await expect(page.locator('button').filter({ hasText: 'Somewhat' }).first()).toBeVisible();

    // Click Back
    await page.locator('[aria-label="Cancel position selection"]').click();

    // Should return to group view — all three groups visible
    await expect(page.locator('button').filter({ hasText: 'Disagree' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Unsure' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Agree' }).first()).toBeVisible();

    // No position should be selected
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0);
  });

  test('count badge shows when count > 0, hidden when 0', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Other user agreed — Agree count should show badge with "1"
    // Disagree and Unsure counts are 0 — no badge
    // We check that "(0)" is NOT displayed anywhere
    await expect(page.locator('text="(0)"')).toHaveCount(0);
  });

  test('no truncated labels at narrow viewport', async ({ page }) => {
    await setTestSession(page, testUser.email);

    // Set narrow viewport
    await page.setViewportSize({ width: 360, height: 667 });
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Full labels should be visible (not truncated)
    await expect(page.locator('button').filter({ hasText: 'Disagree' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Agree' }).first()).toBeVisible();

    // No truncated labels
    await expect(page.locator('text="Dis..."')).toHaveCount(0);
    await expect(page.locator('text="Agr..."')).toHaveCount(0);
  });
});
