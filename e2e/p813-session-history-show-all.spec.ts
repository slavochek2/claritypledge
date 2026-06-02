/**
 * @file p813-session-history-show-all.spec.ts
 * @description E2E for P813: Session History is a journal, not a curated highlight reel.
 *
 * P813 removes the `roundCount > 0 || transcriptStatus === 'completed'` filter
 * from the session list (was at sessions-service.ts:70). Every session the user
 * participated in now appears. Sessions with no completed rounds AND no completed
 * transcript ("abandoned") render de-emphasized with a "no rounds completed"
 * sub-label instead of being hidden.
 *
 * Predecessor: P405 (e2e/p405-my-sessions.spec.ts) — that file keeps the
 * unchanged auth/nav/detail coverage. This file owns the new show-all behavior.
 *
 * Session data is created directly via supabaseAdmin (bypasses RLS). No two-party
 * /live session is required — we test the /sessions page rendering in isolation.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, setTestSession, deleteTestUser } from './helpers/test-user';

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface SeedOptions {
  joinerName?: string | null;
  completedRounds?: number;
  skippedRounds?: number;
}

/** Insert a clarity_session with a given round history. Returns the row id. */
async function seedSession(
  creatorProfileId: string,
  creatorName: string,
  codeSuffix: string,
  opts: SeedOptions = {}
): Promise<string> {
  const { joinerName = null, completedRounds = 0, skippedRounds = 0 } = opts;

  const history = [
    ...Array(completedRounds).fill({
      skipped: false,
      title: 'The Clarity Framework',
      type: 'story',
      checkerRating: 8,
      responderRating: 7,
    }),
    ...Array(skippedRounds).fill({ skipped: true, title: 'Skipped Story', type: 'story' }),
  ];

  const code = `P813E2E${codeSuffix}${Date.now()}`;
  const { data, error } = await supabaseAdmin
    .from('clarity_sessions')
    .insert({
      code,
      creator_profile_id: creatorProfileId,
      creator_name: creatorName,
      joiner_name: joinerName,
      live_state: { sessionHistory: history },
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to seed test session: ${error.message}`);
  return data!.id;
}

async function deleteSession(id: string) {
  await supabaseAdmin.from('clarity_sessions').delete().eq('id', id);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('P813: Session History shows all sessions (no filter)', () => {
  test.describe.configure({ timeout: 30000 });

  // ── 1. Smoke + core behavior: an abandoned session appears, not hidden ─────
  test('smoke: abandoned session (0 rounds) is shown de-emphasized, not hidden', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    const sessionIds: string[] = [];

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    try {
      testUser = await createTestUser({ name: 'P813 AbandonUser' });

      // A session with zero rounds (empty history) — under P405 this was hidden.
      sessionIds.push(
        await seedSession(testUser.user.id, 'P813 AbandonUser', 'abandon', {
          joinerName: 'P813 GhostPartner',
          completedRounds: 0,
        })
      );

      await setTestSession(page, testUser.email);
      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      // Stays on /sessions (NOT the empty state)
      await expect(page).toHaveURL('/sessions');
      await expect(page.getByRole('heading', { name: /session history/i })).toBeVisible({ timeout: 10000 });

      // The abandoned session row appears with partner name + "no rounds completed"
      await expect(page.getByText(/P813 GhostPartner/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/no rounds completed/i)).toBeVisible({ timeout: 10000 });

      // Empty state must NOT be shown
      await expect(page.getByRole('heading', { name: /no sessions yet/i })).not.toBeVisible();

      // No uncaught JS errors
      const appErrors = consoleErrors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('favicon')
      );
      expect(appErrors).toHaveLength(0);
    } finally {
      for (const id of sessionIds) await deleteSession(id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 2. Substantive and abandoned sessions both appear ─────────────────────
  test('substantive and abandoned sessions both appear in the list', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    const sessionIds: string[] = [];

    try {
      testUser = await createTestUser({ name: 'P813 MixUser' });

      // Substantive: 3 completed rounds
      sessionIds.push(
        await seedSession(testUser.user.id, 'P813 MixUser', 'sub', {
          joinerName: 'P813 RealPartner',
          completedRounds: 3,
        })
      );
      // Abandoned: skipped-only (0 completed rounds)
      sessionIds.push(
        await seedSession(testUser.user.id, 'P813 MixUser', 'aband', {
          joinerName: 'P813 SkipPartner',
          completedRounds: 0,
          skippedRounds: 2,
        })
      );

      await setTestSession(page, testUser.email);
      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      // Substantive session: partner + round count badge
      await expect(page.getByText(/P813 RealPartner/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/3 rounds?/i)).toBeVisible({ timeout: 10000 });

      // Abandoned session: partner + "no rounds completed"
      await expect(page.getByText(/P813 SkipPartner/i)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/no rounds completed/i)).toBeVisible({ timeout: 10000 });
    } finally {
      for (const id of sessionIds) await deleteSession(id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });

  // ── 3. Tapping an abandoned session opens detail without error ────────────
  test('tapping an abandoned session opens the detail view gracefully', async ({ page }) => {
    let testUser: Awaited<ReturnType<typeof createTestUser>> | null = null;
    const sessionIds: string[] = [];

    try {
      testUser = await createTestUser({ name: 'P813 TapUser' });

      sessionIds.push(
        await seedSession(testUser.user.id, 'P813 TapUser', 'tap', {
          joinerName: 'P813 TapPartner',
          completedRounds: 0,
        })
      );

      await setTestSession(page, testUser.email);
      await page.goto('/sessions');
      await page.waitForLoadState('networkidle');

      const row = page
        .getByRole('button', { name: /P813 TapPartner/i })
        .or(page.locator('[aria-label*="P813 TapPartner"]'))
        .first();
      await expect(row).toBeVisible({ timeout: 10000 });
      await row.click();

      // Detail view renders the graceful "no rounds" message — not a crash/404
      await expect(page.getByText(/no round details available/i)).toBeVisible({ timeout: 10000 });
    } finally {
      for (const id of sessionIds) await deleteSession(id);
      if (testUser) await deleteTestUser(testUser.user.id);
    }
  });
});
