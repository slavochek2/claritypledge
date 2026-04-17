/**
 * @file p690-inbox-count-list-parity.spec.ts
 * @description P690: Inbox phantom count — RLS join drops letter rows.
 *
 * Verifies that `get_inbox_items(UUID)` SECURITY DEFINER RPC:
 * 1. Exists (migration applied)
 * 2. Returns inbox rows for a receiver even when the source doc is private (not owner/public)
 * 3. Authorization gate: caller can only query their own inbox
 * 4. Count parity: result count matches the `letter_deliveries` direct count
 *
 * Canary: tests 2 and 4 FAIL before the P690 migration (RPC does not exist).
 * They PASS after the migration and `getInboxItems` rewrite.
 *
 * Two-client pattern:
 * - supabaseAdmin: schema-level setup, bypass RLS
 * - user-scoped clients: RPC assertions as authenticated callers
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
// Shared fixture
// ===========================================================================

let sender: TestUser;
let receiver: TestUser;
let thirdParty: TestUser;
let privateDocId: string;
let letterId: string;
let deliveryId: string;

test.beforeAll(async () => {
  sender = await createTestUser({ name: 'P690 sender' });
  receiver = await createTestUser({ name: 'P690 receiver' });
  thirdParty = await createTestUser({ name: 'P690 third party' });

  // Create a private clarity_doc (owned by sender, NOT public)
  // Receiver has no direct SELECT grant on private docs via clarity_docs RLS.
  // This is the exact condition that causes the phantom count bug.
  const { data: doc, error: docErr } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: 'P690 private letter doc', owner_id: sender.user.id })
    .select('id')
    .single();
  expect(docErr, `Doc create failed: ${docErr?.message}`).toBeNull();
  privateDocId = doc!.id;

  // Create sealed letter
  const { data: letter, error: letterErr } = await supabaseAdmin
    .from('clarity_letters')
    .insert({
      source_doc_id: privateDocId,
      sender_id: sender.user.id,
      mode: 'one-to-one',
      status: 'sealed',
      sealed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  expect(letterErr, `Letter create failed: ${letterErr?.message}`).toBeNull();
  letterId = letter!.id;

  // Create delivery to receiver (simulating the letter being claimed after first open)
  const { data: delivery, error: deliveryErr } = await supabaseAdmin
    .from('letter_deliveries')
    .insert({
      letter_id: letterId,
      receiver_email: receiver.email,
      receiver_profile_id: receiver.user.id,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  expect(deliveryErr, `Delivery create failed: ${deliveryErr?.message}`).toBeNull();
  deliveryId = delivery!.id;
});

test.afterAll(async () => {
  if (deliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
  if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
  if (privateDocId) await supabaseAdmin.from('clarity_docs').delete().eq('id', privateDocId);
  if (thirdParty) await deleteTestUser(thirdParty.user.id);
  if (receiver) await deleteTestUser(receiver.user.id);
  if (sender) await deleteTestUser(sender.user.id);
});

test.setTimeout(60000);

// ===========================================================================
// 1. Confirm current PostgREST inner-join drops rows (the bug)
// ===========================================================================

test.describe('P690 Bug confirmation — PostgREST join drops receiver rows', () => {
  test('PostgREST inner join on clarity_docs returns 0 rows for receiver (bug exists)', async () => {
    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    // This is the CURRENT broken query in getInboxItems
    const { data, error: _error } = await userClient
      .from('letter_deliveries')
      .select('*, clarity_letters!inner(source_doc_id, sender_id, clarity_docs!inner(title))')
      .eq('receiver_profile_id', receiver.user.id);

    // Error is also acceptable — inner join on private docs fails silently or with 0 rows
    // The key assertion: NOT 1 row returned (bug = the row is dropped)
    const rowCount = data?.length ?? 0;
    expect(rowCount).toBe(0);
  });
});

// ===========================================================================
// 2. RPC — get_inbox_items returns correct rows (the fix)
// ===========================================================================

test.describe('P690 RPC — get_inbox_items', () => {
  test('get_inbox_items returns 1 received item for receiver with 1 delivered letter', async () => {
    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    const { data, error } = await userClient.rpc('get_inbox_items', {
      p_user_id: receiver.user.id,
    });

    expect(error, `get_inbox_items failed: ${error?.message}`).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    const items = data as Array<Record<string, unknown>>;
    // Receiver has exactly 1 delivered letter — must appear in inbox
    expect(items.length).toBeGreaterThanOrEqual(1);

    const receivedItem = items.find(i => i['delivery_id'] === deliveryId);
    expect(receivedItem).toBeDefined();
    expect(receivedItem!['type']).toBe('received');
    expect(typeof receivedItem!['title']).toBe('string');
    expect((receivedItem!['title'] as string).length).toBeGreaterThan(0);
    expect(receivedItem!['title']).not.toBe('Untitled');
  });

  test('authorization gate: caller cannot query another user\'s inbox', async () => {
    const token = await signIn(thirdParty.email);
    const userClient = makeUserClient(token);

    // Third party tries to query receiver's inbox — should raise exception
    const { data, error } = await userClient.rpc('get_inbox_items', {
      p_user_id: receiver.user.id,
    });

    expect(error, 'Expected authorization error for cross-user query').not.toBeNull();
    expect(data).toBeNull();
  });

  test('count parity: RPC item count matches letter_deliveries direct count for receiver', async () => {
    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    // Get count via RPC
    const { data: rpcData, error: rpcErr } = await userClient.rpc('get_inbox_items', {
      p_user_id: receiver.user.id,
    });
    expect(rpcErr, `RPC failed: ${rpcErr?.message}`).toBeNull();

    const rpcCount = (rpcData as Array<unknown>).length;

    // Get count via direct letter_deliveries query (same logic as getUnreadLetterCount)
    const { count: directCount, error: directErr } = await userClient
      .from('letter_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_profile_id', receiver.user.id);

    expect(directErr, `Direct count failed: ${directErr?.message}`).toBeNull();

    expect(rpcCount).toBe(directCount ?? 0);
  });

  test('empty inbox: user with no sent or received letters returns empty array', async () => {
    const token = await signIn(thirdParty.email);
    const userClient = makeUserClient(token);

    // thirdParty has no sent or received letters in this fixture
    const { data, error } = await userClient.rpc('get_inbox_items', {
      p_user_id: thirdParty.user.id,
    });

    expect(error, `get_inbox_items for third party failed: ${error?.message}`).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const items = data as Array<unknown>;
    expect(items.length).toBe(0);
  });
});
