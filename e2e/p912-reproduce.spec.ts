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
 * This canary forces sequential resolution DETERMINISTICALLY, asserts the
 * durable guarantee holds, then demonstrates the phantom-transient poll timing
 * out (the exact p525 failure).
 *
 * /fix resolves this by replacing p525's line-126 `waitForBothAcknowledged(code)`
 * (and the final line of this canary) with the durable-outcome wait that the
 * lines above already use — proving the real guarantee instead of a transient.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';

/** Polls live_state until a JSONB key matches a value (durable-state assertion). */
async function waitForLiveStateKey(
  code: string,
  key: string,
  value: unknown,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions').select('live_state').eq('code', code).single();
    if (data?.live_state && (data.live_state as Record<string, unknown>)[key] === value) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`[waitForLiveStateKey] Timed out waiting for live_state.${key} = ${String(value)} on ${code}`);
}

/**
 * VERBATIM COPY of p525's flawed helper (line 56). Polls for the transient
 * both-true state. This is the assertion that flakes; the canary proves it
 * times out deterministically under sequential resolution.
 */
async function waitForBothAcknowledged(code: string, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions').select('live_state').eq('code', code).single();
    const state = data?.live_state as Record<string, unknown> | null;
    if (state?.celebrationAcknowledgedByCreator === true &&
        state?.celebrationAcknowledgedByJoiner === true) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`[waitForBothAcknowledged] Timed out on session ${code}`);
}

test.describe('P912: celebration dual-ack phantom-transient (sequential resolution)', () => {
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

      // ─── FLAKE REPRODUCTION (current p525 line 126) ───────────────────────
      // Polling for the transient both-true state times out — it never persists
      // under sequential resolution. THIS LINE FAILS pre-fix. /fix removes it
      // (and p525's line 126); the durable assertions above are the guarantee.
      await waitForBothAcknowledged(code, 8000);
    } finally {
      await session.cleanup();
    }
  });
});
