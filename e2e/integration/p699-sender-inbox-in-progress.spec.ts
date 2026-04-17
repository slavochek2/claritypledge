/**
 * @file p699-sender-inbox-in-progress.spec.ts
 * @description Canary integration test — Phase 2: Sender inbox shows in-progress recipients.
 *
 * Bugs verified:
 *   Bug 1: get_inbox_items() Branch 2 excludes in_progress deliveries (filter `ld.status = 'completed'`)
 *
 * CANARY: All assertions in this file FAIL before the migration fix and PASS after.
 *
 * Before fix: Branch 2 has `AND ld.status = 'completed'` → in-progress rows absent.
 * After fix:  Branch 2 includes `status IN ('in_progress', 'completed')` → rows present.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail } from '../helpers/test-user';
import { createTestStory, deleteTestStory } from '../helpers/test-story';

const TEST_PASSWORD = 'test-password-12345';

async function makeUserClient(email: string) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await tempClient.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

test.describe('P699 Bug 1: sender inbox shows in-progress recipients', () => {
  let senderId: string;
  let senderEmail: string;
  let receiverId: string;
  let receiverEmail: string;
  let senderClient: ReturnType<typeof createClient>;

  let docId: string | undefined;
  let letterId: string | undefined;
  let deliveryId: string | undefined;
  let snapshotStoryId: string | undefined;
  let snapshotVersionId: string | undefined;

  test.beforeAll(async () => {
    senderEmail = generateTestEmail();
    receiverEmail = generateTestEmail();
    const { user: sUser } = await createTestUser({ email: senderEmail });
    const { user: rUser } = await createTestUser({ email: receiverEmail });
    senderId = sUser.id;
    receiverId = rUser.id;
    senderClient = await makeUserClient(senderEmail);

    // Create doc + letter owned by sender
    const { data: doc, error: docErr } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: `P699-inprogress test doc ${Date.now()}`, owner_id: senderId })
      .select('id')
      .single();
    if (docErr || !doc) throw new Error(`doc insert: ${docErr?.message}`);
    docId = doc.id;

    const { data: letter, error: letterErr } = await supabaseAdmin
      .from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: senderId, mode: 'one-to-one', status: 'sealed' })
      .select('id')
      .single();
    if (letterErr || !letter) throw new Error(`letter insert: ${letterErr?.message}`);
    letterId = letter.id;

    // Seed a story + snapshot so total_steps > 0
    const story = await createTestStory(senderId, { title: `P699-inprogress story ${Date.now()}` });
    snapshotStoryId = story.id;

    const { data: version, error: versionErr } = await supabaseAdmin
      .from('story_versions')
      .select('id')
      .eq('story_id', snapshotStoryId)
      .order('version_number', { ascending: true })
      .limit(1)
      .single();
    if (versionErr || !version) throw new Error(`version fetch: ${versionErr?.message}`);
    snapshotVersionId = version.id;

    await supabaseAdmin
      .from('letter_story_snapshots')
      .insert({
        letter_id: letterId,
        story_id: snapshotStoryId,
        version_id: snapshotVersionId,
        position: 0,
        point_config: JSON.stringify({ storyText: 'Test', storyTitle: 'Test', points: [] }),
        visibility: 'public',
      });

    // Create an in_progress delivery: receiver started but hasn't finished
    const { data: delivery, error: deliveryErr } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: receiverEmail,
        receiver_profile_id: receiverId,
        status: 'in_progress',
        stories_rated: 0,
      })
      .select('id')
      .single();
    if (deliveryErr || !delivery) throw new Error(`delivery insert: ${deliveryErr?.message}`);
    deliveryId = delivery.id;
  });

  test.afterAll(async () => {
    if (deliveryId) await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (snapshotStoryId) await deleteTestStory(snapshotStoryId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (senderId) await supabaseAdmin.auth.admin.deleteUser(senderId);
    if (receiverId) await supabaseAdmin.auth.admin.deleteUser(receiverId);
  });

  test('CANARY: in-progress delivery appears in sender inbox (Bug 1 — fails before migration fix)', async () => {
    const { data, error } = await senderClient.rpc('get_inbox_items');

    expect(error, `get_inbox_items RPC failed: ${error?.message}`).toBeNull();

    const items = data as Array<{
      type: string;
      delivery_id: string;
      letter_id: string;
      steps_completed?: number;
      total_steps?: number;
    }>;

    // Before fix: this row is absent because Branch 2 filters `ld.status = 'completed'`.
    // After fix: row is present with type 'recipient_in_progress'.
    const inProgressRow = items.find((item) => item.delivery_id === deliveryId);

    expect(
      inProgressRow,
      `In-progress delivery ${deliveryId} was NOT returned by get_inbox_items() for sender. ` +
      `Bug 1: Branch 2 has AND ld.status = 'completed' — in-progress recipients are excluded.`
    ).toBeDefined();

    expect(
      inProgressRow?.type,
      `Row type should be 'recipient_in_progress' (got: '${inProgressRow?.type}')`
    ).toBe('recipient_in_progress');

    expect(
      inProgressRow?.letter_id,
      'letter_id should match the seeded letter'
    ).toBe(letterId);
  });
});
