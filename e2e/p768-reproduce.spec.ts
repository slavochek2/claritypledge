/**
 * @file p768-reproduce.spec.ts
 * @description P768 canary — re-opening a letter with an existing
 *   letter_point_responses row must NOT surface a re-submit path for
 *   that point. Under the current bug, useLetterReadingState does not
 *   rehydrate prior positions from DB on mount, so the UI enters
 *   `point-engage` phase for already-answered points. The user can then
 *   click Submit, which calls submitPointResponse.insert() and hits a
 *   409 duplicate-key error on `letter_point_responses_unique`.
 *
 * Fix track: Track 1 (immutable audit). Prior responses must be
 *   rehydrated on mount so phase transitions to `point-revealed` for
 *   answered points — no Submit button appears, no 409 fires.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

test.describe('P768: letter submit does not 409 on re-open', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let pointAId: string;
  let pointBId: string;
  let letterId: string;
  let deliveryId: string;
  let deliveryToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P768 Sender' });
    receiver = await createTestUser({ name: 'P768 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P768 Canary Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P768 canary story',
      content: 'Story used to exercise point-engage rehydration.',
    });
    storyId = story.id;

    // Two points — initialPhase returns 'point-engage' for 2+ visible points (D36).
    const pointA = await createTestPoint(sender.user.id, {
      statement: 'P768 canary point A.',
    });
    const pointB = await createTestPoint(sender.user.id, {
      statement: 'P768 canary point B.',
    });
    pointAId = pointA.id;
    pointBId = pointB.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });
    await supabaseAdmin.from('story_points').insert([
      { story_id: storyId, point_id: pointAId, author_id: sender.user.id },
      { story_id: storyId, point_id: pointBId, author_id: sender.user.id },
    ]);

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (version) {
      // point_config mirrors the enriched shape the seal_and_send_letter RPC
      // (P642) writes. Raw inserts bypass that RPC, so without populating
      // point_config here getVisiblePointCount() returns 0 and initialPhase()
      // returns 'story-rate' instead of 'point-engage' — making the canary
      // unable to exercise the bug. See point-engage vs. story-rate (D36).
      await supabaseAdmin.from('letter_story_snapshots').insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: version.id,
        position: 0,
        visibility: 'public',
        point_config: {
          storyText: 'Story used to exercise point-engage rehydration.',
          points: [
            { id: pointAId, text: 'P768 canary point A.', hidden: false, visibility: 'public' },
            { id: pointBId, text: 'P768 canary point B.', hidden: false, visibility: 'public' },
          ],
          order: [pointAId, pointBId],
          hidden: [],
        },
      });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: receiver.user.id,
        invitation_expires_at: expiresAt,
      })
      .select('id, invitation_token')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryId = delivery.id;
    deliveryToken = delivery.invitation_token;

    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      delivery_id: deliveryId,
      story_id: storyId,
      prediction: 3,
    });

    // SEED: prior responses for BOTH points — simulates "user already submitted
    // every point, now re-opens". With the fix, seedStoryWithPriorPositions
    // advances currentPointIndex to the last point AND flips phase to
    // point-revealed (landed point is answered). Without the fix, positions
    // start empty, phase is point-engage for pointA → enabled Submit visible.
    await supabaseAdmin.from('letter_point_responses').insert([
      { delivery_id: deliveryId, point_id: pointAId, position: 'agree' },
      { delivery_id: deliveryId, point_id: pointBId, position: 'disagree' },
    ]);
  });

  test.afterAll(async () => {
    if (deliveryId) {
      await supabaseAdmin.from('letter_point_responses').delete().eq('delivery_id', deliveryId);
    }
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (pointAId) await deleteTestPoint(pointAId);
    if (pointBId) await deleteTestPoint(pointBId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  test('re-opening with prior response does NOT show point-engage Submit (no 409 possible)', async ({ page }) => {
    // Collect console errors throughout the flow.
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${letterId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // Open the letter.
    const openBtn = page
      .getByRole('button', { name: /open the letter|open/i })
      .first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();

    // Let phase render settle — D36 anti-point lead means the first-visible
    // point for a 2+ point story is rendered first. Under the bug that is
    // the already-answered pointA in point-engage phase.
    await page.waitForLoadState('networkidle');

    // Symptom assertion: with prior responses for every visible point, the UI
    // must land on `point-revealed` for the last point (which is already
    // answered). That phase renders a "Next" button. Pre-fix positions start
    // empty → phase stays `point-engage` for pointA → "Next" button never
    // rendered → FAIL. Post-fix seedStoryWithPriorPositions advances phase to
    // `point-revealed` → "Next" rendered → PASS.
    const nextBtn = page.getByRole('button', { name: 'Next', exact: true });
    await expect(
      nextBtn,
      'After re-open with all points answered, expected "Next" button from point-revealed phase — not point-engage',
    ).toBeVisible({ timeout: 5000 });

    // Belt-and-suspenders: no 409 / duplicate-key error should have fired
    // during load either. This would catch a variant fix that keeps the
    // Submit button visible but makes the service idempotent — not the
    // chosen Track 1 path.
    const dupErrors = [...consoleErrors, ...pageErrors].filter(
      (msg) =>
        msg.includes('409') ||
        msg.includes('duplicate key') ||
        msg.includes('letter_point_responses_unique'),
    );
    expect(
      dupErrors,
      'No 409 / duplicate-key errors should appear on re-open',
    ).toEqual([]);
  });
});
