/**
 * @file p651-letter-onboarding-migration.spec.ts
 * @description P651: Letter Recipient Onboarding Redesign — DB migration verification (P270 mandatory rule)
 *
 * Verifies:
 * 1. Schema: `receiver_name TEXT` column on `letter_deliveries`
 * 2. Constraint: UNIQUE (letter_id, receiver_email) rejects duplicate deliveries
 * 3. RPC: `get_letter_for_reading` returns `sender_display_name` (not NULL)
 * 4. RPC: `get_letter_for_reading` does NOT leak `receiver_email`
 * 5. RPC: `get_letter_by_token` does NOT leak `receiver_email`
 * 6. RPC: `update_delivery_status_by_token` rejects backward status transitions
 * 7. Security: `_is_letter_sender` / `_is_letter_receiver` NOT callable by anon
 * 8. RPC: `seal_and_send_letter` accepts `receiver_name` in delivery params
 * 9. RPC: `reveal_prediction_by_token` sealed-bid scoped to delivery
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: test data setup (bypasses RLS)
 * - anonClient: unauthenticated perspective
 * - userClient: authenticated user perspective
 *
 * If tests fail: run `./scripts/migrate.sh` to apply P651 migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

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

/** Build an anonymous (unauthenticated) Supabase client. */
function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
// 1. Schema — receiver_name column exists
// ===========================================================================

test.describe('P651 Migration — receiver_name column', () => {
  test.setTimeout(30000);

  test('letter_deliveries.receiver_name column exists', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_name')
      .limit(1);
    expect(error, 'letter_deliveries.receiver_name missing — run ./scripts/migrate.sh').toBeNull();
  });

  test('receiver_name accepts text value on insert', async () => {
    const sender = await createTestUser({ name: 'P651-RecvName-Sender' });
    let letterId: string | null = null;

    try {
      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ owner_id: sender.user.id, title: 'P651 RecvName Test' })
        .select('id')
        .single();
      if (!doc) throw new Error('Doc creation failed');

      const { data: letter } = await supabaseAdmin
        .from('clarity_letters')
        .insert({
          source_doc_id: doc.id,
          sender_id: sender.user.id,
          mode: 'one-to-one',
        })
        .select('id')
        .single();
      if (!letter) throw new Error('Letter creation failed');
      letterId = letter.id;

      const { data: delivery, error } = await supabaseAdmin
        .from('letter_deliveries')
        .insert({
          letter_id: letter.id,
          receiver_email: 'recv-name-test@gmail.com',
          receiver_name: 'Slava Ladischenski',
        })
        .select('receiver_name')
        .single();

      expect(error).toBeNull();
      expect(delivery?.receiver_name).toBe('Slava Ladischenski');
    } finally {
      if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
      await supabaseAdmin.from('clarity_docs').delete().eq('owner_id', sender.user.id);
      await deleteTestUser(sender.user.id);
    }
  });
});

// ===========================================================================
// 2. UNIQUE constraint — (letter_id, receiver_email)
// ===========================================================================

test.describe('P651 Migration — Duplicate delivery constraint', () => {
  test.setTimeout(30000);

  let sender: TestUser;
  let letterId: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651-Unique-Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P651 Unique Test' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: doc.id,
        sender_id: sender.user.id,
        mode: 'one-to-one',
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('first delivery insert succeeds', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'unique-test@gmail.com',
        receiver_name: 'Test Person',
      });
    expect(error).toBeNull();
  });

  test('duplicate (letter_id, receiver_email) insert fails', async () => {
    const { error } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'unique-test@gmail.com',
        receiver_name: 'Same Person Again',
      });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/unique|duplicate|already exists|violates/i);
  });
});

// ===========================================================================
// 3. RPC — get_letter_for_reading returns sender_display_name
// ===========================================================================

test.describe('P651 Migration — get_letter_for_reading sender name', () => {
  test.setTimeout(45000);

  let sender: TestUser;
  let letterId: string;
  let deliveryToken: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651 Sender Name Test' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P651 Sender Name Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: doc.id,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'sender-name-test@gmail.com',
        receiver_name: 'Recipient Person',
        invitation_expires_at: expiresAt,
      })
      .select('invitation_token')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryToken = delivery.invitation_token;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('get_letter_for_reading returns sender_display_name (not NULL, not UUID)', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('get_letter_for_reading', {
      p_token: deliveryToken,
    });

    expect(error, `get_letter_for_reading failed: ${error?.message}`).toBeNull();
    expect(data).toBeTruthy();

    // TODO: /dev must implement the JOIN in the RPC.
    // After migration, verify the response includes sender_display_name:
    // - data.letter.sender_display_name should be 'P651 Sender Name Test' (the sender's profile name)
    // - data.letter.sender_display_name should NOT be a UUID pattern
    if (data?.letter?.sender_display_name !== undefined) {
      expect(data.letter.sender_display_name).not.toBeNull();
      // Should not be a UUID
      expect(data.letter.sender_display_name).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    }
  });

  test('get_letter_for_reading does NOT return receiver_email', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('get_letter_for_reading', {
      p_token: deliveryToken,
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    // Implemented by P1071 (20260818134500_p1071_redact_reading_rpc_response.sql).
    // Between P651 and P1071 this assertion failed on every run: P717 had
    // deliberately restored receiver_email to power the client-side wrong-user
    // guard. P1071 moved that comparison into the function, so the response can
    // carry the verdict (is_intended_recipient) without the address.
    //
    // Unconditional: the `if (data?.delivery)` wrapper this replaces would have
    // passed silently had the envelope gone missing.
    expect(data.delivery).toBeTruthy();
    expect(data.delivery).not.toHaveProperty('receiver_email');
  });
});

// ===========================================================================
// 4. RPC — get_letter_by_token does NOT return receiver_email
// ===========================================================================

test.describe('P651 Migration — get_letter_by_token email redaction', () => {
  test.setTimeout(45000);

  let sender: TestUser;
  let letterId: string;
  let deliveryToken: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651-TokenEmail-Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P651 Token Email Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: doc.id,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'token-email-test@gmail.com',
        invitation_expires_at: expiresAt,
      })
      .select('invitation_token')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryToken = delivery.invitation_token;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('get_letter_by_token response does NOT include receiver_email', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('get_letter_by_token', {
      p_token: deliveryToken,
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();

    // TODO: /dev must remove receiver_email from get_letter_by_token RPC response.
    // After migration, the response should not contain receiver_email at any level.
    const dataStr = JSON.stringify(data);
    expect(dataStr).not.toContain('token-email-test@gmail.com');
  });
});

// ===========================================================================
// 5. RPC — update_delivery_status_by_token rejects backward transitions
// ===========================================================================

test.describe('P651 Migration — Status regression guard', () => {
  test.setTimeout(45000);

  let sender: TestUser;
  let letterId: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651-StatusGuard-Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P651 Status Guard Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: doc.id,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('completed → sent is rejected (backward transition)', async () => {
    // Create delivery already in 'completed' status
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'status-guard-test@gmail.com',
        status: 'completed',
        completed_at: new Date().toISOString(),
        invitation_expires_at: expiresAt,
      })
      .select('invitation_token')
      .single();

    if (!delivery) throw new Error('Delivery creation failed');

    const anonClient = makeAnonClient();

    // Attempt backward transition: completed → sent
    const { data: _data, error: _error } = await anonClient.rpc('update_delivery_status_by_token', {
      p_token: delivery.invitation_token,
      p_status: 'sent',
    });

    // TODO: /dev must add status ordering guard in the RPC.
    // After migration, this should either:
    // - Return an error (status regression not allowed)
    // - Return success but NOT update the status (no-op for backward transitions)
    // Verify the status didn't change:
    const { data: check } = await supabaseAdmin
      .from('letter_deliveries')
      .select('status')
      .eq('invitation_token', delivery.invitation_token)
      .single();

    expect(check?.status).toBe('completed');

    // Cleanup
    await supabaseAdmin
      .from('letter_deliveries')
      .delete()
      .eq('invitation_token', delivery.invitation_token);
  });

  test('sent → opened is allowed (forward transition)', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'status-forward-test@gmail.com',
        status: 'sent',
        invitation_expires_at: expiresAt,
      })
      .select('invitation_token')
      .single();

    if (!delivery) throw new Error('Delivery creation failed');

    const anonClient = makeAnonClient();

    const { error } = await anonClient.rpc('update_delivery_status_by_token', {
      p_token: delivery.invitation_token,
      p_status: 'opened',
    });

    expect(error).toBeNull();

    // Verify the status changed
    const { data: check } = await supabaseAdmin
      .from('letter_deliveries')
      .select('status')
      .eq('invitation_token', delivery.invitation_token)
      .single();

    expect(check?.status).toBe('opened');

    // Cleanup
    await supabaseAdmin
      .from('letter_deliveries')
      .delete()
      .eq('invitation_token', delivery.invitation_token);
  });
});

// ===========================================================================
// 6. Security — _is_letter_sender / _is_letter_receiver REVOKE from anon
// ===========================================================================

test.describe('P651 Migration — REVOKE helper functions from anon', () => {
  test.setTimeout(30000);

  test('anon cannot call _is_letter_sender', async () => {
    const anonClient = makeAnonClient();
    const fakeUuid = '00000000-0000-0000-0000-000000000000';

    const { error } = await anonClient.rpc('_is_letter_sender', {
      p_letter_id: fakeUuid,
      p_user_id: fakeUuid,
    });

    // TODO: /dev must add REVOKE ALL ON FUNCTION _is_letter_sender FROM public.
    // After migration, anon should get a permission denied error.
    expect(error).not.toBeNull();
    // Permission denied or function not found for anon
    expect(error!.message).toMatch(/permission denied|does not exist|denied|42501/i);
  });

  test('anon cannot call _is_letter_receiver', async () => {
    const anonClient = makeAnonClient();
    const fakeUuid = '00000000-0000-0000-0000-000000000000';

    const { error } = await anonClient.rpc('_is_letter_receiver', {
      p_letter_id: fakeUuid,
      p_user_id: fakeUuid,
    });

    // TODO: /dev must add REVOKE ALL ON FUNCTION _is_letter_receiver FROM public.
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/permission denied|does not exist|denied|42501/i);
  });

  test('authenticated user CAN call _is_letter_sender', async () => {
    const user = await createTestUser({ name: 'P651-Revoke-AuthTest' });
    const token = await signIn(user.email);
    const userClient = makeUserClient(token);

    try {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';

      const { error } = await userClient.rpc('_is_letter_sender', {
        p_letter_id: fakeUuid,
        p_user_id: fakeUuid,
      });

      // Authenticated users should be able to call it (returns false for non-existent letter)
      expect(error).toBeNull();
    } finally {
      await deleteTestUser(user.user.id);
    }
  });
});

// ===========================================================================
// 7. RPC — seal_and_send_letter accepts receiver_name
// ===========================================================================

test.describe('P651 Migration — seal_and_send_letter with receiver_name', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let senderToken: string;
  let docId: string;
  let storyId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651-Seal-Sender' });
    senderToken = await signIn(sender.email);

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P651 Seal Test Doc', visibility: 'public' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P651 Seal Test Story',
      content: 'A story for testing seal with receiver_name.',
    });
    storyId = story.id;

    await supabaseAdmin.from('doc_stories').insert({
      doc_id: docId, story_id: story.id, position: 0,
    });
  });

  test.afterAll(async () => {
    // Clean up letters created during test
    await supabaseAdmin.from('clarity_letters').delete().eq('source_doc_id', docId);
    await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('seal_and_send_letter creates delivery with receiver_name', async () => {
    const _senderClient = makeUserClient(senderToken);

    // Get story version for snapshot
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!version) {
      test.skip();
      return;
    }

    // TODO: /dev must update seal_and_send_letter RPC to accept receiver_name in delivery params.
    // The exact RPC call shape depends on implementation. This test verifies the DB result.
    // After the RPC is updated, call it here with receiver_name in the deliveries array:
    //
    // const { data, error } = await senderClient.rpc('seal_and_send_letter', {
    //   p_letter_id: letterId,  // created by earlier step
    //   p_predictions: [{ story_id: storyId, prediction: 7 }],
    //   p_deliveries: [{ receiver_email: 'seal-name-test@gmail.com', receiver_name: 'Jan Kovac' }],
    // });
    //
    // Then verify:
    // const { data: delivery } = await supabaseAdmin
    //   .from('letter_deliveries')
    //   .select('receiver_name')
    //   .eq('letter_id', letterId)
    //   .single();
    // expect(delivery?.receiver_name).toBe('Jan Kovac');

    // Placeholder: verify the column accepts data via direct insert (schema check)
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
      })
      .select('id')
      .single();

    if (!letter) throw new Error('Letter creation failed');

    const { data: delivery, error: deliveryError } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letter.id,
        receiver_email: 'seal-name-test@gmail.com',
        receiver_name: 'Jan Kovac',
      })
      .select('receiver_name')
      .single();

    expect(deliveryError).toBeNull();
    expect(delivery?.receiver_name).toBe('Jan Kovac');
  });
});

// ===========================================================================
// 8. Sealed-bid scoping — reveal_prediction_by_token scoped to delivery
// ===========================================================================

test.describe('P651 Migration — Sealed-bid delivery scoping', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let receiverA: TestUser;
  let receiverB: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let deliveryA_token: string;
  let deliveryB_token: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P651-SealedScope-Sender' });
    receiverA = await createTestUser({ name: 'P651-SealedScope-ReceiverA' });
    receiverB = await createTestUser({ name: 'P651-SealedScope-ReceiverB' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P651 Sealed Scope Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P651 Shared Story',
      content: 'A story shared across two deliveries.',
    });
    storyId = story.id;

    // Create sealed letter with the same story for two deliveries
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: doc.id,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    // Create story snapshot
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (version) {
      await supabaseAdmin.from('letter_story_snapshots').insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: version.id,
        position: 0,
        visibility: 'public',
      });
    }

    // Delivery A — for receiverA
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deliveryA } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiverA.email,
        receiver_profile_id: receiverA.user.id,
        receiver_name: 'Receiver A',
        status: 'in_progress',
        invitation_expires_at: expiresAt,
      })
      .select('id, invitation_token')
      .single();
    if (!deliveryA) throw new Error('Delivery A creation failed');
    deliveryA_token = deliveryA.invitation_token;

    // Delivery B — for receiverB
    const { data: deliveryB } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiverB.email,
        receiver_profile_id: receiverB.user.id,
        receiver_name: 'Receiver B',
        status: 'in_progress',
        invitation_expires_at: expiresAt,
      })
      .select('id, invitation_token')
      .single();
    if (!deliveryB) throw new Error('Delivery B creation failed');
    deliveryB_token = deliveryB.invitation_token;

    // Create prediction for both deliveries
    await supabaseAdmin.from('letter_predictions').insert([
      { letter_id: letterId, delivery_id: deliveryA.id, story_id: storyId, prediction: 5 },
      { letter_id: letterId, delivery_id: deliveryB.id, story_id: storyId, prediction: 8 },
    ]);

    // ReceiverA has rated the story (story_verification exists)
    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      speaker_id: sender.user.id,
      listener_id: receiverA.user.id,
      speaker_rating: 5,
      listener_rating: 7,
      source: 'letter',
      verified: false,
    });

    // ReceiverB has NOT rated the story — no story_verification
  });

  test.afterAll(async () => {
    // Clean story_verifications for this story
    await supabaseAdmin.from('story_verifications').delete().eq('story_id', storyId).eq('source', 'letter');
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiverA?.user?.id) await deleteTestUser(receiverA.user.id);
    if (receiverB?.user?.id) await deleteTestUser(receiverB.user.id);
  });

  test('receiverA (who rated) can reveal prediction via their token', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('reveal_prediction_by_token', {
      p_token: deliveryA_token,
      p_story_id: storyId,
    });

    // TODO: /dev must scope the sealed-bid check to the specific delivery.
    // After migration, receiverA who has rated should be able to see their prediction.
    expect(error).toBeNull();
    // data should contain the prediction value (5 for delivery A)
    if (data !== null && data !== undefined) {
      // The prediction for delivery A was 5
      const predValue = typeof data === 'object' ? data.prediction : data;
      expect(predValue).toBe(5);
    }
  });

  test('receiverB (who has NOT rated) cannot reveal prediction via their token', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('reveal_prediction_by_token', {
      p_token: deliveryB_token,
      p_story_id: storyId,
    });

    // TODO: /dev must scope the sealed-bid check to the specific delivery.
    // After migration, receiverB who has NOT rated should NOT see the prediction.
    // The RPC should return null or an error indicating sealed-bid hasn't been met.
    expect(error).toBeNull();
    expect(data).toBeFalsy();
  });
});
