/**
 * @file p695-db-schema.spec.ts
 * @description P270: Migration integration test — p695 get_inbox_items exposes completed_at.
 *
 * Verifies: get_inbox_items RPC returns completed_at field in received-letters branch.
 *
 * The change: added 'completed_at', ld.completed_at to the first jsonb_build_object
 * (received letters branch). This integration test ensures:
 * 1. The function runs without SQL errors after migration
 * 2. The response shape includes completed_at (null for pending deliveries)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';
import { createTestPoint, deleteTestPoint } from '../helpers/test-point';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const TEST_PASSWORD = 'test-password-12345'; // gitleaks:allow

test.describe('Migration p695: get_inbox_items exposes completed_at', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let recipient: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ withProfile: true });
    recipient = await createTestUser({ withProfile: true });

    // Create a doc, story, point for sender
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ author_id: sender.user.id, title: 'P695 integration test doc' })
      .select('id')
      .single();
    docId = doc!.id;

    const story = await createTestStory(sender.user.id, {
      title: 'P695 integration test story',
      content: 'Test content',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, storyId, {
      text: 'Test point',
    });
    pointId = point.id;

    // Sign in as sender and seal the letter
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: sender.email,
      password: TEST_PASSWORD,
    });

    const senderClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
    });

    const { data: sealResult, error: sealError } = await senderClient.rpc('seal_and_send_letter', {
      p_doc_id: docId,
      p_mode: 'one-to-one',
      p_recipients: JSON.stringify([{ email: recipient.email, name: 'P695 Test Recipient' }]),
    });
    expect(sealError, `seal_and_send_letter failed: ${sealError?.message}`).toBeNull();
    letterId = sealResult;

    // Get the delivery ID
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id')
      .eq('letter_id', letterId)
      .single();
    deliveryId = delivery!.id;

    // Claim delivery for recipient (links it to their profile)
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ receiver_profile_id: recipient.user.id })
      .eq('id', deliveryId);
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (pointId) await deleteTestPoint(pointId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.user.id);
    if (recipient) await deleteTestUser(recipient.user.id);
  });

  test('get_inbox_items returns completed_at field on received letters (null for pending)', async () => {
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: recipient.email,
      password: TEST_PASSWORD,
    });

    const recipientClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
    });

    const { data, error } = await recipientClient.rpc('get_inbox_items', {
      p_user_id: recipient.user.id,
    });

    expect(error, `get_inbox_items failed: ${error?.message}`).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    const items = data as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);

    const receivedItem = items.find((i) => i['type'] === 'received');
    expect(receivedItem).toBeTruthy();

    // P695: completed_at must be present in the response shape
    expect(Object.prototype.hasOwnProperty.call(receivedItem, 'completed_at')).toBe(true);
    // Delivery is pending — completed_at is null
    expect(receivedItem!['completed_at']).toBeNull();
  });

  test('get_inbox_items completed_at is non-null after delivery status set to completed', async () => {
    const completedAt = new Date().toISOString();

    // Mark delivery as completed
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ status: 'completed', completed_at: completedAt })
      .eq('id', deliveryId);

    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: recipient.email,
      password: TEST_PASSWORD,
    });

    const recipientClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
    });

    const { data, error } = await recipientClient.rpc('get_inbox_items', {
      p_user_id: recipient.user.id,
    });

    expect(error, `get_inbox_items failed: ${error?.message}`).toBeNull();

    const items = data as Array<Record<string, unknown>>;
    const receivedItem = items.find((i) => i['type'] === 'received');
    expect(receivedItem).toBeTruthy();
    expect(receivedItem!['completed_at']).toBeTruthy();
  });
});
