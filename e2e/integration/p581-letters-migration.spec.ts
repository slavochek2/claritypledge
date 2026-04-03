/**
 * @file p581-letters-migration.spec.ts
 * @description P581: Clarity Letters — DB migration verification (P270 mandatory rule)
 *
 * Verifies:
 * 1. Schema: all 5 new tables exist with expected columns
 *    - clarity_letters
 *    - letter_deliveries
 *    - letter_story_snapshots
 *    - letter_predictions
 *    - letter_point_responses
 * 2. Column additions: story_verifications.source, .verified, .sort_order;
 *    clarity_sessions.source_letter_id
 * 3. RLS validation: sealed-bid on letter_predictions, write-lock on snapshots
 * 4. Token validation RPC: get_letter_by_token
 * 5. CHECK constraints: prediction/rating range 0-10
 * 6. Default values: story_verifications.source='live', .verified=true
 *
 * If tests fail: run `./scripts/migrate.sh` to apply P581 migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../src/lib/supabase-admin';
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
// 1. Schema existence — new tables
// ===========================================================================

test.describe('P581 Migration — New table schema', () => {
  test.setTimeout(30000);

  // ── clarity_letters ─────────────────────────────────────────────────────

  test('clarity_letters table exists with required columns', async () => {
    const columns = [
      'id', 'source_doc_id', 'sender_id', 'mode', 'status',
      'sealed_at', 'created_at',
    ];
    for (const col of columns) {
      const { error } = await supabaseAdmin
        .from('clarity_letters')
        .select(col)
        .limit(1);
      expect(error, `clarity_letters.${col} missing — run ./scripts/migrate.sh`).toBeNull();
    }
  });

  // ── letter_deliveries ───────────────────────────────────────────────────

  test('letter_deliveries table exists with required columns', async () => {
    const columns = [
      'id', 'letter_id', 'receiver_email', 'receiver_profile_id',
      'invitation_token', 'invitation_expires_at', 'status',
      'stories_rated', 'opened_at', 'completed_at', 'created_at',
    ];
    for (const col of columns) {
      const { error } = await supabaseAdmin
        .from('letter_deliveries')
        .select(col)
        .limit(1);
      expect(error, `letter_deliveries.${col} missing — run ./scripts/migrate.sh`).toBeNull();
    }
  });

  // ── letter_story_snapshots ──────────────────────────────────────────────

  test('letter_story_snapshots table exists with required columns', async () => {
    const columns = [
      'letter_id', 'story_id', 'version_id',
      'position', 'point_config', 'visibility',
    ];
    for (const col of columns) {
      const { error } = await supabaseAdmin
        .from('letter_story_snapshots')
        .select(col)
        .limit(1);
      expect(error, `letter_story_snapshots.${col} missing — run ./scripts/migrate.sh`).toBeNull();
    }
  });

  // ── letter_predictions ──────────────────────────────────────────────────

  test('letter_predictions table exists with required columns', async () => {
    const columns = [
      'id', 'letter_id', 'delivery_id', 'story_id',
      'prediction', 'created_at',
    ];
    for (const col of columns) {
      const { error } = await supabaseAdmin
        .from('letter_predictions')
        .select(col)
        .limit(1);
      expect(error, `letter_predictions.${col} missing — run ./scripts/migrate.sh`).toBeNull();
    }
  });

  // ── letter_point_responses ──────────────────────────────────────────────

  test('letter_point_responses table exists with required columns', async () => {
    // Security gap #5: separate forward-only position table
    const columns = [
      'id', 'delivery_id', 'point_id', 'position', 'created_at',
    ];
    for (const col of columns) {
      const { error } = await supabaseAdmin
        .from('letter_point_responses')
        .select(col)
        .limit(1);
      expect(error, `letter_point_responses.${col} missing — run ./scripts/migrate.sh`).toBeNull();
    }
  });
});

// ===========================================================================
// 2. Column additions on existing tables
// ===========================================================================

test.describe('P581 Migration — Column additions to existing tables', () => {
  test.setTimeout(30000);

  test('story_verifications.source column exists (D21)', async () => {
    const { error } = await supabaseAdmin
      .from('story_verifications')
      .select('source')
      .limit(1);
    expect(error, 'story_verifications.source missing — run ./scripts/migrate.sh').toBeNull();
  });

  test('story_verifications.verified column exists (D21)', async () => {
    const { error } = await supabaseAdmin
      .from('story_verifications')
      .select('verified')
      .limit(1);
    expect(error, 'story_verifications.verified missing — run ./scripts/migrate.sh').toBeNull();
  });

  test('story_verifications.sort_order column exists', async () => {
    const { error } = await supabaseAdmin
      .from('story_verifications')
      .select('sort_order')
      .limit(1);
    expect(error, 'story_verifications.sort_order missing — run ./scripts/migrate.sh').toBeNull();
  });

  test('clarity_sessions.source_letter_id column exists (D26)', async () => {
    const { error } = await supabaseAdmin
      .from('clarity_sessions')
      .select('source_letter_id')
      .limit(1);
    expect(error, 'clarity_sessions.source_letter_id missing — run ./scripts/migrate.sh').toBeNull();
  });
});

// ===========================================================================
// 3. Default values
// ===========================================================================

test.describe('P581 Migration — Default values', () => {
  test.setTimeout(30000);

  test('story_verifications.source defaults to "live" for new rows', async () => {
    // Insert a verification row via service_role and check defaults
    const sender = await createTestUser({ name: 'P581-Default-Sender' });
    const listener = await createTestUser({ name: 'P581-Default-Listener' });
    let verificationId: string | null = null;

    try {
      const { data, error } = await supabaseAdmin
        .from('story_verifications')
        .insert({
          speaker_id: sender.user.id,
          listener_id: listener.user.id,
          speaker_rating: 7,
          listener_rating: 5,
        })
        .select('id, source, verified')
        .single();

      expect(error).toBeNull();
      expect(data?.source).toBe('live');
      expect(data?.verified).toBe(true);
      verificationId = data?.id ?? null;
    } finally {
      if (verificationId) {
        await supabaseAdmin.from('story_verifications').delete().eq('id', verificationId);
      }
      await deleteTestUser(sender.user.id);
      await deleteTestUser(listener.user.id);
    }
  });

  test('letter_deliveries.status defaults to "sent"', async () => {
    // We need a letter to FK into. Create minimal chain via service_role.
    const sender = await createTestUser({ name: 'P581-Delivery-Default' });
    let letterId: string | null = null;

    try {
      // Create a minimal doc for the letter FK
      const { data: doc } = await supabaseAdmin
        .from('clarity_docs')
        .insert({ owner_id: sender.user.id, title: 'P581 Test Doc' })
        .select('id')
        .single();

      if (!doc) throw new Error('Failed to create test doc');

      const { data: letter } = await supabaseAdmin
        .from('clarity_letters')
        .insert({
          source_doc_id: doc.id,
          sender_id: sender.user.id,
          mode: 'one-to-one',
        })
        .select('id')
        .single();

      if (!letter) throw new Error('Failed to create test letter');
      letterId = letter.id;

      const { data: delivery, error } = await supabaseAdmin
        .from('letter_deliveries')
        .insert({ letter_id: letter.id })
        .select('status, stories_rated')
        .single();

      expect(error).toBeNull();
      expect(delivery?.status).toBe('sent');
      expect(delivery?.stories_rated).toBe(0);
    } finally {
      if (letterId) {
        await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
      }
      // doc cleanup handled by user deletion cascade or manual
      await supabaseAdmin.from('clarity_docs').delete().eq('owner_id', sender.user.id);
      await deleteTestUser(sender.user.id);
    }
  });
});

// ===========================================================================
// 4. CHECK constraints — prediction range 0-10
// ===========================================================================

test.describe('P581 Migration — CHECK constraints', () => {
  test.setTimeout(45000);

  let sender: TestUser;
  let letterId: string;
  let storyId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P581-CHECK' });

    // Minimal chain: doc → letter → story → snapshot
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P581 CHECK Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');

    const story = await createTestStory(sender.user.id, { title: 'P581 CHECK Story' });
    storyId = story.id;

    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: doc.id,
        sender_id: sender.user.id,
        mode: 'one-to-many',
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (storyId) await deleteTestStory(storyId);
    await supabaseAdmin.from('clarity_docs').delete().eq('owner_id', sender.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('prediction CHECK rejects value > 10', async () => {
    const { error } = await supabaseAdmin
      .from('letter_predictions')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        prediction: 11,
      });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/check|violates|constraint/i);
  });

  test('prediction CHECK rejects value < 0', async () => {
    const { error } = await supabaseAdmin
      .from('letter_predictions')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        prediction: -1,
      });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/check|violates|constraint/i);
  });

  test('prediction CHECK accepts valid value (0-10)', async () => {
    const { data, error } = await supabaseAdmin
      .from('letter_predictions')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        prediction: 7,
      })
      .select('id, prediction')
      .single();

    expect(error).toBeNull();
    expect(data?.prediction).toBe(7);

    // Cleanup
    if (data) {
      await supabaseAdmin.from('letter_predictions').delete().eq('id', data.id);
    }
  });
});

// ===========================================================================
// 5. RLS — Write-lock on snapshots and predictions (Security gap #6)
// ===========================================================================

test.describe('P581 Migration — RLS write-lock on immutable tables', () => {
  test.setTimeout(45000);

  let sender: TestUser;
  let receiver: TestUser;
  let senderToken: string;
  let receiverToken: string;
  let letterId: string;
  let storyId: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P581-RLS-Sender' });
    receiver = await createTestUser({ name: 'P581-RLS-Receiver' });
    senderToken = await signIn(sender.email);
    receiverToken = await signIn(receiver.email);

    // Setup: doc → story → letter → snapshot (via service_role)
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P581 RLS Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { title: 'P581 RLS Story' });
    storyId = story.id;

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
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    // Create delivery for receiver
    await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: receiver.user.id,
      });
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  test('authenticated user cannot INSERT into letter_story_snapshots (WITH CHECK false)', async () => {
    const senderClient = makeUserClient(senderToken);

    const { error } = await senderClient
      .from('letter_story_snapshots')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: '00000000-0000-0000-0000-000000000000',
        position: 0,
        visibility: 'public',
      });

    // RLS WITH CHECK (false) should reject all inserts from authenticated users
    expect(error).not.toBeNull();
    expect(error!.code).toMatch(/42501|PGRST/);
  });

  test('authenticated user cannot INSERT into letter_predictions', async () => {
    const senderClient = makeUserClient(senderToken);

    const { error } = await senderClient
      .from('letter_predictions')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        prediction: 5,
      });

    expect(error).not.toBeNull();
    expect(error!.code).toMatch(/42501|PGRST/);
  });

  test('anonymous client cannot INSERT into letter_story_snapshots', async () => {
    const anonClient = makeAnonClient();

    const { error } = await anonClient
      .from('letter_story_snapshots')
      .insert({
        letter_id: letterId,
        story_id: storyId,
        version_id: '00000000-0000-0000-0000-000000000000',
        position: 0,
        visibility: 'public',
      });

    expect(error).not.toBeNull();
  });
});

// ===========================================================================
// 6. RLS — letter_deliveries status transitions
// ===========================================================================

test.describe('P581 Migration — Delivery status transitions', () => {
  test.setTimeout(45000);

  let sender: TestUser;
  let receiver: TestUser;
  let receiverToken: string;
  let wrongUser: TestUser;
  let wrongToken: string;
  let letterId: string;
  let deliveryId: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P581-Status-Sender' });
    receiver = await createTestUser({ name: 'P581-Status-Receiver' });
    wrongUser = await createTestUser({ name: 'P581-Status-Wrong' });
    receiverToken = await signIn(receiver.email);
    wrongToken = await signIn(wrongUser.email);

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P581 Status Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

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
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: receiver.user.id,
      })
      .select('id')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryId = delivery.id;
  });

  test.afterAll(async () => {
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (wrongUser?.user?.id) await deleteTestUser(wrongUser.user.id);
  });

  test('receiver can update own delivery status (opened)', async () => {
    const receiverClient = makeUserClient(receiverToken);

    const { error } = await receiverClient
      .from('letter_deliveries')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', deliveryId);

    expect(error).toBeNull();
  });

  test('wrong user cannot update delivery status of another user', async () => {
    const wrongClient = makeUserClient(wrongToken);

    const { data, error } = await wrongClient
      .from('letter_deliveries')
      .update({ status: 'in_progress' })
      .eq('id', deliveryId)
      .select('id');

    // RLS should filter out the row — update returns empty, not error
    if (!error) {
      expect(data).toHaveLength(0);
    }
  });
});

// ===========================================================================
// 7. Token validation RPC — get_letter_by_token
// ===========================================================================

test.describe('P581 Migration — Token validation RPC', () => {
  test.setTimeout(45000);

  let sender: TestUser;
  let letterId: string;
  let deliveryToken: string;
  let docId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P581-Token-Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P581 Token Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

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
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'token-test@gmail.com',
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

  test('get_letter_by_token returns letter data for valid token', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('get_letter_by_token', {
      p_token: deliveryToken,
    });

    // If RPC exists and token is valid, we should get data back
    expect(error, `get_letter_by_token RPC failed: ${error?.message}`).toBeNull();
    expect(data).toBeTruthy();
  });

  test('get_letter_by_token returns null for non-existent token', async () => {
    const anonClient = makeAnonClient();
    const fakeToken = '00000000-0000-0000-0000-000000000000';

    const { data, error } = await anonClient.rpc('get_letter_by_token', {
      p_token: fakeToken,
    });

    // Should return null/empty, not an error (404 pattern)
    expect(error).toBeNull();
    expect(data).toBeFalsy();
  });

  test('get_letter_by_token returns null for expired token', async () => {
    // Create a delivery with expired token
    const expiredAt = new Date(Date.now() - 1000).toISOString(); // 1 second ago
    const { data: expiredDelivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'expired@gmail.com',
        invitation_expires_at: expiredAt,
      })
      .select('invitation_token')
      .single();

    if (!expiredDelivery) throw new Error('Expired delivery creation failed');

    const anonClient = makeAnonClient();
    const { data, error } = await anonClient.rpc('get_letter_by_token', {
      p_token: expiredDelivery.invitation_token,
    });

    expect(error).toBeNull();
    expect(data).toBeFalsy();
  });
});
