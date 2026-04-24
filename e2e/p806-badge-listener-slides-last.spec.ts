/**
 * @file p806-badge-listener-slides-last.spec.ts
 *
 * Canary test for P806: badge handler runs on the wrong client when the listener
 * slides to 10 last.
 *
 * Architectural bug: badge insertion lives inside event handlers triggered by
 * the local user's slider/rating action. In the dominant prod scenario, the
 * certifier slides first and the listener slides last. The listener's
 * handleFreeRoundComplete fires, awardBadgeIfEligible returns early (not
 * certifier), then the function unconditionally writes freePhase='success',
 * which locks the certifier's client out of ever re-running the handler
 * (entry guard at clarity-live-page.tsx:1701 returns immediately on
 * freePhase !== 'unlocked').
 *
 * Test setup (deterministic — avoids racy slider timing):
 * - Story with one #understanding-tagged point + listener position=agree
 * - Host = certifier (creator with is_certifier=true)
 * - advanceSessionState writes the *exact prod lockout state* directly:
 *     freePhase='success', freeSliderCreator=10, freeSliderJoiner=10,
 *     badgePointEarned=false
 * - Both users navigate into the session and see the celebration screen
 *
 * Pre-fix expectation (FAIL):
 *   The amber "Badge point earned!" headline never appears, and badge_points
 *   has no row. The handler-based architecture has no path to re-enter
 *   awardBadgeIfEligible from this state.
 *
 * Post-fix expectation (PASS):
 *   A state-watching useEffect on the certifier's client detects mutual 10/10
 *   on mount, inserts the badge_points row, writes badgePointEarned=true to
 *   shared state, and the amber headline propagates to both parties.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';

test.describe('P806: badge handler runs on wrong client when listener slides last', () => {

  test('Path E: badge fires from post-lockout state when listener wrote freePhase=success', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P806E Speaker',
      guestName: 'P806E Listener',
    });

    const hostProfileId = session.host.user.user.id;
    const guestProfileId = session.guest.user.user.id;

    let testStoryId: string | null = null;
    let testPointId: string | null = null;

    try {
      // Host = certifier (matches P804 canary pattern: creator is the certifier/speaker)
      const { error: certError } = await supabaseAdmin
        .from('profiles')
        .update({ is_certifier: true })
        .eq('id', hostProfileId);
      if (certError) throw new Error(`is_certifier set failed: ${certError.message}`);

      // Story + #understanding point + listener position=agree (badge preconditions met)
      const { data: storyData, error: storyError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: hostProfileId,
          content: 'P806E test story content. #understanding #st1',
          tags: ['understanding', 'st1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (storyError || !storyData) throw new Error(`story create failed: ${storyError?.message}`);
      testStoryId = storyData.id;

      const { data: pointData, error: pointError } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P806E test: to verify understanding the listener paraphrases.',
          first_validator_id: hostProfileId,
          tags: ['understanding', 'st1', 'v1'],
          system_tags: ['understanding', 'st1', 'v1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (pointError || !pointData) throw new Error(`point create failed: ${pointError?.message}`);
      testPointId = pointData.id;

      const { error: spError } = await supabaseAdmin
        .from('story_points')
        .insert({ story_id: testStoryId, point_id: testPointId, author_id: hostProfileId });
      if (spError) throw new Error(`story_points failed: ${spError.message}`);

      const { error: posError } = await supabaseAdmin
        .from('point_positions')
        .upsert({
          user_id: guestProfileId,
          point_id: testPointId,
          position: 'agree',
        });
      if (posError) throw new Error(`point_positions failed: ${posError.message}`);

      // Advance state DIRECTLY to the post-lockout configuration that prod
      // session 9f7f7fc7 ended up in: mutual 10 reached, freePhase=success
      // already written, badgePointEarned=false (no badge ever fired).
      // This is the canonical "listener slid last and locked out the certifier"
      // end-state — the test asserts the certifier's client can still produce
      // the badge from this state.
      await advanceSessionState(session.sessionCode, {
        freePhase: 'success',
        freeSliderCreator: 10,
        freeSliderJoiner: 10,
        badgePointEarned: false,
        badgeCount: 0,
        selectedStoryId: testStoryId,
        selectedStoryData: {
          id: testStoryId,
          content: 'P806E test story content. #understanding #st1',
          authorId: hostProfileId,
          authorName: 'P806E Speaker',
          authorSlug: 'p806e-speaker',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [
            {
              id: testPointId,
              statement: 'P806E test: to verify understanding the listener paraphrases.',
              tags: ['understanding', 'st1', 'v1'],
              systemTags: ['understanding', 'st1', 'v1'],
            },
          ],
        },
        livePositionsJoiner: { [testPointId]: 'agree' },
        checkerIsCreator: true,
        checkerName: 'P806E Speaker',
        checksCount: 1,
        checksTotal: 7,
      });

      // Both clients render the celebration screen from the post-lockout state.
      // Pre-fix: handler-based code never re-runs (freePhase guard at line 1701
      // blocks re-entry). Post-fix: state-watching useEffect on certifier's
      // client fires on first render, sees mutual 10/10, inserts badge_points.
      await expect(
        session.host.page.getByText(/understood.*perfectly/i)
      ).toBeVisible({ timeout: 15000 });

      // CANARY 1 (UI symptom): amber badge headline must appear on certifier's
      // screen. Pre-fix: never renders because badgePointEarned stays false in
      // shared state. Post-fix: state-watcher writes badgePointEarned=true and
      // it propagates to both parties.
      await expect(
        session.host.page.getByText(/Badge point earned!/i)
      ).toBeVisible({ timeout: 8000 });

      // CANARY 2 (DB symptom): badge_points row must exist for the listener.
      // Pre-fix: empty (mirrors prod session 9f7f7fc7's badge_points: 0 rows).
      // Post-fix: one row, verified_by=host (certifier), position=agree.
      const { data: badges, error: badgeReadError } = await supabaseAdmin
        .from('badge_points')
        .select('id, user_id, verified_by, point_id, position')
        .eq('user_id', guestProfileId)
        .eq('point_id', testPointId);
      expect(badgeReadError).toBeNull();
      expect(badges).toHaveLength(1);
      expect(badges?.[0].verified_by).toBe(hostProfileId);
      expect(badges?.[0].position).toBe('agree');

      // CANARY 3 (UI symptom on listener's screen): the amber headline must
      // also appear on the listener's screen via Realtime propagation.
      // This proves the certifier's badge write reaches the non-certifier party.
      await expect(
        session.guest.page.getByText(/Badge point earned!/i)
      ).toBeVisible({ timeout: 8000 });
    } finally {
      if (testPointId) {
        await supabaseAdmin.from('badge_points').delete().eq('point_id', testPointId);
        await supabaseAdmin.from('point_positions').delete().eq('point_id', testPointId);
        await supabaseAdmin.from('story_points').delete().eq('point_id', testPointId);
        await supabaseAdmin.from('points').delete().eq('id', testPointId);
      }
      if (testStoryId) {
        await supabaseAdmin.from('stories').delete().eq('id', testStoryId);
      }
      await supabaseAdmin.from('profiles').update({ is_certifier: false }).eq('id', hostProfileId);
      await session.cleanup();
    }
  });
});
