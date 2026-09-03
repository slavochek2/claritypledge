/**
 * @file p686-badge-certification.spec.ts
 *
 * E2E tests for P686: Auto-certification from /live (two-party flow).
 *
 * These are two-party /live session tests. They verify:
 * 1. Happy path: certifier speaks on #understanding story, 10/10, agree position → badge earned
 * 2. Silent skip: listener has no position → standard celebration only
 * 3. Silent skip: listener has somewhat_agree → standard celebration only
 * 4. Silent skip: non-certifier is speaker → standard celebration only
 * 5. Duplicate: same (user, point) already badged → standard celebration, no badge headline
 *
 * NOTE: These tests depend on the /live celebration screen implementation.
 * Selectors marked with "// TODO: fill selector after implementation" must be
 * updated once the badge headline element is built in free-mode-success.tsx.
 *
 * ARCHITECTURE NOTE:
 * Certification is client-side (certifier's browser inserts badge_point).
 * Two-party session: host = certifier, guest = listener.
 * advanceSessionState() skips the full slider interaction to reach the 10/10 state.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTwoPartySession } from './helpers/test-session';
import { advanceSessionState, waitForUIUpdate } from './helpers/test-realtime';
import { createTestPoint as _createTestPoint, createTestPosition, deleteTestPoint as _deleteTestPoint } from './helpers/test-point';

const TOTAL_BADGE_POINTS = 9; // spec: 9 clarity points total

test.describe('P686: Badge auto-certification from /live', () => {
  test.describe.configure({ timeout: 60000 });

  // ── Helper: seed an #understanding point ────────────────────────────────
  async function seedUnderstandingPoint(firstValidatorId: string): Promise<string> {
    const { data } = await supabaseAdmin
      .from('points')
      .insert({
        statement: `P686 E2E understanding point ${Date.now()}`,
        first_validator_id: firstValidatorId,
        system_tags: ['understanding'],
      })
      .select('id')
      .single();
    return data!.id;
  }

  // ── Helper: seed a story linked to a point ──────────────────────────────
  async function seedStoryOnPoint(authorId: string, pointId: string): Promise<string> {
    const { data: story } = await supabaseAdmin
      .from('stories')
      .insert({
        content: 'P686 E2E test story for certification round',
        author_id: authorId,
        visibility: 'public',
      })
      .select('id')
      .single();
    const storyId = story!.id;
    await supabaseAdmin.from('story_points').insert({ story_id: storyId, point_id: pointId });
    return storyId;
  }

  // ── Helper: mark host as is_certifier = true ────────────────────────────
  async function setAsCertifier(profileId: string): Promise<void> {
    await supabaseAdmin.from('profiles').update({ is_certifier: true }).eq('id', profileId);
  }

  // ── Helper: simulate reaching 10/10 celebration in free-mode ────────────
  // Writes the live_state that triggers the celebration screen for both parties.
  async function advanceTo1010Celebration(sessionCode: string, storyId: string, pointId: string): Promise<void> {
    await advanceSessionState(sessionCode, {
      sessionMode: 'free',
      freePhase: 'unlocked',
      freeSliderCreator: 10,
      freeSliderJoiner: 10,
      selectedStoryId: storyId,
      selectedPointId: pointId,
      showCelebration: true,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────

  test('happy path: certifier speaking + agree position → badge point earned', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P686 Certifier',
      guestName: 'P686 Earner',
    });

    let pointId: string | null = null;
    let storyId: string | null = null;

    try {
      const hostId = session.host.user.user.id;
      const guestId = session.guest.user.user.id;

      // Seed: make host a certifier
      await setAsCertifier(hostId);

      // Seed: #understanding point
      pointId = await seedUnderstandingPoint(hostId);

      // Seed: story linked to the point
      storyId = await seedStoryOnPoint(hostId, pointId);

      // Seed: guest has 'agree' position on the point
      await createTestPosition(pointId, guestId, 'agree');

      // Advance session to 10/10 free-mode celebration state
      await advanceTo1010Celebration(session.sessionCode, storyId, pointId);

      // Wait for host (certifier's) client to show celebration
      // TODO: fill selector after implementation — badge headline element in free-mode-success.tsx
      const badgeHeadline = session.host.page.getByText(/Badge point earned/i);
      await waitForUIUpdate(session.host.page, badgeHeadline, 15000);
      await expect(badgeHeadline).toBeVisible({ timeout: 5000 });

      // Verify badge point was inserted in DB
      const { data: badgeRows } = await supabaseAdmin
        .from('badge_points')
        .select('id, position, verified_by')
        .eq('user_id', guestId)
        .eq('point_id', pointId);

      expect(badgeRows?.length).toBe(1);
      expect(badgeRows?.[0]?.position).toBe('agree');
      expect(badgeRows?.[0]?.verified_by).toBe(hostId);

      // Progress text: "N/9" visible on celebration
      await expect(session.host.page.getByText(`1/${TOTAL_BADGE_POINTS}`)).toBeVisible({ timeout: 5000 });

    } finally {
      // Cleanup badge_points before deleting session/point/users
      if (pointId) {
        await supabaseAdmin.from('badge_points').delete()
          .eq('user_id', session.guest.user.user.id)
          .eq('point_id', pointId);
        await supabaseAdmin.from('story_points').delete().eq('point_id', pointId);
        if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
        await supabaseAdmin.from('point_positions').delete()
          .eq('point_id', pointId)
          .eq('user_id', session.guest.user.user.id);
        await supabaseAdmin.from('points').delete().eq('id', pointId);
      }
      await supabaseAdmin.from('profiles').update({ is_certifier: false })
        .eq('id', session.host.user.user.id);
      await session.cleanup();
    }
  });

  test('silent skip: listener has no position → standard celebration (no badge headline)', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P686 Certifier NoPos',
      guestName: 'P686 Earner NoPos',
    });

    let pointId: string | null = null;
    let storyId: string | null = null;

    try {
      const hostId = session.host.user.user.id;

      await setAsCertifier(hostId);
      pointId = await seedUnderstandingPoint(hostId);
      storyId = await seedStoryOnPoint(hostId, pointId);
      // No position seeded for guest

      await advanceTo1010Celebration(session.sessionCode, storyId, pointId);

      // Standard celebration should show, but NO badge headline
      // Wait for celebration screen to appear
      await session.host.page.waitForTimeout(2000); // give time for celebration to render
      const badgeHeadline = session.host.page.getByText(/Badge point earned/i);
      // Badge headline must NOT appear
      await expect(badgeHeadline).not.toBeVisible({ timeout: 5000 });

      // Standard celebration text should appear
      // TODO: fill selector after implementation — check for standard celebration element
      const standardCelebration = session.host.page.getByText(/understood.*perfectly/i);
      await expect(standardCelebration).toBeVisible({ timeout: 5000 });

      // Verify no badge_point inserted in DB
      const { data: badgeRows } = await supabaseAdmin
        .from('badge_points')
        .select('id')
        .eq('user_id', session.guest.user.user.id)
        .eq('point_id', pointId);
      expect(badgeRows?.length ?? 0).toBe(0);

    } finally {
      if (pointId) {
        await supabaseAdmin.from('story_points').delete().eq('point_id', pointId);
        if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
        await supabaseAdmin.from('points').delete().eq('id', pointId);
      }
      await supabaseAdmin.from('profiles').update({ is_certifier: false })
        .eq('id', session.host.user.user.id);
      await session.cleanup();
    }
  });

  test('silent skip: listener has somewhat_agree → standard celebration only', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P686 Certifier SWA',
      guestName: 'P686 Earner SWA',
    });

    let pointId: string | null = null;
    let storyId: string | null = null;

    try {
      const hostId = session.host.user.user.id;
      const guestId = session.guest.user.user.id;

      await setAsCertifier(hostId);
      pointId = await seedUnderstandingPoint(hostId);
      storyId = await seedStoryOnPoint(hostId, pointId);

      // somewhat_agree does NOT qualify per spec
      await createTestPosition(pointId, guestId, 'somewhat_agree' as Parameters<typeof createTestPosition>[2]);

      await advanceTo1010Celebration(session.sessionCode, storyId, pointId);

      const badgeHeadline = session.host.page.getByText(/Badge point earned/i);
      await expect(badgeHeadline).not.toBeVisible({ timeout: 5000 });

      const { data: badgeRows } = await supabaseAdmin
        .from('badge_points')
        .select('id')
        .eq('user_id', guestId)
        .eq('point_id', pointId);
      expect(badgeRows?.length ?? 0).toBe(0);

    } finally {
      if (pointId) {
        await supabaseAdmin.from('point_positions').delete()
          .eq('point_id', pointId).eq('user_id', session.guest.user.user.id);
        await supabaseAdmin.from('story_points').delete().eq('point_id', pointId);
        if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
        await supabaseAdmin.from('points').delete().eq('id', pointId);
      }
      await supabaseAdmin.from('profiles').update({ is_certifier: false })
        .eq('id', session.host.user.user.id);
      await session.cleanup();
    }
  });

  test('silent skip: non-certifier is speaker → standard celebration only', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P686 NonCertifier',
      guestName: 'P686 Listener NC',
    });

    let pointId: string | null = null;
    let storyId: string | null = null;

    try {
      const hostId = session.host.user.user.id;
      const guestId = session.guest.user.user.id;

      // Host is NOT a certifier (is_certifier defaults to false)
      pointId = await seedUnderstandingPoint(hostId);
      storyId = await seedStoryOnPoint(hostId, pointId);
      await createTestPosition(pointId, guestId, 'agree');

      await advanceTo1010Celebration(session.sessionCode, storyId, pointId);

      const badgeHeadline = session.host.page.getByText(/Badge point earned/i);
      await expect(badgeHeadline).not.toBeVisible({ timeout: 5000 });

      const { data: badgeRows } = await supabaseAdmin
        .from('badge_points')
        .select('id')
        .eq('user_id', guestId)
        .eq('point_id', pointId);
      expect(badgeRows?.length ?? 0).toBe(0);

    } finally {
      if (pointId) {
        await supabaseAdmin.from('point_positions').delete()
          .eq('point_id', pointId).eq('user_id', session.guest.user.user.id);
        await supabaseAdmin.from('story_points').delete().eq('point_id', pointId);
        if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
        await supabaseAdmin.from('points').delete().eq('id', pointId);
      }
      await session.cleanup();
    }
  });

  test('duplicate: already badged → standard celebration (no second badge headline)', async ({ browser }) => {
    const session = await createTwoPartySession(browser, {
      hostName: 'P686 Certifier Dup',
      guestName: 'P686 Earner Dup',
    });

    let pointId: string | null = null;
    let storyId: string | null = null;

    try {
      const hostId = session.host.user.user.id;
      const guestId = session.guest.user.user.id;

      await setAsCertifier(hostId);
      pointId = await seedUnderstandingPoint(hostId);
      storyId = await seedStoryOnPoint(hostId, pointId);
      await createTestPosition(pointId, guestId, 'agree');

      // Pre-seed a badge_point so the duplicate path is hit
      await supabaseAdmin.from('badge_points').insert({
        user_id: guestId,
        point_id: pointId,
        verified_by: hostId,
        session_id: session.sessionId,
        position: 'agree',
        verified_at: new Date().toISOString(),
      });

      await advanceTo1010Celebration(session.sessionCode, storyId, pointId);

      // The insert will use ON CONFLICT DO NOTHING — no new badge, no headline
      const badgeHeadline = session.host.page.getByText(/Badge point earned/i);
      await expect(badgeHeadline).not.toBeVisible({ timeout: 5000 });

      // Row count must still be 1
      const { data: badgeRows } = await supabaseAdmin
        .from('badge_points')
        .select('id')
        .eq('user_id', guestId)
        .eq('point_id', pointId);
      expect(badgeRows?.length).toBe(1);

    } finally {
      if (pointId) {
        await supabaseAdmin.from('badge_points').delete()
          .eq('user_id', session.guest.user.user.id).eq('point_id', pointId);
        await supabaseAdmin.from('point_positions').delete()
          .eq('point_id', pointId).eq('user_id', session.guest.user.user.id);
        await supabaseAdmin.from('story_points').delete().eq('point_id', pointId);
        if (storyId) await supabaseAdmin.from('stories').delete().eq('id', storyId);
        await supabaseAdmin.from('points').delete().eq('id', pointId);
      }
      await supabaseAdmin.from('profiles').update({ is_certifier: false })
        .eq('id', session.host.user.user.id);
      await session.cleanup();
    }
  });
});
