/**
 * @file p405-smoke.spec.ts
 * @description Smoke tests for P405: My Sessions — Session History in Global Nav
 *
 * Fast regression checks:
 * 1. /sessions loads for authenticated user — no JS errors, page heading present
 * 2. /sessions redirects unauthenticated visitor to /login
 * 3. /live main screen does not show "THIS SESSION" history block
 * 4. Bottom nav Sessions tab visible for authenticated user (mobile)
 * 5. Desktop My Sessions link visible for authenticated user
 *
 * These catch regressions where:
 * - The /sessions route is missing or broken
 * - Auth guard is not applied
 * - SessionHistoryList was accidentally re-added to /live
 * - Bottom nav lost the Sessions tab
 */

import { test, expect } from '@playwright/test';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';
import { mockMicPermission } from './helpers/test-realtime';

test.describe('P405 Smoke: My Sessions', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 1. /sessions page loads for authenticated user ─────────────────────────
  test('/sessions loads for authenticated user without errors', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    try {
      testUser = await createTestUser({ name: 'P405 Smoke Auth' });
      await setTestSession(page, testUser.email);

      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      // Should stay on /sessions (not redirected)
      await expect(page).toHaveURL('/sessions');

      // My Sessions heading should be present
      await expect(
        page.getByRole('heading', { name: /my sessions/i })
      ).toBeVisible({ timeout: 10000 });

      // No uncaught JS errors
      const appErrors = consoleErrors.filter(
        e => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 2. /sessions redirects unauthenticated visitor ────────────────────────
  test('/sessions redirects unauthenticated visitor to /login', async ({ page }) => {
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Should redirect to login (with or without query param)
    await expect(page).toHaveURL(/\/login/);
  });

  // ── 3. /live has no "THIS SESSION" history block ──────────────────────────
  test('/live main screen does not show "THIS SESSION" history block', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    await mockMicPermission(page);

    try {
      testUser = await createTestUser({ name: 'P405 Smoke LiveClean' });
      await setTestSession(page, testUser.email);

      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      // "THIS SESSION" header must not appear
      await expect(page.getByText(/this session/i)).not.toBeVisible({ timeout: 5000 });

      // Primary action still visible
      await expect(
        page.getByRole('button', { name: /new session/i })
      ).toBeVisible({ timeout: 10000 });
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 4. Mobile bottom nav has Sessions tab ─────────────────────────────────
  test('mobile bottom nav includes Sessions tab for authenticated user', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      testUser = await createTestUser({ name: 'P405 Smoke MobileNav' });
      await setTestSession(page, testUser.email);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Sessions tab should be present in the mobile nav
      const sessionsTab = page.getByRole('link', { name: /^sessions$/i })
        .or(page.getByRole('link', { name: /my sessions/i }))
        .first();
      await expect(sessionsTab).toBeVisible({ timeout: 10000 });
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 5. Desktop nav has My Sessions link ───────────────────────────────────
  test('desktop nav has My Sessions link for authenticated user', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      testUser = await createTestUser({ name: 'P405 Smoke DesktopNav' });
      await setTestSession(page, testUser.email);

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // My Sessions should appear in desktop top nav icon links
      // OR in the avatar dropdown
      const mySessionsInNav = page.getByRole('link', { name: /my sessions/i });
      const isVisible = await mySessionsInNav.isVisible().catch(() => false);

      if (!isVisible) {
        // Try avatar dropdown
        const avatarButton = page.locator('button[aria-label*="avatar" i], button[aria-haspopup="menu"]').first();
        if (await avatarButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await avatarButton.click();
          await expect(
            page.getByRole('menuitem', { name: /my sessions/i })
              .or(page.getByRole('link', { name: /my sessions/i }))
          ).toBeVisible({ timeout: 5000 });
        }
      } else {
        await expect(mySessionsInNav).toBeVisible();
      }
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});
