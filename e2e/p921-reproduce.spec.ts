/**
 * @file p921-reproduce.spec.ts
 *
 * P921 canary — the TWO decision-free, genuine app bugs surfaced while
 * reproducing the 5 failing p769 ended-state tests. Both FAIL before the fix
 * and must PASS after it.
 *
 * NOT covered here (pending a founder decision — see spec § Root Cause):
 *   @110 / @279 / @647 assert the SessionEndedScreen text "This session has
 *   ended", but the in-session / join-via-link ended paths render
 *   PartnerLeftScreen ("Session ended"). Detection works (proven by trace —
 *   partner DOES see "Session ended"); the tests assert the wrong screen's
 *   copy. Whether the app should route those paths to SessionEndedScreen, or
 *   the tests should assert "Session ended", is a UX/copy decision. No canary
 *   until that is decided, to avoid encoding the wrong expectation.
 *
 * Covered (no copy decision needed):
 *   Canary A (was @401) — a session ended REMOTELY (RPC, not this tab's End
 *     button) must clear this tab's clarity_live_* sessionStorage. The
 *     detection sites (clarity-live-page.tsx realtime ~1165 / poll ~1346) set
 *     sessionEnded but never call clearStoredSession(). P769 invariant:
 *     session-end clears storage on both sides.
 *   Canary B (was @700) — clicking End Session then immediately navigating
 *     must still land live_state.sessionEnded=true in the DB. terminate() (the
 *     RPC) is sequenced in confirmExitMeeting AFTER `await Promise.race([
 *     stopAndUploadRecording(), 5s])` + `await createTranscriptionJob()`; a
 *     full-page nav tears down the JS context before the RPC fires, so the
 *     partner is never notified. The genuine propagation failure.
 */
import { test, expect, type Browser } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { waitForDBStateKey } from './helpers/test-realtime';
import {
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
