/**
 * @file p892-reproduce.spec.ts
 *
 * Canary test for P892: a /live round whose check cycle completed is never
 * recorded in `sessionHistory` when the mutual celebration-acknowledge
 * handshake doesn't fire for BOTH parties (one side clicks Continue, the
 * other abandons — tab closed, session ended, never acknowledges).
 *
 * Root cause (clarity-live-page.tsx — confirmed by static trace of all 5
 * sessionHistory write sites):
 *   Every completion append is gated on both-ack:
 *     - guided handleCelebrationComplete bothDone block (~2440)
 *     - guided reactive safety-net useEffect (~2512)
 *     - free handleFreeDiscussAnother bothDone block (~1837)   ← P879 added, still both-ack gated
 *     - free reactive safety-net useEffect (~2534)             ← P879 added, still both-ack gated
 *   Session exit (confirmExitMeeting, ~3480) does NOT flush a pending round.
 *   So a genuinely completed check cycle (celebration reached, ratings 10/10)
 *   is silently lost unless both parties click Continue.
 *
 * Scenario audit (in scope, one ticket per founder decision):
 *   1. Guided celebration, one party acks, other abandons  → test 1
 *   2. Free-mode success, one party acks, other abandons   → test 2
 *   (Both parties acking already works — covered by P525/P879 tests.)
 *
 * Per .claude/rules/live.md: each test drives the REAL Continue button on the
 * host page (handleCelebrationComplete / handleFreeDiscussAnother), not an
 * advanceSessionState bypass of the handler. The DB-state assertion is ground
 * truth — same pattern as e2e/p879-free-mode-rounds-not-recorded.spec.ts.
 *
 * Pre-fix expectation (FAIL): after the host's one-sided ack settles,
 *   sessionHistory stays [] — the round is lost.
 * Post-fix expectation (PASS): the completed round is appended exactly once
 *   regardless of the partner's missing ack.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';

/** Poll the DB until sessionHistory is non-empty or the deadline passes. */
async function pollSessionHistory(sessionCode: string, timeoutMs: number): Promise<unknown[]> {
  const deadline = Date.now() + timeoutMs;
  let history: unknown[] = [];
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();
    const ls = data?.live_state as Record<string, unknown> | undefined;
    history = (ls?.sessionHistory ?? []) as unknown[];
    if (history.length > 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return history;
}

/** Wait until the host's ack boolean lands in the DB (proves the click handler ran). */
async function waitForHostAck(sessionCode: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data } = await supabaseAdmin
      .from('clarity_sessions')
      .select('live_state')
      .eq('code', sessionCode)
      .single();
    const ls = data?.live_state as Record<string, unknown> | undefined;
    if (ls?.celebrationAcknowledgedByCreator === true) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

test.describe('P892: round with completed check cycle must be recorded despite abandoned handshake', () => {
  test('guided: one-sided Continue (partner abandons) must still record the round', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P892 Speaker',
      guestName: 'P892 Listener',
    });

    try {
      // ─── Advance to the guided perfect-rating celebration ──────────────────
      // Mirrors state after both ratings submitted at 10/10 (isPerfect branch
      // in live-mode-view.tsx ~2572 renders the celebration + Continue button).
      await advanceSessionState(session.sessionCode, {
        sessionMode: 'guided',
        currentRound: 1,
        ratingPhase: 'results',
        checkerName: 'P892 Speaker',
        checkerIsCreator: true,
        checkerSubmitted: true,
        responderSubmitted: true,
        checkerRating: 10,
        responderRating: 10,
      });

      // ─── HOST clicks the real Continue button; GUEST never acknowledges ────
      const continueButton = session.host.page.getByRole('button', { name: 'Continue' });
      await expect(continueButton, 'celebration Continue must render on host').toBeVisible({
        timeout: 15000,
      });
      await continueButton.click();

      // handleCelebrationComplete ran → host's ack boolean lands in DB.
      expect(
        await waitForHostAck(session.sessionCode, 15000),
        'host ack (celebrationAcknowledgedByCreator) must land in DB — proves the real handler ran',
      ).toBe(true);

      // ─── CANARY (DB symptom — ground truth) ────────────────────────────────
      // The completed check cycle MUST be recorded even though the partner
      // never acknowledged. PRE-FIX: append is both-ack gated → stays [] → FAIL.
      const history = await pollSessionHistory(session.sessionCode, 15000);
      expect(
        history.length,
        'a guided round with a completed check cycle must be appended to sessionHistory exactly once even when the mutual handshake never fires (clarity-live-page.tsx ~2440/~2512)',
      ).toBe(1);
    } finally {
      await session.cleanup();
    }
  });

  test('guided: NO acks, host ends session — exit flush must record the completed round', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P892 Speaker',
      guestName: 'P892 Listener',
    });

    try {
      // ─── Advance to a celebration reached via the explain-back loop ─────────
      // reachedPerfect (live-mode-view ~2566) uses the LAST explainBackRatings
      // entry, not the initial checkerRating, and fires at non-'results' phases
      // too — both gaps the code-review pass found in the first exit predicate.
      await advanceSessionState(session.sessionCode, {
        sessionMode: 'guided',
        currentRound: 1,
        ratingPhase: 'revealed',
        checkerName: 'P892 Speaker',
        checkerIsCreator: true,
        checkerSubmitted: true,
        responderSubmitted: true,
        checkerRating: 7,
        responderRating: 9,
        explainBackRatings: [7, 10],
      });

      // ─── NEITHER party acknowledges; HOST ends the session ─────────────────
      // Wait for the celebration to render on the host first — proves the
      // advanced state propagated into the host's confirmed ref before exit.
      await expect(
        session.host.page.getByRole('button', { name: 'Continue' }),
        'celebration must render on host before exiting (state propagated)',
      ).toBeVisible({ timeout: 15000 });

      // data-testid="leave-meeting" — the /live banner's End Session button
      // specifically (a name-based .first() could silently match another button)
      const endButton = session.host.page.getByTestId('leave-meeting');
      await expect(endButton, 'End Session must be reachable on host').toBeVisible({ timeout: 15000 });
      await endButton.click();

      // ─── CANARY (DB symptom — ground truth) ────────────────────────────────
      // confirmExitMeeting must flush the completed-but-unacknowledged round.
      const history = await pollSessionHistory(session.sessionCode, 15000);
      expect(
        history.length,
        'a completed round must be flushed to sessionHistory on session exit even when neither party acknowledged (confirmExitMeeting)',
      ).toBe(1);

      // Flag assertion: the flush must also mark the round as recorded, so any
      // late bothDone/reactive append path cannot double-append.
      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('code', session.sessionCode)
        .single();
      const ls = data?.live_state as Record<string, unknown> | undefined;
      expect(ls?.roundRecorded, 'roundRecorded flag must be set by the exit flush').toBe(true);
    } finally {
      await session.cleanup();
    }
  });

  test('free mode: one-sided Continue (partner abandons) must still record the round', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P892 Speaker',
      guestName: 'P892 Listener',
    });

    try {
      // ─── Advance to a completed free-mode round (freePhase='success') ──────
      // Mirrors state after the slider hit 10/10 — a real, recordable round.
      await advanceSessionState(session.sessionCode, {
        sessionMode: 'free',
        currentRound: 1,
        freePhase: 'success',
        ratingPhase: 'idle',
        checkerName: 'P892 Speaker',
        checkerIsCreator: true,
        checkerRating: 9,
        responderRating: 10,
        freeSliderCreator: 10,
        freeSliderJoiner: 10,
        freeRounds: [{ listenerConfidence: 10, speakerBelief: 9, label: '0' }],
      });

      // ─── HOST clicks the real Continue button; GUEST never acknowledges ────
      const continueButton = session.host.page.getByRole('button', { name: 'Continue' });
      await expect(continueButton, 'free-mode success Continue must render on host').toBeVisible({
        timeout: 15000,
      });
      await continueButton.click();

      // handleFreeDiscussAnother ran → host's ack boolean lands in DB.
      expect(
        await waitForHostAck(session.sessionCode, 15000),
        'host ack (celebrationAcknowledgedByCreator) must land in DB — proves the real handler ran',
      ).toBe(true);

      // ─── CANARY (DB symptom — ground truth) ────────────────────────────────
      // PRE-FIX: free append is both-ack gated (~1837/~2534) → stays [] → FAIL.
      const history = await pollSessionHistory(session.sessionCode, 15000);
      expect(
        history.length,
        'a completed free-mode round must be appended to sessionHistory exactly once even when the mutual handshake never fires (clarity-live-page.tsx ~1837/~2534)',
      ).toBe(1);
    } finally {
      await session.cleanup();
    }
  });
});
