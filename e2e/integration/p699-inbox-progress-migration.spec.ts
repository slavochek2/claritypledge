/**
 * @file p699-inbox-progress-migration.spec.ts
 * @description P699: Letter Results — Inbox progress migration verification
 *
 * Verifies that get_inbox_items RPC returns the new progress fields:
 * - stories_rated: number of stories the receiver has rated
 * - total_stories: total stories in the letter
 *
 * These fields power the "Step N of M completed" indicator on in-progress items.
 *
 * If tests fail: run `./scripts/migrate.sh` to apply P699 inbox-progress migration.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import {
  createFullTestLetter,
  completeTestDelivery,
  deleteTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

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

function makeUserClient(accessToken: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ===========================================================================
// 1. get_inbox_items returns stories_rated and total_stories
// ===========================================================================

test.describe('P699 Migration — get_inbox_items progress fields', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let receiver: TestUser;
  let receiverToken: string;
  let docId: string;
  let storyId1: string;
  let storyId2: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P699 Inbox Progress Sender' });
    receiver = await createTestUser({ name: 'P699 Inbox Progress Receiver' });
    receiverToken = await signIn(receiver.email);

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P699 Inbox Progress Doc' })
      .select('id')
      .single();
    if (!doc) throw new Error('Doc creation failed');
    docId = doc.id;

    const story1 = await createTestStory(sender.user.id, { title: 'P699 Inbox Story 1' });
    const story2 = await createTestStory(sender.user.id, { title: 'P699 Inbox Story 2' });
    storyId1 = story1.id;
    storyId2 = story2.id;

    const { data: version1 } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId1)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    const { data: version2 } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', storyId2)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!version1 || !version2) throw new Error('Story versions not found');

    const { letter, delivery } = await createFullTestLetter(
      sender.user.id,
      docId,
      [
        { storyId: storyId1, versionId: version1.id, prediction: 5, position: 0 },
        { storyId: storyId2, versionId: version2.id, prediction: 7, position: 1 },
      ],
      { email: receiver.email, profileId: receiver.user.id },
      { seal: true }
    );
    letterId = letter.id;
    deliveryId = delivery.id;

    // Set delivery to in_progress with 1 of 2 stories rated
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'in_progress', stories_rated: 1 })
      .eq('id', deliveryId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (storyId1) await deleteTestStory(storyId1);
    if (storyId2) await deleteTestStory(storyId2);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (receiver?.user?.id) await deleteTestUser(receiver.user.id);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('get_inbox_items returns stories_rated field on in-progress items', async () => {
    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient.rpc('get_inbox_items');

    expect(error, `get_inbox_items failed: ${error?.message}`).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // Find the in-progress item for this letter
    const items = data as Array<Record<string, unknown>>;
    const inboxItem = items.find(
      (item) => item.letter_id === letterId || item.delivery_id === deliveryId
    );

    expect(
      inboxItem,
      `No inbox item found for letter ${letterId}. Items: ${JSON.stringify(items)}`
    ).toBeTruthy();

    // stories_rated field must exist and equal 1
    expect(
      'stories_rated' in inboxItem!,
      'stories_rated field missing from get_inbox_items response — run ./scripts/migrate.sh'
    ).toBe(true);

    expect(inboxItem!.stories_rated).toBe(1);
  });

  test('get_inbox_items returns total_stories field', async () => {
    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient.rpc('get_inbox_items');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    const items = data as Array<Record<string, unknown>>;
    const inboxItem = items.find(
      (item) => item.letter_id === letterId || item.delivery_id === deliveryId
    );

    expect(inboxItem).toBeTruthy();

    // total_stories must exist and equal 2 (letter has 2 snapshots)
    expect(
      'total_stories' in inboxItem!,
      'total_stories field missing from get_inbox_items response — run ./scripts/migrate.sh'
    ).toBe(true);

    expect(inboxItem!.total_stories).toBe(2);
  });

  test('completed delivery shows stories_rated equal to total_stories', async () => {
    // Complete the delivery so stories_rated = 2 = total_stories
    await completeTestDelivery(deliveryId, 2);

    const receiverClient = makeUserClient(receiverToken);

    const { data, error } = await receiverClient.rpc('get_inbox_items');

    expect(error).toBeNull();

    const items = data as Array<Record<string, unknown>>;
    const inboxItem = items.find(
      (item) => item.letter_id === letterId || item.delivery_id === deliveryId
    );

    expect(inboxItem).toBeTruthy();
    expect(inboxItem!.stories_rated).toBe(2);
    expect(inboxItem!.total_stories).toBe(2);
  });

  test('get_inbox_items RPC exists (not 42883 function-not-found)', async () => {
    const receiverClient = makeUserClient(receiverToken);

    const { error } = await receiverClient.rpc('get_inbox_items');

    if (error) {
      expect(
        error.message,
        `get_inbox_items RPC not found — run ./scripts/migrate.sh`
      ).not.toMatch(/function.*does not exist|could not find function/i);
    }
  });
});
