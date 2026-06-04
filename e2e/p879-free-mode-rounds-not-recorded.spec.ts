/**
 * @file p879-free-mode-rounds-not-recorded.spec.ts
 *
 * Canary test for P879: free-mode /live rounds are never recorded in
 * `sessionHistory`, so a completed free-mode session shows "no rounds
 * completed" in Session History (P405/P813) regardless of how many rounds
 * the pair actually finished.
 *
 * Root cause (clarity-live-page.tsx):
 *   The two GUIDED completion paths append a round entry to `sessionHistory`:
 *     - handleCelebrationComplete bothDone block (line ~2408)
 *     - reactive safety-net useEffect (line ~2480)
 *   The two FREE completion paths reset round state WITHOUT any append:
 *     - handleFreeDiscussAnother bothDone block (line ~1805)
 *     - free reactive safety-net useEffect (line ~2497)  ← EXERCISED HERE
 *   `checksCount` increments on the check path (line ~2761), independent of the
 *   append — which is why a real session (test DB GFEPZL, 2026-06-02) shows
 *   checksCount=3 with sessionHistory=[].
 *
 * Test path under test (free reactive safety-net at line ~2497):
 *   1. Advance state to a completed free-mode round (freePhase='success' with
 *      a selected story + ratings — a recordable round).
 *   2. Both clients ack ("Discuss another" dual-ack). The host's free reactive
 *      safety-net useEffect catches bothAcknowledged && freePhase==='success'
 *      and fires the round-reset updateLiveState() — the buggy path.
 *   3. Reset settles (freePhase cleared, ratingPhase=idle).
 *
 * Pre-fix expectation (FAIL):
 *   After the reset settles, `live_state.sessionHistory` is still [] — the free
 *   reset block omits the append. The completed round is lost.
 *
 * Post-fix expectation (PASS):
 *   The free reset block appends a round entry (mirroring guided mode), so
 *   `sessionHistory` has length 1 after the round completes.
 *
 * Per .claude/rules/live.md: this drives the actual buggy handler (the reactive
 * reset useEffect runs on the host client in response to the both-ack state),
 * not an advanceSessionState bypass of it. The DB-state assertion is ground
 * truth — same pattern as e2e/p814-badge-flag-persists-across-rounds.spec.ts.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';

test.describe('P879: free-mode rounds must be recorded in sessionHistory', () => {
  test('free reactive safety-net reset must append the completed round to sessionHistory', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P879 Speaker',
      guestName: 'P879 Listener',
    });

    const hostProfileId = session.host.user.user.id;

    let storyId: string | null = null;
    let pointId: string | null = null;

    try {
      // ─── Test story + point the free-mode round discusses ──────────────────
      const { data: storyData, error: sError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: hostProfileId,
          content: 'P879 story: discussed in a free-mode round. #st1',
          tags: ['st1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (sError || !storyData) throw new Error(`story failed: ${sError?.message}`);
      storyId = storyData.id;

      const { data: pointData, error: pError } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P879 point: the listener confirms understanding.',
          first_validator_id: hostProfileId,
          tags: ['st1', 'v1'],
          system_tags: ['st1', 'v1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (pError || !pointData) throw new Error(`point failed: ${pError?.message}`);
      pointId = pointData.id;

      const { error: spError } = await supabaseAdmin
        .from('story_points')
        .insert({ story_id: storyId, point_id: pointId, author_id: hostProfileId });
      if (spError) throw new Error(`story_points failed: ${spError.message}`);

      // ─── Advance to a COMPLETED free-mode round (freePhase='success') ───────
      // Mirrors the state after handleFreeRoundComplete fires (slider hit 10/10):
      // a real, recordable round with a discussed story and both ratings.
      await advanceSessionState(session.sessionCode, {
        sessionMode: 'free',
        currentRound: 1,
        freePhase: 'success',
        ratingPhase: 'idle',
        checkerName: 'P879 Speaker',
        checkerIsCreator: true,
        checkerRating: 9,
        responderRating: 10,
        freeSliderCreator: 10,
        freeSliderJoiner: 10,
        freeRounds: [{ listenerConfidence: 10, speakerBelief: 9, label: '0' }],
        selectedStoryId: storyId,
        selectedContentTitle: 'P879 story',
        selectedStoryData: {
          id: storyId,
          content: 'P879 story: discussed in a free-mode round. #st1',
          authorId: hostProfileId,
          authorName: 'P879 Speaker',
          authorSlug: 'p879-speaker',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [
            {
              id: pointId,
              statement: 'P879 point: the listener confirms understanding.',
              tags: ['st1', 'v1'],
              systemTags: ['st1', 'v1'],
            },
          ],
        },
      });

      // ─── Both parties ack ("Discuss another") → host free reset fires ──────
      await advanceSessionState(session.sessionCode, {
        celebrationAcknowledgedByCreator: true,
        celebrationAcknowledgedByJoiner: true,
      });

      // Wait for the host's free reactive safety-net useEffect to fire the reset
      // → DB shows freePhase cleared + ratingPhase=idle.
      const resetDeadline = Date.now() + 20000;
      let resetSettled = false;
      while (Date.now() < resetDeadline) {
        const { data: midState } = await supabaseAdmin
          .from('clarity_sessions')
          .select('live_state')
          .eq('code', session.sessionCode)
          .single();
        const ls = midState?.live_state as Record<string, unknown> | undefined;
        if (
          (ls?.freePhase === null || ls?.freePhase === undefined) &&
          ls?.ratingPhase === 'idle' &&
          ls?.celebrationAcknowledgedByCreator !== true
        ) {
          resetSettled = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!resetSettled) {
        throw new Error(
          'Free reset never settled — free reactive safety-net useEffect did not fire on host page',
        );
      }

      // ─── CANARY (DB symptom — ground truth) ───────────────────────────────
      // The completed free-mode round MUST be recorded in sessionHistory.
      // PRE-FIX: sessionHistory stays [] (free reset omits the append) → FAIL.
      // POST-FIX: sessionHistory has the round entry → length 1.
      const { data: finalState } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('code', session.sessionCode)
        .single();
      const finalLs = finalState?.live_state as Record<string, unknown>;
      const history = (finalLs?.sessionHistory ?? []) as unknown[];
      expect(
        history.length,
        'a completed free-mode round must be appended to sessionHistory (free reset path at clarity-live-page.tsx ~2497)',
      ).toBeGreaterThanOrEqual(1);
    } finally {
      // FK cleanup order: point_positions → story_points → points → stories
      if (pointId) {
        await supabaseAdmin.from('point_positions').delete().eq('point_id', pointId);
        await supabaseAdmin.from('story_points').delete().eq('point_id', pointId);
        await supabaseAdmin.from('points').delete().eq('id', pointId);
      }
      if (storyId) {
        await supabaseAdmin.from('stories').delete().eq('id', storyId);
      }
      await session.cleanup();
    }
  });
});
