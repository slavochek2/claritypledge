/**
 * @file p814-badge-flag-persists-across-rounds.spec.ts
 *
 * Canary test for P814: stale `badgePointEarned` flag persists across
 * rating-phase rounds.
 *
 * Bug: After P806 made the certifier's state-watcher useEffect actually fire
 * badges in the rating-phase path, a latent bug surfaced — the round-reset
 * paths in `clarity-live-page.tsx` (`handleCelebrationComplete` bothDone block
 * + reactive safety-net useEffects) never clear `badgePointEarned`/`badgeCount`.
 * The free-mode equivalent at `handleFreeDiscussAnother:1822-1823` does. The
 * asymmetry was invisible pre-P806 because the rating-phase badge never fired.
 *
 * Test path under test (Edit B target — line 2397 reactive safety-net):
 *   1. Round 1: storyA #understanding point + listener position=agree → badge fires
 *   2. Both ack celebration → safety-net useEffect resets state on host client
 *   3. Round 2: storyB #understanding point + listener position=disagree → no badge
 *
 * Pre-fix expectation (FAIL):
 *   After step 2's reset settles, `badgePointEarned: true` persists in
 *   `live_state` (the reset block omits the clear). On step 3's celebration
 *   screen, the amber "Badge point earned!" headline still renders despite
 *   round 2 having no qualifying badge.
 *
 * Post-fix expectation (PASS):
 *   Step 2's reset clears `badgePointEarned: false, badgeCount: 0` (same as
 *   `handleFreeDiscussAnother:1822-1823`). Step 3's celebration screen shows
 *   no amber headline because the round-2 watcher correctly returns
 *   not-eligible (listener position=disagree).
 *
 * Coverage: Edit B target (rating-mode reactive safety-net) is exercised
 * directly. Edit A (`handleCelebrationComplete` bothDone) and Edit C
 * (free-mode reactive safety-net) are structurally identical — covered by
 * code-pattern mirror, not direct test. The DB-state assertion below proves
 * the fix at the lowest level (ground truth before any UI rendering).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';

test.describe('P814: stale badgePointEarned across rating-phase rounds', () => {
  test('reactive safety-net useEffect must clear badgePointEarned on round reset', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P814 Speaker',
      guestName: 'P814 Listener',
    });

    const hostProfileId = session.host.user.user.id;
    const guestProfileId = session.guest.user.user.id;

    let storyAId: string | null = null;
    let storyBId: string | null = null;
    let pointAId: string | null = null;
    let pointBId: string | null = null;

    try {
      // Host = certifier (only certifiers run the badge insertion path)
      const { error: certError } = await supabaseAdmin
        .from('profiles')
        .update({ is_certifier: true })
        .eq('id', hostProfileId);
      if (certError) throw new Error(`is_certifier set failed: ${certError.message}`);

      // ─── storyA + #understanding point + listener=agree (badge eligible) ───
      const { data: storyAData, error: sAError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: hostProfileId,
          content: 'P814 storyA: badge eligible. #understanding #st1',
          tags: ['understanding', 'st1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (sAError || !storyAData) throw new Error(`storyA failed: ${sAError?.message}`);
      storyAId = storyAData.id;

      const { data: pointAData, error: pAError } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P814 pointA: to verify understanding the listener paraphrases.',
          first_validator_id: hostProfileId,
          tags: ['understanding', 'st1', 'v1'],
          system_tags: ['understanding', 'st1', 'v1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (pAError || !pointAData) throw new Error(`pointA failed: ${pAError?.message}`);
      pointAId = pointAData.id;

      const { error: spAError } = await supabaseAdmin
        .from('story_points')
        .insert({ story_id: storyAId, point_id: pointAId, author_id: hostProfileId });
      if (spAError) throw new Error(`story_pointsA failed: ${spAError.message}`);

      const { error: posAError } = await supabaseAdmin
        .from('point_positions')
        .upsert({ user_id: guestProfileId, point_id: pointAId, position: 'agree' });
      if (posAError) throw new Error(`point_positionsA failed: ${posAError.message}`);

      // ─── storyB + #understanding point + listener=disagree (NOT eligible) ───
      const { data: storyBData, error: sBError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: hostProfileId,
          content: 'P814 storyB: not badge eligible. #understanding #st1',
          tags: ['understanding', 'st1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (sBError || !storyBData) throw new Error(`storyB failed: ${sBError?.message}`);
      storyBId = storyBData.id;

      const { data: pointBData, error: pBError } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P814 pointB: listener does not yet understand.',
          first_validator_id: hostProfileId,
          tags: ['understanding', 'st1', 'v1'],
          system_tags: ['understanding', 'st1', 'v1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (pBError || !pointBData) throw new Error(`pointB failed: ${pBError?.message}`);
      pointBId = pointBData.id;

      const { error: spBError } = await supabaseAdmin
        .from('story_points')
        .insert({ story_id: storyBId, point_id: pointBId, author_id: hostProfileId });
      if (spBError) throw new Error(`story_pointsB failed: ${spBError.message}`);

      const { error: posBError } = await supabaseAdmin
        .from('point_positions')
        .upsert({ user_id: guestProfileId, point_id: pointBId, position: 'disagree' });
      if (posBError) throw new Error(`point_positionsB failed: ${posBError.message}`);

      // ─── ROUND 1: drive to results-phase celebration → watcher fires badge ───
      // explainBackRatings=[10] → reachedPerfect=true → state-watcher (line 1606)
      // calls awardBadgeIfEligible → listener position=agree → inserts badge_points
      // → updateLiveState({badgePointEarned: true, badgeCount: N})
      await advanceSessionState(session.sessionCode, {
        currentRound: 1,
        ratingPhase: 'results',
        explainBackRatings: [10],
        checkerName: 'P814 Speaker',
        checkerIsCreator: true,
        checkerSubmitted: true,
        responderSubmitted: true,
        checkerRating: 8,
        responderRating: 8,
        selectedStoryId: storyAId,
        selectedStoryData: {
          id: storyAId,
          content: 'P814 storyA: badge eligible. #understanding #st1',
          authorId: hostProfileId,
          authorName: 'P814 Speaker',
          authorSlug: 'p814-speaker',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [
            {
              id: pointAId,
              statement: 'P814 pointA: to verify understanding the listener paraphrases.',
              tags: ['understanding', 'st1', 'v1'],
              systemTags: ['understanding', 'st1', 'v1'],
            },
          ],
        },
        livePositionsJoiner: { [pointAId]: 'agree' },
      });

      // Round 1 amber headline must appear → confirms badge fired
      await expect(
        session.host.page.getByText(/Badge point earned!/i)
      ).toBeVisible({ timeout: 15000 });

      // Verify DB state mid-round 1 — badgePointEarned written by watcher
      const { data: r1State } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('code', session.sessionCode)
        .single();
      expect((r1State?.live_state as Record<string, unknown>)?.badgePointEarned).toBe(true);

      // ─── ROUND 1 → ROUND 2 TRANSITION ─────────────────────────────────────
      // Both clients ack the celebration. Reactive safety-net useEffect on the
      // host's page (line 2368, P525) catches `bothAcknowledged === true &&
      // ratingPhase !== 'idle'` and fires the round-reset updateLiveState() —
      // line 2397 is the EDIT B TARGET.
      await advanceSessionState(session.sessionCode, {
        celebrationAcknowledgedByCreator: true,
        celebrationAcknowledgedByJoiner: true,
      });

      // Wait for the host's reactive useEffect to fire the reset → DB shows
      // ratingPhase=idle + selectedStoryId cleared.
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
          ls?.ratingPhase === 'idle' &&
          (ls.selectedStoryId === null || ls.selectedStoryId === undefined)
        ) {
          resetSettled = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!resetSettled) {
        throw new Error(
          'Reset never settled — reactive safety-net useEffect did not fire on host page',
        );
      }

      // ─── CANARY 1 (DB symptom — ground truth) ─────────────────────────────
      // The reset block (Edit B target) MUST clear badgePointEarned and
      // badgeCount alongside the other round-state fields it already clears.
      // PRE-FIX: stays `true` / non-zero. POST-FIX: cleared.
      const { data: postResetState } = await supabaseAdmin
        .from('clarity_sessions')
        .select('live_state')
        .eq('code', session.sessionCode)
        .single();
      const postLs = postResetState?.live_state as Record<string, unknown>;
      expect(
        postLs?.badgePointEarned,
        'badgePointEarned must be cleared by reactive safety-net reset (Edit B target at line 2397)',
      ).not.toBe(true);

      // ─── ROUND 2: storyB with non-qualifying listener position ─────────────
      // explainBackRatings=[10] → reachedPerfect=true → watcher runs.
      // Listener position=disagree → awardBadgeIfEligible returns
      // badgePointEarned: false. The amber headline must NOT render.
      await advanceSessionState(session.sessionCode, {
        currentRound: 2,
        ratingPhase: 'results',
        explainBackRatings: [10],
        checkerName: 'P814 Speaker',
        checkerIsCreator: true,
        checkerSubmitted: true,
        responderSubmitted: true,
        checkerRating: 8,
        responderRating: 8,
        selectedStoryId: storyBId,
        selectedStoryData: {
          id: storyBId,
          content: 'P814 storyB: not badge eligible. #understanding #st1',
          authorId: hostProfileId,
          authorName: 'P814 Speaker',
          authorSlug: 'p814-speaker',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [
            {
              id: pointBId,
              statement: 'P814 pointB: listener does not yet understand.',
              tags: ['understanding', 'st1', 'v1'],
              systemTags: ['understanding', 'st1', 'v1'],
            },
          ],
        },
        livePositionsJoiner: { [pointBId]: 'disagree' },
      });

      // ─── CANARY 2 (UI symptom on round 2) ─────────────────────────────────
      // Round 2 has no qualifying badge → amber headline must NOT render on
      // host's celebration screen. PRE-FIX: stale `badgePointEarned: true`
      // persists → headline visible. POST-FIX: flag cleared on reset → hidden.
      // Timeout chosen to exceed app's 1s drift polling + Realtime propagation.
      await expect(
        session.host.page.getByText(/Badge point earned!/i),
      ).toBeHidden({ timeout: 8000 });

      // ─── CANARY 3 (DB symptom — exactly one badge for the session) ────────
      // badge_points must contain exactly the round-1 row. A regression that
      // accidentally fires round 2's badge (despite disagree position) would
      // double the count.
      const { data: badges } = await supabaseAdmin
        .from('badge_points')
        .select('id, point_id')
        .in('point_id', [pointAId, pointBId]);
      expect(badges).toHaveLength(1);
      expect(badges?.[0].point_id).toBe(pointAId);
    } finally {
      // FK cleanup order: badge_points → point_positions → story_points → points → stories
      const pointIds = [pointAId, pointBId].filter((id): id is string => id !== null);
      const storyIds = [storyAId, storyBId].filter((id): id is string => id !== null);
      if (pointIds.length) {
        await supabaseAdmin.from('badge_points').delete().in('point_id', pointIds);
        await supabaseAdmin.from('point_positions').delete().in('point_id', pointIds);
        await supabaseAdmin.from('story_points').delete().in('point_id', pointIds);
        await supabaseAdmin.from('points').delete().in('id', pointIds);
      }
      if (storyIds.length) {
        await supabaseAdmin.from('stories').delete().in('id', storyIds);
      }
      await supabaseAdmin.from('profiles').update({ is_certifier: false }).eq('id', hostProfileId);
      await session.cleanup();
    }
  });
});
