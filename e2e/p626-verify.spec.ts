/**
 * P626 Verification: Guided Mode — Speak Button + Mode Switcher Visibility
 *
 * Tests three fixes:
 * 1. Listener stays idle until speaker submits (no premature UI changes)
 * 2. Mode switcher hidden for speaker after Speak click
 * 3. Mode switcher hidden for listener after speaker submits
 */
import { test, expect } from '@playwright/test';
import { createTwoPartySession, type TwoPartySession } from './helpers/test-session';

test.describe('P626: Guided mode Speak button + mode switcher', () => {
  let session: TwoPartySession;

  test.beforeEach(async ({ browser }) => {
    session = await createTwoPartySession(browser, {
      hostName: 'Speaker',
      guestName: 'Listener',
    });
  });

  test.afterEach(async () => {
    await session?.cleanup();
  });

  test('UAT-6: Mode switcher visible on idle screen before round', async () => {
    const hostPage = session.host.page;

    // Wait for live session to load
    await expect(hostPage.getByText('Listener')).toBeVisible({ timeout: 15000 });

    // Mode switcher should be visible on idle screen
    await expect(hostPage.getByRole('button', { name: 'Open mode' })).toBeVisible({ timeout: 5000 });
    await expect(hostPage.getByRole('button', { name: 'Guided mode' })).toBeVisible();
  });

  test('UAT-1 + UAT-3: Listener stays idle until speaker submits, mode switcher hidden after', async () => {
    const hostPage = session.host.page;
    const guestPage = session.guest.page;

    // Wait for both pages to load
    await expect(hostPage.getByText('Listener')).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByText('Speaker')).toBeVisible({ timeout: 15000 });

    // Both should see the Speak button initially
    await expect(hostPage.getByTestId('start-check')).toBeVisible({ timeout: 5000 });
    await expect(guestPage.getByTestId('start-check')).toBeVisible({ timeout: 5000 });

    // Host (speaker) clicks Speak
    await hostPage.getByTestId('start-check').click();

    // Host should see the rating drawer (number scale)
    await expect(hostPage.getByText('Not at all')).toBeVisible({ timeout: 5000 });
    await expect(hostPage.getByText('Complete cognitive understanding')).toBeVisible();

    // UAT-1: Listener should see NO change — still on idle with Speak button visible
    await guestPage.waitForTimeout(2000); // Give Realtime time to propagate
    await expect(guestPage.getByTestId('start-check')).toBeVisible();

    // UAT-3 (pre-submit): Mode switcher should still be visible for listener
    // (because ratingInitiatedBy is not set until submit)
    // Note: mode switcher only shows if onSessionModeChange callback exists
    // which depends on session setup. We verify the Speak button is still there as proxy.

    // Now speaker submits a rating (e.g., 7)
    await hostPage.getByRole('button', { name: '7' }).click();
    await hostPage.getByRole('button', { name: 'Submit' }).click();

    // After speaker submits, listener should eventually see the rating drawer
    // (responder-drawer view state)
    await expect(guestPage.getByText('How confident are you that you understand Speaker?')).toBeVisible({ timeout: 10000 });

    // UAT-3: Mode switcher should be hidden for listener now (in responder-drawer)
    await expect(guestPage.getByRole('button', { name: 'Open mode' })).not.toBeVisible();
    await expect(guestPage.getByRole('button', { name: 'Guided mode' })).not.toBeVisible();
  });

  test('UAT-2: Mode switcher hidden for speaker after Speak click', async () => {
    const hostPage = session.host.page;

    // Wait for live session to load
    await expect(hostPage.getByText('Listener')).toBeVisible({ timeout: 15000 });

    // Mode switcher visible before clicking Speak
    await expect(hostPage.getByRole('button', { name: 'Open mode' })).toBeVisible({ timeout: 5000 });

    // Speaker clicks Speak
    await hostPage.getByTestId('start-check').click();

    // Mode switcher should be hidden (speaker is now in RatingScreenWithOptionalDrawer)
    await expect(hostPage.getByRole('button', { name: 'Open mode' })).not.toBeVisible();
    await expect(hostPage.getByRole('button', { name: 'Guided mode' })).not.toBeVisible();

    // UAT-4: Speaker should see number scale directly
    await expect(hostPage.getByText('Not at all')).toBeVisible({ timeout: 5000 });
    await expect(hostPage.getByRole('button', { name: 'Rate 1', exact: true })).toBeVisible();
    await expect(hostPage.getByRole('button', { name: 'Rate 10' })).toBeVisible();
    await expect(hostPage.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('UAT-5: After both submit, mode switcher remains hidden', async () => {
    const hostPage = session.host.page;
    const guestPage = session.guest.page;

    // Wait for both pages to load
    await expect(hostPage.getByText('Listener')).toBeVisible({ timeout: 15000 });
    await expect(guestPage.getByText('Speaker')).toBeVisible({ timeout: 15000 });

    // Speaker clicks Speak and submits
    await hostPage.getByTestId('start-check').click();
    await hostPage.getByRole('button', { name: '7' }).click();
    await hostPage.getByRole('button', { name: 'Submit' }).click();

    // Wait for listener to see the drawer
    await expect(guestPage.getByText('How confident are you that you understand Speaker?')).toBeVisible({ timeout: 10000 });

    // Listener submits their rating
    await guestPage.getByRole('button', { name: '8' }).click();
    await guestPage.getByRole('button', { name: 'Submit' }).click();

    // After both submit, we should be on the understanding/results screen
    // Mode switcher should NOT be visible on either side
    await hostPage.waitForTimeout(2000);
    await expect(hostPage.getByRole('button', { name: 'Open mode' })).not.toBeVisible();
    await expect(guestPage.getByRole('button', { name: 'Open mode' })).not.toBeVisible();
  });
});
