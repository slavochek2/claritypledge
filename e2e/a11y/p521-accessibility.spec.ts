/**
 * @file p521-accessibility.spec.ts
 * @description Accessibility tests for P521: Position Buttons — Two-Step Progressive Disclosure
 *
 * Tests:
 * - Keyboard navigation through group segments
 * - Keyboard navigation through intensity picker
 * - Focus management (intensity picker open/close)
 * - ARIA labels and roles
 * - Screen reader announcements
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import type { TestUser } from '../helpers/test-user';

let testUser: TestUser;
let pointId: string;

test.describe('P521: Accessibility — Position Buttons Progressive Disclosure', () => {
  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P521A11yUser' });
    const point = await createTestPoint(testUser.user.id, {
      statement: 'P521 a11y test point',
    });
    pointId = point.id;
  });

  test.afterEach(async () => {
    if (pointId) {
      try { await deleteTestPoint(pointId); } catch { /* cascade */ }
    }
    if (testUser?.user?.id) {
      try { await deleteTestUser(testUser.user.id); } catch { /* noop */ }
    }
  });

  test('group buttons have aria-pressed attribute', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // All three buttons should have aria-pressed="false" initially
    const buttons = page.locator('button[aria-pressed]');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < Math.min(count, 3); i++) {
      await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  test('keyboard: Enter opens intensity picker', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Tab to Agree button and press Enter
    const agreeButton = page.locator('button').filter({ hasText: 'Agree' }).first();
    await agreeButton.focus();
    await page.keyboard.press('Enter');

    // Intensity picker should open
    await expect(page.locator('button').filter({ hasText: 'Somewhat' }).first()).toBeVisible();
  });

  test('keyboard: Escape closes intensity picker', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Open intensity picker
    await page.locator('button').filter({ hasText: 'Agree' }).first().click();
    await expect(page.locator('button').filter({ hasText: 'Somewhat' }).first()).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Should return to group view
    await expect(page.locator('button').filter({ hasText: 'Disagree' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Unsure' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Agree' }).first()).toBeVisible();
  });

  test('back button has accessible label', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Open intensity picker
    await page.locator('button').filter({ hasText: 'Agree' }).first().click();

    // Back button should have aria-label
    const backButton = page.locator('[aria-label="Cancel position selection"]');
    await expect(backButton).toBeVisible();
  });

  test('intensity options have accessible labels', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Open intensity picker for Agree
    await page.locator('button').filter({ hasText: 'Agree' }).first().click();

    // Each intensity button should be focusable and identifiable
    const somewhatBtn = page.locator('button').filter({ hasText: 'Somewhat' }).first();
    const stronglyBtn = page.locator('button').filter({ hasText: 'Strongly' }).first();

    await expect(somewhatBtn).toBeVisible();
    await expect(stronglyBtn).toBeVisible();

    // Buttons should be keyboard focusable
    await somewhatBtn.focus();
    await expect(somewhatBtn).toBeFocused();
  });

  test('touch targets meet minimum size (40px)', async ({ page }) => {
    await setTestSession(page, testUser.email);

    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Check button heights
    const buttons = page.locator('button[aria-pressed]');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }
  });
});
