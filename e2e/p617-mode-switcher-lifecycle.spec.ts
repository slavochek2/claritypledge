import { test, expect, Browser } from '@playwright/test';
import { createTwoPartySessionRealistic, TwoPartySession } from './helpers/test-session';
import { waitForUIUpdate, advanceSessionState, postRoundIdleState } from './helpers/test-realtime';
import { createTestStory, deleteTestStory } from './helpers/test-story';

/**
 * P617/P643: Mode Switcher + Drawer Lifecycle Verification
 *
 * Tests the 3-state mode switcher (enabled/disabled/hidden) and
 * the correct drawer routing after speaker submits rating.
 *
 * Uses createTwoPartySessionRealistic — host subscribes first, guest joins
 * later — to exercise the real Realtime subscription timing path. The old
 * createTwoPartySession pre-inserted both users simultaneously, masking bugs
 * that only appear with sequential (realistic) join.
 *
 * All cross-context state sync uses waitForUIUpdate() — no page.reload().
 * If state doesn't arrive via the app's Realtime + drift polling, the test fails.
 */

test.describe('P617: Mode switcher lifecycle', () => {
  let session: TwoPartySession;

  test.beforeEach(async ({ browser }: { browser: Browser }) => {
    // Both users need 'host' (verified) role — P617 doesn't test verification gates
    // and the 'guest' role (unverified) triggers auth redirects in some flows.
    // Uses realistic join: host first, guest joins later via Realtime path.
    session = await createTwoPartySessionRealistic(browser, {
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

    // Bug 1 isolation: verify the drawer opened on host FIRST
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

    // THEN check guest — Bug 2: guest's mode switcher should disable via Realtime
    // The wrapper div gets opacity-50 and cursor-not-allowed when isLocked
    const disabledPill = guest.page.locator('[class*="opacity-50"][class*="cursor-not-allowed"]');
    await waitForUIUpdate(guest.page, disabledPill, 20000);
  });

  test('P643: listener Speak button disables during cardless Speak (clean-idle path)', async () => {
    const { host, guest } = session;

    // Wait for both on idle
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByTestId('start-check')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByTestId('start-check')).toBeEnabled();

    // Host clicks Speak (cardless — no story selected)
    await host.page.getByText('Speak').first().click();
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

    // Guest's Speak button should become disabled via Realtime
    await expect(guest.page.getByTestId('start-check')).toBeDisabled({ timeout: 20000 });
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

  test('P643 root cause: story selection auto-opens rating drawer', async () => {
    const { host } = session;

    // Wait for idle screen (proves page loaded)
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

    // Create a test story for the host user.
    // StorySearchPicker renders story.content (not title) as the display text.
    const storyContent = 'P643 test story for auto-start';
    const story = await createTestStory(host.user.user.id, {
      title: 'P643 Test Story',
      content: storyContent,
    });

    try {
      // Re-navigate to pick up the newly created story.
      // The stories useEffect fires on mount — story created after initial load won't appear.
      // This is NOT Realtime sync (banned by test rules) — it's a data-loading concern.
      await host.page.goto(`/live/${session.sessionCode}?skipMicCheck=true`);
      await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

      // Click "+ Select your story" to open the picker
      await host.page.getByText('+ Select your story').click();
      await expect(host.page.getByText(storyContent)).toBeVisible({ timeout: 10000 });

      // Select the story — this should auto-open the rating drawer (the P643 fix)
      await host.page.getByText(storyContent).click();

      // The rating drawer should appear WITHOUT clicking Speak
      await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

      // Speak button should NOT be visible (we're in the rating drawer now)
      await expect(host.page.getByTestId('start-check')).not.toBeVisible({ timeout: 1000 });
    } finally {
      await deleteTestStory(story.id);
    }
  });

  test('Bug 3: listener should NOT see story card before speaker submits', async () => {
    const { host, guest } = session;

    // Wait for idle screen on both
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

    // Host clicks Speak — enters local rating phase (ratingInitiatedByIsCreator set)
    // The drawer opens locally on host but guest should NOT see the rating drawer yet
    await host.page.getByText('Speak').first().click();
    await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

    // Bug 3 assertion: guest must NOT see rating buttons while speaker is in local rating.
    // The listener should see the mode switcher disabled (from UAT-3) but NOT the rating UI.
    // isListenerDuringLocalRating should be true on guest side, hiding the story card
    // and NOT showing the rating drawer (showRatingDrawer is local to speaker).
    const guestRateButtons = guest.page.getByRole('button', { name: /^Rate \d+$/ });
    await expect(guestRateButtons.first()).not.toBeVisible({ timeout: 5000 });

    // Also verify guest does NOT see 'How well do you believe' text (the drawer prompt)
    await expect(guest.page.getByText('How well do you believe')).not.toBeVisible({ timeout: 3000 });

    // NOW speaker submits — guest should see the rating drawer
    await host.page.getByRole('button', { name: 'Rate 7' }).click();
    await host.page.getByRole('button', { name: 'Submit' }).click();

    // After submission, guest SHOULD now see rating buttons via Realtime delivery
    await waitForUIUpdate(
      guest.page,
      guest.page.getByRole('button', { name: /^Rate \d+$/ }).first(),
      20000,
    );
  });

  test('Layer 3: listener Speak button disables (not hides) during speaker story rating', async () => {
    const { host, guest } = session;

    // Wait for idle screen on both
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

    // Create a test story for the host user
    const storyContent = 'P643 Layer 3 test story';
    const story = await createTestStory(host.user.user.id, {
      title: 'Layer 3 Test',
      content: storyContent,
    });

    try {
      // Re-navigate to pick up the story
      await host.page.goto(`/live/${session.sessionCode}?skipMicCheck=true`);
      await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

      // Host selects story → auto-opens rating drawer
      await host.page.getByText('+ Select your story').click();
      await expect(host.page.getByText(storyContent)).toBeVisible({ timeout: 10000 });
      await host.page.getByText(storyContent).click();
      await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

      // Layer 3 assertion: listener's Speak button should be VISIBLE but DISABLED
      // Before fix: button disappears entirely (isCleanIdle = false, no Speak in non-clean-idle path)
      const guestSpeak = guest.page.getByTestId('start-check');
      await waitForUIUpdate(guest.page, guestSpeak, 20000);
      await expect(guestSpeak).toBeDisabled();
    } finally {
      await deleteTestStory(story.id);
    }
  });

  test('Layer 4: Back before first submission returns both users to clean idle', async () => {
    const { host, guest } = session;

    // Wait for idle screen on both
    await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });
    await expect(guest.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

    // Create a test story for the host user
    const storyContent = 'P643 Layer 4 test story';
    const story = await createTestStory(host.user.user.id, {
      title: 'Layer 4 Test',
      content: storyContent,
    });

    try {
      // Re-navigate to pick up the story
      await host.page.goto(`/live/${session.sessionCode}?skipMicCheck=true`);
      await expect(host.page.getByText('Speak')).toBeVisible({ timeout: 15000 });

      // Host selects story → auto-opens rating drawer
      await host.page.getByText('+ Select your story').click();
      await expect(host.page.getByText(storyContent)).toBeVisible({ timeout: 10000 });
      await host.page.getByText(storyContent).click();
      await expect(host.page.getByText('How well do you believe')).toBeVisible({ timeout: 5000 });

      // Host clicks Back (cancel before submitting any rating)
      await host.page.getByRole('button', { name: 'Back' }).click();

      // Layer 4 assertion: host should return to clean idle — Speak button visible, no story card
      await expect(host.page.getByTestId('start-check')).toBeVisible({ timeout: 5000 });
      // Story card should NOT be visible (clean idle)
      await expect(host.page.getByText(storyContent)).not.toBeVisible({ timeout: 3000 });

      // Guest should also be back to clean idle — Speak button visible AND re-enabled
      const guestSpeak = guest.page.getByTestId('start-check');
      await waitForUIUpdate(guest.page, guestSpeak, 20000);
      await expect(guestSpeak).not.toBeDisabled({ timeout: 5000 });
    } finally {
      await deleteTestStory(story.id);
    }
  });
});
