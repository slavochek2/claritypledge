/**
 * @file p921-reproduce.spec.ts
 *
 * P921 canary — the genuine app bugs surfaced while reproducing the 5 failing
 * p769 ended-state tests. All FAIL before the fix and must PASS after it.
 *
 * Founder decision (2026-06-10, recorded in spec § Open Questions):
 *   - Cause 1 ended-screen routing is PATH-DEPENDENT: a cold link/refresh to an
 *     ALREADY-ended session → SessionEndedScreen ("This session has ended" +
 *     Go-to-Letters); a partner-ends-MID-session → keep PartnerLeftScreen
 *     ("Session ended"). So @279/@647 are app fixes (Canary C); @110 is a test
 *     fix (its in-session path correctly shows "Session ended" — no app canary).
 *   - One /fix handles all three causes.
 *
 * Canary A (was @401) — a session ended REMOTELY (RPC, not this tab's End
 *   button) must clear this tab's clarity_live_* sessionStorage. The detection
 *   sites (clarity-live-page.tsx realtime ~1165 / poll ~1346) set sessionEnded
 *   but never call clearStoredSession(). P769 invariant: end clears storage on
 *   both sides.
 * Canary B (was @700) — clicking End Session then immediately navigating must
 *   still land live_state.sessionEnded=true in the DB. terminate() is sequenced
 *   in confirmExitMeeting AFTER `await Promise.race([stopAndUploadRecording(),
 *   5s])` + `await createTranscriptionJob()`; a full-page nav tears down the JS
 *   context before the RPC fires, so the partner is never notified.
 * Canary C (was @279/@647) — a cold visit to /live/{code} of an already-ended
 *   session must show the SessionEndedScreen ("This session has ended" +
 *   Go-to-Letters), NOT route through join→live→PartnerLeftScreen ("Session
 *   ended"). joinClaritySession (api.ts:932) has no sessionEnded guard, so the
 *   partner rejoins the dead session and lands on the wrong terminal screen.
 */
import { test, expect, type Browser } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { mockMicPermission, waitForDBStateKey } from './helpers/test-realtime';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { getTestAuthContext } from './helpers/auth-context';
import {
  createTestSessionInDB,
  createTwoPartySession,
  createTwoPartySessionRealistic,
} from './helpers/test-session';

const CLARITY_LIVE_KEYS = [
  'clarity_live_session_id',
  'clarity_live_session_code',
  'clarity_live_role',
  'clarity_live_guest_name',
];

async function dirtyLiveKeys(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate((keys: string[]) => {
    return keys.filter((k) => sessionStorage.getItem(k) !== null);
  }, CLARITY_LIVE_KEYS);
}

// ─── Canary A (was @401) — remote end must clear local clarity_live_* storage ──

test.describe('P921-A: remote session-end clears the detecting tab’s sessionStorage', () => {
  test.setTimeout(90_000);

  test('host tab clears clarity_live_* within 5s of a remote complete_clarity_session', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P921A Host',
      guestName: 'P921A Guest',
    });
    try {
      // Sanity: app populated the keys during the live session (otherwise the
      // assertion below would pass vacuously).
      const beforeKeys = await dirtyLiveKeys(session.host.page);
      expect(
        beforeKeys.length,
        'precondition — host should have clarity_live_* keys while live',
      ).toBeGreaterThan(0);

      // End the session REMOTELY (neither tab clicked End Session).
      await supabaseAdmin.rpc('complete_clarity_session', { p_session_id: session.sessionId });
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'sessionEnded', true, 'id', session.sessionId, 10_000,
      );

      // Give the host page's poll/realtime detection time to react (~1s poll).
      await new Promise((r) => setTimeout(r, 4_000));

      const afterKeys = await dirtyLiveKeys(session.host.page);
      expect(
        afterKeys,
        `Host still has clarity_live_* keys after remote end: ${afterKeys.join(', ')}`,
      ).toHaveLength(0);
    } finally {
      await session.cleanup();
    }
  });
});

// ─── Canary B (was @700) — End Session + immediate nav must still write DB ─────

test.describe('P921-B: End Session then immediate navigation still writes sessionEnded', () => {
  test.setTimeout(90_000);

  test('creator clicks End Session and navigates away — live_state.sessionEnded lands in DB', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const session = await createTwoPartySessionRealistic(browser, {
      hostName: 'P921B Host',
      guestName: 'P921B Guest',
    });
    try {
      const endButton = session.host.page
        .getByRole('button', { name: /end session|leave|exit/i })
        .first();
      await expect(endButton).toBeVisible({ timeout: 5_000 });

      await endButton.click();
      // Navigate during the upload window — simulates clicking a nav link / closing.
      await session.host.page.goto('/letters', { waitUntil: 'domcontentloaded' });

      // The partner is only notified via this DB write. It must survive the nav.
      await waitForDBStateKey(
        'clarity_sessions', 'live_state', 'sessionEnded', true, 'id', session.sessionId, 12_000,
      );
    } finally {
      await session.cleanup();
    }
  });
});

// ─── Canary C (was @279/@647) — cold link to ended session → SessionEndedScreen ─

test.describe('P921-C: cold /live/{code} to an already-ended session shows SessionEndedScreen', () => {
  test.setTimeout(60_000);
  let hostUser: TestUser;
  let partnerUser: TestUser;

  test.beforeAll(async () => {
    [hostUser, partnerUser] = await Promise.all([
      createTestUser({ name: 'P921C Host' }),
      createTestUser({ name: 'P921C Partner' }),
    ]);
  });
  test.afterAll(async () => {
    await Promise.all([deleteTestUser(hostUser.user.id), deleteTestUser(partnerUser.user.id)]);
  });

  test('partner opening an ended session link sees "This session has ended", not "Session ended"', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const dbSession = await createTestSessionInDB(hostUser.user.id, partnerUser.name, {
      guestProfileId: partnerUser.user.id,
    });
    try {
      await supabaseAdmin.rpc('complete_clarity_session', { p_session_id: dbSession.sessionId });

      const partnerAuth = await getTestAuthContext('host', browser, { name: partnerUser.name });
      const partnerPage = await partnerAuth.context.newPage();
      await mockMicPermission(partnerPage);
      try {
        await partnerPage.goto(`/live/${dbSession.sessionCode}?skipMicCheck=true`);
        await partnerPage.waitForLoadState('networkidle');

        // The cold-load terminal screen for a dead session link.
        const endedHeading = partnerPage.getByRole('heading', { name: /this session has ended/i });
        await expect(endedHeading).toBeVisible({ timeout: 8_000 });

        // SessionEndedScreen's escape hatch (distinguishes it from PartnerLeftScreen).
        // Match the exact "Go to Letters" CTA — /letters/i alone also matches the
        // BottomNav "Letters" link (intentionally shown on the ended screen,
        // bottom-nav.tsx), which is a strict-mode ambiguity, not the CTA under test.
        const lettersCta = partnerPage.getByRole('link', { name: /go to letters/i });
        await expect(lettersCta).toBeVisible({ timeout: 3_000 });
      } finally {
        await partnerPage.close();
        await partnerAuth.cleanup();
      }
    } finally {
      await dbSession.cleanup();
    }
  });
});
