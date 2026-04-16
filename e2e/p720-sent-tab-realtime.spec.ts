/**
 * @file p720-sent-tab-realtime.spec.ts
 * @description P720: Canary test — sent tab does NOT update in real-time when delivery status changes.
 *
 * Bug: sent-tab.tsx fetches once on mount (no Supabase real-time subscription).
 * When a recipient's delivery transitions from 'sent' → 'in_progress' → 'completed',
 * the sender's Sent tab shows stale data until they manually refresh.
 *
 * This test MUST FAIL before the fix (proving the bug exists).
 * It PASSES after the fix adds a real-time subscription to sent-tab.tsx.
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
import {
  createFullTestLetter,
  deleteTestLetter,
  type TestDelivery,
} from './helpers/test-letter';

test.describe('P720: Sent tab real-time delivery status updates', () => {
  test.describe.configure({ timeout: 60_000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let delivery: TestDelivery;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P720 Sender' });
    receiver = await createTestUser({ name: 'P720 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P720 Realtime Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { title: 'P720 Test Story' });
    storyId = story.id;

    const { data: versionData } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!versionData) throw new Error('Story version not found');

    const result = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: versionData.id, prediction: 1 }],
      { email: receiver.email }
    );
    letterId = result.letter.id;
    delivery = result.delivery;
  });

  test.afterAll(async () => {
    await deleteTestLetter(letterId);
    await deleteTestStory(storyId);
    const { error } = await supabaseAdmin
      .from('clarity_docs')
      .delete()
      .eq('id', docId);
    if (error) console.error('[P720 cleanup] doc delete error:', error);
    await deleteTestUser(sender.user.id);
    await deleteTestUser(receiver.user.id);
  });

  test('smoke: sent tab loads with letter and initial delivery status', async ({ page }) => {
    await setTestSession(page, sender.email);
    await page.goto('/letters');
    await page.waitForLoadState('networkidle');

    // Switch to Sent tab if not already there
    const sentTab = page.getByRole('tab', { name: /sent/i });
    if (await sentTab.isVisible()) {
      await sentTab.click();
    }

    await expect(page.getByText('P720 Realtime Test Doc')).toBeVisible({ timeout: 10_000 });
  });

  test('sent tab updates status in real-time when delivery transitions to completed (CANARY — fails before fix)', async ({ browser }) => {
    // Open sender's /letters page and keep it open (no refresh)
    const senderContext = await browser.newContext();
    const senderPage = await senderContext.newPage();

    try {
      await setTestSession(senderPage, sender.email);
      await senderPage.goto('/letters');
      await senderPage.waitForLoadState('networkidle');

      // Switch to Sent tab
      const sentTab = senderPage.getByRole('tab', { name: /sent/i });
      if (await sentTab.isVisible()) {
        await sentTab.click();
        await senderPage.waitForLoadState('networkidle');
      }

      // Confirm initial state: 0 of 1 completed
      await expect(
        senderPage.getByText(/0 of 1 recipients? completed/i)
      ).toBeVisible({ timeout: 10_000 });

      // Simulate recipient completing the letter — update delivery in DB directly
      // (Equivalent to recipient going through all steps and submitting)
      const { error } = await supabaseAdmin
        .from('letter_deliveries')
        .update({
          status: 'completed',
          stories_rated: 1,
          completed_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);
      if (error) throw new Error(`DB update failed: ${error.message}`);

      // Sent tab should update WITHOUT a page refresh within 5 seconds.
      // BUG (P720): This assertion times out because sent-tab.tsx has no
      // real-time subscription — the UI stays stale until manual refresh.
      await expect(
        senderPage.getByText(/1 of 1 recipients? completed/i)
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await senderContext.close();
    }
  });
});
