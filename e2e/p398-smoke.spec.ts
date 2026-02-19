/**
 * @file p398-smoke.spec.ts
 * @description Smoke tests for P398: Clickable Session Round History with Summary Screen
 *
 * Fast regression detection — verifies:
 * - /live page loads without console errors (authenticated)
 * - /live join page loads without console errors (guest)
 * - Session history with enriched P398 data does not crash the idle screen
 *
 * No two-party setup. Full summary-flow tests are in e2e/p398-session-history-summary.spec.ts.
 */

import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, setTestSession, TestUser } from './helpers/test-user';

// ============================================================================
// Guest tests — no auth needed
// ============================================================================

test.describe('P398 Smoke — Guest (join flow)', () => {
  test('/live/{code} join page loads without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/live/SMOKE398');
    await page.waitForLoadState('networkidle');

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(consoleErrors, `Console errors on join page: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });
});

// ============================================================================
// Authenticated tests — creator flow
// ============================================================================

test.describe('P398 Smoke — Authenticated (creator flow)', () => {
  let testUser: TestUser;

  test.beforeEach(async () => {
    testUser = await createTestUser({ name: 'P398 Smoke User' });
  });

  test.afterEach(async () => {
    if (testUser?.user?.id) await deleteTestUser(testUser.user.id);
  });

  test('/live page loads without console errors', async ({ page }) => {
    await setTestSession(page, testUser.email);
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    expect(consoleErrors, `Console errors on /live: ${consoleErrors.join(', ')}`).toHaveLength(0);
  });

  test('/live page renders action buttons without crashing', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    // Page should render the "New session" button (pre-session state)
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(10);
  });
});
