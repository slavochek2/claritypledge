/**
 * @file p160-smoke.spec.ts
 * @description Smoke tests for P160: Private Session Mode
 *
 * Fast regression detection — verifies pages load without errors
 * and the recording toggle is present.
 *
 * Creator flow (/live) requires auth (P66 gate) → uses setTestSession.
 * Join flow (/live/:code) doesn't require auth → runs as guest.
 */
import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

// ============================================================================
// Guest tests — no auth needed (join flow)
// ============================================================================
test.describe('P160 Smoke Tests — Guest (join flow)', () => {
  test('/live/{code} join page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/live/SMOKE999');
    await page.waitForLoadState('networkidle');

    // Page should render (either join form or session-not-found state)
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(consoleErrors).toHaveLength(0);
  });

  test('/live/{code} join page shows name input', async ({ page }) => {
    await page.goto('/live/SMOKE999');
    await expect(page.locator('input[placeholder="Enter your name"]')).toBeVisible();
  });

  test('/live/{code} consent checkbox is visible on join page', async ({ page }) => {
    await page.goto('/live/SMOKE999');
    const checkbox = page.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
  });
});

// ============================================================================
// Authenticated tests — creator flow, requires setTestSession
// ============================================================================
test.describe('P160 Smoke Tests — Authenticated (creator flow)', () => {
  let testUser: TestUser;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P160 Smoke User' });
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) {
      await deleteTestUser(testUser.user.id);
    }
  });

  test('/live page loads without console errors', async ({ page }) => {
    await setTestSession(page, testUser.email);
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toContainText('Clarity Session');
    expect(consoleErrors).toHaveLength(0);
  });

  test('/live page shows recording toggle', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/live');
    await expect(page.getByRole('switch')).toBeVisible();
  });

  test('/live page recording toggle defaults to ON', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/live');
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  test('recording toggle is interactive — toggle OFF and back ON without crash', async ({
    page,
  }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/live');

    const toggle = page.getByRole('switch');
    await expect(toggle).toBeVisible();

    // Toggle OFF
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Toggle ON
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    // No crash — page still functional
    await expect(page.getByRole('button', { name: /new session/i })).toBeVisible();
  });
});
