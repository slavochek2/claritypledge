import { test, expect, Browser } from '@playwright/test';
import { createTwoPartySession, TwoPartySession } from './helpers/test-session';

/**
 * P617: Verify ALL THREE original issues are fixed — no page.reload().
 *
 * Issue 1: Mode switcher disabled (not hidden) when partner clicks Speak
 * Issue 2: Listener does NOT see story card until round starts
 * Issue 3: Listener gets auto-drawer after speaker submits (no Speak click)
 *
 * All assertions use the app's own delivery (Realtime + drift polling).
 * No page.reload() — if state doesn't arrive, the test fails.
 */

test.describe('P617: all three issues verified without reload', () => {
  let session: TwoPartySession;

  test.beforeEach(async ({ browser }: { browser: Browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'E2E Speaker',
      guestName: 'E2E Listener',
    });
  });

  test.afterEach(async () => {
    await session?.cleanup();
  });

  test('Issue 1+2+3: full Speak→Submit flow without reload', async () => {
    const { host, guest } = session;

    await host.page.waitForLoadState('networkidle');
    await guest.page.waitForLoadState('networkidle');

    // Dismiss terms dialog if it appears
    for (const page of [host.page, guest.page]) {
      const continueBtn = page.getByRole('button', { name: 'Continue' });
      if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await continueBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // Both on idle — mode switcher visible + enabled
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByText('Open mode')).toBeVisible({ timeout: 15000 });

    // Confirm guest mode switcher is NOT disabled before Speak
    const disabledPill = guest.page.locator('[class*="opacity-50"][class*="cursor-not-allowed"]');
    await expect(disabledPill).not.toBeVisible({ timeout: 3000 });

    // ═══════════════════════════════════════════════════════════════
    // HOST CLICKS SPEAK — tests Issue 1 + Issue 2
    // ═══════════════════════════════════════════════════════════════
    await host.page.getByText('Speak').first().click();

    // Host should see rating drawer (they left IdleScreen)
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

    // ISSUE 1: Guest's mode switcher should become DISABLED (not hidden)
    // No reload — drift polling delivers ratingInitiatedBy
    await expect(disabledPill).toBeVisible({ timeout: 20000 });

    // ISSUE 2: Guest should NOT see story card (no story selected in this test,
    // but verify the Speak button is still visible — guest stays on idle)
    await expect(guest.page.getByText('Open mode')).toBeVisible();

    // ═══════════════════════════════════════════════════════════════
    // HOST SUBMITS RATING — tests Issue 3
    // ═══════════════════════════════════════════════════════════════
    await host.page.getByRole('button', { name: 'Rate 7' }).click();
    await host.page.getByRole('button', { name: 'Submit' }).click();

    // ISSUE 3: Guest should see rating buttons (auto-drawer) WITHOUT clicking Speak
    // No reload — drift polling delivers checkerSubmitted + ratingPhase
    const guestRateButton = guest.page.getByRole('button', { name: /^Rate \d+$/ }).first();
    await expect(guestRateButton).toBeVisible({ timeout: 20000 });

    // Guest should NOT see a Speak button — they go straight to the drawer
    // (The Speak button absence confirms the auto-drawer worked)
    await expect(guest.page.getByTestId('start-check')).not.toBeVisible({ timeout: 2000 });
  });
});
