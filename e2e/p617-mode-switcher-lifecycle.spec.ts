import { test, expect, Browser } from '@playwright/test';
import { createTwoPartySession, TwoPartySession } from './helpers/test-session';
import { supabaseAdmin } from './helpers/supabase-admin';

/**
 * P617: Mode Switcher + Drawer Lifecycle Verification
 *
 * Tests the 3-state mode switcher (enabled/disabled/hidden) and
 * the correct drawer routing after speaker submits rating.
 */

/** Poll DB until live_state JSONB has a specific key set */
async function waitForLiveStateKey(
  sessionCode: string,
  key: string,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();
    const liveState = data?.live_state as Record<string, unknown> | null;
    if (liveState && liveState[key]) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`[waitForLiveStateKey] Timed out after ${timeoutMs}ms waiting for live_state.${key} on session ${sessionCode}`);
}

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

    // Wait for DB to propagate the submission via JSONB query
    await waitForLiveStateKey(session.sessionCode, 'checkerSubmitted');

    // Reload guest to pick up state (isolated contexts don't share Realtime)
    await guest.page.reload();
    await guest.page.waitForLoadState('networkidle');

    // The partner should see rating buttons (from the drawer), not just a Speak button
    await expect(guest.page.getByRole('button', { name: /^Rate \d+$/ }).first()).toBeVisible({ timeout: 10000 });
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

    // Wait for DB to have ratingInitiatedBy, then reload guest to pick up state
    await waitForLiveStateKey(session.sessionCode, 'ratingInitiatedBy');
    await guest.page.reload();
    await guest.page.waitForLoadState('networkidle');

    // Wait for idle screen with mode switcher visible on guest
    await expect(guest.page.getByText('Open mode')).toBeVisible({ timeout: 15000 });

    // Mode switcher container should have opacity-50 (disabled visual state)
    // The wrapper div gets opacity-50 and cursor-not-allowed when isLocked
    const disabledPill = guest.page.locator('[class*="opacity-50"][class*="cursor-not-allowed"]');
    await expect(disabledPill).toBeVisible({ timeout: 5000 });
  });

  test('UAT-6: mode switcher reappears after full round via DB-driven state', async () => {
    // Strategy: advance through the round by writing live_state directly via
    // supabaseAdmin, then reload the host to verify the mode switcher reappears.
    // This avoids the multi-reload chain that exceeds the 30s timeout.
    const { host } = session;

    await host.page.waitForLoadState('networkidle');

    // Dismiss terms if needed
    const continueBtn = host.page.getByRole('button', { name: 'Continue' });
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click();
      await host.page.waitForLoadState('networkidle');
    }

    // Confirm mode switcher visible on idle
    await expect(host.page.getByText('Open mode')).toBeVisible({ timeout: 15000 });

    // Simulate a complete round via direct DB write:
    // Set live_state to post-celebration idle (all fields reset)
    // This mimics what handleCelebrationComplete does after both users ack
    const { data: sessionRow } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', session.sessionCode)
      .single();

    const currentState = sessionRow?.live_state as Record<string, unknown> ?? {};
    const postRoundState = {
      ...currentState,
      ratingPhase: 'idle',
      checkerName: undefined,
      checkerRating: undefined,
      responderRating: undefined,
      ratingInitiatedBy: undefined,
      checkerSubmitted: undefined,
      responderSubmitted: undefined,
      proverName: undefined,
      explainBackRatings: [],
      sessionHistory: [
        ...(Array.isArray(currentState.sessionHistory) ? currentState.sessionHistory : []),
        { checkerRating: 7, responderRating: 7, round: 1 },
      ],
    };

    await supabaseAdmin
      .from('clarity_sessions')
      .update({ live_state: postRoundState })
      .eq('code', session.sessionCode);

    // Reload host to pick up the post-round idle state
    await host.page.reload();
    await host.page.waitForLoadState('networkidle');

    // Mode switcher should be visible and enabled on idle
    await expect(host.page.getByText('Open mode')).toBeVisible({ timeout: 15000 });
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 5000 });

    // Verify it's NOT disabled (no opacity-50 class)
    const disabledPill = host.page.locator('[class*="opacity-50"][class*="cursor-not-allowed"]');
    await expect(disabledPill).not.toBeVisible({ timeout: 3000 });
  });
});
