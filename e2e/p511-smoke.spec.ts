/**
 * @file p511-smoke.spec.ts
 * @description Smoke tests for P511: Session Resilience — Grace Period, Rejoin, and Active Session Banner
 *
 * Fast regression detection:
 * - /live page loads without errors
 * - No console errors related to session resilience components
 * - Active session banner does not render when no session exists
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';

function setupErrorCollector(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('console', msg => {
    if (
      msg.type() === 'error' &&
      !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|\[vite\]|favicon/i)
    ) {
      errors.push(msg.text());
    }
  });
  return errors;
}

test.describe('P511: Smoke Tests', () => {
  test.setTimeout(45000);

  let testUser: TestUser;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P511Smoke' });
  });

  test.afterAll(async () => {
    if (testUser?.user?.id) await deleteTestUser(testUser.user.id);
  });

  // ── /live page loads ──────────────────────────────────────────────────────

  test('/live page loads without errors (authenticated)', async ({ page }) => {
    const errors = setupErrorCollector(page);

    await setTestSession(page, testUser.email);
    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    // Page should load — verify some content renders
    await expect(page.locator('body')).toBeVisible();

    // Filter for session-resilience related errors
    const sessionErrors = errors.filter(
      e => e.includes('session') || e.includes('heartbeat') || e.includes('grace') || e.includes('banner')
    );
    expect(
      sessionErrors,
      `Session resilience console errors: ${sessionErrors.join('\n')}`
    ).toHaveLength(0);
  });

  test('/live page loads without errors (anonymous)', async ({ page }) => {
    const errors = setupErrorCollector(page);

    await page.goto('/live');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    const sessionErrors = errors.filter(
      e => e.includes('session') || e.includes('heartbeat') || e.includes('grace') || e.includes('banner')
    );
    expect(
      sessionErrors,
      `Session resilience console errors (anon): ${sessionErrors.join('\n')}`
    ).toHaveLength(0);
  });

  // ── Banner does not appear when no session ────────────────────────────────

  test('no active session banner when user has no session', async ({ page }) => {
    await setTestSession(page, testUser.email);
    await page.goto('/events');
    await page.waitForLoadState('networkidle');

    // Banner should NOT appear when there's no active session
    const banner = page.locator('[role="status"][aria-label*="session" i]');
    await expect(banner).not.toBeVisible({ timeout: 3000 });
  });

  test('no active session banner for anonymous user', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const banner = page.locator('[role="status"][aria-label*="session" i]');
    await expect(banner).not.toBeVisible({ timeout: 3000 });
  });

  // ── No stale localStorage causes errors ───────────────────────────────────

  test('stale localStorage does not cause console errors on page load', async ({ page }) => {
    const errors = setupErrorCollector(page);

    // Inject malformed/stale session data before page load
    await page.context().addInitScript(() => {
      localStorage.setItem('cp_active_session', '{"code":"STALE123","role":"joiner"}');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should gracefully handle stale data without throwing
    const sessionErrors = errors.filter(
      e => e.includes('session') || e.includes('STALE') || e.includes('cp_active_session')
    );
    expect(
      sessionErrors,
      `Stale localStorage caused errors: ${sessionErrors.join('\n')}`
    ).toHaveLength(0);
  });
});
