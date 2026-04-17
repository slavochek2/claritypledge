/**
 * @file p581-letters-sealed-bid.spec.ts
 * @description P581: Sealed-bid guarantee — the highest-risk security surface
 *
 * The core integrity requirement: a receiver CANNOT see the sender's prediction
 * until the receiver has submitted their own rating for that story.
 *
 * This test validates the enforcement at the DATABASE level (RLS + RPC), not
 * client-side hiding. A determined user querying PostgREST directly must still
 * be blocked.
 *
 * Tests:
 * 1. Sender can always query their own predictions (SELECT via RLS)
 * 2. Receiver CANNOT query predictions before completing their rating
 * 3. Receiver CAN query predictions after completing the letter (status='completed')
 * 4. Anonymous user CANNOT query predictions at all
 * 5. Wrong authenticated user CANNOT query predictions
 * 6. Forward-only: letter-sourced story_verifications cannot be UPDATEd or DELETEd
 * 7. letter_point_responses are forward-only (no UPDATE policy)
 *
 * TWO-CLIENT PATTERN:
 * - supabaseAdmin: test data setup (bypasses RLS)
 * - senderClient (JWT): sender's perspective
 * - receiverClient (JWT): receiver's perspective
 * - wrongClient (JWT): unauthorized third party
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeAnonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
// Test suite
// ===========================================================================

test.describe('P581: Sealed-bid guarantee — prediction visibility', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let receiver: TestUser;
  let wrongUser: TestUser;
  let senderToken: string;
  let receiverToken: string;
  let wrongToken: string;

  let docId: string;
  let storyId: string;
  let letterId: string;
  let deliveryId: string;
  let _predictionId: string;

  test.beforeAll(async () => {
    // Create users
    sender = await createTestUser({ name: 'SealedBid-Sender' });
    receiver = await createTestUser({ name: 'SealedBid-Receiver' });
    wrongUser = await createTestUser({ name: 'SealedBid-Wrong' });

    senderToken = await signIn(sender.email);
    receiverToken = await signIn(receiver.email);
    wrongToken = await signIn(wrongUser.email);

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'Sealed-Bid Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create story
    const story = await createTestStory(sender.user.id, {
      title: 'Sealed-Bid Test Story',
      content: 'A story about false consensus in decision framing.',
    });
    storyId = story.id;

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
    if (!letter) throw new Error('Letter creation failed');
    letterId = letter.id;

    // Create delivery for receiver (status = 'sent', not yet completed)
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: receiver.user.id,
        status: 'sent',
        invitation_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryId = delivery.id;

    // Create prediction (via service_role — bypasses RLS)
    const { data: prediction } = await supabaseAdmin
      .from('letter_predictions')
      .insert({
        letter_id: letterId,
        delivery_id: deliveryId,
        story_id: storyId,
        prediction: 4,
      })
      .select('id')
      .single();
    if (!prediction) throw new Error('Prediction creation failed');
    _predictionId = prediction.id;

    // Create story snapshot
    // Get story version (auto-created by trigger on stories INSERT)
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (version) {
      await supabaseAdmin
        .from('letter_story_snapshots')
        .insert({
          letter_id: letterId,
          story_id: storyId,
          version_id: version.id,
          position: 0,
          visibility: 'public',
        });
    }
  });

  test.afterAll(async () => {
    // Clean up in reverse FK order
    if (letterId) {
      await supabaseAdmin.from('letter_predictions').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (wrongUser?.user?.id) await deleteTestUser(wrongUser.user.id);
  });

  // ── 1. Sender can always see their own predictions ────────────────────

  test('sender can always query predictions for their own letter', async () => {
    const senderClient = makeUserClient(senderToken);

    const { data, error } = await senderClient
      .from('letter_predictions')
      .select('id, prediction, story_id')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].prediction).toBe(4);
  });

  // ── 2. Receiver CANNOT see predictions before completing ──────────────

  test('receiver CANNOT query predictions before completing letter (sealed-bid)', async () => {
    // Delivery status is still 'sent' — receiver has NOT submitted any rating
    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient
      .from('letter_predictions')
      .select('id, prediction, story_id')
      .eq('letter_id', letterId);

    // RLS should return zero rows (not an error — just filtered out)
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test('receiver still cannot see predictions after opening (status=opened)', async () => {
    // Transition to 'opened'
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', deliveryId);

    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient
      .from('letter_predictions')
      .select('id, prediction')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test('receiver still cannot see predictions while in-progress', async () => {
    // Transition to 'in_progress'
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'in_progress', stories_rated: 0 })
      .eq('id', deliveryId);

    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient
      .from('letter_predictions')
      .select('id, prediction')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // ── 3. Receiver CAN see predictions after completing ──────────────────

  test('receiver CAN query predictions after rating the story (per-story reveal)', async () => {
    // Per AD3: receiver sees prediction for a specific story ONLY after they have rated it
    // (matching story_verifications row with source='letter' exists)
    // Insert a story_verifications row for this story+receiver (simulating the receiver rating)
    const { error: verifyInsertError } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: storyId,
        speaker_id: sender.user.id,
        listener_id: receiver.user.id,
        speaker_rating: 4,
        listener_rating: 7,
        source: 'letter',
        verified: false,
      });

    if (verifyInsertError) {
      console.error('VERIFY INSERT ERROR:', JSON.stringify(verifyInsertError));
    }
    expect(verifyInsertError).toBeNull();

    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient
      .from('letter_predictions')
      .select('id, prediction, story_id')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].prediction).toBe(4);
  });

  // ── 4. Anonymous user cannot see predictions ──────────────────────────

  test('anonymous user CANNOT query predictions', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient
      .from('letter_predictions')
      .select('id, prediction')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // ── 5. Wrong authenticated user cannot see predictions ────────────────

  test('wrong user CANNOT query predictions for a letter not sent to them', async () => {
    const wrongClient = makeUserClient(wrongToken);

    const { data, error } = await wrongClient
      .from('letter_predictions')
      .select('id, prediction')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

// ===========================================================================
// Forward-only guarantees
// ===========================================================================

test.describe('P581: Forward-only — ratings and positions are immutable', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let receiver: TestUser;
  let receiverToken: string;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let deliveryId: string;
  let verificationId: string | null = null;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'ForwardOnly-Sender' });
    receiver = await createTestUser({ name: 'ForwardOnly-Receiver' });
    receiverToken = await signIn(receiver.email);

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'Forward-Only Test Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { title: 'Forward-Only Story' });
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

    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiver.email,
        receiver_profile_id: receiver.user.id,
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (!delivery) throw new Error('Delivery creation failed');
    deliveryId = delivery.id;

    // Insert a letter-sourced story_verification via service_role
    const { data: verification } = await supabaseAdmin
      .from('story_verifications')
      .insert({
        story_id: storyId,
        speaker_id: sender.user.id,
        listener_id: receiver.user.id,
        speaker_rating: 4,
        listener_rating: 8,
        source: 'letter',
        verified: false,
      })
      .select('id')
      .single();
    if (verification) verificationId = verification.id;
  });

  test.afterAll(async () => {
    if (verificationId) {
      await supabaseAdmin.from('story_verifications').delete().eq('id', verificationId);
    }
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
  });

  test('receiver cannot UPDATE a letter-sourced story_verification rating (D7/D50)', async () => {
    if (!verificationId) {
      test.skip();
      return;
    }

    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient
      .from('story_verifications')
      .update({ listener_rating: 3 })
      .eq('id', verificationId)
      .eq('source', 'letter')
      .select('id');

    // Either RLS blocks the update or the update returns zero matched rows
    if (!error) {
      expect(data).toHaveLength(0);
    }
  });

  test('receiver cannot DELETE a letter-sourced story_verification', async () => {
    if (!verificationId) {
      test.skip();
      return;
    }

    const receiverClient = makeUserClient(receiverToken);

    // Attempt to delete
    await receiverClient
      .from('story_verifications')
      .delete()
      .eq('id', verificationId)
      .eq('source', 'letter');

    // Verify the row still exists (via service_role)
    const { data } = await supabaseAdmin
      .from('story_verifications')
      .select('id')
      .eq('id', verificationId)
      .single();

    expect(data).not.toBeNull();
    expect(data?.id).toBe(verificationId);
  });

  test('letter_point_responses cannot be UPDATEd by receiver (forward-only)', async () => {
    const receiverClient = makeUserClient(receiverToken);

    // First, insert a response via service_role
    const { data: point } = await supabaseAdmin
      .from('points')
      .insert({
        statement: 'Forward-only test point',
        first_validator_id: sender.user.id,
      })
      .select('id')
      .single();

    if (!point) {
      test.skip();
      return;
    }

    const { data: response } = await supabaseAdmin
      .from('letter_point_responses')
      .insert({
        delivery_id: deliveryId,
        point_id: point.id,
        position: 'agree',
      })
      .select('id')
      .single();

    if (!response) {
      await supabaseAdmin.from('points').delete().eq('id', point.id);
      test.skip();
      return;
    }

    // Attempt to update position via receiver client
    const { data: updated } = await receiverClient
      .from('letter_point_responses')
      .update({ position: 'disagree' })
      .eq('id', response.id)
      .select('id');

    // Forward-only: no UPDATE policy — should return zero rows
    expect(updated).toHaveLength(0);

    // Cleanup
    await supabaseAdmin.from('letter_point_responses').delete().eq('id', response.id);
    await supabaseAdmin.from('points').delete().eq('id', point.id);
  });
});
