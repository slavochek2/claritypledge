/**
 * @file p847-position-buttons-explicit-clear.spec.ts
 * @description E2E tests for P847: Position Buttons — Explicit-Clear Interaction Model
 *
 * Tests user flows:
 * - Common path: click unselected group → selected, no menu
 * - Refine path: click selected group → menu opens (Clear position visible)
 * - Explicit clear via "Clear position" row → position removed
 * - Escape and click-outside close menu without mutation
 * - Unsure: one-click select, second-click opens 1-row Clear menu
 * - Regression: two-click on same segment never triggers null state
 * - Touch targets ≥40px on segments and open menu rows
 */
import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint } from './helpers/test-point';
import type { TestUser } from './helpers/test-user';

let testUser: TestUser;
let otherUser: TestUser;
let pointId: string;

test.describe('P847: Position Buttons — Explicit-Clear Interaction Model', () => {
  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P847TestUser' });
    otherUser = await createTestUser({ name: 'P847OtherUser' });
    const point = await createTestPoint(testUser.user.id, {
      statement: 'P847 test: Explicit-clear interaction model for position buttons',
    });
    pointId = point.id;

    // Other user agrees to provide badge count fixture
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

  // ── Smoke ──────────────────────────────────────────────────────────────

  test('smoke: point page loads with no console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter ResizeObserver noise — benign browser quirk, not application error
        if (!text.includes('ResizeObserver')) {
          consoleErrors.push(text);
        }
      }
    });

    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Three position segments must be visible
    await expect(page.getByTestId('disagree-group')).toBeVisible();
    await expect(page.getByTestId('unsure-group')).toBeVisible();
    await expect(page.getByTestId('agree-group')).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  // ── Common path ────────────────────────────────────────────────────────

  test('click unselected Agree → button shows pressed state, no dropdown menu visible', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    await page.getByTestId('agree-group').click();

    // Agree should be pressed
    await expect(
      page.locator('button[aria-pressed="true"]').filter({ hasText: /^Agree/ }).first()
    ).toBeVisible();

    // Dropdown menu must NOT appear — no menu items
    await expect(page.locator('text=/Clear position/i')).toHaveCount(0);
    await expect(page.locator('text="Somewhat Agree"')).toHaveCount(0);
  });

  // ── Refine path ────────────────────────────────────────────────────────

  test('click selected Agree → menu opens with "Clear position", badge counts unchanged', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // First click: select Agree
    await page.getByTestId('agree-group').click();
    await expect(page.locator('button[aria-pressed="true"]')).toBeVisible();

    // Capture badge count before second click
    // (otherUser has 'agree', so Agree badge shows at least 1)
    const agreeButtonBefore = page.locator('button[aria-pressed="true"]').first();
    const textBefore = await agreeButtonBefore.textContent();

    // Second click: opens menu
    await page.locator('button[aria-pressed="true"]').first().click();

    // Menu must appear with "Clear position"
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Position still selected — not mutated by the second click
    await expect(page.locator('button[aria-pressed="true"]').first()).toBeVisible();

    // Badge count unchanged
    const textAfter = await page.locator('button[aria-pressed="true"]').first().textContent();
    expect(textAfter).toBe(textBefore);
  });

  // ── Explicit clear ─────────────────────────────────────────────────────

  test('click "Clear position" from menu → vote removed, segment returns to unpressed state', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select Agree
    await page.getByTestId('agree-group').click();
    await expect(page.locator('button[aria-pressed="true"]')).toBeVisible();

    // Open menu
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Click Clear position
    await page.locator('text=/Clear position/i').first().click();

    // All segments must be unpressed
    await expect(page.locator('button[aria-pressed="true"]')).toHaveCount(0);

    // Menu must be closed
    await expect(page.locator('text=/Clear position/i')).toHaveCount(0);
  });

  // ── Dismiss paths ──────────────────────────────────────────────────────

  test('press Escape with menu open → menu closes, position unchanged', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select Agree, open menu
    await page.getByTestId('agree-group').click();
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Press Escape
    await page.keyboard.press('Escape');

    // Menu closed
    await expect(page.locator('text=/Clear position/i')).toHaveCount(0);

    // Position still selected
    await expect(page.locator('button[aria-pressed="true"]').filter({ hasText: /^Agree/ })).toBeVisible();
  });

  test('click outside menu → menu closes, position unchanged', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select Agree, open menu
    await page.getByTestId('agree-group').click();
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Click outside the component — anywhere else on the page body
    await page.locator('body').click({ position: { x: 10, y: 10 } });

    // Menu closed
    await expect(page.locator('text=/Clear position/i')).toHaveCount(0);

    // Position still selected
    await expect(page.locator('button[aria-pressed="true"]')).toBeVisible();
  });

  // ── Unsure ─────────────────────────────────────────────────────────────

  test('Unsure: first click selects, second click opens 1-row Clear menu', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // First click: should select Unsure immediately with no menu
    await page.getByTestId('unsure-group').click();
    await expect(page.locator('button[aria-pressed="true"]').filter({ hasText: 'Unsure' })).toBeVisible();
    await expect(page.locator('text=/Clear position/i')).toHaveCount(0);

    // Second click: opens 1-row menu with ONLY "Clear position"
    await page.locator('button[aria-pressed="true"]').filter({ hasText: 'Unsure' }).click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // No "Somewhat" or "Strongly" rows — Unsure has no sub-intensities
    await expect(page.locator('text="Somewhat Unsure"')).toHaveCount(0);
    await expect(page.locator('text="Strongly Unsure"')).toHaveCount(0);
  });

  // ── Regression ────────────────────────────────────────────────────────

  test('regression: rapid two-click on Agree segment never triggers null state', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Select Agree
    await page.getByTestId('agree-group').click();

    // Verify selected
    await expect(page.locator('button[aria-pressed="true"]')).toBeVisible();

    // Second click on same segment — should open menu only, NOT remove vote
    await page.locator('button[aria-pressed="true"]').first().click();

    // Position must remain selected (aria-pressed="true" still present)
    await expect(page.locator('button[aria-pressed="true"]')).toBeVisible();
  });

  // ── Touch targets ──────────────────────────────────────────────────────

  test('touch targets ≥40px on menu rows and segments when menu is open', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/point/${pointId}`);
    await page.waitForLoadState('networkidle');

    // Check segment heights (3 main buttons)
    const segments = page.locator('button[aria-pressed]');
    const segmentCount = await segments.count();
    for (let i = 0; i < Math.min(segmentCount, 3); i++) {
      const box = await segments.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(40);
      }
    }

    // Select Agree, then open menu
    await page.getByTestId('agree-group').click();
    await page.locator('button[aria-pressed="true"]').first().click();
    await expect(page.locator('text=/Clear position/i').first()).toBeVisible();

    // Check menu row heights — target the menu option buttons (role="option"),
    // not the inner text spans which only reflect text height (~20px).
    const clearRow = page.getByRole('option', { name: /Clear position/i });
    const clearBox = await clearRow.boundingBox();
    if (clearBox) {
      expect(clearBox.height).toBeGreaterThanOrEqual(40);
    }

    const intensityRow = page.getByRole('option', { name: 'Somewhat Agree' });
    const intensityBox = await intensityRow.boundingBox();
    if (intensityBox) {
      expect(intensityBox.height).toBeGreaterThanOrEqual(40);
    }
  });
});
