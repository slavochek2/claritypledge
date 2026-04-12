/**
 * @file 20260412150407_fix_invitation_token_uuid_cast.spec.ts
 * @description P270: Migration integration test — invitation_token UUID cast fix.
 *
 * Verifies: add_recipient_to_sealed_letter RPC no longer fails with
 * "column 'invitation_token' is of type uuid but expression is of type text".
 *
 * The bug: gen_random_uuid()::text was inserted into a UUID column.
 * The fix: removed the ::text cast.
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

test.describe('Migration fix: invitation_token UUID cast', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let docId: string;
  let storyId: string;
  let pointId: string;
  let letterId: string;

  test.beforeAll(async () => {
    // Create sender with doc, story, point
    sender = await createTestUser({ withProfile: true });

    // Create a doc for the sender
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ author_id: sender.user.id, title: 'UUID cast test doc' })
      .select('id')
      .single();
    docId = doc!.id;

    // Create story + point so seal_and_send_letter has content
    const story = await createTestStory(sender.user.id, {
      title: 'UUID cast test story',
      content: 'Test content for UUID cast fix',
    });
    storyId = story.id;

    const point = await createTestPoint(sender.user.id, storyId, {
      text: 'Test point for UUID cast fix',
    });
    pointId = point.id;

    // Seal the letter via RPC (one-to-one with a dummy recipient)
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: sender.email,
      password: TEST_PASSWORD,
    });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
    });

    const { data: sealResult, error: sealError } = await userClient.rpc('seal_and_send_letter', {
      p_doc_id: docId,
      p_mode: 'one-to-one',
      p_recipients: JSON.stringify([{ email: 'uuid-cast-seed@example.com', name: 'Seed Recipient' }]),
    });

    expect(sealError, `seal_and_send_letter failed: ${sealError?.message}`).toBeNull();
    letterId = sealResult;
  });

  test.afterAll(async () => {
    // Clean up in reverse order
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (pointId) await deleteTestPoint(pointId);
    if (storyId) await deleteTestStory(storyId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('add_recipient_to_sealed_letter succeeds without type error', async () => {
    // Sign in as sender
    const { data: signIn } = await supabaseAdmin.auth.signInWithPassword({
      email: sender.email,
      password: TEST_PASSWORD,
    });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${signIn!.session!.access_token}` } },
    });

    // This was the failing call before the fix
    const { data: deliveryId, error } = await userClient.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_email: 'uuid-cast-test@example.com',
      p_receiver_name: 'Test Recipient',
    });

    expect(error, `RPC failed: ${error?.message}`).toBeNull();
    expect(deliveryId).toBeTruthy();

    // Verify the delivery row has a valid UUID invitation_token
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .select('invitation_token')
      .eq('id', deliveryId)
      .single();

    expect(delivery).toBeTruthy();
    // UUID v4 format check
    expect(delivery!.invitation_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });
});
