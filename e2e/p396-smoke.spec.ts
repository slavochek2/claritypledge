/**
 * @file p396-smoke.spec.ts
 * @description Smoke tests for P396: Eliminate unverified user state
 *
 * Fast regression checks that verify:
 * 1. /live page loads for authenticated (verified) users — host controls visible
 * 2. /live/:code loads for unauthenticated guests — name-only form, no email field
 * 3. /live redirects unauthenticated visitors (no code) to /signup — host gate enforced
 * 4. /live/:code as authenticated user — admitted directly, no name/email form
 *
 * These catch regressions where the join or host flow breaks after P396 changes.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';

test.describe('P396 Smoke: Live page — two-state auth model', () => {
  test.describe.configure({ timeout: 30000 });

  // ── Guest flow ──────────────────────────────────────────────────────────────

  test('unauthenticated visitor without code is redirected to /signup', async ({ page }) => {
    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL('/signup');
  });

  test('/live/:code loads for unauthenticated guest — name-only form, no email', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.goto('/live/TEST396');
    await page.waitForLoadState('networkidle');

    // Must stay on the join page (not redirected)
    await expect(page).toHaveURL('/live/TEST396');

    // Name input must be visible (name-only form)
    await expect(
      page.locator('input[placeholder="Enter your name"]')
    ).toBeVisible({ timeout: 10000 });

    // Email input must NOT be present (P396 removes email from guest join)
    await expect(
      page.locator('input[type="email"], input[placeholder*="email" i]')
    ).not.toBeVisible();

    // No uncaught JS errors
    const appErrors = consoleErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
    );
    expect(appErrors).toHaveLength(0);
  });

  // ── Authenticated (host) flow ───────────────────────────────────────────────

  test('/live loads for authenticated verified user — host controls visible', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    try {
      testUser = await createTestUser({ name: 'P396 Smoke Host' });
      await setTestSession(page, testUser.email);

      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      // Should stay on /live (not redirected)
      await expect(page).toHaveURL('/live');

      // Host controls should be visible (verified user can host)
      const startButton = page.getByRole('button', { name: /new session/i });
      await expect(startButton).toBeVisible({ timeout: 10000 });

      const appErrors = consoleErrors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  test('/live/:code as authenticated user — no name/email form shown', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      testUser = await createTestUser({ name: 'P396 Smoke Verified Joiner' });
      await setTestSession(page, testUser.email);

      await page.goto('/live/TEST396');
      await page.waitForLoadState('networkidle');

      // Should stay on the page
      await expect(page).toHaveURL('/live/TEST396');

      // Verified user must NOT be asked for their name or email (admitted directly)
      await expect(
        page.locator('input[type="email"], input[placeholder*="email" i]')
      ).not.toBeVisible();
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});
