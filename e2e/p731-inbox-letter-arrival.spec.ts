/**
 * @file p731-inbox-letter-arrival.spec.ts
 * @description Canary: letter sent to known user appears in their inbox without claiming.
 *
 * Bug: add_recipient_to_sealed_letter creates delivery with receiver_profile_id=NULL.
 * get_inbox_items Branch 1 requires receiver_profile_id=v_user_id — so the letter is
 * invisible in inbox until claim_letter_delivery is called (recipient opens via link).
 *
 * Fix: look up profiles by email at send time, set receiver_profile_id if found.
 * This test FAILS with current code and PASSES after the fix.
 */

import { test, expect } from '@playwright/test';
import {
  createTestUser,
  setTestSession,
  deleteTestUser,
  type TestUser,
} from './helpers/test-user';
import { supabaseAdmin } from './helpers/supabase-admin';
import {
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

test.describe('P731: Inbox letter arrival after send', () => {
  test.describe.configure({ timeout: 60000 });

  let sender: TestUser;
  let receiver: TestUser;
  let letterId: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P731 Sender' });
    receiver = await createTestUser({ name: 'P731 Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P731 Test Letter', owner_id: sender.user.id })
      .select('id')
      .single();
    docId = doc!.id;

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
    await sealTestLetter(letterId);

    // Simulate what add_recipient_to_sealed_letter does:
    // creates delivery with receiver_email set but receiver_profile_id = NULL.
    await createTestDelivery(letterId, {
      receiverEmail: receiver.email,
      receiverProfileId: undefined, // NULL — this is the bug trigger
      status: 'sent',
    });
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.user.id);
    if (receiver) await deleteTestUser(receiver.user.id);
  });

  test('sent letter appears in recipient inbox without recipient having opened the link', async ({ page }) => {
    await setTestSession(page, receiver.email);
    await page.goto('/letters?tab=inbox');
    await page.waitForLoadState('networkidle');

    // Recipient should see the letter in inbox — currently FAILS because
    // receiver_profile_id is NULL and get_inbox_items Branch 1 skips it.
    await expect(page.getByText('P731 Test Letter')).toBeVisible({ timeout: 6000 });
  });
});
