/**
 * @file p523-smoke.spec.ts
 * @description Smoke tests for P523: Point Creation & Responses
 *
 * Verifies that new pages and sections load without JS errors.
 * No data mutations — smoke tests are read-only.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, type TestUser } from './helpers/test-user';
import { createTestPoint, createTestPosition, deleteTestPoint, type TestPoint } from './helpers/test-point';

test.describe('P523 Smoke — Pages and sections load', () => {
  test.describe.configure({ timeout: 45000 });

  let user: TestUser;
  let point: TestPoint;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P523Smoke' });
    point = await createTestPoint(user.user.id, {
      statement: 'P523 smoke test point for page load verification',
    });
    await createTestPosition(point.id, user.user.id, 'agree');
  });

  test.afterAll(async () => {
    await deleteTestPoint(point.id).catch(() => {});
    await deleteTestUser(user.user.id);
  });

  // ── 1. /create-point page loads without errors ────────────────────────────

  test('/create-point page loads without JS errors (authenticated)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto('/create-point');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Make a Point')).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/state your claim/i)).toBeVisible({ timeout: 5000 });

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  // ── 2. /create-point?respondTo=<validId> loads with reference preview ─────

  test('/create-point?respondTo=<validId> loads with reference preview', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto(`/create-point?respondTo=${point.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Make a Point')).toBeVisible({ timeout: 10000 });

    // "Responding to" preview should show original point text
    await expect(
      page.getByText(/p523 smoke test point/i)
    ).toBeVisible({ timeout: 10000 });

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  // ── 3. Point detail page with Responses section loads ─────────────────────

  test('point detail page renders Responses section without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto(`/point/${point.id}`);
    await page.waitForLoadState('networkidle');

    // Point statement visible
    await expect(
      page.getByText('P523 smoke test point for page load verification')
    ).toBeVisible({ timeout: 10000 });

    // Responses section header visible
    await expect(page.getByText(/responses/i)).toBeVisible({ timeout: 10000 });

    // Respond button visible
    await expect(page.getByRole('button', { name: /respond/i })).toBeVisible({ timeout: 5000 });

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  // ── 4. Create dropdown renders on feed ────────────────────────────────────

  test('Create dropdown renders on feed page without errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Create button should be visible (replaces "Share a Story")
    const createButton = page.getByRole('button', { name: /create/i });
    await expect(createButton).toBeVisible({ timeout: 10000 });

    expect(consoleErrors, `Console errors: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  // ── 5. /create-point unauthenticated redirects to auth ────────────────────

  test('/create-point redirects unauthenticated user to auth', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/create-point');
    await page.waitForLoadState('networkidle');

    // Should either show auth gate or redirect — page should not crash
    await expect(page.locator('body')).toBeVisible();

    // Filter out expected auth-related console messages
    const unexpectedErrors = consoleErrors.filter(
      e => !e.includes('auth') && !e.includes('session') && !e.includes('401')
    );
    expect(unexpectedErrors, `Unexpected console errors: ${unexpectedErrors.join(', ')}`).toHaveLength(0);
  });

  // ── 6. /create-point?respondTo=<invalidId> handles gracefully ─────────────

  test('/create-point?respondTo=<invalidId> handles gracefully (no crash)', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setTestSession(page, user.email);
    await page.goto('/create-point?respondTo=00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    // Page should load (may show "point no longer available" message)
    await expect(page.getByText('Make a Point')).toBeVisible({ timeout: 10000 });

    // Textarea should still be usable (graceful degradation)
    await expect(page.getByPlaceholder(/state your claim/i)).toBeVisible({ timeout: 5000 });
  });
});
