import { test, expect, Browser } from '@playwright/test';
import { createTwoPartySession, TwoPartySession } from './helpers/test-session';

/**
 * P617 drift detection verification — confirms ratingInitiatedBy
 * propagates to the listener WITHOUT page.reload().
 *
 * This test relies on the app's own state delivery (Realtime + drift polling)
 * rather than page.reload() which bypasses both mechanisms.
 */

test.describe('P617: drift detection delivers ratingInitiatedBy', () => {
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

  test('listener mode switcher disables without page.reload()', async () => {
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

    // Wait for both on idle
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByText('Open mode')).toBeVisible({ timeout: 15000 });

    // Confirm guest mode switcher is NOT disabled before Speak
    const disabledPill = guest.page.locator('[class*="opacity-50"][class*="cursor-not-allowed"]');
    await expect(disabledPill).not.toBeVisible({ timeout: 3000 });

    // Host clicks Speak — writes ratingInitiatedBy to DB
    await host.page.getByText('Speak').first().click();

    // NO page.reload() — wait for drift polling to deliver the update
    // Drift polling interval is ~5s, so allow up to 20s for delivery
    await expect(disabledPill).toBeVisible({ timeout: 20000 });
  });
});
