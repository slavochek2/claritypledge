/**
 * @file p458-smoke.spec.ts
 * @description Smoke tests for P458: Anonymous User Auth Gate with Context Preservation
 *
 * Verifies:
 *   - Point detail page loads without errors for an unauthenticated user
 *   - Position buttons are visible (not hidden) on load
 *   - No console errors on anon page view
 *   - Signup page loads without errors when accessed via position-gate URL
 *
 * These tests are intentionally lightweight — they confirm the page renders
 * and position buttons are present without testing the full auth-gate flow.
 * Full flow tests live in e2e/p458-anon-position-auth-gate.spec.ts.
 *
 * Console error filter: suppresses known non-critical patterns (Supabase
 * realtime WebSocket errors that fire in test environments).
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestPoint, deleteTestPoint, type TestPoint } from './helpers/test-point';

// ---------------------------------------------------------------------------
// Known non-critical error patterns
// ---------------------------------------------------------------------------

const SUPPRESSED_ERROR_PATTERNS = [
  /supabase.*realtime/i,
  /WebSocket.*failed/i,
  /net::ERR_/i,
  /\[vite\]/i,
];

function isKnownNonCritical(msg: string): boolean {
  return SUPPRESSED_ERROR_PATTERNS.some(p => p.test(msg));
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

let testUser: TestUser;
let testPoint: TestPoint;

test.beforeAll(async () => {
  testUser = await createTestUser({ name: 'P458Smoke' });
  testPoint = await createTestPoint(testUser.user.id, {
    statement: `P458 smoke test point ${Date.now()}`,
  });
});

test.afterAll(async () => {
  // Delete point first (cascades positions), then user
  if (testPoint?.id) await deleteTestPoint(testPoint.id);
  if (testUser?.user?.id) await deleteTestUser(testUser.user.id);
});

// ---------------------------------------------------------------------------
// Smoke tests
// ---------------------------------------------------------------------------

test.describe('P458 Smoke — unauthenticated point detail page', () => {
  test.describe.configure({ timeout: 60000 });

  test('point detail page loads without JS errors for unauthenticated user', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    // No session — anonymous browse
    await page.goto(`/point/${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // Page must render the point statement
    await expect(page.getByText(testPoint.statement)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on anon /point/${testPoint.id}: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('position buttons are visible (not hidden) on anon point detail page', async ({ page }) => {
    await page.goto(`/point/${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // At least the Agree button must be present in the DOM and visible
    const agreeBtn = page.getByRole('button', { name: /^agree$/i })
      .or(page.locator('[data-position="agree"]'))
      .or(page.getByText(/^Agree$/));

    await expect(agreeBtn.first()).toBeVisible({ timeout: 10000 });
  });

  test('position button area is not empty / not replaced by a login prompt', async ({ page }) => {
    await page.goto(`/point/${testPoint.id}`);
    await page.waitForLoadState('networkidle');

    // The position section must be present
    // If implementation uses a container with data-testid, prefer that
    // Otherwise: Agree button visible = section is rendered
    const disagreeBtn = page.getByRole('button', { name: /^disagree$/i })
      .or(page.locator('[data-position="disagree"]'))
      .or(page.getByText(/^Disagree$/));

    await expect(disagreeBtn.first()).toBeVisible({ timeout: 10000 });
  });

  test('point detail page does not crash with ?embed=true for anonymous visitor', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`/point/${testPoint.id}?embed=true`);
    await page.waitForLoadState('networkidle');

    // Page must render (no blank screen)
    await expect(page.getByText(testPoint.statement)).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on anon /point/${testPoint.id}?embed=true: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });
});

test.describe('P458 Smoke — signup page with position-gate context', () => {
  test.describe.configure({ timeout: 60000 });

  test('signup page loads without errors when accessed via position-gate URL', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' && !isKnownNonCritical(msg.text())) {
        consoleErrors.push(msg.text());
      }
    });

    const signupUrl = `/signup?action=set-position&pointId=${testPoint.id}&position=agree&redirect=${encodeURIComponent(`/point/${testPoint.id}`)}&pointTitle=${encodeURIComponent(testPoint.statement.slice(0, 100))}`;
    await page.goto(signupUrl);
    await page.waitForLoadState('networkidle');

    // Signup form must be visible
    const emailInput = page.getByRole('textbox', { name: /email/i })
      .or(page.locator('input[type="email"]'));
    await expect(emailInput.first()).toBeVisible({ timeout: 10000 });

    expect(
      consoleErrors,
      `Console errors on signup with position context: ${consoleErrors.join('\n')}`
    ).toHaveLength(0);
  });
});
