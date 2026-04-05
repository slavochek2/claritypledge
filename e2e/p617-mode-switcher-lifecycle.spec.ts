import { test, expect, Browser } from '@playwright/test';
import { createTwoPartySession, TwoPartySession } from './helpers/test-session';
import { waitForUIUpdate, advanceSessionState, postRoundIdleState } from './helpers/test-realtime';

/**
 * P617/P643: Mode Switcher + Drawer Lifecycle Verification
 *
 * Tests the 3-state mode switcher (enabled/disabled/hidden) and
 * the correct drawer routing after speaker submits rating.
 *
 * All cross-context state sync uses waitForUIUpdate() — no page.reload().
 * If state doesn't arrive via the app's Realtime + drift polling, the test fails.
 */

test.describe('P617: Mode switcher lifecycle', () => {
  let session: TwoPartySession;

  test.beforeEach(async ({ browser }: { browser: Browser }) => {
    // Both users need 'host' (verified) role — P617 doesn't test verification gates
    // and the 'guest' role (unverified) triggers auth redirects in some flows
    session = await createTwoPartySession(browser, {
      hostName: 'E2E Speaker',
      guestName: 'E2E Listener',
    });
  });

  test.afterEach(async () => {
    await session?.cleanup();
  });

  test('UAT-1+5: idle screen shows mode switcher + Speak opens drawer for speaker', async () => {
    const { host, guest } = session;

    // Wait for both to land on idle screen (auth + auto-join + session load)
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

    // Both should see mode switcher on idle
    await expect(host.page.getByText('Open mode')).toBeVisible({ timeout: 5000 });
    await expect(guest.page.getByText('Open mode')).toBeVisible({ timeout: 5000 });

    // Speaker clicks Speak — should see rating drawer immediately
    await host.page.getByText('Speak').first().click();
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });
  });

  test('UAT-6+7: speaker submits → partner sees drawer (not Speak button)', async () => {
    const { host, guest } = session;

    // Wait for idle screen (auth + auto-join + session load)
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

    // Speaker clicks Speak and submits rating
    await host.page.getByText('Speak').first().click();
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });
    await host.page.getByRole('button', { name: 'Rate 7' }).click();
    await host.page.getByRole('button', { name: 'Submit' }).click();

    // Guest should see rating buttons via Realtime delivery (no page.reload)
    // If this fails, the Realtime delivery path is broken — that's the P643 bug
    await waitForUIUpdate(
      guest.page,
      guest.page.getByRole('button', { name: /^Rate \d+$/ }).first(),
      20000,
    );
  });

  test('UAT-4+9: mode switcher reappears after cancel', async () => {
    const { host } = session;

    // Wait for idle
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 10000 });

    // Verify mode switcher is visible
    await expect(host.page.getByText('Open mode')).toBeVisible();

    // Speaker clicks Speak
    await host.page.getByText('Speak').first().click();
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

    // Speaker clicks Back (cancel)
    await host.page.getByRole('button', { name: 'Back' }).click();

    // Mode switcher should reappear
    await expect(host.page.getByText('Open mode')).toBeVisible({ timeout: 5000 });
  });

  test('UAT-3: mode switcher disabled when partner is rating', async () => {
    const { host, guest } = session;

    // Wait for both on idle (auth + auto-join + session load)
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByText('Open mode')).toBeVisible({ timeout: 15000 });

    // Host clicks Speak — sets ratingInitiatedBy via Realtime
    await host.page.getByText('Speak').first().click();

    // Guest's mode switcher should disable via Realtime delivery (no page.reload)
    // The wrapper div gets opacity-50 and cursor-not-allowed when isLocked
    const disabledPill = guest.page.locator('[class*="opacity-50"][class*="cursor-not-allowed"]');
    await waitForUIUpdate(guest.page, disabledPill, 20000);
  });

  test('UAT-6: mode switcher reappears after full round via DB-driven state', async () => {
    // Strategy: advance through the round by writing live_state directly via
    // advanceSessionState, then verify the UI updates via Realtime delivery.
    const { host } = session;

    // Wait for idle screen
    await expect(host.page.getByText('Open mode')).toBeVisible({ timeout: 15000 });

    // Simulate a complete round via direct DB write:
    // Set live_state to post-celebration idle (all fields reset)
    await advanceSessionState(session.sessionCode, {
      ...postRoundIdleState(),
      sessionHistory: [{ checkerRating: 7, responderRating: 7, round: 1 }],
    });

    // Mode switcher should remain visible and enabled via Realtime delivery (no page.reload)
    await waitForUIUpdate(
      host.page,
      host.page.getByText('Speak'),
      20000,
    );
    await expect(host.page.getByText('Open mode')).toBeVisible({ timeout: 5000 });

    // Verify it's NOT disabled (no opacity-50 class)
    const disabledPill = host.page.locator('[class*="opacity-50"][class*="cursor-not-allowed"]');
    await expect(disabledPill).not.toBeVisible({ timeout: 3000 });
  });
});
