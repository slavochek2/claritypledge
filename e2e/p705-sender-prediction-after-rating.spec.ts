/**
 * @file p705-sender-prediction-after-rating.spec.ts
 * @description P705 canary: after an anon one-to-many token reader submits a rating,
 * the sender's prediction row must show a number — not "Pending...".
 *
 * BEFORE FIX: publicPredictions never fetched in token path → prediction stays null
 *   → JourneyToUnderstanding renders <RatingDotsPending> → "Pending" text visible.
 *
 * AFTER FIX: token path fetches getLetterForPublicReading + passes publicPredictions
 *   to <LetterReadingFlowPublic> → prediction resolves → number shown, no "Pending".
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from './helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from './helpers/test-user';
import { createTestStory, deleteTestStory } from './helpers/test-story';
import { createTestPoint, deleteTestPoint } from './helpers/test-point';

test.describe('P705: Sender prediction visible after anon token reader rates', () => {
  test.describe.configure({ timeout: 90_000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let point1Id: string;
  let letterId: string;
  let deliveryId: string;
  let deliveryToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P705 Sender' });

    const story = await createTestStory(sender.user.id, {
      title: 'P705 Prediction Test',
      content: 'Testing that sender prediction shows after anon rating submission.',
    });
    storyId = story.id;

    // Single point: open → point-engage → point-revealed → story-rate → story-revealed
    const point1 = await createTestPoint(sender.user.id, {
      statement: 'P705 Point 1: Honest feedback requires trust.',
    });
    point1Id = point1.id;

    await supabaseAdmin.from('point_positions').upsert([
      { point_id: point1Id, user_id: sender.user.id, position: 'agree' },
    ]);

    const { data: version, error: versionError } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version || versionError) throw new Error(`Story version not found: ${versionError?.message}`);

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P705 Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc || docError) throw new Error(`Doc creation failed: ${docError?.message}`);
    docId = doc.id;

    const { data: letter, error: letterError } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: doc.id,
        sender_id: sender.user.id,
        mode: 'one-to-many',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter || letterError) throw new Error(`Letter creation failed: ${letterError?.message}`);
    letterId = letter.id;

    const { error: snapshotError } = await supabaseAdmin
      .from('letter_story_snapshots')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: version.id,
        position: 0,
        visibility: 'public',
        point_config: {
          storyTitle: 'P705 Prediction Test',
          storyText: 'Testing that sender prediction shows after anon rating submission.',
          points: [
            { id: point1Id, text: 'P705 Point 1: Honest feedback requires trust.', authorPosition: 'agree' },
          ],
        },
      });
    if (snapshotError) throw new Error(`Snapshot creation failed: ${snapshotError.message}`);

    // Insert shared prediction (delivery_id=NULL = one-to-many shared)
    // This is the sender's prediction that should appear after the reader rates.
    const { error: predError } = await supabaseAdmin
      .from('letter_predictions')
      .insert({
        letter_id: letterId,
        delivery_id: null,
        story_id: storyId,
        prediction: 7,
      });
    if (predError) throw new Error(`Prediction insert failed: ${predError.message}`);

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({ letter_id: letterId, receiver_email: null, receiver_profile_id: null, status: 'sent' })
      .select('id, invitation_token')
      .single();
    if (!delivery || deliveryError) throw new Error(`Delivery creation failed: ${deliveryError?.message}`);
    deliveryId = delivery.id;
    deliveryToken = delivery.invitation_token;
  });

  test.afterAll(async () => {
    if (letterId) {
      const { data: deliveries } = await supabaseAdmin
        .from('letter_deliveries')
        .select('id')
        .eq('letter_id', letterId);
      if (deliveries?.length) {
        await supabaseAdmin
          .from('letter_point_responses')
          .delete()
          .in('delivery_id', deliveries.map((d) => d.id));
      }
      await supabaseAdmin
        .from('letter_predictions')
        .delete()
        .eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (point1Id) await deleteTestPoint(point1Id);
    if (storyId) await deleteTestStory(storyId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('smoke: anon token recipient sees cover page', async ({ page }) => {
    await page.goto(`/letter/${deliveryId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /open the letter/i })).toBeVisible({ timeout: 10_000 });
  });

  test('P705: sender prediction shows number (not Pending) after completing full flow', async ({ page }) => {
    await page.goto(`/letter/${deliveryId}?token=${deliveryToken}`);
    await page.waitForLoadState('networkidle');

    // Step 1: Open letter
    const openBtn = page.getByRole('button', { name: /open the letter/i });
    await expect(openBtn).toBeVisible({ timeout: 10_000 });
    await openBtn.click();

    // With 1 point the letter skips point-engage and opens directly to story-rate.

    // Step 2: story-rate phase — select rating 7, submit
    const ratingBtn = page.getByRole('button', { name: /^rate 7$/i });
    await expect(ratingBtn).toBeVisible({ timeout: 10_000 });
    await ratingBtn.click();

    const submitRatingBtn = page.getByRole('button', { name: /^submit$/i });
    await expect(submitRatingBtn).toBeEnabled({ timeout: 5_000 });
    await submitRatingBtn.click();

    // Step 4: story-revealed phase — sender prediction must NOT show "Pending..."
    // Before fix: prediction=null → JourneyToUnderstanding renders RatingDisplayPending → "Pending..." visible
    // After fix:  prediction=7 → JourneyToUnderstanding renders RatingDisplay → number visible, no "Pending..."
    //
    // The JourneyToUnderstanding component renders two rows for the listener (isChecker=false):
    //   - "Your confidence": the reader's rating (always shown after submission)
    //   - "{senderName}'s belief": the prediction (shows "Pending..." when prediction=null)
    // We wait for the belief row to appear (any content) and assert it does NOT contain "Pending..."

    // Wait for story-revealed phase to render (JourneyToUnderstanding appears)
    const beliefRow = page.getByText("P705 Sender's belief");
    await expect(beliefRow).toBeVisible({ timeout: 10_000 });

    // The sibling RatingDisplayPending span renders "Pending..." — must be absent
    const pendingSpan = page.getByText('Pending...', { exact: true });
    await expect(pendingSpan).not.toBeVisible({ timeout: 5_000 });
  });
});
