/**
 * @file p796-badge-certification.spec.ts
 *
 * Canary test for P796: badge_points never inserted despite all conditions met.
 *
 * Failing assertion (pre-fix): amber "Badge point earned!" headline is absent
 * and badge_points table is empty after a valid 10/10 certification round.
 *
 * Setup:
 * - Host = certifier (is_certifier=true)
 * - Test story + #understanding point created in DB
 * - Listener (guest) has position='agree' on the understanding point
 * - Session state advanced to freePhase='unlocked' with both conditions met
 * - Host keyboard-slides to 10 → triggers handleFreeRoundComplete
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState } from './helpers/test-realtime';

test.describe('P796: badge certification on 10/10 round', () => {
  test('smoke: page loads on /live', async ({ page }) => {
    await page.goto('/live');
    await expect(page).not.toHaveURL(/error/);
  });

  test('badge_points row inserted and amber headline shown when certifier hits 10/10 with agreeing listener', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P796 Certifier',
      guestName: 'P796 Listener',
    });

    const hostProfileId = session.host.user.user.id;
    const guestProfileId = session.guest.user.user.id;

    let testStoryId: string | null = null;
    let testPointId: string | null = null;

    try {
      // ── 1. Grant is_certifier to host ──────────────────────────────────────
      const { error: certError } = await supabaseAdmin
        .from('profiles')
        .update({ is_certifier: true })
        .eq('id', hostProfileId);
      if (certError) throw new Error(`Failed to set is_certifier: ${certError.message}`);

      // ── 2. Create test story (title was dropped in P701) ───────────────────
      const { data: storyData, error: storyError } = await supabaseAdmin
        .from('stories')
        .insert({
          author_id: hostProfileId,
          content: 'P796 test story content. #understanding #st1',
          tags: ['understanding', 'st1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (storyError || !storyData) throw new Error(`Failed to create test story: ${storyError?.message}`);
      testStoryId = storyData.id;

      // ── 3. Create test #understanding point ───────────────────────────────
      const { data: pointData, error: pointError } = await supabaseAdmin
        .from('points')
        .insert({
          statement: 'P796 test: to verify understanding the listener paraphrases.',
          first_validator_id: hostProfileId,
          tags: ['understanding', 'st1', 'v1'],
          system_tags: ['understanding', 'st1', 'v1'],
          visibility: 'private',
        })
        .select('id')
        .single();
      if (pointError || !pointData) throw new Error(`Failed to create test point: ${pointError?.message}`);
      testPointId = pointData.id;

      // ── 4. Link point to story ─────────────────────────────────────────────
      const { error: spError } = await supabaseAdmin
        .from('story_points')
        .insert({ story_id: testStoryId, point_id: testPointId, author_id: hostProfileId });
      if (spError) throw new Error(`Failed to link story_points: ${spError.message}`);

      // ── 5. Record listener's agree position on the understanding point ──────
      const { error: posError } = await supabaseAdmin
        .from('point_positions')
        .upsert({
          user_id: guestProfileId,
          point_id: testPointId,
          position: 'agree',
        });
      if (posError) throw new Error(`Failed to set point_positions: ${posError.message}`);

      // ── 6. Advance session to freePhase='unlocked' with all badge pre-conditions ──
      // freeSliderJoiner=10 puts the guest's slider at 10 in confirmedLiveState.
      // livePositionsJoiner records the guest's in-session position on the point.
      // selectedStoryData carries the #understanding point so the primary path fires.
      await advanceSessionState(session.sessionCode, {
        freePhase: 'unlocked',
        freeSliderJoiner: 10,
        selectedStoryId: testStoryId,
        selectedStoryData: {
          id: testStoryId,
          content: 'P797 test story content. #understanding #st1',
          authorId: hostProfileId,
          authorName: 'P797 Certifier',
          authorSlug: 'p797-certifier',
          authorAvatarColor: '#888888',
          authorAvatarUrl: null,
          authorRole: 'Founder',
          authorEarsCount: 0,
          authorHasPledged: false,
          visibility: 'private',
          points: [
            {
              id: testPointId,
              statement: 'P797 test: to verify understanding the listener paraphrases.',
              tags: ['understanding', 'st1', 'v1'],
              systemTags: ['understanding', 'st1', 'v1'],
            },
          ],
        },
        livePositionsJoiner: { [testPointId]: 'agree' },
        checkerIsCreator: true,
        checkerName: 'P796 Certifier',
        checksCount: 1,
        checksTotal: 7,
      });

      // ── 7. Wait for host's slider to appear (freePhase=unlocked renders it) ──
      await expect(session.host.page.locator('[role="slider"]')).toBeVisible({ timeout: 15000 });

      // ── 8. Host slides to 10 → triggers handleFreeRoundComplete ─────────────
      await session.host.page.locator('[role="slider"]').focus();
      for (let i = 0; i < 10; i++) {
        await session.host.page.keyboard.press('ArrowRight');
      }

      // ── 9. Success screen must appear ────────────────────────────────────────
      await expect(
        session.host.page.getByText(/understood.*perfectly/i)
      ).toBeVisible({ timeout: 15000 });

      // ── 10. CANARY: amber badge headline must appear on the success screen ───
      // This FAILS now (badgePointEarned=false) and PASSES after the fix.
      await expect(
        session.host.page.getByText(/Badge point earned!/i)
      ).toBeVisible({ timeout: 8000 });

      // ── 11. DB CANARY: badge_points row must exist ────────────────────────────
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
      // ── Cleanup ───────────────────────────────────────────────────────────────
      if (testPointId) {
        await supabaseAdmin.from('badge_points').delete().eq('point_id', testPointId);
        await supabaseAdmin.from('point_positions').delete().eq('point_id', testPointId).eq('user_id', guestProfileId);
        await supabaseAdmin.from('story_points').delete().eq('point_id', testPointId);
        await supabaseAdmin.from('points').delete().eq('id', testPointId);
      }
      if (testStoryId) {
        await supabaseAdmin.from('stories').delete().eq('id', testStoryId);
      }
      // Revoke certifier status
      await supabaseAdmin.from('profiles').update({ is_certifier: false }).eq('id', hostProfileId);
      await session.cleanup();
    }
  });
});
