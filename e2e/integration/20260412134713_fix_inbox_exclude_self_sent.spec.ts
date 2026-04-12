/**
 * Integration test: get_inbox_items excludes self-sent letters.
 *
 * Migration: 20260412134713_fix_inbox_exclude_self_sent.sql
 * Purpose: Verify the `AND cl.sender_id != p_user_id` filter works —
 *   letters sent and received by the same user must NOT appear in inbox.
 *
 * Note: get_inbox_items has an auth gate (p_user_id = auth.uid()) that
 *   rejects service-role calls. All RPC calls use a user-scoped client.
 *   Data setup (inserts) uses supabaseAdmin to bypass RLS.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

const TEST_PASSWORD = 'test-password-12345';

async function makeUserClient(email: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await tempClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

test.describe('Migration: fix_inbox_exclude_self_sent — self-sent letters excluded from inbox', () => {
  let userId: string;
  let userEmail: string;
  let userClient: ReturnType<typeof createClient>;

  // Track created rows for cleanup
  let docId: string | undefined;
  let letterId: string | undefined;
  let deliveryId: string | undefined;

  test.beforeAll(async () => {
    userEmail = generateTestEmail();
    const { user } = await createTestUser({ email: userEmail });
    userId = user.id;
    userClient = await makeUserClient(userEmail);
  });

  test.afterAll(async () => {
    // Clean up in reverse dependency order
    if (deliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
  });

  test('get_inbox_items returns empty array for new user (baseline)', async () => {
    const { data, error } = await userClient.rpc('get_inbox_items', {
      p_user_id: userId,
    });

    expect(error, `get_inbox_items failed: ${error?.message}`).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });

  test('self-sent letter does not appear in inbox', async () => {
    // Insert test data via service role (bypasses RLS)
    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'Self-send test doc', owner_id: userId })
      .select('id')
      .single();
    expect(docError, `clarity_docs insert failed: ${docError?.message}`).toBeNull();
    docId = doc!.id;

    const { data: letter, error: letterError } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: userId, mode: 'one-to-one' })
      .select('id')
      .single();
    expect(letterError, `clarity_letters insert failed: ${letterError?.message}`).toBeNull();
    letterId = letter!.id;

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({ letter_id: letterId, receiver_profile_id: userId })
      .select('id')
      .single();
    expect(deliveryError, `letter_deliveries insert failed: ${deliveryError?.message}`).toBeNull();
    deliveryId = delivery!.id;

    // Call via user-scoped client — auth gate passes, self-sent filter applied
    const { data, error } = await userClient.rpc('get_inbox_items', {
      p_user_id: userId,
    });

    expect(error).toBeNull();

    const items = data as Array<{ letter_id: string }>;
    const selfSentItem = items.find((item) => item.letter_id === letterId);

    expect(
      selfSentItem,
      `Self-sent letter ${letterId} appeared in inbox — sender_id != p_user_id filter not applied`
    ).toBeUndefined();
  });
});
