/**
 * @file p732-inbox-results-on-first-step.spec.ts
 * @description Canary for P732: delivery must reach 'in_progress' after recipient submits step 1.
 *
 * Bug: useLetterReadingState never calls updateDeliveryStatus('in_progress') inside
 * submitPointPosition. The only place it fires is nextStory() at the story-0→1 transition —
 * which single-story letters never hit. Result: delivery stays 'opened' through all
 * intermediate steps; sender's inbox shows nothing until full completion.
 *
 * get_inbox_items gates the sender's result row on:
 *   completed_at IS NOT NULL OR status = 'in_progress'
 * So the row is invisible to the sender during active reading.
 *
 * This test proves the bug: recipient submits first point answer → delivery status
 * should be 'in_progress' but remains 'opened'.
 *
 * After the fix: updateDeliveryStatus('in_progress') fires on first submitPointPosition call.
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
import {
  createFullTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P732: Delivery reaches in_progress on first step', () => {
  test.describe.configure({ timeout: 90000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let point1Id: string;
  let point2Id: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P732 Sender' });
    receiver = await createTestUser({ name: 'P732 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P732 Test Letter', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      content: 'P732 test story content for reading flow.',
    });
    storyId = story.id;

    // 2 points → initialPhase = 'point-engage' (anti-point lead, 2+ visible points)
    const p1 = await createTestPoint(sender.user.id, storyId, { statement: 'P732 first point' });
    const p2 = await createTestPoint(sender.user.id, storyId, { statement: 'P732 second point' });
    point1Id = p1.id;
    point2Id = p2.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: version.id, prediction: 6, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    await deleteTestPoint(point2Id);
    await deleteTestPoint(point1Id);
    await deleteTestStory(storyId);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await deleteTestUser(receiver.user.id);
    await deleteTestUser(sender.user.id);
  });

  test('delivery status becomes in_progress after recipient submits first point answer', async ({ page }) => {
    // Recipient opens the letter
    await setTestSession(page, receiver.email);
    await page.goto(`/letter/${deliveryId}`);
    await page.waitForLoadState('networkidle');

    // Click "Open the Letter" on the cover screen
    await page.getByText('Open the Letter').click();
    await page.waitForLoadState('networkidle');

    // Recipient is now at point-engage phase (2-point letter = anti-point lead)
    // Submit first position answer — click "Agree"
    await page.getByRole('button', { name: 'Agree' }).first().click();
    await page.waitForLoadState('networkidle');

    // Check delivery status in DB — should be 'in_progress', currently stays 'opened'
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .select('status')
      .eq('id', deliveryId)
      .single();

    // BUG: this assertion FAILS — status is 'opened', not 'in_progress'
    // FIXED: updateDeliveryStatus('in_progress') fires on first submitPointPosition
    expect(delivery?.status).toBe('in_progress');
  });
});
