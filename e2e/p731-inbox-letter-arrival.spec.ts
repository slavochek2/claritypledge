/**
 * @file p731-inbox-letter-arrival.spec.ts
 * @description Regression: letter sent to known user appears in their inbox without claiming.
 *
 * Bug: add_recipient_to_sealed_letter created delivery with receiver_profile_id=NULL.
 * get_inbox_items Branch 1 requires receiver_profile_id=v_user_id — letter was invisible
 * in inbox until claim_letter_delivery was called (recipient opened via link).
 *
 * Fix: RPC now looks up profiles by email and sets receiver_profile_id at insert time.
 * This test calls the actual RPC as the sender, so the fix is what makes it pass.
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
  sealTestLetter,
  deleteTestLetter,
} from './helpers/test-letter';

async function createAuthClientForUser(email: string) {
  const { createClient: mkClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempClient = mkClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await tempClient.auth.signInWithPassword({
    email,
    password: 'test-password-12345',
  });
  if (!data.session) throw new Error(`signInWithPassword failed for ${email}`);
  return mkClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

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

    // Call the actual RPC as the sender — the fix makes it set receiver_profile_id.
    const senderClient = await createAuthClientForUser(sender.email);
    const { error } = await senderClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_email: receiver.email,
    });
    if (error) throw new Error(`RPC failed: ${error.message}`);

    // Pin the root cause fix: delivery must have receiver_profile_id set immediately.
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_profile_id')
      .eq('letter_id', letterId)
      .single();
    if (delivery?.receiver_profile_id !== receiver.user.id) {
      throw new Error(
        `receiver_profile_id not set at insert time: got ${delivery?.receiver_profile_id}`
      );
    }
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

    await expect(page.getByText('P731 Test Letter')).toBeVisible({ timeout: 6000 });
  });
});
