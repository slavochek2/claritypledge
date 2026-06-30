/**
 * P976 — /live boolean-flag stale echo can clobber a just-submitted rating (P671 class).
 *
 * Scenario: host (checker) clicks "Submit Rating" → DB gets checkerSubmitted:true.
 * A stale Realtime echo then arrives with checkerSubmitted:false at the same ratingPhase.
 *
 * Pre-fix:  the not-in-flight branch did a wholesale setLiveState, reverting
 *           checkerSubmitted to false → host sees the rating drawer again (FAIL).
 * Post-fix: isStateRegression rejects the echo → host stays on "Waiting for…" (PASS).
 *
 * Two-party setup: both host and guest browser contexts subscribe to Realtime so
 * the echo propagates through the real WebSocket path, not a mock.
 */

import { test, expect, type Browser } from '@playwright/test';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState, waitForUIUpdate } from './helpers/test-realtime';

test.describe('P976 — boolean-flag stale echo guard', () => {
  test.setTimeout(90000);

  test('smoke: two-party session reaches /live and shows lobby UI', async ({ browser }: { browser: Browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P976 Creator',
      guestName: 'P976 Joiner',
    });
    try {
      // Both pages must be on /live/{code} — createTwoPartySession asserts this
      await expect(session.host.page).toHaveURL(new RegExp(`/live/${session.sessionCode}`));
      await expect(session.guest.page).toHaveURL(new RegExp(`/live/${session.sessionCode}`));
    } finally {
      await session.cleanup();
    }
  });

  test(
    'host clicks Submit Rating → stale echo with checkerSubmitted:false is rejected → waiting UI persists',
    async ({ browser }: { browser: Browser }) => {
      const hostName = 'P976 Creator';
      const guestName = 'P976 Joiner';

      const session = await createTwoPartySession(browser, { hostName, guestName });

      try {
        // ── 1. Advance to the rating phase so both parties see the rating drawer.
        await advanceSessionState(session.sessionCode, {
          ratingPhase: 'rating',
          checkerIsCreator: true,
          checkerName: hostName,
          ratingInitiatedBy: hostName,
          checkerSubmitted: false,
          responderSubmitted: false,
        });

        // ── 2. Wait for host page to show the rating drawer ("Submit" button visible).
        const hostSubmitBtn = session.host.page.getByRole('button', { name: 'Submit', exact: true });
        await hostSubmitBtn.waitFor({ state: 'visible', timeout: 15000 });

        // ── 3. Host selects rating 7 then clicks Submit (REAL UI button click).
        await session.host.page.getByRole('button', { name: 'Rate 7', exact: true }).click();
        await hostSubmitBtn.waitFor({ state: 'enabled', timeout: 5000 });
        await hostSubmitBtn.click();

        // ── 4. Wait for host page to reflect the submitted state.
        //       "Waiting for <guest-first-name> to share their confidence..." appears
        //       once checkerSubmitted flips true and the phase transitions to 'waiting'.
        const waitingLocator = session.host.page.getByText(/to share their confidence/);
        await waitingLocator.waitFor({ state: 'visible', timeout: 15000 });

        // Confirm the rating drawer is gone (i.e., no visible "Submit" button).
        await expect(hostSubmitBtn).not.toBeVisible({ timeout: 2000 });

        // ── 5. Inject stale echo: write checkerSubmitted:false back to the DB.
        //       This simulates a cached Realtime event arriving out-of-order.
        //       advanceSessionState merges into current state, so the resulting
        //       DB row has ratingPhase:'waiting', checkerSubmitted:false — the
        //       exact regression vector from the P976 root cause.
        await advanceSessionState(session.sessionCode, { checkerSubmitted: false });

        // ── 6. Wait for both Realtime delivery + drift poll (≥ 1s + buffer).
        await session.host.page.waitForTimeout(3500);

        // ── 7. Assert: host page still shows "Waiting for…" — stale echo was rejected.
        //       Pre-fix: checkerSubmitted reverts to false → host sees rating drawer (FAIL).
        //       Post-fix: isStateRegression rejects the echo → "Waiting for…" persists (PASS).
        await expect(
          session.host.page.getByText(/to share their confidence/),
        ).toBeVisible({ timeout: 2000 });

        // The rating drawer (Submit button) must NOT be showing.
        await expect(hostSubmitBtn).not.toBeVisible({ timeout: 2000 });

        // ── 8. Verify guest page also rejected the stale echo (both are protected).
        //       Guest sees a waiting state too (checker submitted, responder hasn't).
        //       The guest's Realtime guard should reject the stale checkerSubmitted:false echo.
        await waitForUIUpdate(
          session.guest.page,
          session.guest.page.getByText(/confidence/),
          10000,
        );
      } finally {
        await session.cleanup();
      }
    },
  );
});
