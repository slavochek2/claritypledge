/**
 * Integration test: self-sends are blocked at seal and claim.
 *
 * Migration: 20260412135402_fix_block_self_send.sql
 *
 * Covers:
 *   1. seal_and_send_letter raises exception when receiver_email = sender's email
 *   2. claim_letter_delivery returns 'cannot_claim_own_letter' when auth.uid() = sender_id
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

test.describe('Migration: fix_block_self_send — self-sends blocked at seal and claim', () => {
  let senderUserId: string;
  let senderEmail: string;
  let senderClient: ReturnType<typeof createClient>;

  // IDs for cleanup
  let docId: string | undefined;
  let letterId: string | undefined;

  test.beforeAll(async () => {
    senderEmail = generateTestEmail();
    const { user } = await createTestUser({ email: senderEmail });
    senderUserId = user.id;
    senderClient = await makeUserClient(senderEmail);

    // Create a clarity_doc + draft letter owned by the sender
    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'Self-send block test doc', owner_id: senderUserId })
      .select('id')
      .single();
    if (docError) throw new Error(`clarity_docs insert failed: ${docError.message}`);
    docId = doc!.id;

    const { data: letter, error: letterError } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: senderUserId, mode: 'one-to-one' })
      .select('id')
      .single();
    if (letterError) throw new Error(`clarity_letters insert failed: ${letterError.message}`);
    letterId = letter!.id;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (senderUserId) await supabaseAdmin.auth.admin.deleteUser(senderUserId);
  });

  test('seal_and_send_letter rejects delivery to sender own email', async () => {
    const { data, error } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: [{ receiver_email: senderEmail, receiver_name: 'Myself' }],
    });

    // Expect a DB exception (PGRST error or P0001)
    expect(
      error,
      'Expected an error when sender sends to their own email, got none'
    ).not.toBeNull();
    expect(error!.message).toContain('Cannot send a letter to yourself');
    expect(data).toBeNull();

    // Confirm the letter is still draft (rollback happened)
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .select('status')
      .eq('id', letterId)
      .single();
    expect(letter?.status).toBe('draft');
  });

  test('claim_letter_delivery returns cannot_claim_own_letter for sender', async () => {
    // Manually insert a delivery bypassing the seal (service role), to test claim guard independently
    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({ letter_id: letterId, receiver_email: 'other@example.com' })
      .select('id, invitation_token')
      .single();
    expect(deliveryError, `Delivery insert failed: ${deliveryError?.message}`).toBeNull();

    // Force the letter to 'sealed' so claim_letter_delivery can find it
    await supabaseAdmin
      .from('clarity_letters')
      .update({ status: 'sealed', sealed_at: new Date().toISOString() })
      .eq('id', letterId);

    // Sender tries to claim — should be blocked
    const { data, error } = await senderClient.rpc('claim_letter_delivery', {
      p_token: delivery!.invitation_token,
    });

    expect(error).toBeNull();
    expect(data?.error).toBe('cannot_claim_own_letter');

    // Cleanup delivery
    await supabaseAdmin.from('letter_deliveries').delete().eq('id', delivery!.id);

    // Reset letter to draft for cleanup consistency
    await supabaseAdmin
      .from('clarity_letters')
      .update({ status: 'draft', sealed_at: null })
      .eq('id', letterId);
  });
});
