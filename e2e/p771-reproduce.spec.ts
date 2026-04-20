/**
 * @file p771-reproduce.spec.ts
 * @description P771 canary — multi-point letter where only later points have
 *   prior DB responses must NOT surface a re-submit path for answered points.
 *
 *   Scenario: 2-point letter, only pointB (idx 1) is pre-answered. User flows
 *   through pointA (unanswered) normally. On advancing from story-revealed,
 *   advanceFromStoryReveal must detect that pointB is already answered and emit
 *   phase='remaining-point-revealed' — NOT 'remaining-point-engage'.
 *
 *   Pre-fix: unconditional `phase: 'remaining-point-engage'` → UI shows Submit
 *   for pointB → INSERT hits UNIQUE(delivery_id, point_id) → 409.
 *   Post-fix: isPointAnswered guard → phase='remaining-point-revealed' → Next
 *   button visible, no Submit, no 409.
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

test.describe('P771: partial-rehydration 409 — only later points pre-answered', () => {
  test.describe.configure({ timeout: 90000 });

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
    sender = await createTestUser({ name: 'P771 Sender' });
    receiver = await createTestUser({ name: 'P771 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({
        owner_id: sender.user.id,
        title: 'P771 Canary Doc',
        visibility: 'public',
      })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P771 canary story',
      content: 'Story used to exercise partial-rehydration 409 fix.',
    });
    storyId = story.id;

    const pointA = await createTestPoint(sender.user.id, {
      statement: 'P771 canary point A (unanswered).',
    });
    const pointB = await createTestPoint(sender.user.id, {
      statement: 'P771 canary point B (pre-answered).',
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
      await supabaseAdmin.from('letter_story_snapshots').insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: version.id,
        position: 0,
        visibility: 'public',
        point_config: {
          storyText: 'Story used to exercise partial-rehydration 409 fix.',
          points: [
            { id: pointAId, text: 'P771 canary point A (unanswered).', hidden: false, visibility: 'public' },
            { id: pointBId, text: 'P771 canary point B (pre-answered).', hidden: false, visibility: 'public' },
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

    // SEED: only pointB is pre-answered. pointA has no response.
    // This is the partial-rehydration scenario that P768's canary does NOT cover.
    await supabaseAdmin.from('letter_point_responses').insert([
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

  test('advancing past unanswered pointA does NOT show point-engage for pre-answered pointB', async ({ page }) => {
    // Track POST requests to letter_point_responses after the user engages pointA.
    const postRequestsAfterPointA: string[] = [];

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
    const openBtn = page.getByRole('button', { name: /open the letter|open/i }).first();
    await expect(openBtn).toBeVisible({ timeout: 10000 });
    await openBtn.click();
    await page.waitForLoadState('networkidle');

    // Phase: point-engage for pointA (first unanswered point).
    // Submit pointA position.
    const agreeBtn = page.getByRole('button', { name: /agree/i }).first();
    await expect(agreeBtn).toBeVisible({ timeout: 10000 });
    await agreeBtn.click();

    const submitBtn = page.getByRole('button', { name: /submit/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 5000 });

    await submitBtn.click();
    await page.waitForLoadState('networkidle');

    // Register listener AFTER pointA's POST has completed (networkidle).
    // Any subsequent POST to letter_point_responses would be for pointB — which
    // is pre-answered and must never be re-submitted.
    page.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        req.url().includes('letter_point_responses')
      ) {
        postRequestsAfterPointA.push(req.url());
      }
    });

    // Now in story-rate or story-revealed. Rate the story if needed.
    const ratingBtn = page.getByRole('button', { name: /^[1-5]$/ }).first();
    if (await ratingBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ratingBtn.click();
      const submitRatingBtn = page.getByRole('button', { name: /submit|done|next/i }).first();
      if (await submitRatingBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitRatingBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // Advance from story-revealed → should go to remaining-point-revealed for pointB.
    const advanceBtn = page.getByRole('button', { name: /next|advance|continue/i }).first();
    if (await advanceBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await advanceBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // SYMPTOM ASSERTION: The UI must show "Next" (remaining-point-revealed phase),
    // NOT a Submit button (remaining-point-engage phase would show Submit for pointB).
    // Pre-fix: advanceFromStoryReveal emits remaining-point-engage → Submit visible → 409.
    // Post-fix: isPointAnswered detects pointB answered → remaining-point-revealed → Next visible.
    const nextBtn = page.getByRole('button', { name: 'Next', exact: true });
    await expect(
      nextBtn,
      'After advancing past unanswered pointA, pre-answered pointB must appear in revealed phase (Next button) — not engage phase (Submit button)',
    ).toBeVisible({ timeout: 5000 });

    // No POST to letter_point_responses should have fired for pointB.
    expect(
      postRequestsAfterPointA,
      'No POST to letter_point_responses should fire after pointA submit — pointB is pre-answered',
    ).toHaveLength(0);

    // No 409 or duplicate-key errors.
    const dupErrors = [...consoleErrors, ...pageErrors].filter(
      (msg) =>
        msg.includes('409') ||
        msg.includes('duplicate key') ||
        msg.includes('letter_point_responses_unique'),
    );
    expect(
      dupErrors,
      'No 409 / duplicate-key errors should appear during the flow',
    ).toEqual([]);
  });
});
