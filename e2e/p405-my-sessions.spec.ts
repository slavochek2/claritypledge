/**
 * @file p405-my-sessions.spec.ts
 * @description E2E tests for P405: My Sessions — Session History in Global Nav
 *
 * Tests the user flows for the My Sessions feature:
 * 1. /sessions page loads with sessions list (happy path)
 * 2. Empty state shown when user has no completed sessions
 * 3. Unauthenticated access redirects to /login
 * 4. Session row click opens detail drawer/expand
 * 5. Mobile bottom nav shows 4 tabs including "My Sessions" / "Sessions"
 * 6. "THIS SESSION" block removed from /live main screen
 * 7. Sessions tab hidden during an active live session
 * 8. Desktop nav includes "My Sessions" link
 *
 * Session data setup: created directly via supabaseAdmin (bypasses RLS).
 * No two-party live session required — we test the /sessions page in isolation.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../src/lib/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  generateTestEmail as _generateTestEmail,
} from './helpers/test-user';
import { mockMicPermission } from './helpers/test-realtime';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTestSessionWithHistory(
  creatorProfileId: string,
  creatorName: string,
  options: {
    joinerProfileId?: string;
    joinerName?: string;
    completedRounds?: number;
    skippedRounds?: number;
  } = {}
): Promise<string> {
  const {
    joinerProfileId = null,
    joinerName = null,
    completedRounds = 2,
    skippedRounds = 0,
  } = options;

  const history = [
    ...Array(completedRounds).fill({
      skipped: false,
      title: 'The Clarity Framework',
      type: 'story',
      checkerRating: 8,
      responderRating: 7,
    }),
    ...Array(skippedRounds).fill({
      skipped: true,
      title: 'Skipped Story',
      type: 'story',
    }),
  ];

  const code = `P405E2E${Date.now()}`;
  const { data, error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code,
      creator_profile_id: creatorProfileId,
      creator_name: creatorName,
      joiner_profile_id: joinerProfileId,
      joiner_name: joinerName,
      live_state: { sessionHistory: history },
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create test session: ${error.message}`);
  return data!.id;
}

async function deleteTestSession(id: string) {
  await supabaseAdmin.from('clarity_sessions').delete().eq('id', id);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P405: My Sessions — /sessions page', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 1. Auth guard: unauthenticated redirects to /login ────────────────────
  test('unauthenticated visitor is redirected to /login', async ({ page }) => {
    await page.goto('/sessions');
    await page.waitForLoadState('networkidle');

    // Should redirect to login with redirect param
    await expect(page).toHaveURL(/\/login/);
  });

  // ── 2. Happy path: sessions list loads ───────────────────────────────────
  test('sessions list loads with past sessions for authenticated user', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    const sessionIds: string[] = [];

    try {
      testUser = await createTestUser({ name: 'P405 SessionUser' });

      // Create a session with completed rounds
      const sessionId = await createTestSessionWithHistory(
        testUser.user.id,
        'P405 SessionUser',
        { joinerName: 'P405 Partner', completedRounds: 3 }
      );
      sessionIds.push(sessionId);

      await setTestSession(page, testUser.email);
      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      // Should stay on /sessions
      await expect(page).toHaveURL('/sessions');

      // Page heading should be visible
      await expect(page.getByRole('heading', { name: /session history/i })).toBeVisible({ timeout: 10000 });

      // Session row should appear with partner name and round count
      await expect(page.getByText(/P405 Partner/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/3 rounds?/i)).toBeVisible({ timeout: 10000 });
    } finally {
      for (const id of sessionIds) await deleteTestSession(id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 3. Empty state: no completed sessions ─────────────────────────────────
  test('empty state shown when user has no completed sessions', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    const sessionIds: string[] = [];

    try {
      testUser = await createTestUser({ name: 'P405 NoSessionUser' });

      // Create a session with ONLY skipped rounds (should be filtered out)
      const sessionId = await createTestSessionWithHistory(
        testUser.user.id,
        'P405 NoSessionUser',
        { completedRounds: 0, skippedRounds: 1 }
      );
      sessionIds.push(sessionId);

      await setTestSession(page, testUser.email);
      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      // Empty state should be shown
      await expect(
        page.getByRole('heading', { name: /no sessions yet/i })
      ).toBeVisible({ timeout: 10000 });

      // CTA button to start a session should be present
      await expect(
        page.getByRole('link', { name: /start a clarity session/i })
          .or(page.getByRole('button', { name: /start a clarity session/i }))
          .first()
      ).toBeVisible({ timeout: 10000 });
    } finally {
      for (const id of sessionIds) await deleteTestSession(id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 4. Session detail opens on row click ──────────────────────────────────
  test('tapping a session row opens the detail view with rounds', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    const sessionIds: string[] = [];

    try {
      testUser = await createTestUser({ name: 'P405 DetailUser' });

      const sessionId = await createTestSessionWithHistory(
        testUser.user.id,
        'P405 DetailUser',
        { joinerName: 'P405 DetailPartner', completedRounds: 2 }
      );
      sessionIds.push(sessionId);

      await setTestSession(page, testUser.email);
      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      // Wait for session list to load
      await expect(page.getByText(/P405 DetailPartner/i)).toBeVisible({ timeout: 10000 });

      // Click the session row
      const sessionRow = page.getByRole('button', { name: /P405 DetailPartner/i })
        .or(page.locator('[aria-label*="P405 DetailPartner"]'))
        .first();
      await sessionRow.click();

      // Detail view should show round content
      await expect(
        page.getByText(/the clarity framework/i)
          .or(page.getByText(/rounds? completed/i))
          .first()
      ).toBeVisible({ timeout: 10000 });
    } finally {
      for (const id of sessionIds) await deleteTestSession(id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 5. No console errors on /sessions ─────────────────────────────────────
  test('/sessions page loads without uncaught JS errors', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));

    try {
      testUser = await createTestUser({ name: 'P405 CleanUser' });
      await setTestSession(page, testUser.email);

      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      const appErrors = consoleErrors.filter(
        e => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});

test.describe('P405: Navigation — My Sessions tab and links', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 6. Mobile bottom nav has Sessions tab ─────────────────────────────────
  test('mobile bottom nav includes Sessions tab (not in active session)', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      testUser = await createTestUser({ name: 'P405 MobileNavUser' });
      await setTestSession(page, testUser.email);

      // Use mobile viewport
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Sessions tab should be in the bottom nav
      const sessionsTab = page.getByRole('link', { name: /sessions/i })
        .or(page.getByRole('tab', { name: /sessions/i }))
        .first();
      await expect(sessionsTab).toBeVisible({ timeout: 10000 });
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 7. Desktop nav has My Sessions link ──────────────────────────────────
  test('desktop nav has My Sessions link for authenticated user', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      testUser = await createTestUser({ name: 'P405 DesktopNavUser' });
      await setTestSession(page, testUser.email);

      // Use desktop viewport
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // My Sessions should be in top nav or accessible from avatar dropdown
      const mySessionsLink = page.getByRole('link', { name: /my sessions/i });
      const isInNav = await mySessionsLink.isVisible().catch(() => false);

      if (!isInNav) {
        // Check in avatar dropdown
        const avatarButton = page.getByRole('button', { name: /avatar|account|menu/i })
          .or(page.locator('[data-testid="avatar-button"], [aria-label*="avatar"]'))
          .first();
        if (await avatarButton.isVisible()) {
          await avatarButton.click();
          await expect(page.getByRole('menuitem', { name: /my sessions/i })
            .or(page.getByRole('link', { name: /my sessions/i }))
          ).toBeVisible({ timeout: 5000 });
        }
      } else {
        await expect(mySessionsLink).toBeVisible();
      }
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 8. Sessions nav tab navigates to /sessions ────────────────────────────
  test('clicking Sessions tab navigates to /sessions page', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      testUser = await createTestUser({ name: 'P405 NavClickUser' });
      await setTestSession(page, testUser.email);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const sessionsTab = page.getByRole('link', { name: /sessions/i }).first();
      await expect(sessionsTab).toBeVisible({ timeout: 10000 });
      await sessionsTab.click();

      await expect(page).toHaveURL('/sessions');
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});

test.describe('P405: /live screen cleanup — SessionHistoryList removed', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 9. /live idle screen has no "THIS SESSION" history block ─────────────
  test('/live main screen does not show "THIS SESSION" history block', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    await mockMicPermission(page);

    try {
      testUser = await createTestUser({ name: 'P405 LiveCleanUser' });
      await setTestSession(page, testUser.email);

      await page.goto('/live');
      await page.waitForLoadState('networkidle');

      // "THIS SESSION" heading must not be visible
      await expect(page.getByText(/this session/i)).not.toBeVisible({ timeout: 5000 });

      // The main screen still shows the primary action
      await expect(page.getByRole('button', { name: /new session/i })).toBeVisible({ timeout: 10000 });
    } finally {
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});

test.describe('P405: Sessions tab suppressed during active live session', () => {
  test.describe.configure({ timeout: 60000 });

  // ── 10. Sessions tab hidden during active /live session ───────────────────
  test('Sessions tab is hidden from bottom nav during active live session', async ({ browser }) => {
    const creatorContext = await browser.newContext();
    const creatorPage = await creatorContext.newPage();

    await mockMicPermission(creatorPage);

    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;

    try {
      testUser = await createTestUser({ name: 'P405 LiveSuppress' });
      await setTestSession(creatorPage, testUser.email);

      await creatorPage.setViewportSize({ width: 390, height: 844 });

      // Verify Sessions tab is visible before entering active session
      await creatorPage.goto('/');
      await creatorPage.waitForLoadState('networkidle');
      const sessionsTab = creatorPage.getByRole('link', { name: /session history/i }).first();
      await expect(sessionsTab).toBeVisible({ timeout: 10000 });

      // Start a live session to enter active state
      await creatorPage.goto('/live');
      await creatorPage.waitForLoadState('networkidle');
      await creatorPage.getByRole('button', { name: 'New session' }).click();
      await expect(creatorPage.getByText('Invite Your Partner')).toBeVisible({ timeout: 10000 });

      // Now in active session (waiting state) — Sessions tab should be hidden
      const hiddenTab = creatorPage.getByRole('link', { name: /session history/i });
      await expect(hiddenTab).not.toBeVisible({ timeout: 5000 });
    } finally {
      await creatorContext.close();
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});
