/**
 * @file p912-reproduce.spec.ts
 * @description Canary for P912 — celebration dual-ack "phantom transient" flake.
 *
 * ROOT CAUSE (confirmed via 100ms live_state capture, see spec):
 *   p525's `waitForBothAcknowledged` polls for
 *   `celebrationAcknowledgedByCreator === true && ...Joiner === true`
 *   SIMULTANEOUSLY. But the app is racing to CLEAR that state:
 *   - Sequential resolution (joiner's ref already shows creator's ack when it
 *     clicks) → joiner takes handleCelebrationComplete's `bothDone` branch and
 *     does an immediate full-overwrite reset. The DB goes
 *     `creator:true → idle/round2` — both-true NEVER persists.
 *   - Simultaneous → both-true persists only ~0.8s before the reactive
 *     safety-net useEffect clears it; a 500ms poll can miss that window.
 *   Either way `waitForBothAcknowledged` times out (30s) while the DURABLE
 *   outcome (round advances, both leave celebration) is correct. Test noise,
 *   not a production race. Under parallel suite load the click gap widens →
 *   sequential resolution becomes likely → the flake appears.
 *
 * This test forces sequential resolution DETERMINISTICALLY and asserts the
 * durable guarantee holds: round advances to idle, both Continue buttons
 * disappear, and currentRound === 2. Sequential resolution is the load-sensitive
 * worst case that triggered the original p525 flake (P912).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState, waitForLiveStateKey } from './helpers/test-realtime';

test.describe('P912: celebration dual-ack — sequential resolution (worst-case timing)', () => {
  test.describe.configure({ timeout: 120000 });

  test('round advances when joiner already saw creator ack — both-true never persists', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P912R Creator',
      guestName: 'P912R Joiner',
    });
    const code = session.sessionCode;

    try {
      await advanceSessionState(code, {
        ratingPhase: 'celebration',
        currentRound: 1,
        checkerSubmitted: true,
        responderSubmitted: true,
        checkerRating: 10,
        responderRating: 10,
        checkerName: 'P912R Creator',
        checkerIsCreator: true,
        currentSpeaker: 'P912R Creator',
        currentListener: 'P912R Joiner',
        celebrationAcknowledgedByCreator: false,
        celebrationAcknowledgedByJoiner: false,
        celebrationAcknowledgedBy: [],
        roundRecorded: false,
      });

      const continueCreator = session.host.page.getByRole('button', { name: /continue/i });
      const continueJoiner = session.guest.page.getByRole('button', { name: /continue/i });
      await expect(continueCreator).toBeVisible({ timeout: 15000 });
      await expect(continueJoiner).toBeVisible({ timeout: 15000 });

      // ─── Force SEQUENTIAL resolution ──────────────────────────────────────
      // Creator acks first; wait for the ack to land in the DB AND for Realtime +
      // the 1s drift poll to deliver it into the joiner's confirmedLiveStateRef,
      // so the joiner takes handleCelebrationComplete's bothDone (immediate-reset)
      // branch — never writing both-true to the DB.
      await continueCreator.click();
      await waitForLiveStateKey(code, 'celebrationAcknowledgedByCreator', true, 10000);
      await session.guest.page.waitForTimeout(2500);
      await continueJoiner.click();

      // ─── DURABLE GUARANTEE (the real product behavior — must hold) ─────────
      await waitForLiveStateKey(code, 'ratingPhase', 'idle', 15000);
      await expect(continueCreator).not.toBeVisible({ timeout: 15000 });
      await expect(continueJoiner).not.toBeVisible({ timeout: 15000 });

      const { data: finalState } = await supabaseAdmin
        .from('clarity_sessions').select('live_state').eq('code', code).single();
      expect((finalState?.live_state as Record<string, unknown>).currentRound).toBe(2);

    } finally {
      await session.cleanup();
    }
  });
});
