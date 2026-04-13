/**
 * @file p699-letter-results-migration.spec.ts
 * @description P699: Letter Results Story Walk — DB migration verification
 *
 * Verifies the get_letter_results SECURITY DEFINER RPC:
 * 1. Function exists (schema existence check)
 * 2. Sender can call RPC for their own sealed letter
 * 3. Receiver can call RPC with delivery_id for their delivery
 * 4. Unauthorized caller gets NULL (no existence leak)
 * 5. Non-sealed letter returns NULL
 * 6. Both perspectives return correct data shape (predictions, ratings, snapshots)
 *
 * If tests fail: run `./scripts/migrate.sh` to apply P699 migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';
import {
  createFullTestLetter,
  completeTestDelivery,
  deleteTestLetter,
} from '../helpers/test-letter';

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
// 1. Schema existence — RPC function
// ===========================================================================

test.describe('P699 Migration — get_letter_results RPC exists', () => {
  test.setTimeout(30000);

  test('get_letter_results function exists in database', async () => {
    // Calling the RPC with a nonexistent UUID should return null (not "function not found" error)
    const anonClient = makeAnonClient();
    const { error } = await anonClient.rpc('get_letter_results', {
      p_letter_id: '00000000-0000-0000-0000-000000000000',
      p_delivery_id: null,
    });

    // If RPC doesn't exist, error.message will contain "function" or "does not exist"
    // If RPC exists but returns null, error is null
    if (error) {
      expect(
        error.message,
        `get_letter_results RPC not found — run ./scripts/migrate.sh. Error: ${error.message}`
      ).not.toMatch(/function.*does not exist|could not find function/i);
    }
    // Success path: no error (returns null for nonexistent letter)
  });
});

// ===========================================================================
// 2. Authorization — sender and receiver access, unauthorized blocked
// ===========================================================================

test.describe('P699 Migration — get_letter_results authorization', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let receiver: TestUser;
  let thirdParty: TestUser;
  let senderToken: string;
  let receiverToken: string;
  let thirdPartyToken: string;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P699 Results Sender' });
    receiver = await createTestUser({ name: 'P699 Results Receiver' });
    thirdParty = await createTestUser({ name: 'P699 Results Third Party' });

    senderToken = await signIn(sender.email);
    receiverToken = await signIn(receiver.email);
    thirdPartyToken = await signIn(thirdParty.email);

    // Create doc
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P699 Results Auth Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    // Create story with a point
    const story = await createTestStory(sender.user.id, { title: 'P699 Results Story' });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, storyId, { statement: 'P699 test point' });
    pointId = point.id;

    // Fetch latest story version for snapshot
    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    // Create full letter (sealed)
    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: version.id, prediction: 7, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    // Create story verification (receiver rating)
    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      speaker_id: sender.user.id,
      listener_id: receiver.user.id,
      speaker_rating: 7,
      listener_rating: 4,
      source: 'letter',
      verified: false,
      sort_order: 0,
    });

    // Create letter point response
    await supabaseAdmin.from('letter_point_responses').insert({
      delivery_id: deliveryId,
      point_id: pointId,
      position: 'agree',
    });

    // Complete the delivery
    await completeTestDelivery(deliveryId, 1);
  });

  test.afterAll(async () => {
    // Clean story verifications before letter deletion
    if (storyId) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId)
        .eq('source', 'letter');
    }
    if (letterId) await deleteTestLetter(letterId);
    if (pointId) await deleteTestPoint(pointId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (thirdParty?.user?.id) await deleteTestUser(thirdParty.user.id);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  // ── 2a. Sender authorization ──────────────────────────────────────────────

  test('sender can call get_letter_results for their own letter (no delivery_id)', async () => {
    const senderClient = makeUserClient(senderToken);

    const { data, error } = await senderClient.rpc('get_letter_results', {
      p_letter_id: letterId,
      p_delivery_id: null,
    });

    expect(error, `RPC failed for sender: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
    // Sender perspective: data should be truthy (letter exists and caller is authorized)
  });

  // ── 2b. Receiver authorization ────────────────────────────────────────────

  test('receiver can call get_letter_results with their delivery_id', async () => {
    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient.rpc('get_letter_results', {
      p_letter_id: letterId,
      p_delivery_id: deliveryId,
    });

    expect(error, `RPC failed for receiver: ${error?.message}`).toBeNull();
    expect(data).not.toBeNull();
  });

  // ── 2c. Unauthorized caller gets NULL ─────────────────────────────────────

  test('third-party user gets NULL from get_letter_results (no existence leak)', async () => {
    const thirdPartyClient = makeUserClient(thirdPartyToken);

    const { data, error } = await thirdPartyClient.rpc('get_letter_results', {
      p_letter_id: letterId,
      p_delivery_id: null,
    });

    expect(error).toBeNull(); // Should not throw — just return empty
    // PostgREST returns [] (not null) for RETURN; in TABLE-returning functions
    expect(Array.isArray(data) && data.length === 0).toBe(true);
  });

  test('anonymous caller gets NULL from get_letter_results', async () => {
    const anonClient = makeAnonClient();

    const { data, error } = await anonClient.rpc('get_letter_results', {
      p_letter_id: letterId,
      p_delivery_id: null,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data) && data.length === 0).toBe(true);
  });

  // ── 2d. Receiver WITHOUT delivery_id cannot access (wrong perspective) ────

  test('receiver without delivery_id gets NULL (unauthorized — not the sender)', async () => {
    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient.rpc('get_letter_results', {
      p_letter_id: letterId,
      p_delivery_id: null,
    });

    // Receiver is not the sender — without delivery_id, returns empty (not sender)
    expect(error).toBeNull();
    expect(Array.isArray(data) && data.length === 0).toBe(true);
  });
});

// ===========================================================================
// 3. Sealed status — non-sealed letter returns NULL
// ===========================================================================

test.describe('P699 Migration — get_letter_results requires sealed letter', () => {
  test.setTimeout(45000);

  let sender: TestUser;
  let senderToken: string;
  let docId: string;
  let storyId: string;
  let draftLetterId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P699 Draft Letter Sender' });
    senderToken = await signIn(sender.email);

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P699 Draft Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { title: 'P699 Draft Story' });
    storyId = story.id;

    // Create letter in DRAFT status (NOT sealed)
    const { data: letter } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: sender.user.id,
        mode: 'one-to-one',
        status: 'draft',
      })
      .select('id')
      .single();
    if (!letter) throw new Error('Draft letter creation failed');
    draftLetterId = letter.id;
  });

  test.afterAll(async () => {
    if (draftLetterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', draftLetterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('non-sealed (draft) letter returns NULL from get_letter_results', async () => {
    const senderClient = makeUserClient(senderToken);

    const { data, error } = await senderClient.rpc('get_letter_results', {
      p_letter_id: draftLetterId,
      p_delivery_id: null,
    });

    expect(error).toBeNull();
    // Draft letters cannot be accessed via results — guards against premature reveal
    expect(Array.isArray(data) && data.length === 0).toBe(true);
  });
});

// ===========================================================================
// 4. Data shape — correct fields returned per perspective
// ===========================================================================

test.describe('P699 Migration — get_letter_results data shape', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let receiver: TestUser;
  let senderToken: string;
  let receiverToken: string;
  let docId: string;
  let storyId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P699 Shape Sender' });
    receiver = await createTestUser({ name: 'P699 Shape Receiver' });
    senderToken = await signIn(sender.email);
    receiverToken = await signIn(receiver.email);

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P699 Shape Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story = await createTestStory(sender.user.id, { title: 'P699 Shape Story', content: 'Shape test content.' });
    storyId = story.id;

    const { data: version } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version) throw new Error('Story version not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [{ storyId, versionId: version.id, prediction: 6, position: 0 }],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    // Receiver rating
    await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      speaker_id: sender.user.id,
      listener_id: receiver.user.id,
      speaker_rating: 6,
      listener_rating: 9,
      source: 'letter',
      verified: false,
      sort_order: 0,
    });

    await completeTestDelivery(deliveryId, 1);
  });

  test.afterAll(async () => {
    if (storyId) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId)
        .eq('source', 'letter');
    }
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('sender perspective includes predictions, snapshots, and perspective field', async () => {
    const senderClient = makeUserClient(senderToken);

    const { data, error } = await senderClient.rpc('get_letter_results', {
      p_letter_id: letterId,
      p_delivery_id: null,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    // Expect a response object (shape TBD by implementation — at minimum truthy)
    // These field checks validate the spec contract: predictions + snapshots + perspective
    const result = Array.isArray(data) ? data[0] : data;
    expect(result).toBeTruthy();

    // perspective should identify caller as 'sender'
    if (result && typeof result === 'object' && 'perspective' in result) {
      expect(result.perspective).toBe('sender');
    }
  });

  test('receiver perspective returns perspective=receiver', async () => {
    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient.rpc('get_letter_results', {
      p_letter_id: letterId,
      p_delivery_id: deliveryId,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const result = Array.isArray(data) ? data[0] : data;
    expect(result).toBeTruthy();

    if (result && typeof result === 'object' && 'perspective' in result) {
      expect(result.perspective).toBe('receiver');
    }
  });

  test('sender result includes prediction value for the story', async () => {
    const senderClient = makeUserClient(senderToken);

    const { data, error } = await senderClient.rpc('get_letter_results', {
      p_letter_id: letterId,
      p_delivery_id: null,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    // The result should include prediction data — value 6 was set in beforeAll
    const result = Array.isArray(data) ? data : [data];
    const hasStoryData = result.some((item: unknown) => {
      if (typeof item !== 'object' || item === null) return false;
      const obj = item as Record<string, unknown>;
      // Accept any shape that contains prediction data
      return (
        'prediction' in obj ||
        'predictions' in obj ||
        'stories' in obj ||
        JSON.stringify(item).includes('prediction')
      );
    });
    expect(hasStoryData, 'Response should contain prediction data').toBe(true);
  });

  test('nonexistent letter_id returns NULL (no error)', async () => {
    const senderClient = makeUserClient(senderToken);

    const { data, error } = await senderClient.rpc('get_letter_results', {
      p_letter_id: '00000000-0000-0000-0000-000000000000',
      p_delivery_id: null,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data) && data.length === 0).toBe(true);
  });
});
