/**
 * @file canary-point-submit-rls.spec.ts
 *
 * Canary: Reproduces RLS failure on letter_point_responses.
 *
 * Root cause: expiry check removed from getLetterForReadingByToken (p683 migration)
 * but NOT from claim_letter_delivery. When invitation_expires_at is in the past:
 *   - getLetterForReadingByToken → succeeds (no expiry check) — letter loads
 *   - claimLetterDelivery → silently fails (expiry check still present) — receiver_profile_id stays NULL
 *   - P714: effectiveToken = undefined (isAuthenticated = true)
 *   - submitPointResponse(deliveryId, ...) → RLS requires receiver_profile_id = auth.uid() → FAILS
 *
 * This test MUST FAIL until the bug is fixed.
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

test.describe('Canary: point submit RLS bug (receiver_profile_id NULL)', () => {
  test.describe.configure({ timeout: 90_000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;
  let deliveryId: string;
  let deliveryToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'RLS Canary Sender' });
    receiver = await createTestUser({ name: 'RLS Canary Receiver' });

    // Doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'RLS Canary Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Story + point
    const story = await createTestStory(sender.user.id, {
      title: 'RLS Canary Story',
      content: 'Avoiding hard conversations destroys trust faster than having them.',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, {
      statement: 'Clear disagreement beats polite silence.',
    });
    pointId = point.id;

    await supabaseAdmin.from('doc_stories').insert({ doc_id: docId, story_id: storyId, position: 0 });
    await supabaseAdmin.from('story_points').insert({ story_id: storyId, point_id: pointId });
    await supabaseAdmin.from('point_positions').insert({
      point_id: pointId, user_id: sender.user.id, position: 'agree',
    });

    // Story version
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    // Sealed letter
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

    // Snapshot with 1 point (triggers D36: story-rate first, then point-engage)
    await supabaseAdmin.from('letter_story_snapshots').insert({
      letter_id: letterId,
      story_id: storyId,
      version_id: version.id,
      position: 0,
      visibility: 'public',
      point_config: {
        storyTitle: 'RLS Canary Story',
        storyText: 'Avoiding hard conversations destroys trust faster than having them.',
        points: [{ id: pointId, text: 'Clear disagreement beats polite silence.', authorPosition: 'agree' }],
      },
    });

    // Delivery: receiver_profile_id NULL + invitation ALREADY EXPIRED.
    // getLetterForReadingByToken has NO expiry check (removed in p683 migration).
    // claim_letter_delivery STILL has expiry check — so claim silently fails.
    // Result: letter loads OK, receiver_profile_id stays NULL, submitPointResponse hits RLS.
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: null,
        invitation_expires_at: new Date(Date.now() - 60 * 1000).toISOString(), // ← 1 min in the past
      })
      .select('id, invitation_token')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryId = delivery.id;
    deliveryToken = delivery.invitation_token;

    // Prediction
    await supabaseAdmin.from('letter_predictions').insert({
      letter_id: letterId,
      delivery_id: deliveryId,
      story_id: storyId,
      prediction: 7,
    });
  });

  test.afterAll(async () => {
    await supabaseAdmin.from('story_verifications').delete()
      .eq('story_id', storyId).eq('source', 'letter');
    await supabaseAdmin.from('letter_point_responses').delete().eq('delivery_id', deliveryId);
    await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
    await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
    await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
    await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    await supabaseAdmin.from('point_positions').delete().eq('point_id', pointId).eq('user_id', sender.user.id);
    await supabaseAdmin.from('story_points').delete().eq('story_id', storyId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    await deleteTestStory(storyId);
    await deleteTestPoint(pointId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestUser(sender.user.id);
    await deleteTestUser(receiver.user.id);
  });

  test('authenticated receiver can submit a point position without RLS error', async ({ page }) => {
    // NOTE: This test covers the happy path — open letter → rate → submit position.
    // The "Open the Letter" click calls updateDeliveryStatusByToken, which sets
    // receiver_profile_id on the delivery before point submission. As a result, this
    // test does NOT cover the broken edge case (authenticated user + receiver_profile_id
    // still NULL), which was the actual P716 failure mode. That edge case is now
    // unreachable in production because P716 reverts P714's token-strip: authenticated
    // users use the SECURITY DEFINER token RPC (no RLS), not the authed RLS path.
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Inject auth as receiver (authenticated user with a session)
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // Open the letter
    const openBtn = page.getByRole('button', { name: /open the letter/i });
    await expect(openBtn).toBeVisible({ timeout: 15_000 });
    await openBtn.click();

    // D36: 1-point story → story-rate phase first
    // Rating drawer should appear
    const ratingGroup = page.locator('[role="group"][aria-label="Rating scale from 0 to 10"]');
    await expect(ratingGroup).toBeVisible({ timeout: 15_000 });

    // Rate the story (click 7)
    const rateBtn = page.locator('button[aria-label="Rate 7"]');
    await expect(rateBtn).toBeVisible({ timeout: 5_000 });
    await rateBtn.click();

    // Submit the rating
    const submitRatingBtn = page.locator('button:has-text("Submit")').first();
    await expect(submitRatingBtn).toBeEnabled({ timeout: 3_000 });
    await submitRatingBtn.click();

    // Gap reveal shown — click Next or Continue (label varies by branch)
    const continueBtn = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    await expect(continueBtn).toBeVisible({ timeout: 10_000 });
    await continueBtn.click();

    // Point-engage phase: position buttons (Agree / Unsure / Disagree)
    const positionBtn = page.locator('button:has-text("Agree"), button:has-text("Unsure"), button:has-text("Disagree")').first();
    await expect(positionBtn).toBeVisible({ timeout: 10_000 });
    await positionBtn.click();

    // Submit the point position
    const submitPointBtn = page.locator('button:has-text("Submit")').first();
    await expect(submitPointBtn).toBeEnabled({ timeout: 3_000 });
    await submitPointBtn.click();

    // Check receiver_profile_id on the delivery (did claim run?)
    const { data: deliveryAfter } = await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_profile_id')
      .eq('id', deliveryId)
      .single();
    console.log('[CANARY] delivery.receiver_profile_id after flow:', deliveryAfter?.receiver_profile_id);

    // Check if a row was written to letter_point_responses
    const { data: responses } = await supabaseAdmin
      .from('letter_point_responses')
      .select('id, position')
      .eq('delivery_id', deliveryId)
      .eq('point_id', pointId);
    console.log('[CANARY] letter_point_responses rows:', responses?.length ?? 0);

    // All console errors captured
    console.log('[CANARY] All console errors:', JSON.stringify(consoleErrors));

    // Filter for RLS errors
    const rlsErrors = consoleErrors.filter(
      (e) => e.includes('security policy') || e.includes('Failed to submit point') || e.includes('letter_point_responses') || e.includes('db-error')
    );

    expect(rlsErrors, `RLS/DB errors in console:\n${rlsErrors.join('\n')}`).toHaveLength(0);
    expect(responses?.length, 'Expected 1 row in letter_point_responses').toBe(1);
  });
});
