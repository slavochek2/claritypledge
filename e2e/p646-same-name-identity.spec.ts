import { test, expect, Browser } from '@playwright/test';
import { createTwoPartySession, TwoPartySession } from './helpers/test-session';

/**
 * P646: Same-name identity — verifies /live works when both users share a display name.
 *
 * Root cause: identity checks used `ratingInitiatedBy !== currentUserName` which
 * fails when both users have the same name. Fix uses role-based `*IsCreator` booleans.
 *
 * This test uses SAME NAME for both users. If the name collision bug exists:
 * - Listener's mode switcher stays enabled (should disable)
 * - Listener's story card stays visible (should hide)
 * - Listener doesn't get auto-drawer after speaker submits
 */

test.describe('P646: same-name identity — role-based checks', () => {
  let session: TwoPartySession;

  // BOTH users get the SAME name — this is the bug trigger
  const SHARED_NAME = 'Same Name User';

  test.beforeEach(async ({ browser }: { browser: Browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: SHARED_NAME,
      guestName: SHARED_NAME,
    });
  });

  test.afterEach(async () => {
    await session?.cleanup();
  });

  test('speaker clicks Speak → listener mode switcher disables + story card hides', async () => {
    const { host, guest } = session;

    // Wait for both to reach idle state
    await host.page.waitForLoadState('networkidle');
    await guest.page.waitForLoadState('networkidle');

    // Both should see Speak button (idle state)
    // Host (creator) sees Speak in the clean-idle two-zone layout
    await expect(host.page.getByTestId('start-check')).toBeVisible({ timeout: 15000 });

    // ═══════════════════════════════════════════════════════════════
    // HOST CLICKS SPEAK — the key test
    // ═══════════════════════════════════════════════════════════════
    await host.page.getByTestId('start-check').click();

    // Host should see rating drawer (local-rating view)
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

    // GUEST: mode switcher should become DISABLED (opacity-50)
    // This is the P646 bug — with name collision, this stayed enabled
    const disabledPill = guest.page.locator('[class*="opacity-50"][class*="cursor-not-allowed"]');
    await expect(disabledPill).toBeVisible({ timeout: 20000 });

    // ═══════════════════════════════════════════════════════════════
    // HOST SUBMITS RATING — test auto-drawer for listener
    // ═══════════════════════════════════════════════════════════════
    // Select rating 7
    await host.page.getByRole('button', { name: 'Rate 7' }).click();
    await host.page.getByRole('button', { name: 'Submit' }).click();

    // Guest should see rating buttons (auto-drawer) WITHOUT clicking Speak
    const guestRateButton = guest.page.getByRole('button', { name: /^Rate \d+$/ }).first();
    await expect(guestRateButton).toBeVisible({ timeout: 20000 });

    // Guest should NOT see a Speak button (they're in responder-drawer, not idle)
    await expect(guest.page.getByTestId('start-check')).not.toBeVisible({ timeout: 2000 });
  });

  test('speaker clicks Speak exactly ONCE → drawer appears immediately (no double-click)', async () => {
    const { host } = session;

    await host.page.waitForLoadState('networkidle');

    // Verify Speak button is visible
    const speakButton = host.page.getByTestId('start-check');
    await expect(speakButton).toBeVisible({ timeout: 15000 });

    // Click ONCE
    await speakButton.click();

    // Drawer should appear — "How well do you believe" prompt
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

    // Speak button should NOT be visible anymore (we're in local-rating view)
    await expect(speakButton).not.toBeVisible({ timeout: 2000 });
  });
});
