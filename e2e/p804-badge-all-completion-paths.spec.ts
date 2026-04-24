/**
 * @file p804-badge-all-completion-paths.spec.ts
 *
 * Canary tests for P804: Badge certification silently drops across all /live
 * round-completion paths.
 *
 * Three failing assertions (pre-fix), one per completion path:
 *
 *  Path A — Rating-phase instant 10/10
 *    Speaker rates 10 first try, listener confirms 10. No paraphrase.
 *    Pre-fix: clarity-live-page.tsx:2127 isPerfect block has no badge code.
 *    Post-fix: badge fires + amber headline shown on perfect celebration.
 *
 *  Path B — Rating-phase 10/10 after one paraphrase round
 *    Same as A but with explainBackRatings recording one paraphrase round.
 *    Pre-fix: same as Path A — rating-phase isPerfect path never inserts badges.
 *
 *  Path C — Free-mode 10/10 with multi-#understanding story
 *    Story has TWO #understanding-tagged points (v1 disagreed, v2 agreed).
 *    Pre-fix: clarity-live-page.tsx:1654 .find() picks v1 (disagreed) → no badge.
 *    Post-fix: latest-version picker selects v2 (agreed) → badge fires for v2.
 *
 * Setup pattern (all paths):
 * - Host = certifier (is_certifier=true)
 * - Test story + #understanding point(s) created in DB
 * - Listener (joiner) has agree position on the relevant point
 * - Session state advanced to the trigger point via advanceSessionState
 * - Trigger via real UI interaction (rating click + Submit, or slider)
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';

test.describe('P804: badge certification across all /live completion paths', () => {

  // ──────────────────────────────────────────────────────────────────────────
  // PATH A — Rating-phase instant 10/10 (Bug 1)
  // ──────────────────────────────────────────────────────────────────────────
  test('Path A: badge fires when rating-phase reaches 10/10 instantly (no paraphrase)', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P804A Speaker',
      guestName: 'P804A Listener',
    });

    const hostProfileId = session.host.user.user.id;
    const guestProfileId = session.guest.user.user.id;

    let testStoryId: string | null = null;
    let testPointId: string | null = null;

    try {
      // Grant is_certifier to host
      const { error: certError } = await supabaseAdmin
        .from('profiles')
        .update({ is_certifier: true })
        .eq('id', hostProfileId);
      if (certError) throw new Error(`is_certifier set failed: ${certError.message}`);

      // Story + #understanding point + listener position=agree
      const { data: storyData, error: storyError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: hostProfileId,
          content: 'P804A test story content. #understanding #st1',
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
          statement: 'P804A test: to verify understanding the listener paraphrases.',
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

      // Advance state: speaker (host=checker) has already submitted rating 10.
      // Listener sees the responder rating drawer.
      await advanceSessionState(session.sessionCode, {
        ratingPhase: 'waiting',
        checkerName: 'P804A Speaker',
        checkerIsCreator: true,
        checkerRating: 10,
        checkerSubmitted: true,
        responderRating: undefined,
        responderSubmitted: false,
        explainBackRatings: [],
        explainBackRound: 0,
        ratingInitiatedBy: 'P804A Speaker',
        ratingInitiatedByIsCreator: true,
        selectedStoryId: testStoryId,
        selectedStoryData: {
          id: testStoryId,
          content: 'P804A test story content. #understanding #st1',
          authorId: hostProfileId,
          authorName: 'P804A Speaker',
          authorSlug: 'p804a-speaker',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [
            {
              id: testPointId,
              statement: 'P804A test: to verify understanding the listener paraphrases.',
              tags: ['understanding', 'st1', 'v1'],
              systemTags: ['understanding', 'st1', 'v1'],
            },
          ],
        },
        livePositionsJoiner: { [testPointId]: 'agree' },
        checksCount: 0,
        checksTotal: 7,
      });

      // Listener clicks "Rate 10" then "Submit" → handleRatingSubmit fires →
      // bothSubmitted=true → isPerfect=true. Pre-fix: no badge code runs anywhere.
      // Post-fix: certifier (host) client inserts badge_points row.
      await expect(session.guest.page.getByRole('button', { name: 'Rate 10' })).toBeVisible({ timeout: 15000 });
      await session.guest.page.getByRole('button', { name: 'Rate 10' }).click();
      await session.guest.page.getByRole('button', { name: 'Submit' }).click();

      // Host enters perfect celebration phase
      await expect(
        session.host.page.getByText(/understood.*perfectly/i)
      ).toBeVisible({ timeout: 15000 });

      // CANARY 1 (UI symptom): amber badge headline must appear on host's screen.
      // Pre-fix: rating-phase 'perfect' branch in live-mode-view.tsx (line 3074)
      // doesn't render this — it only exists in free-mode-success.tsx.
      await expect(
        session.host.page.getByText(/Badge point earned!/i)
      ).toBeVisible({ timeout: 8000 });

      // CANARY 2 (DB symptom): badge_points row must exist for the listener.
      const { data: badges, error: badgeReadError } = await supabaseAdmin
        .from('badge_points')
        .select('id, user_id, verified_by, point_id, position')
        .eq('user_id', guestProfileId)
        .eq('point_id', testPointId);
      expect(badgeReadError).toBeNull();
      expect(badges).toHaveLength(1);
      expect(badges?.[0].verified_by).toBe(hostProfileId);
      expect(badges?.[0].position).toBe('agree');
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

  // ──────────────────────────────────────────────────────────────────────────
  // PATH B — Rating-phase 10/10 after one paraphrase round (Bug 1)
  // ──────────────────────────────────────────────────────────────────────────
  test('Path B: badge fires when rating-phase reaches 10/10 after one paraphrase round', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P804B Speaker',
      guestName: 'P804B Listener',
    });

    const hostProfileId = session.host.user.user.id;
    const guestProfileId = session.guest.user.user.id;

    let testStoryId: string | null = null;
    let testPointId: string | null = null;

    try {
      const { error: certError } = await supabaseAdmin
        .from('profiles')
        .update({ is_certifier: true })
        .eq('id', hostProfileId);
      if (certError) throw new Error(`is_certifier set failed: ${certError.message}`);

      const { data: storyData, error: storyError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: hostProfileId,
          content: 'P804B test story content. #understanding #st1',
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
          statement: 'P804B test: to verify understanding the listener paraphrases.',
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

      // Advance state: one paraphrase round happened (checker had previously rated 7).
      // Now speaker re-rated to 10 (after listener's explain-back), waiting on listener.
      await advanceSessionState(session.sessionCode, {
        ratingPhase: 'waiting',
        checkerName: 'P804B Speaker',
        checkerIsCreator: true,
        checkerRating: 10,
        checkerSubmitted: true,
        responderRating: undefined,
        responderSubmitted: false,
        explainBackRatings: [7],
        explainBackRound: 1,
        explainBackDone: true,
        speakerSawExplainBackDone: true,
        ratingInitiatedBy: 'P804B Speaker',
        ratingInitiatedByIsCreator: true,
        selectedStoryId: testStoryId,
        selectedStoryData: {
          id: testStoryId,
          content: 'P804B test story content. #understanding #st1',
          authorId: hostProfileId,
          authorName: 'P804B Speaker',
          authorSlug: 'p804b-speaker',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [
            {
              id: testPointId,
              statement: 'P804B test: to verify understanding the listener paraphrases.',
              tags: ['understanding', 'st1', 'v1'],
              systemTags: ['understanding', 'st1', 'v1'],
            },
          ],
        },
        livePositionsJoiner: { [testPointId]: 'agree' },
        checksCount: 0,
        checksTotal: 7,
      });

      // Listener completes the round at 10
      await expect(session.guest.page.getByRole('button', { name: 'Rate 10' })).toBeVisible({ timeout: 15000 });
      await session.guest.page.getByRole('button', { name: 'Rate 10' }).click();
      await session.guest.page.getByRole('button', { name: 'Submit' }).click();

      await expect(
        session.host.page.getByText(/understood.*perfectly/i)
      ).toBeVisible({ timeout: 15000 });

      // CANARY 1 (UI): amber badge headline must appear after one explain-back round
      await expect(
        session.host.page.getByText(/Badge point earned!/i)
      ).toBeVisible({ timeout: 8000 });

      // CANARY 2 (DB): badge_points row must exist
      const { data: badges, error: badgeReadError } = await supabaseAdmin
        .from('badge_points')
        .select('id, user_id, verified_by, point_id, position')
        .eq('user_id', guestProfileId)
        .eq('point_id', testPointId);
      expect(badgeReadError).toBeNull();
      expect(badges).toHaveLength(1);
      expect(badges?.[0].verified_by).toBe(hostProfileId);
      expect(badges?.[0].position).toBe('agree');
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

  // ──────────────────────────────────────────────────────────────────────────
  // PATH C — Free-mode 10/10 with multi-#understanding story (Bug 2)
  // ──────────────────────────────────────────────────────────────────────────
  test('Path C: badge fires for the agreed-on point when story has multiple #understanding versions', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P804C Speaker',
      guestName: 'P804C Listener',
    });

    const hostProfileId = session.host.user.user.id;
    const guestProfileId = session.guest.user.user.id;

    let testStoryId: string | null = null;
    let testPointV1Id: string | null = null;
    let testPointV2Id: string | null = null;

    try {
      const { error: certError } = await supabaseAdmin
        .from('profiles')
        .update({ is_certifier: true })
        .eq('id', hostProfileId);
      if (certError) throw new Error(`is_certifier set failed: ${certError.message}`);

      const { data: storyData, error: storyError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: hostProfileId,
          content: 'P804C test story content. #understanding #st1',
          tags: ['understanding', 'st1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (storyError || !storyData) throw new Error(`story create failed: ${storyError?.message}`);
      testStoryId = storyData.id;

      // v1 point — listener will DISAGREE
      const { data: v1Data, error: v1Error } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P804C v1 (older): to verify understanding the listener paraphrases.',
          first_validator_id: hostProfileId,
          tags: ['understanding', 'st1', 'v1'],
          system_tags: ['understanding', 'st1', 'v1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (v1Error || !v1Data) throw new Error(`v1 create failed: ${v1Error?.message}`);
      testPointV1Id = v1Data.id;

      // v2 point — listener will AGREE (this is the latest, should be badged)
      const { data: v2Data, error: v2Error } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P804C v2 (latest): to verify understanding the listener paraphrases.',
          first_validator_id: hostProfileId,
          tags: ['understanding', 'st1', 'v2'],
          system_tags: ['understanding', 'st1', 'v2'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (v2Error || !v2Data) throw new Error(`v2 create failed: ${v2Error?.message}`);
      testPointV2Id = v2Data.id;

      // Link both to story
      const { error: spError } = await supabaseAdmin
        .from('story_points')
        .insert([
          { story_id: testStoryId, point_id: testPointV1Id, author_id: hostProfileId },
          { story_id: testStoryId, point_id: testPointV2Id, author_id: hostProfileId },
        ]);
      if (spError) throw new Error(`story_points failed: ${spError.message}`);

      // Listener: disagree on v1, agree on v2
      const { error: posError } = await supabaseAdmin
        .from('point_positions')
        .upsert([
          { user_id: guestProfileId, point_id: testPointV1Id, position: 'disagree' },
          { user_id: guestProfileId, point_id: testPointV2Id, position: 'agree' },
        ]);
      if (posError) throw new Error(`point_positions failed: ${posError.message}`);

      // Advance state to free-phase 'unlocked' with listener's slider already at 10.
      // CRITICAL: v1 is FIRST in the points array — pre-fix .find() will pick v1
      // (the disagreed one) and skip the badge entirely.
      await advanceSessionState(session.sessionCode, {
        freePhase: 'unlocked',
        freeSliderJoiner: 10,
        selectedStoryId: testStoryId,
        selectedStoryData: {
          id: testStoryId,
          content: 'P804C test story content. #understanding #st1',
          authorId: hostProfileId,
          authorName: 'P804C Speaker',
          authorSlug: 'p804c-speaker',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [
            {
              // v1 — disagreed by listener — placed first to ensure .find() picks it
              id: testPointV1Id,
              statement: 'P804C v1 (older): to verify understanding the listener paraphrases.',
              tags: ['understanding', 'st1', 'v1'],
              systemTags: ['understanding', 'st1', 'v1'],
            },
            {
              // v2 — agreed by listener — should win after fix (latest version)
              id: testPointV2Id,
              statement: 'P804C v2 (latest): to verify understanding the listener paraphrases.',
              tags: ['understanding', 'st1', 'v2'],
              systemTags: ['understanding', 'st1', 'v2'],
            },
          ],
        },
        livePositionsJoiner: {
          [testPointV1Id]: 'disagree',
          [testPointV2Id]: 'agree',
        },
        checkerIsCreator: true,
        checkerName: 'P804C Speaker',
        checksCount: 1,
        checksTotal: 7,
      });

      // Host slides to 10 → handleFreeRoundComplete → badge check.
      // Pre-fix: .find() picks v1 → listenerPosition='disagree' → guard fails → no badge.
      // Post-fix: latest-version picker selects v2 → listenerPosition='agree' → badge for v2.
      await expect(session.host.page.locator('[role="slider"]')).toBeVisible({ timeout: 15000 });
      await session.host.page.locator('[role="slider"]').focus();
      for (let i = 0; i < 10; i++) {
        await session.host.page.keyboard.press('ArrowRight');
      }

      await expect(
        session.host.page.getByText(/understood.*perfectly/i)
      ).toBeVisible({ timeout: 15000 });

      // CANARY 1 (UI): amber badge headline visible (badgePointEarned=true)
      await expect(
        session.host.page.getByText(/Badge point earned!/i)
      ).toBeVisible({ timeout: 8000 });

      // CANARY 2 (DB): badge_points row exists, AND it's for v2 (the agreed one)
      const { data: badges, error: badgeReadError } = await supabaseAdmin
        .from('badge_points')
        .select('id, user_id, verified_by, point_id, position')
        .eq('user_id', guestProfileId);
      expect(badgeReadError).toBeNull();
      expect(badges).toHaveLength(1);
      expect(badges?.[0].point_id).toBe(testPointV2Id);
      expect(badges?.[0].verified_by).toBe(hostProfileId);
      expect(badges?.[0].position).toBe('agree');
    } finally {
      if (testPointV1Id) {
        await supabaseAdmin.from('badge_points').delete().eq('point_id', testPointV1Id);
        await supabaseAdmin.from('point_positions').delete().eq('point_id', testPointV1Id);
        await supabaseAdmin.from('story_points').delete().eq('point_id', testPointV1Id);
        await supabaseAdmin.from('points').delete().eq('id', testPointV1Id);
      }
      if (testPointV2Id) {
        await supabaseAdmin.from('badge_points').delete().eq('point_id', testPointV2Id);
        await supabaseAdmin.from('point_positions').delete().eq('point_id', testPointV2Id);
        await supabaseAdmin.from('story_points').delete().eq('point_id', testPointV2Id);
        await supabaseAdmin.from('points').delete().eq('id', testPointV2Id);
      }
      if (testStoryId) {
        await supabaseAdmin.from('stories').delete().eq('id', testStoryId);
      }
      await supabaseAdmin.from('profiles').update({ is_certifier: false }).eq('id', hostProfileId);
      await session.cleanup();
    }
  });
});
