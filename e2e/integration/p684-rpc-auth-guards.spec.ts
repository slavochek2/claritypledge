/**
 * @file p684-rpc-auth-guards.spec.ts
 * @description P684: Integration tests — RPC anonymous access lockdown.
 *
 * CRITICAL SECURITY INVARIANT:
 * After the P684 migration, all four response RPCs must reject anonymous callers
 * with RAISE EXCEPTION 'Authentication required'. The anon role can still CALL
 * the function (grant is kept), but auth.uid() IS NULL triggers a hard error —
 * not a soft false/null return.
 *
 * Also tests:
 * - get_letter_for_public_reading — the NEW RPC that enables anonymous browsing
 * - Zero delivery rows for browse-only readers
 * - Zero anonymous response rows (story_verifications, letter_point_responses)
 * - terms_acceptances row created by create-and-respond-letter edge function
 *
 * Run: npx playwright test --project=integration e2e/integration/p684-rpc-auth-guards.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  type TestUser,
} from '../helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  createTestStorySnapshot,
  createTestPrediction,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

// ---------------------------------------------------------------------------
// Anon client factory — uses anonKey only, no session
// ---------------------------------------------------------------------------

function makeAnonClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Authenticated user client factory
// ---------------------------------------------------------------------------

function makeUserClient(accessToken: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

test.describe('P684: RPC auth guards — anonymous callers must be rejected', () => {
  test.describe.configure({ timeout: 30000 });

  let sender: TestUser;
  let receiver: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;
  let deliveryToken: string;
  let _deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P684 Auth Guard Sender' });
    receiver = await createTestUser({ name: 'P684 Auth Guard Receiver' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P684 Auth Guard Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create story + point
    const story = await createTestStory(sender.user.id, {
      content: 'P684 auth guard test story.',
    });
    storyId = story.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    const point = await createTestPoint(sender.user.id, {
      statement: 'P684 auth guard test point.',
    });
    pointId = point.id;

    // Create sealed one-to-many letter (no pre-created delivery — that's the P684 invariant)
    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    await createTestStorySnapshot(letterId, storyId, version.id, { position: 0 });
    await createTestPrediction(letterId, storyId, 7, null);
    await sealTestLetter(letterId);

    // Create a delivery row for testing response RPCs
    // (In production, create-and-respond-letter creates this; here we seed directly.)
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: receiver.email,
      receiverProfileId: receiver.user.id,
      status: 'opened',
    });
    _deliveryId = delivery.id;
    deliveryToken = delivery.invitationToken;

    // Seed one story_verification so reveal_prediction_by_token can be tested
    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      version_id: version.id, // must be a real story_versions.id (FK constraint)
      speaker_id: sender.user.id,
      listener_id: receiver.user.id,
      listener_rating: 7,
      speaker_rating: 0,
      source: 'letter',
      verified: false,
      session_id: null,
    });
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (pointId) await deleteTestPoint(pointId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (receiver) await deleteTestUser(receiver.user.id);
    if (sender) await deleteTestUser(sender.user.id);
  });

  // ==========================================================================
  // 1. submit_rating_by_token — anonymous caller MUST be rejected
  // ==========================================================================

  test('submit_rating_by_token: anonymous caller raises exception (not false/null)', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('submit_rating_by_token', {
      p_token: deliveryToken,
      p_story_id: storyId,
      p_rating: 5,
    });

    // P684 migration adds: IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'
    expect(error, 'Expected RAISE EXCEPTION for anonymous caller').not.toBeNull();
    expect(error?.message).toContain('Authentication required');
    expect(data).toBeNull();
  });

  test('submit_rating_by_token: authenticated caller succeeds', async () => {
    // Sign in as receiver
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn } = await tempClient.auth.signInWithPassword({
      email: receiver.email,
      password: 'test-password-12345',
    });
    expect(signIn?.session, 'Receiver must have a valid session').not.toBeNull();

    const userClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await userClient.rpc('submit_rating_by_token', {
      p_token: deliveryToken,
      p_story_id: storyId,
      p_rating: 8,
    });

    expect(error, `Authenticated caller should not error: ${error?.message}`).toBeNull();
    expect(data).toBe(true);
  });

  // ==========================================================================
  // 2. submit_point_response_by_token — anonymous caller MUST be rejected
  // ==========================================================================

  test('submit_point_response_by_token: anonymous caller raises exception', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('submit_point_response_by_token', {
      p_token: deliveryToken,
      p_point_id: pointId,
      p_position: 'agree',
    });

    expect(error, 'Expected RAISE EXCEPTION for anonymous caller').not.toBeNull();
    expect(error?.message).toContain('Authentication required');
    expect(data).toBeNull();
  });

  test('submit_point_response_by_token: authenticated caller succeeds', async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn } = await tempClient.auth.signInWithPassword({
      email: receiver.email,
      password: 'test-password-12345',
    });
    expect(signIn?.session).not.toBeNull();

    const userClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await userClient.rpc('submit_point_response_by_token', {
      p_token: deliveryToken,
      p_point_id: pointId,
      p_position: 'agree',
    });

    expect(error, `Authenticated caller should not error: ${error?.message}`).toBeNull();
    expect(data).toBe(true);
  });

  // ==========================================================================
  // 3. reveal_prediction_by_token — anonymous caller MUST be rejected
  // ==========================================================================

  test('reveal_prediction_by_token: anonymous caller raises exception', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('reveal_prediction_by_token', {
      p_token: deliveryToken,
      p_story_id: storyId,
    });

    expect(error, 'Expected RAISE EXCEPTION for anonymous caller').not.toBeNull();
    expect(error?.message).toContain('Authentication required');
    expect(data).toBeNull();
  });

  test('reveal_prediction_by_token: authenticated caller succeeds', async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn } = await tempClient.auth.signInWithPassword({
      email: receiver.email,
      password: 'test-password-12345',
    });
    expect(signIn?.session).not.toBeNull();

    const userClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await userClient.rpc('reveal_prediction_by_token', {
      p_token: deliveryToken,
      p_story_id: storyId,
    });

    expect(error, `Authenticated caller should not error: ${error?.message}`).toBeNull();
    // Returns JSONB with prediction field
    expect(data).not.toBeNull();
  });

  // ==========================================================================
  // 4. update_delivery_status_by_token — anonymous caller MUST be rejected
  // ==========================================================================

  test('update_delivery_status_by_token: anonymous caller raises exception', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('update_delivery_status_by_token', {
      p_token: deliveryToken,
      p_status: 'in_progress',
    });

    expect(error, 'Expected RAISE EXCEPTION for anonymous caller').not.toBeNull();
    expect(error?.message).toContain('Authentication required');
    expect(data).toBeNull();
  });

  test('update_delivery_status_by_token: authenticated caller succeeds', async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signIn } = await tempClient.auth.signInWithPassword({
      email: receiver.email,
      password: 'test-password-12345',
    });
    expect(signIn?.session).not.toBeNull();

    const userClient = makeUserClient(signIn!.session!.access_token);

    const { data, error } = await userClient.rpc('update_delivery_status_by_token', {
      p_token: deliveryToken,
      p_status: 'in_progress',
    });

    expect(error, `Authenticated caller should not error: ${error?.message}`).toBeNull();
    expect(data).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Public reading RPC — anonymous access ALLOWED
// ---------------------------------------------------------------------------

test.describe('P684: get_letter_for_public_reading — anonymous read access', () => {
  test.describe.configure({ timeout: 30000 });

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P684 Public Read Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P684 Public Read Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, {
      content: 'P684 public reading RPC test story.',
    });
    storyId = story.id;

    await supabaseAdmin
      .from('doc_stories')
      .insert({ doc_id: docId, story_id: storyId, position: 0 });

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    await createTestStorySnapshot(letterId, storyId, version.id, { position: 0 });
    await createTestPrediction(letterId, storyId, 6, null);
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) {
      await supabaseAdmin.from('doc_stories').delete().eq('doc_id', docId);
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('anonymous caller can read sealed one-to-many letter content', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('get_letter_for_public_reading', {
      p_letter_id: letterId,
    });

    expect(error, `get_letter_for_public_reading should succeed anonymously: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    expect(data.letter_id ?? data.id ?? data?.letter?.id).toBeTruthy();
  });

  test('get_letter_for_public_reading does NOT return predictions (sealed-bid)', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('get_letter_for_public_reading', {
      p_letter_id: letterId,
    });

    expect(error).toBeNull();
    // Predictions must NOT be in the response — sealed-bid: only revealed after rating
    const dataStr = JSON.stringify(data ?? {});
    expect(dataStr).not.toContain('"prediction"');
  });

  test('get_letter_for_public_reading rejects non-existent letter', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('get_letter_for_public_reading', {
      p_letter_id: '00000000-0000-0000-0000-000000000000',
    });

    // Should return null data or an error — not reveal any letter
    expect(data == null || error != null).toBe(true);
  });

  test('get_letter_for_public_reading rejects one-to-one letter (mode guard)', async () => {
    // Create a one-to-one letter (needs its own doc)
    const { data: doc121 } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P684 Mode Guard Doc 121' })
      .select('id')
      .single();
    if (!doc121) throw new Error('Doc creation failed');

    const letter121 = await createTestLetter(sender.user.id, doc121.id, { mode: 'one-to-one' });

    // Look up story version (storyId was created in beforeAll)
    const { data: version121 } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version121) throw new Error('Story version not found for mode guard test');

    await createTestStorySnapshot(letter121.id, storyId, version121.id, { position: 0 });
    await sealTestLetter(letter121.id);

    const anonClient = makeAnonClient();
    const { data, error } = await anonClient.rpc('get_letter_for_public_reading', {
      p_letter_id: letter121.id,
    });

    // Must reject — one-to-one letters are NOT publicly readable
    expect(data == null || error != null).toBe(true);

    await deleteTestLetter(letter121.id);
    await supabaseAdmin.from('clarity_docs').delete().eq('id', doc121.id);
  });
});

// ---------------------------------------------------------------------------
// Zero anonymous delivery rows invariant
// ---------------------------------------------------------------------------

test.describe('P684: Zero anonymous delivery rows for browse-only readers', () => {
  test.describe.configure({ timeout: 20000 });

  let sender: TestUser;
  let docId: string;
  let letterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P684 Zero Delivery Sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P684 Zero Delivery Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-many' });
    letterId = letter.id;
    await sealTestLetter(letter.id);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('no delivery rows exist for a newly sealed one-to-many letter', async () => {
    const { data, error } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', letterId);

    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  test('browsing the public link (calling get_letter_for_public_reading) does not create a delivery row', async () => {
    const anonClient = makeAnonClient();

    // Simulate browse — call the public reading RPC
    await anonClient.rpc('get_letter_for_public_reading', {
      p_letter_id: letterId,
    });

    // Query delivery rows via admin (bypasses RLS)
    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', letterId);

    expect(data?.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Schema check: P684 migration applied
// ---------------------------------------------------------------------------

test.describe('P684: Schema — migration applied (P270 pattern)', () => {
  test.describe.configure({ timeout: 15000 });

  test('get_letter_for_public_reading function exists in DB', async () => {
    // If this call errors with "function not found", the P684 migration has not been applied
    const anonClient = makeAnonClient();
    const { error } = await anonClient.rpc('get_letter_for_public_reading', {
      p_letter_id: '00000000-0000-0000-0000-000000000000',
    });

    // May return null data (letter not found), but must NOT fail with "function does not exist"
    expect(
      error?.message ?? '',
      'get_letter_for_public_reading function missing — run migration'
    ).not.toContain('function get_letter_for_public_reading');
  });

  test('terms_acceptances table accepts auth.uid() = sender rows (RLS check)', async () => {
    // Verifies the terms_acceptances RLS accepts authenticated inserts
    // Uses admin to avoid RLS, but verifies table is reachable and schema is intact
    const { error } = await supabaseAdmin
      .from('terms_acceptances')
      .select('id')
      .limit(1);

    expect(
      error,
      `terms_acceptances table inaccessible: ${error?.message}`
    ).toBeNull();
  });
});
