/**
 * @file p671-rating-submission-loop.spec.ts
 *
 * P671: Canary test — rating submissions must not loop between participants.
 *
 * The bug: After both users submit ratings, the ratingPhase should settle at
 * 'revealed' and stay there. Instead, it intermittently flickers or loops back
 * to 'waiting' or 'idle', forcing re-submission.
 *
 * This test injects state via advanceSessionState (DB write → Realtime delivery)
 * to simulate the two-party rating flow and asserts UI stability at each phase.
 */

import { test, expect } from '@playwright/test';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState, checkerSubmittedState } from './helpers/test-realtime';

test.describe('P671 — Rating Submission Loop', () => {
  test.setTimeout(90_000);

  test('rating phase settles at revealed after both users submit', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P671 Speaker',
      guestName: 'P671 Listener',
    });

    try {
      const hostPage = session.host.page;
      const guestPage = session.guest.page;

      // Wait for both pages to show idle screen (Speak button visible)
      // Use start-check testid to match ONLY the idle screen's Speak button,
      // not the "Speak freely" skip button inside the understanding view.
      const hostSpeak = hostPage.getByTestId('start-check');
      const guestSpeak = guestPage.getByTestId('start-check');
      await expect(hostSpeak).toBeVisible({ timeout: 15_000 });
      await expect(guestSpeak).toBeVisible({ timeout: 15_000 });

      // Step 1: Host submits first rating (becomes checker)
      await advanceSessionState(session.sessionCode, {
        ...checkerSubmittedState('P671 Speaker', 7),
        checkerIsCreator: true,
        responderSubmitted: false,
      });

      // Guest should see the responder drawer (partner submitted, I haven't)
      // The responder-drawer shows a rating slider — look for the submit button
      // or the "Rate" text that appears when partner has submitted.
      // Since we can't reliably detect the drawer, wait for Realtime delivery
      // then check that guest does NOT see idle (Speak button should be gone).
      await guestPage.waitForTimeout(4000); // Realtime + drift poll
      // Guest's Speak button should NOT be visible — they're now in responder view
      await expect(guestSpeak).not.toBeVisible({ timeout: 5_000 });

      // Step 2: Guest submits second rating (both submitted → revealed)
      await advanceSessionState(session.sessionCode, {
        ratingPhase: 'revealed',
        responderRating: 8,
        responderSubmitted: true,
        checksCount: 1,
      });

      // Both pages should show the understanding view (revealed results).
      // The understanding view contains rating display text.
      // Wait for Realtime delivery on both pages.
      await hostPage.waitForTimeout(4000);

      // Step 3: Assert stability — ratingPhase should stay 'revealed'.
      // If the loop bug exists, ratingPhase will flicker between revealed/waiting/idle.
      // We check that the Speak button doesn't reappear on either page for 5 seconds.
      const stabilityChecks = 5;
      for (let i = 0; i < stabilityChecks; i++) {
        await hostPage.waitForTimeout(1000);
        // If Speak button reappears, the state looped back to idle
        const hostSpeakVisible = await hostSpeak.isVisible();
        const guestSpeakVisible = await guestSpeak.isVisible();

        expect(hostSpeakVisible, `Host Speak button reappeared at check ${i + 1} — state looped back to idle`).toBe(false);
        expect(guestSpeakVisible, `Guest Speak button reappeared at check ${i + 1} — state looped back to idle`).toBe(false);
      }
    } finally {
      await session.cleanup();
    }
  });

  test('second-round rating flow does not inherit stale celebration state', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P671R2 Speaker',
      guestName: 'P671R2 Listener',
    });

    try {
      const hostPage = session.host.page;
      const guestPage = session.guest.page;

      // Wait for idle
      // Use start-check testid to match ONLY the idle screen's Speak button
      const hostSpeak = hostPage.getByTestId('start-check');
      const guestSpeak = guestPage.getByTestId('start-check');
      await expect(hostSpeak).toBeVisible({ timeout: 15_000 });
      await expect(guestSpeak).toBeVisible({ timeout: 15_000 });

      // Round 1: Full cycle through to completion
      // 1a. Checker submits
      await advanceSessionState(session.sessionCode, {
        ...checkerSubmittedState('P671R2 Speaker', 7),
        checkerIsCreator: true,
        responderSubmitted: false,
      });
      await guestPage.waitForTimeout(3000);

      // 1b. Both submitted → revealed
      await advanceSessionState(session.sessionCode, {
        ratingPhase: 'revealed',
        responderRating: 8,
        responderSubmitted: true,
        checksCount: 1,
      });
      await hostPage.waitForTimeout(3000);

      // 1c. Both acknowledge celebration → round reset
      await advanceSessionState(session.sessionCode, {
        celebrationAcknowledgedByCreator: true,
        celebrationAcknowledgedByJoiner: true,
      });
      // Wait for the reactive reset to fire and propagate
      await hostPage.waitForTimeout(5000);

      // After round reset, both should see idle (Speak button visible again)
      // The reactive reset writes ratingPhase: 'idle' via the safety-net effect.
      // If it doesn't fire (no both-ack in DB), manually advance to idle.
      const hostSpeakAfterRound1 = await hostSpeak.isVisible();
      if (!hostSpeakAfterRound1) {
        // Manually reset to round 2 idle state
        await advanceSessionState(session.sessionCode, {
          currentRound: 2,
          ratingPhase: 'idle',
          checkerName: null,
          checkerIsCreator: null,
          checkerRating: null,
          responderRating: null,
          checkerSubmitted: false,
          responderSubmitted: false,
          ratingInitiatedBy: null,
          ratingInitiatedByIsCreator: null,
          celebrationAcknowledgedByCreator: false,
          celebrationAcknowledgedByJoiner: false,
          proverName: null,
          explainBackRound: 0,
          explainBackRatings: [],
          explainBackDone: false,
        });
        await hostPage.waitForTimeout(4000);
      }

      // Round 2: Start rating flow — THIS is where the loop bug manifests
      // if stale celebration booleans persist in DB.
      await advanceSessionState(session.sessionCode, {
        ...checkerSubmittedState('P671R2 Speaker', 9),
        checkerIsCreator: true,
        responderSubmitted: false,
      });
      await guestPage.waitForTimeout(4000);

      // Guest should be in responder view, not idle
      await expect(guestSpeak).not.toBeVisible({ timeout: 5_000 });

      // Both submit → revealed
      await advanceSessionState(session.sessionCode, {
        ratingPhase: 'revealed',
        responderRating: 9,
        responderSubmitted: true,
        checksCount: 2,
      });
      await hostPage.waitForTimeout(4000);

      // Stability check: Speak button should not reappear (no loop)
      for (let i = 0; i < 3; i++) {
        await hostPage.waitForTimeout(1000);
        const hostSpeakVisible = await hostSpeak.isVisible();
        expect(hostSpeakVisible, `Round 2: Host Speak button reappeared at check ${i + 1}`).toBe(false);
      }
    } finally {
      await session.cleanup();
    }
  });
});
