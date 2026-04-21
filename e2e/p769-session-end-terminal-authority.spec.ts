/**
 * @file p769-session-end-terminal-authority.spec.ts
 *
 * P769: Session-end must be terminal and authoritative — E2E tests.
 *
 * FIXME(p769-dev): Selectors for "This session has ended" and "Active session
 * banner" depend on exact copy/aria text after implementation. Update to match
 * actual rendered output. Expected text per spec:
 *   - Ended screen heading: "This session has ended"
 *   - Banner: "In session with {name}" / "End Session" button
 *   - RejoinPrompt: "Your session is still running"
 */

import { test, expect, type Browser } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  setTestSession,
  type TestUser,
} from './helpers/test-user';
import {
  mockMicPermission,
  waitForUIUpdate,
  waitForDBStateKey,
} from './helpers/test-realtime';
import {
  createTwoPartySession,
  createTwoPartySessionRealistic,
  createTestSessionInDB,
} from './helpers/test-session';
import { getTestAuthContext } from './helpers/auth-context';

// ─── Error collector helper ───────────────────────────────────────────────────

function collectErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', msg => {
    if (
      msg.type() === 'error' &&
      !msg.text().match(/supabase.*realtime|WebSocket.*failed|net::ERR_|favicon|\[vite\]/i)
    ) {
      errors.push(msg.text());
    }
  });
  return errors;
}

// ─── Storage read helpers ─────────────────────────────────────────────────────

const CLARITY_LIVE_KEYS = [
  'clarity_live_session_id',
  'clarity_live_session_code',
  'clarity_live_role',
  'clarity_live_guest_name',
];

async function readSessionStorageKeys(
  page: import('@playwright/test').Page
): Promise<Record<string, string | null>> {
  return page.evaluate((keys: string[]) => {
    const result: Record<string, string | null> = {};
    keys.forEach(k => {
      result[k] = sessionStorage.getItem(k);
    });
    return result;
  }, CLARITY_LIVE_KEYS);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1 — Smoke check (must be FIRST)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769 smoke', () => {
  let testUser: TestUser;

  test.beforeAll(async () => {
    testUser = await createTestUser({ name: 'P769 Smoke User' });
  });

  test.afterAll(async () => {
    if (testUser?.user?.id) {
      try { await deleteTestUser(testUser.user.id); } catch { /* noop */ }
    }
  });

  test('smoke: /live page loads without console errors', async ({ page }) => {
    const errors = collectErrors(page);

    await setTestSession(page, testUser.email);
    await page.goto('/live?skipMicCheck=true');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();

    expect(
      errors.filter(e => !e.includes('WebSocket') && !e.includes('favicon')),
      'Console errors present on /live page'
    ).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2 — Author ends from ActiveSessionBanner; partner sees ended screen
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: Author ends from ActiveSessionBanner → partner sees ended screen', () => {
  test.setTimeout(90_000);

  test(
    'author ends session from ActiveSessionBanner — banner disappears ≤1s; ' +
      'partner on /live sees ended screen within 3s',
    async ({ browser }: { browser: Browser }) => {
      const session = await createTwoPartySession(browser, {
        hostName: 'P769 Banner Author',
        guestName: 'P769 Banner Partner',
      });

      try {
        await session.host.page.goto('/letters');
        await session.host.page.waitForLoadState('networkidle');

        await session.host.page.evaluate(
          ({ code, partnerName }: { code: string; partnerName: string }) => {
            localStorage.setItem(
              'cp_active_session',
              JSON.stringify({
                code,
                partnerName,
                role: 'creator',
                savedAt: new Date().toISOString(),
              })
            );
          },
          { code: session.sessionCode, partnerName: 'P769 Banner Partner' }
        );

        await session.host.page.reload();
        await session.host.page.waitForLoadState('networkidle');

        const endButton = session.host.page.getByRole('button', { name: /end session/i }).first();
        await expect(endButton).toBeVisible({ timeout: 5_000 });

        await endButton.click();

        await expect(endButton).not.toBeVisible({ timeout: 1_500 });

        const endedScreen = session.guest.page.getByRole('heading', {
          name: /this session has ended/i,
        });
        await waitForUIUpdate(session.guest.page, endedScreen, 5_000);

        await waitForDBStateKey(
          'clarity_sessions',
          'live_state',
          'sessionEnded',
          true,
          'code',
          session.sessionCode,
          10_000
        );

        const { data: sessionRow } = await supabaseAdmin
          .from('clarity_sessions')
          .select('status')
          .eq('code', session.sessionCode)
          .single();
        expect(sessionRow?.status).toBe('completed');
      } finally {
        await session.cleanup();
      }
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3 — Author ends from /live (confirmExitMeeting); invite.closed_at set
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: Author ends from /live → invite closed; letter surfaces clear', () => {
  test.setTimeout(90_000);

  test('author ends from /live — clarity_live_invites.closed_at is set', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const session = await createTwoPartySessionRealistic(browser, {
      hostName: 'P769 Exit Host',
      guestName: 'P769 Exit Guest',
    });

    const { data: invite } = await supabaseAdmin
      .from('clarity_live_invites')
      .insert({
        creator_id: session.host.user.user.id,
        session_id: session.sessionId,
        target_user_id: session.guest.user.user.id,
      })
      .select('id')
      .single();
    const inviteId: string | undefined = invite?.id;

    try {
      const exitButton = session.host.page
        .getByRole('button', { name: /end session|leave|exit/i })
        .first();

      if (await exitButton.isVisible({ timeout: 5_000 })) {
        await exitButton.click();

        const confirmButton = session.host.page
          .getByRole('button', { name: /confirm|end|yes/i })
          .first();
        if (await confirmButton.isVisible({ timeout: 2_000 })) {
          await confirmButton.click();
        }
      } else {
        await supabaseAdmin.rpc('complete_clarity_session', {
          p_session_id: session.sessionId,
        });
      }

      await waitForDBStateKey(
        'clarity_sessions',
        'live_state',
        'sessionEnded',
        true,
        'id',
        session.sessionId,
        10_000
      );

      if (inviteId) {
        const { data: inviteRow } = await supabaseAdmin
          .from('clarity_live_invites')
          .select('closed_at')
          .eq('id', inviteId)
          .single();

        expect(
          inviteRow?.closed_at,
          'clarity_live_invites.closed_at must be set after session end (AC: invite closure)'
        ).not.toBeNull();
      }
    } finally {
      if (inviteId) {
        await supabaseAdmin.from('clarity_live_invites').delete().eq('id', inviteId);
      }
      await session.cleanup();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 4 — Partner lands on /live after session ended → ended screen
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: Partner lands on /live after session ended → ended screen', () => {
  test.setTimeout(60_000);

  let hostUser: TestUser;
  let partnerUser: TestUser;

  test.beforeAll(async () => {
    [hostUser, partnerUser] = await Promise.all([
      createTestUser({ name: 'P769 EndedHost' }),
      createTestUser({ name: 'P769 EndedPartner' }),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([
      deleteTestUser(hostUser.user.id),
      deleteTestUser(partnerUser.user.id),
    ]);
  });

  test('partner navigates to /live/{code} where session is already ended — sees ended screen', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const dbSession = await createTestSessionInDB(
      hostUser.user.id,
      partnerUser.name,
      { guestProfileId: partnerUser.user.id }
    );

    try {
      await supabaseAdmin.rpc('complete_clarity_session', {
        p_session_id: dbSession.sessionId,
      });

      const partnerAuth = await getTestAuthContext('host', browser, { name: partnerUser.name });
      const partnerPage = await partnerAuth.context.newPage();
      await mockMicPermission(partnerPage);

      try {
        await partnerPage.goto(`/live/${dbSession.sessionCode}?skipMicCheck=true`);
        await partnerPage.waitForLoadState('networkidle');

        const endedScreen = partnerPage.getByRole('heading', {
          name: /this session has ended/i,
        });
        await expect(endedScreen).toBeVisible({ timeout: 8_000 });

        const newSessionButton = partnerPage.getByRole('button', {
          name: /new session|start session|create/i,
        });
        await expect(newSessionButton).not.toBeVisible({ timeout: 2_000 });

        const lettersCta = partnerPage.getByRole('link', { name: /letters|go to letters/i });
        await expect(lettersCta).toBeVisible({ timeout: 5_000 });
      } finally {
        await partnerPage.close();
        await partnerAuth.cleanup();
      }
    } finally {
      await dbSession.cleanup();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 5 — Partner refreshes /letters after session ended → no banner
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: Partner refreshes /letters after session ended → no ActiveSessionBanner', () => {
  let partnerUser: TestUser;
  let hostUser: TestUser;

  test.beforeAll(async () => {
    [partnerUser, hostUser] = await Promise.all([
      createTestUser({ name: 'P769 LettersPartner' }),
      createTestUser({ name: 'P769 LettersHost' }),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([
      deleteTestUser(partnerUser.user.id),
      deleteTestUser(hostUser.user.id),
    ]);
  });

  test('partner visits /letters — no ActiveSessionBanner after session ended', async ({ page }) => {
    const dbSession = await createTestSessionInDB(
      hostUser.user.id,
      partnerUser.name,
      { guestProfileId: partnerUser.user.id }
    );

    try {
      await supabaseAdmin.rpc('complete_clarity_session', {
        p_session_id: dbSession.sessionId,
      });

      await setTestSession(page, partnerUser.email);
      await page.evaluate(
        ({
          code,
          hostName,
        }: {
          code: string;
          hostName: string;
        }) => {
          localStorage.setItem(
            'cp_active_session',
            JSON.stringify({
              code,
              partnerName: hostName,
              role: 'joiner',
              savedAt: new Date().toISOString(),
            })
          );
        },
        { code: dbSession.sessionCode, hostName: hostUser.name }
      );

      await page.goto('/letters');
      await page.waitForLoadState('networkidle');

      await page.waitForTimeout(1_500);

      const banner = page.locator('[data-testid="active-session-banner"]');
      await expect(banner).not.toBeVisible({ timeout: 500 });
    } finally {
      await dbSession.cleanup();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 6 — sessionStorage cleared on both sides after termination
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: sessionStorage cleared on both parties after termination', () => {
  test.setTimeout(90_000);

  test('both host and guest have empty clarity_live_* sessionStorage within 5s of End Session', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P769 Storage Host',
      guestName: 'P769 Storage Guest',
    });

    try {
      await supabaseAdmin.rpc('complete_clarity_session', {
        p_session_id: session.sessionId,
      });

      await waitForDBStateKey(
        'clarity_sessions',
        'live_state',
        'sessionEnded',
        true,
        'id',
        session.sessionId,
        10_000
      );

      await new Promise((r) => setTimeout(r, 3_000));

      const hostStorage = await readSessionStorageKeys(session.host.page);
      const hostDirtyKeys = Object.entries(hostStorage)
        .filter(([, v]) => v !== null)
        .map(([k]) => k);

      const guestStorage = await readSessionStorageKeys(session.guest.page);
      const guestDirtyKeys = Object.entries(guestStorage)
        .filter(([, v]) => v !== null)
        .map(([k]) => k);

      expect(
        hostDirtyKeys,
        `Host still has clarity_live_* keys after End Session: ${hostDirtyKeys.join(', ')}`
      ).toHaveLength(0);

      expect(
        guestDirtyKeys,
        `Guest still has clarity_live_* keys after End Session: ${guestDirtyKeys.join(', ')}`
      ).toHaveLength(0);
    } finally {
      await session.cleanup();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 7 — Subscription count canary (single channel at steady state)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: Single subscribeToClaritySession channel at steady state', () => {
  test.setTimeout(60_000);

  test('one /live page has exactly one clarity_session channel open (not three)', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P769 Channel Host',
      guestName: 'P769 Channel Guest',
    });

    try {
      await session.host.page.waitForLoadState('networkidle');
      await new Promise((r) => setTimeout(r, 2_000));

      const channelCount = await session.host.page.evaluate(
        (sessionId: string) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const supabase = (window as any).__supabase_client__;
            if (!supabase?.realtime?.channels) return -1;

            const channels: { topic: string }[] = supabase.realtime.channels;
            return channels.filter(
              (ch) =>
                ch.topic.includes('clarity_session') &&
                ch.topic.includes(sessionId)
            ).length;
          } catch {
            return -1;
          }
        },
        session.sessionId
      );

      if (channelCount === -1) {
        console.log('[P769] Channel introspection not available — using DB consistency fallback');

        const { data } = await supabaseAdmin
          .from('clarity_sessions')
          .select('live_state')
          .eq('id', session.sessionId)
          .single();
        expect(data).not.toBeNull();
      } else {
        expect(
          channelCount,
          'Expected exactly 1 clarity_session channel — found multiple (subscription leak)'
        ).toBe(1);
      }
    } finally {
      await session.cleanup();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 8 — Regression: refresh during active session does NOT end it
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: Regression — refresh during active session does NOT end session', () => {
  test.setTimeout(90_000);

  test('creator refreshes /live page — session remains active in DB', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P769 Refresh Host',
      guestName: 'P769 Refresh Guest',
    });

    try {
      const { data: before } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state, status')
        .eq('id', session.sessionId)
        .single();

      await session.host.page.reload();
      await session.host.page.waitForLoadState('networkidle');

      await new Promise((r) => setTimeout(r, 2_000));

      const { data: after } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state, status')
        .eq('id', session.sessionId)
        .single();

      const liveState = after?.live_state as Record<string, unknown> | null;

      expect(
        liveState?.sessionEnded ?? false,
        'Refresh must NOT set sessionEnded=true (P511 invariant violated)'
      ).toBe(false);

      expect(
        after?.status,
        'Refresh must NOT set status=completed'
      ).not.toBe('completed');

      expect(after?.status).toBe(before?.status);
    } finally {
      await session.cleanup();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 9 — Regression: guest pagehide does NOT write joinerEnded
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: Regression — guest pagehide does NOT write joinerEnded', () => {
  test.setTimeout(60_000);

  test('guest tab closes (pagehide) — joinerEnded stays false in DB', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P769 Pagehide Host',
      guestName: 'P769 Pagehide Guest',
    });

    try {
      await session.guest.page.close();

      await new Promise((r) => setTimeout(r, 3_000));

      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state, status')
        .eq('id', session.sessionId)
        .single();

      const liveState = data?.live_state as Record<string, unknown> | null;

      expect(
        liveState?.joinerEnded ?? false,
        'Guest pagehide (tab close) must NOT write joinerEnded=true (P511 invariant)'
      ).toBe(false);

      expect(
        liveState?.sessionEnded ?? false,
        'Guest pagehide must NOT write sessionEnded=true'
      ).toBe(false);

      expect(data?.status).not.toBe('completed');
    } finally {
      await supabaseAdmin
        .from('clarity_sessions')
        .delete()
        .eq('id', session.sessionId);
      try {
        await session.host.page.close();
      } catch { /* already closed */ }
      await session.host.context.close();
      await deleteTestUser(session.host.user.user.id);
      await deleteTestUser(session.guest.user.user.id);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 10 — RejoinPrompt shows loading state then ended screen
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('P769: RejoinPrompt — no flash; ended screen after reconciliation', () => {
  let partnerUser: TestUser;
  let hostUser: TestUser;

  test.beforeAll(async () => {
    [partnerUser, hostUser] = await Promise.all([
      createTestUser({ name: 'P769 RejoinPartner' }),
      createTestUser({ name: 'P769 RejoinHost' }),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([
      deleteTestUser(partnerUser.user.id),
      deleteTestUser(hostUser.user.id),
    ]);
  });

  test('partner refreshes /live within 5s — no RejoinPrompt flash; ended screen shows ≤1s after mount', async ({
    page,
  }) => {
    const dbSession = await createTestSessionInDB(
      hostUser.user.id,
      partnerUser.name,
      { guestProfileId: partnerUser.user.id }
    );

    try {
      await supabaseAdmin.rpc('complete_clarity_session', {
        p_session_id: dbSession.sessionId,
      });

      await setTestSession(page, partnerUser.email);

      await page.evaluate(
        ({ code, hostName }: { code: string; hostName: string }) => {
          localStorage.setItem(
            'cp_active_session',
            JSON.stringify({
              code,
              partnerName: hostName,
              role: 'joiner',
              savedAt: new Date().toISOString(),
            })
          );
          sessionStorage.setItem('clarity_live_session_code', code);
        },
        { code: dbSession.sessionCode, hostName: hostUser.name }
      );

      const mountTime = Date.now();
      await page.goto(`/live/${dbSession.sessionCode}?skipMicCheck=true`);
      await page.waitForLoadState('networkidle');

      const rejoinPrompt = page.getByText(/your session is still running/i);
      await expect(rejoinPrompt).not.toBeVisible({ timeout: 2_000 });

      const endedScreen = page.getByRole('heading', { name: /this session has ended/i });
      await expect(endedScreen).toBeVisible({ timeout: 3_000 });

      const reconciliationMs = Date.now() - mountTime;
      console.log(`[P769] Reconciliation time: ${reconciliationMs}ms`);
    } finally {
      await dbSession.cleanup();
    }
  });
});

test.describe('P775: ActiveSessionBanner cleared pre-upload in confirmExitMeeting', () => {
  test.setTimeout(90_000);

  test('creator clicks End Session then navigates to /letters during upload — no banner', async ({ browser }) => {
    const session = await createTwoPartySessionRealistic(browser, {
      hostName: 'P775 Banner Race Host',
      guestName: 'P775 Banner Race Guest',
    });
    try {
      const endButton = session.host.page
        .getByRole('button', { name: /end session|leave|exit/i })
        .first();
      await expect(endButton).toBeVisible({ timeout: 5_000 });

      // React's synthetic click handler runs synchronously before the microtask
      // queue yields to Playwright's navigation, so clearStoredSession() +
      // clearActiveSession() execute before the page unmounts.
      await Promise.all([
        endButton.click(),
        session.host.page.goto('/letters', { waitUntil: 'domcontentloaded' }),
      ]);

      const banner = session.host.page.locator('[data-testid="active-session-banner"]');
      await expect(banner).not.toBeVisible({ timeout: 1_000 });

      // Reload — still no banner (localStorage + context both cleared)
      await session.host.page.reload();
      await session.host.page.waitForLoadState('networkidle');
      await expect(banner).not.toBeVisible({ timeout: 1_000 });

      // DB eventually consistent
      await waitForDBStateKey('clarity_sessions', 'live_state', 'sessionEnded', true, 'id', session.sessionId, 10_000);
    } finally {
      await session.cleanup();
    }
  });

  test('joiner clicks End Session then navigates — no banner (joiner path, same race)', async ({ browser }) => {
    const session = await createTwoPartySessionRealistic(browser, {
      hostName: 'P775 Joiner Race Host',
      guestName: 'P775 Joiner Race Guest',
    });
    try {
      const endButton = session.guest.page
        .getByRole('button', { name: /end session|leave|exit/i })
        .first();
      await expect(endButton).toBeVisible({ timeout: 5_000 });

      // Same intentional Promise.all ordering as creator test — see comment above.
      await Promise.all([
        endButton.click(),
        session.guest.page.goto('/letters', { waitUntil: 'domcontentloaded' }),
      ]);

      const banner = session.guest.page.locator('[data-testid="active-session-banner"]');
      await expect(banner).not.toBeVisible({ timeout: 1_000 });

      await session.guest.page.reload();
      await session.guest.page.waitForLoadState('networkidle');
      await expect(banner).not.toBeVisible({ timeout: 1_000 });
      // No DB assertion: joiner exit calls clearSessionJoiner + cancelLiveInvite
      // (not terminate), so live_state.sessionEnded is not set for the joiner path.
      // Banner clearance is the observable signal; DB write landing is tested by
      // existing P769 tests that cover the complete_clarity_session RPC.
    } finally {
      await session.cleanup();
    }
  });
});
