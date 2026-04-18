/**
 * Integration test: seal_and_send_letter populates receiver_profile_id.
 *
 * Migration: 20260418210000_p757_set_receiver_profile_id_on_seal.sql
 *
 * Covers:
 *   1. Sealing to a registered email → receiver_profile_id populated immediately
 *   2. Sealing to an unknown email → receiver_profile_id remains NULL (no error)
 *   3. Sealed letter with known receiver appears in inbox without opening email link
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

test.describe('P757: seal_and_send_letter sets receiver_profile_id', () => {
  let senderUserId: string;
  let senderEmail: string;
  let senderClient: ReturnType<typeof createClient>;

  let receiverUserId: string;
  let receiverEmail: string;
  let receiverClient: ReturnType<typeof createClient>;

  let docId: string;
  // Sealed in beforeAll for scenarios 1 and 3
  let letterIdForKnown: string;
  // Sealed per-test for scenario 2
  let letterIdForUnknown: string | undefined;

  test.beforeAll(async () => {
    senderEmail = generateTestEmail();
    const { user: sender } = await createTestUser({ email: senderEmail });
    senderUserId = sender.id;
    senderClient = await makeUserClient(senderEmail);

    receiverEmail = generateTestEmail();
    const { user: receiver } = await createTestUser({ email: receiverEmail });
    receiverUserId = receiver.id;
    receiverClient = await makeUserClient(receiverEmail);

    const { data: doc, error: docError } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P757 seal profile_id test doc', owner_id: senderUserId })
      .select('id')
      .single();
    if (docError) throw new Error(`clarity_docs insert failed: ${docError.message}`);
    docId = doc!.id;

    // Pre-seal a letter to the known receiver — used by scenarios 1 and 3
    const { data: letter, error: letterError } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: senderUserId, mode: 'one-to-one' })
      .select('id')
      .single();
    if (letterError) throw new Error(`clarity_letters insert failed: ${letterError.message}`);
    letterIdForKnown = letter!.id;

    const { error: sealError } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterIdForKnown,
      p_predictions: [],
      p_deliveries: [{ receiver_email: receiverEmail, receiver_name: 'Receiver' }],
    });
    if (sealError) throw new Error(`seal_and_send_letter failed in beforeAll: ${sealError.message}`);
  });

  test.afterAll(async () => {
    if (letterIdForKnown) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterIdForKnown);
    if (letterIdForUnknown) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterIdForUnknown);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (senderUserId) await supabaseAdmin.auth.admin.deleteUser(senderUserId);
    if (receiverUserId) await supabaseAdmin.auth.admin.deleteUser(receiverUserId);
  });

  test('scenario 1: sealing to a registered email sets receiver_profile_id', async () => {
    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_profile_id')
      .eq('letter_id', letterIdForKnown)
      .eq('receiver_email', receiverEmail)
      .single();

    expect(deliveryError, `delivery query failed: ${deliveryError?.message}`).toBeNull();
    expect(delivery?.receiver_profile_id).toBe(receiverUserId);
  });

  test('scenario 2: sealing to an unknown email leaves receiver_profile_id NULL', async () => {
    const unknownEmail = `unknown-${Date.now()}@nowhere-p757.invalid`;

    const { data: letter, error: letterError } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: senderUserId, mode: 'one-to-one' })
      .select('id')
      .single();
    expect(letterError, `letter insert failed: ${letterError?.message}`).toBeNull();
    letterIdForUnknown = letter!.id;

    const { data, error } = await senderClient.rpc('seal_and_send_letter', {
      p_letter_id: letterIdForUnknown,
      p_predictions: [],
      p_deliveries: [{ receiver_email: unknownEmail, receiver_name: 'Nobody' }],
    });

    expect(error, `seal_and_send_letter failed: ${error?.message}`).toBeNull();
    expect(data).toBe(true);

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_profile_id')
      .eq('letter_id', letterIdForUnknown)
      .eq('receiver_email', unknownEmail)
      .single();

    expect(deliveryError, `delivery query failed: ${deliveryError?.message}`).toBeNull();
    expect(delivery?.receiver_profile_id).toBeNull();
  });

  test('scenario 3: sealed letter with known receiver appears in inbox without email link', async () => {
    // Receiver calls get_inbox_items — letter must appear without having opened the email link
    const { data: inbox, error: inboxError } = await receiverClient.rpc('get_inbox_items');

    expect(inboxError, `get_inbox_items failed: ${inboxError?.message}`).toBeNull();
    expect(Array.isArray(inbox)).toBe(true);

    const found = (inbox as { letter_id: string }[]).find(
      (item) => item.letter_id === letterIdForKnown
    );
    expect(found, `Letter ${letterIdForKnown} not found in inbox — receiver_profile_id likely NULL`).toBeDefined();
  });
});
