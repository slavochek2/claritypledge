/**
 * @file p847-position-buttons-accessibility.spec.ts
 * @description Accessibility tests for P847: Position Buttons — Explicit-Clear Interaction Model
 *
 * Tests:
 * - Tab navigation through group segments
 * - aria-pressed reflects active segment
 * - aria-expanded reflects menu open/closed state on active segment
 * - Keyboard navigation within open menu (intensity rows + Clear row)
 * - Enter activates focused intensity row and Clear row
 * - Escape closes menu and returns focus to the segment that opened it
 * - Touch target minimum sizes (40px)
 *
 * Note: axe-core/playwright is NOT installed in this project. Tests use manual
 * ARIA attribute assertions. If axe-core is added in future, add the axe sweep
 * as an additional first test in this file.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from '../helpers/test-user';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import type { TestUser } from '../helpers/test-user';

let testUser: TestUser;
let pointId: string;

test.describe('P847: Accessibility — Position Buttons Explicit-Clear', () => {
  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P847A11yUser' });
    const point = await createTestPoint(testUser.user.id, {
      statement: 'P847 a11y test: explicit clear interaction model',
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

  // ── Smoke ──────────────────────────────────────────────────────────────

  test('smoke: position buttons render with basic aria attributes on point page', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // All three segment buttons must have aria-pressed
    const buttons = page.locator('button[aria-pressed]');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Initially all unpressed
    for (let i = 0; i < Math.min(count, 3); i++) {
      await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  // ── Tab navigation ─────────────────────────────────────────────────────

  test('Tab navigation reaches Disagree, Unsure, Agree segments in order', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Focus on the first position button by tabbing from body
    const disagreeButton = page.locator('button[aria-pressed]').nth(0);
    await disagreeButton.focus();
    await expect(disagreeButton).toBeFocused();

    // Tab to Unsure (second)
    await page.keyboard.press('Tab');
    const unsureButton = page.locator('button[aria-pressed]').nth(1);
    await expect(unsureButton).toBeFocused();

    // Tab to Agree (third)
    await page.keyboard.press('Tab');
    const agreeButton = page.locator('button[aria-pressed]').nth(2);
    await expect(agreeButton).toBeFocused();
  });

  // ── aria-pressed reflects active segment ──────────────────────────────

  test('aria-pressed="true" reflects which segment is active', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Click Agree
    await page.getByTestId('agree-group').click();

    // Agree segment must be aria-pressed="true"
    await expect(
      page.locator('button[aria-pressed="true"]').filter({ hasText: /^Agree/ }).first()
    ).toBeVisible();

    // Disagree and Unsure must be aria-pressed="false"
    await expect(
      page.getByTestId('disagree-group')
    ).toHaveAttribute('aria-pressed', 'false');

    await expect(
      page.getByTestId('unsure-group')
    ).toHaveAttribute('aria-pressed', 'false');
  });

  // ── aria-expanded reflects menu state ─────────────────────────────────

  test('aria-expanded="true" on active segment when menu is open', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select Agree (first click — no menu in P847)
    await page.getByTestId('agree-group').click();
    const agreeButton = page.locator('button[aria-pressed="true"]').first();

    // aria-expanded should be "false" (menu closed) or absent initially
    const expandedBefore = await agreeButton.getAttribute('aria-expanded');
    expect(expandedBefore === 'false' || expandedBefore === null).toBe(true);

    // Second click opens menu
    await agreeButton.click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Now aria-expanded must be "true"
    await expect(
      page.locator('button[aria-pressed="true"]').first()
    ).toHaveAttribute('aria-expanded', 'true');
  });

  test('aria-expanded="true" on Unsure segment when its 1-row Clear menu is open', async ({ page }) => {
    // Architect Decision E: aria-expanded uses `isActive ? isOpen : undefined`,
    // not `positions.length > 1`. Unsure has 1 intensity but now opens a menu
    // when selected (1-row Clear-only menu). aria-expanded must reflect this.
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select Unsure (first click — no menu)
    await page.getByTestId('unsure-group').click();
    const unsureButton = page.locator('button[aria-pressed="true"]').first();

    // aria-expanded should be "false" or absent before menu opens
    const expandedBefore = await unsureButton.getAttribute('aria-expanded');
    expect(expandedBefore === 'false' || expandedBefore === null).toBe(true);

    // Second click opens 1-row Clear menu for Unsure
    await unsureButton.click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Now aria-expanded MUST be "true" on the Unsure segment
    await expect(
      page.locator('button[aria-pressed="true"]').first()
    ).toHaveAttribute('aria-expanded', 'true');
  });

  test('aria-expanded="false" after menu closes via Escape', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('agree-group').click();
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    await page.keyboard.press('Escape');

    // Menu closed → aria-expanded should be "false"
    await expect(
      page.locator('button[aria-pressed="true"]').first()
    ).toHaveAttribute('aria-expanded', 'false');
  });

  // ── Tab into open menu ────────────────────────────────────────────────

  test('opening menu auto-focuses first option; Tab cycles to "Clear position"', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select and open menu for Agree
    await page.getByTestId('agree-group').click();
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Portal escapes natural tab order — component auto-focuses first option on open
    const somewhatRow = page.getByRole('option', { name: 'Somewhat Agree' });
    await expect(somewhatRow).toBeFocused();

    // Tab through to "Clear position"
    await page.keyboard.press('Tab'); // Agree (default)
    await page.keyboard.press('Tab'); // Strongly Agree
    await page.keyboard.press('Tab'); // Clear position

    const clearRow = page.getByRole('option', { name: /Clear position/i });
    await expect(clearRow).toBeFocused();
  });

  // ── Enter activates intensity row ─────────────────────────────────────

  test('Enter on focused intensity row → menu closes, position updated', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select and open menu for Agree
    await page.getByTestId('agree-group').click();
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Focus the "Strongly Agree" row and press Enter
    const stronglyRow = page.locator('text="Strongly Agree"').first();
    await stronglyRow.focus();
    await page.keyboard.press('Enter');

    // Menu must close
    await expect(page.locator('text=/Clear position/i')).toHaveCount(0);

    // Agree segment should still be pressed (Agree+ label for strongly_agree)
    await expect(page.locator('button[aria-pressed="true"]')).toBeVisible();
  });

  // ── Enter activates "Clear position" row ──────────────────────────────

  test('Enter on "Clear position" row → position cleared, menu closes', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select Agree then open menu
    await page.getByTestId('agree-group').click();
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Focus and activate "Clear position" — target the role=option button, not the inner span
    const clearRow = page.getByRole('option', { name: /Clear position/i });
    await clearRow.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Remove position' }).click();

    // Position cleared — no segment pressed
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0);
    // Menu closed
    await expect(page.locator('text=/Clear position/i')).toHaveCount(0);
  });

  // ── Escape closes menu, focus returns ─────────────────────────────────

  test('Escape closes menu, focus returns to segment that opened it', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select Agree and open menu
    const agreeButton = page.getByTestId('agree-group');
    await agreeButton.click(); // selects
    const pressedButton = page.locator('button[aria-pressed="true"]').first();
    await pressedButton.click(); // opens menu
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    await page.keyboard.press('Escape');

    // Menu gone
    await expect(page.locator('text=/Clear position/i')).toHaveCount(0);

    // Focus should return to the Agree segment
    await expect(page.locator('button[aria-pressed="true"]').first()).toBeFocused();
  });

  // ── Touch targets ──────────────────────────────────────────────────────

  test('touch targets ≥40px height on all interactive elements', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Segment buttons
    const segments = page.locator('button[aria-pressed]');
    const segmentCount = await segments.count();
    for (let i = 0; i < Math.min(segmentCount, 3); i++) {
      const box = await segments.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }

    // Select Agree and open menu to check menu row heights
    await page.getByTestId('agree-group').click();
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // "Clear position" row — target role=option button (inner span is text-height only)
    const clearBox = await page.getByRole('option', { name: /Clear position/i }).boundingBox();
    if (clearBox) {
      expect(clearBox.height).toBeGreaterThanOrEqual(40);
    }

    // "Somewhat Agree" row
    const somewhatBox = await page.getByRole('option', { name: 'Somewhat Agree' }).boundingBox();
    if (somewhatBox) {
      expect(somewhatBox.height).toBeGreaterThanOrEqual(40);
    }
  });
});
