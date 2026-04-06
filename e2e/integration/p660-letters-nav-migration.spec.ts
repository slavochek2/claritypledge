/**
 * @file p660-letters-nav-migration.spec.ts
 * @description P660: Letters Navigation Architecture — DB migration verification
 *
 * Verifies:
 * 1. Schema: `read_at` column exists on `letter_deliveries`
 * 2. RPC: `mark_inbox_item_read` — receiver can mark, sender can mark their responses
 * 3. RPC: `add_recipient_to_sealed_letter` — sender can add, non-sender cannot
 * 4. RLS: receiver sees only their own deliveries, sender sees their own letters
 *
 * Two-client pattern (mandatory):
 * - supabaseAdmin: schema-level checks (bypasses RLS)
 * - user-scoped clients: RLS and RPC assertions
 *
 * If tests fail: run `./scripts/migrate.sh` to apply P660 migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

/** Build an authenticated Supabase client from a JWT access token. */
function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Sign in and return access token. */
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
// 1. Schema — read_at column on letter_deliveries
// ===========================================================================

test.describe('P660 Migration — read_at column', () => {
  test.setTimeout(30000);

  test('letter_deliveries.read_at column exists', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .select('read_at')
      .limit(1);

    expect(
      error,
      'letter_deliveries.read_at missing — run ./scripts/migrate.sh to apply P660 migration'
    ).toBeNull();
  });

  test('read_at defaults to NULL on new delivery rows', async () => {
    let sender: TestUser | undefined;
    let docId: string | undefined;
    let letterId: string | undefined;
    let deliveryId: string | undefined;

    try {
      sender = await createTestUser({ name: 'P660 read_at default sender' });

      // Create a doc for the letter
      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ title: 'P660 read_at test doc', owner_id: sender.user.id })
        .select('id')
        .single();
      docId = doc!.id;

      // Create a letter
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

      // Create a delivery without setting read_at
      const { data: delivery, error } = await supabaseAdmin
        .from('letter_deliveries')
        .insert({
          letter_id: letterId,
          receiver_email: 'p660-test-default@gmail.com',
          status: 'sent',
        })
        .select('id, read_at')
        .single();

      deliveryId = delivery!.id;
      expect(error).toBeNull();
      expect(delivery!.read_at).toBeNull();
    } finally {
      if (deliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
      if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
      if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
      if (sender) await deleteTestUser(sender.user.id);
    }
  });
});

// ===========================================================================
// 2. RPC — mark_inbox_item_read
// ===========================================================================

test.describe('P660 Migration — mark_inbox_item_read RPC', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let receiver: TestUser;
  let thirdParty: TestUser;
  let docId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P660 mark-read sender' });
    receiver = await createTestUser({ name: 'P660 mark-read receiver' });
    thirdParty = await createTestUser({ name: 'P660 mark-read third party' });

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P660 mark-read test doc', owner_id: sender.user.id })
      .select('id')
      .single();
    docId = doc!.id;

    // Create sealed letter
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

    // Create completed delivery to receiver
    const { data: delivery } = await supabaseAdmin
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
    deliveryId = delivery!.id;
  });

  test.afterAll(async () => {
    if (deliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (thirdParty) await deleteTestUser(thirdParty.user.id);
    if (receiver) await deleteTestUser(receiver.user.id);
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('receiver can mark their delivery as read', async () => {
    // Reset read_at to NULL first
    await supabaseAdmin.from('letter_deliveries').update({ read_at: null }).eq('id', deliveryId);

    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient.rpc('mark_inbox_item_read', {
      p_delivery_id: deliveryId,
    });

    expect(error, `Receiver failed to mark as read: ${error?.message}`).toBeNull();

    // Verify read_at was set
    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('read_at')
      .eq('id', deliveryId)
      .single();

    expect(data!.read_at).not.toBeNull();
  });

  test('sender can mark delivery as read (for response notifications)', async () => {
    // Reset read_at
    await supabaseAdmin.from('letter_deliveries').update({ read_at: null }).eq('id', deliveryId);

    const token = await signIn(sender.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient.rpc('mark_inbox_item_read', {
      p_delivery_id: deliveryId,
    });

    expect(error, `Sender failed to mark as read: ${error?.message}`).toBeNull();

    // Verify read_at was set
    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('read_at')
      .eq('id', deliveryId)
      .single();

    expect(data!.read_at).not.toBeNull();
  });

  test('third party cannot mark someone else\'s delivery as read', async () => {
    // Reset read_at
    await supabaseAdmin.from('letter_deliveries').update({ read_at: null }).eq('id', deliveryId);

    const token = await signIn(thirdParty.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient.rpc('mark_inbox_item_read', {
      p_delivery_id: deliveryId,
    });

    // Should fail — third party is neither sender nor receiver
    expect(error).not.toBeNull();

    // Verify read_at is still NULL
    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('read_at')
      .eq('id', deliveryId)
      .single();

    expect(data!.read_at).toBeNull();
  });

  test('marking already-read item is idempotent (no error)', async () => {
    // Set read_at first
    const now = new Date().toISOString();
    await supabaseAdmin.from('letter_deliveries').update({ read_at: now }).eq('id', deliveryId);

    const token = await signIn(receiver.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient.rpc('mark_inbox_item_read', {
      p_delivery_id: deliveryId,
    });

    // Should succeed without error (idempotent)
    expect(error, `Idempotent mark-as-read failed: ${error?.message}`).toBeNull();
  });
});

// ===========================================================================
// 3. RPC — add_recipient_to_sealed_letter
// ===========================================================================

test.describe('P660 Migration — add_recipient_to_sealed_letter RPC', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let nonSender: TestUser;
  let docId: string;
  let sealedLetterId: string;
  let draftLetterId: string;
  const addedDeliveryIds: string[] = [];

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P660 add-recipient sender' });
    nonSender = await createTestUser({ name: 'P660 add-recipient non-sender' });

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P660 add-recipient test doc', owner_id: sender.user.id })
      .select('id')
      .single();
    docId = doc!.id;

    // Create sealed letter
    const { data: sealedLetter } = await supabaseAdmin
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
    sealedLetterId = sealedLetter!.id;

    // Create draft letter (for negative test — cannot add recipient to draft)
    const { data: draftLetter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'draft',
      })
      .select('id')
      .single();
    draftLetterId = draftLetter!.id;
  });

  test.afterAll(async () => {
    // Clean up any deliveries created by the RPC
    for (const id of addedDeliveryIds) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('id', id);
    }
    if (draftLetterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', draftLetterId);
    if (sealedLetterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', sealedLetterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (nonSender) await deleteTestUser(nonSender.user.id);
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('sender can add a recipient to a sealed letter', async () => {
    const token = await signIn(sender.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: sealedLetterId,
      p_email: 'new-recipient-p660@gmail.com',
    });

    expect(error, `Sender failed to add recipient: ${error?.message}`).toBeNull();

    // Verify a delivery row was created
    const { data: deliveries } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id, letter_id, receiver_email, status')
      .eq('letter_id', sealedLetterId)
      .eq('receiver_email', 'new-recipient-p660@gmail.com');

    expect(deliveries).toHaveLength(1);
    expect(deliveries![0].status).toBe('sent');
    addedDeliveryIds.push(deliveries![0].id);
  });

  test('non-sender cannot add a recipient to someone else\'s letter', async () => {
    const token = await signIn(nonSender.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: sealedLetterId,
      p_email: 'unauthorized-add-p660@gmail.com',
    });

    // Should fail — non-sender is not the letter owner
    expect(error).not.toBeNull();

    // Verify no delivery was created
    const { data: deliveries } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', sealedLetterId)
      .eq('receiver_email', 'unauthorized-add-p660@gmail.com');

    expect(deliveries).toHaveLength(0);
  });

  test('sender cannot add a recipient to a draft letter', async () => {
    const token = await signIn(sender.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: draftLetterId,
      p_email: 'draft-add-p660@gmail.com',
    });

    // Should fail — letter must be sealed
    expect(error).not.toBeNull();
  });

  test('RPC validates email format', async () => {
    const token = await signIn(sender.email);
    const userClient = makeUserClient(token);

    const { error } = await userClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: sealedLetterId,
      p_email: 'not-an-email',
    });

    // Should fail — invalid email format
    expect(error).not.toBeNull();
  });
});

// ===========================================================================
// 4. RLS — delivery visibility scoping
// ===========================================================================

test.describe('P660 Migration — RLS delivery visibility', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let receiverA: TestUser;
  let receiverB: TestUser;
  let docId: string;
  let letterId: string;
  let deliveryAId: string;
  let deliveryBId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P660 RLS sender' });
    receiverA = await createTestUser({ name: 'P660 RLS receiver A' });
    receiverB = await createTestUser({ name: 'P660 RLS receiver B' });

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P660 RLS test doc', owner_id: sender.user.id })
      .select('id')
      .single();
    docId = doc!.id;

    // Create sealed letter
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

    // Create two deliveries to different receivers
    const { data: deliveryA } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiverA.email,
        receiver_profile_id: receiverA.user.id,
        status: 'sent',
      })
      .select('id')
      .single();
    deliveryAId = deliveryA!.id;

    const { data: deliveryB } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiverB.email,
        receiver_profile_id: receiverB.user.id,
        status: 'sent',
      })
      .select('id')
      .single();
    deliveryBId = deliveryB!.id;
  });

  test.afterAll(async () => {
    if (deliveryBId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryBId);
    if (deliveryAId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryAId);
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiverB) await deleteTestUser(receiverB.user.id);
    if (receiverA) await deleteTestUser(receiverA.user.id);
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('receiver A sees only their own delivery, not receiver B\'s', async () => {
    const token = await signIn(receiverA.email);
    const userClient = makeUserClient(token);

    const { data: deliveries, error } = await userClient
      .from('letter_deliveries')
      .select('id, receiver_email')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    // Receiver A should see only their own delivery
    const ids = deliveries!.map(d => d.id);
    expect(ids).toContain(deliveryAId);
    expect(ids).not.toContain(deliveryBId);
  });

  test('sender sees all deliveries for their letter', async () => {
    const token = await signIn(sender.email);
    const userClient = makeUserClient(token);

    const { data: deliveries, error } = await userClient
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    const ids = deliveries!.map(d => d.id);
    expect(ids).toContain(deliveryAId);
    expect(ids).toContain(deliveryBId);
  });

  test('receiver B cannot see receiver A\'s delivery', async () => {
    const token = await signIn(receiverB.email);
    const userClient = makeUserClient(token);

    const { data: deliveries, error } = await userClient
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    const ids = deliveries!.map(d => d.id);
    expect(ids).toContain(deliveryBId);
    expect(ids).not.toContain(deliveryAId);
  });
});
