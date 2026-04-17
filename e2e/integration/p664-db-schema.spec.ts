/**
 * @file p664-db-schema.spec.ts
 * @description P664: RPC signature migration verification for add_recipient_to_sealed_letter.
 *
 * Verifies:
 * 1. RPC accepts p_receiver_name parameter (new in P664 migration)
 * 2. receiver_name is stored in letter_deliveries when provided
 * 3. Backward compat: omitting p_receiver_name still works (DEFAULT NULL)
 *
 * Two-client pattern (mandatory):
 * - supabaseAdmin: schema-level setup and verification (bypasses RLS)
 * - user-scoped clients: RPC calls as the sender (authenticated)
 *
 * If tests fail: run `./scripts/migrate.sh` to apply P664 migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function signIn(email: string): Promise<string> {
  const tempClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await tempClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

// ===========================================================================
// P664: add_recipient_to_sealed_letter — receiver_name parameter
// ===========================================================================

test.describe('P664 Migration — add_recipient_to_sealed_letter receiver_name', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let docId: string;
  let letterId: string;
  const cleanupDeliveryIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P664 receiver-name sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P664 receiver-name test doc', owner_id: sender.user.id })
      .select('id')
      .single();
    docId = doc!.id;

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
    letterId = letter!.id;
  });

  test.afterAll(async () => {
    for (const id of cleanupDeliveryIds) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('id', id);
    }
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('RPC accepts p_receiver_name and stores it in letter_deliveries', async () => {
    const token = await signIn(sender.email);
    const userClient = makeUserClient(token);

    const { data: deliveryId, error } = await userClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_email: 'p664-named-recipient@gmail.com',
      p_receiver_name: 'Alex Rivera',
    });

    expect(error, `RPC rejected p_receiver_name: ${error?.message}`).toBeNull();

    // Verify receiver_name was stored
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id, receiver_email, receiver_name, status')
      .eq('id', deliveryId as string)
      .single();

    expect(delivery).not.toBeNull();
    expect(delivery!.receiver_name).toBe('Alex Rivera');
    expect(delivery!.receiver_email).toBe('p664-named-recipient@gmail.com');
    expect(delivery!.status).toBe('sent');
    cleanupDeliveryIds.push(delivery!.id);
  });

  test('backward compat: omitting p_receiver_name still works (NULL default)', async () => {
    const token = await signIn(sender.email);
    const userClient = makeUserClient(token);

    const { data: deliveryId, error } = await userClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_email: 'p664-anon-recipient@gmail.com',
      // p_receiver_name omitted — should default to NULL
    });

    expect(error, `Backward compat failed: ${error?.message}`).toBeNull();

    // Verify receiver_name is NULL (default)
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id, receiver_name')
      .eq('id', deliveryId as string)
      .single();

    expect(delivery!.receiver_name).toBeNull();
    cleanupDeliveryIds.push(delivery!.id);
  });

  test('explicit null p_receiver_name stored as NULL', async () => {
    const token = await signIn(sender.email);
    const userClient = makeUserClient(token);

    const { data: deliveryId, error } = await userClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_email: 'p664-null-name-recipient@gmail.com',
      p_receiver_name: null,
    });

    expect(error, `Explicit null p_receiver_name failed: ${error?.message}`).toBeNull();

    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id, receiver_name')
      .eq('id', deliveryId as string)
      .single();

    expect(delivery!.receiver_name).toBeNull();
    cleanupDeliveryIds.push(delivery!.id);
  });
});
