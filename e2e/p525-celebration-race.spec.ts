/**
 * @file p525-celebration-race.spec.ts
 * @description E2E tests for P525: Live State Deadlock Prevention
 *
 * The core scenario: two users clicking "Continue" on the celebration screen
 * simultaneously. Before P525, the celebrationAcknowledgedBy array could lose
 * one user's acknowledgment due to JSONB key-level overwrite. After P525,
 * each user writes to their own boolean key — no collision possible.
 *
 * Also tests: handleSkip clears selectedStoryData (no stale data leak).
 *
 * Rewritten for current join flow (P891): the legacy `/live?code=` query-param
 * join no longer enters a session — both participants now join via
 * createTwoPartySession (real `/live/CODE` join flow), then the round is
 * advanced to the target phase via advanceSessionState (DB merge). The
 * Continue/Skip interactions under test remain UI-driven clicks.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState, waitForLiveStateKey } from './helpers/test-realtime';

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('P525: Celebration race — two users clicking Continue simultaneously', () => {
  test.describe.configure({ timeout: 120000 });

  test('both users clicking Continue on celebration → both advance to next round', async ({ browser }) => {
    // This test verifies the behavioral outcome of the P525 boolean fix.
    // We cannot reliably trigger a true simultaneous click in E2E, but we can
    // verify that both acknowledgments persist in the DB without overwriting.
    const session = await createTwoPartySession(browser, {
      hostName: 'P525 Creator',
      guestName: 'P525 Guest',
    });
    const code = session.sessionCode;

    try {
      // Advance the joined session to the celebration phase via DB merge
      await advanceSessionState(code, {
        // 'celebration' is NOT a RatingPhase — it appears nowhere in the type nor in
        // PHASE_ORDER, so the merge guard scored it rank -1 and rejected the whole
        // fixture as a regression; the client stayed on idle and never rendered the
        // celebration screen. The real gate is ratingPhase 'results' + a 10 rating
        // (live-mode-view.tsx: reachedPerfect → phase 'perfect'). P1080.
        ratingPhase: 'results',
        currentRound: 1,
        checkerSubmitted: true,
        responderSubmitted: true,
        checkerRating: 10,
        responderRating: 10,
        checkerName: 'P525 Creator',
        checkerIsCreator: true,
        currentSpeaker: 'P525 Creator',
        currentListener: 'P525 Guest',
        celebrationAcknowledgedByCreator: false,
        celebrationAcknowledgedByJoiner: false,
      });

      // Wait for celebration screen to appear on both
      const continueButtonCreator = session.host.page.getByRole('button', { name: /continue/i });
      const continueButtonJoiner = session.guest.page.getByRole('button', { name: /continue/i });

      await expect(continueButtonCreator).toBeVisible({ timeout: 15000 });
      await expect(continueButtonJoiner).toBeVisible({ timeout: 15000 });

      // Both click Continue (as close together as possible)
      await Promise.all([
        continueButtonCreator.click(),
        continueButtonJoiner.click(),
      ]);

      // Session advances — ratingPhase returns to 'idle'
      await waitForLiveStateKey(code, 'ratingPhase', 'idle', 15000);

      // UI leaves the celebration screen on BOTH pages — DB state alone does
      // not prove either page re-rendered off celebration.
      await expect(continueButtonCreator).not.toBeVisible({ timeout: 15000 });
      await expect(continueButtonJoiner).not.toBeVisible({ timeout: 15000 });

      // Round incremented
      const { data: finalState } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('code', code)
        .single();

      const state = finalState?.live_state as Record<string, unknown>;
      expect(state.currentRound).toBe(2);
    } finally {
      await session.cleanup();
    }
  });

  test('sequential resolution: creator acks first → individual boolean persists in DB → round advances', async ({ browser }) => {
    // Tests the P525 per-role boolean mechanism directly: verifies that the
    // creator's individual JSONB key (`celebrationAcknowledgedByCreator`) lands
    // in the DB before the joiner acks. The durable-outcome assertions prove
    // the round advanced correctly via the bothDone branch.
    const session = await createTwoPartySession(browser, {
      hostName: 'P525 Creator Seq',
      guestName: 'P525 Guest Seq',
    });
    const code = session.sessionCode;

    try {
      await advanceSessionState(code, {
        // 'celebration' is NOT a RatingPhase — it appears nowhere in the type nor in
        // PHASE_ORDER, so the merge guard scored it rank -1 and rejected the whole
        // fixture as a regression; the client stayed on idle and never rendered the
        // celebration screen. The real gate is ratingPhase 'results' + a 10 rating
        // (live-mode-view.tsx: reachedPerfect → phase 'perfect'). P1080.
        ratingPhase: 'results',
        currentRound: 1,
        checkerSubmitted: true,
        responderSubmitted: true,
        checkerRating: 10,
        responderRating: 10,
        checkerName: 'P525 Creator Seq',
        checkerIsCreator: true,
        currentSpeaker: 'P525 Creator Seq',
        currentListener: 'P525 Guest Seq',
        celebrationAcknowledgedByCreator: false,
        celebrationAcknowledgedByJoiner: false,
      });

      const continueButtonCreator = session.host.page.getByRole('button', { name: /continue/i });
      const continueButtonJoiner = session.guest.page.getByRole('button', { name: /continue/i });

      await expect(continueButtonCreator).toBeVisible({ timeout: 15000 });
      await expect(continueButtonJoiner).toBeVisible({ timeout: 15000 });

      // Creator acks first — verify the individual JSONB boolean key persisted
      await continueButtonCreator.click();
      await waitForLiveStateKey(code, 'celebrationAcknowledgedByCreator', true, 10000);

      // Wait for Realtime + 1s drift poll to deliver creator's ack to joiner
      await session.guest.page.waitForTimeout(2500);
      await continueButtonJoiner.click();

      // Durable outcome: round advances, both leave celebration
      await waitForLiveStateKey(code, 'ratingPhase', 'idle', 15000);
      await expect(continueButtonCreator).not.toBeVisible({ timeout: 15000 });
      await expect(continueButtonJoiner).not.toBeVisible({ timeout: 15000 });

      const { data: finalState } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('code', code)
        .single();
      const state = finalState?.live_state as Record<string, unknown>;
      expect(state.currentRound).toBe(2);
    } finally {
      await session.cleanup();
    }
  });
});

test.describe('P525: handleSkip clears selectedStoryData', () => {
  test.describe.configure({ timeout: 120000 });

  test('skipping a round clears selectedStoryData from live_state', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P525 Skip Creator',
      guestName: 'P525 Skip Guest',
    });
    const code = session.sessionCode;

    try {
      // Advance to an in-flight rating round with story data attached.
      // Creator is the checker (their page shows the rating drawer with a skip affordance).
      await advanceSessionState(code, {
        ratingPhase: 'rating',
        currentRound: 1,
        checkerSubmitted: false,
        responderSubmitted: false,
        checkerName: 'P525 Skip Creator',
        checkerIsCreator: true,
        currentSpeaker: 'P525 Skip Creator',
        currentListener: 'P525 Skip Guest',
        // Full StoryData shape (see e2e/p879 seed) — a partial shape crashes
        // the story card component into the error boundary.
        selectedStoryData: {
          id: '00000000-0000-0000-0000-000000000525',
          content: 'P525 Skip Story: a story for the skip test.',
          authorId: '00000000-0000-0000-0000-000000000001',
          authorName: 'P525 Skip Creator',
          authorSlug: 'p525-skip-creator',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [],
        },
        selectedContentTitle: 'P525 Skip Story',
      });

      // Creator skips the round from the rating drawer — the drawer's "Back"
      // affordance is wired to handleSkip (onBackToIdle={handleSkip},
      // clarity-live-page.tsx ~4435).
      const skipButton = session.host.page.getByRole('button', { name: /^Back$/i });
      await expect(skipButton).toBeVisible({ timeout: 15000 });
      await skipButton.click();

      // Skip propagates — ratingPhase returns to 'idle'
      await waitForLiveStateKey(code, 'ratingPhase', 'idle', 15000);

      // selectedStoryData is cleared (the P525 stale-data guarantee)
      const { data } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('code', code)
        .single();
      const state = data?.live_state as Record<string, unknown> | null;
      expect(state?.selectedStoryData).toBeFalsy();
    } finally {
      await session.cleanup();
    }
  });
});
