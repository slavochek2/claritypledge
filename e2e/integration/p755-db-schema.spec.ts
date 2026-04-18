/**
 * P755 migration verification: get_inbox_items() returns restored fields.
 *
 * Verifies that 20260418200000_p755_restore_inbox_in_progress_rpc.sql was applied:
 *   - Branch 1 response includes steps_completed and total_steps
 *   - Branch 2 includes recipient_in_progress type for in-progress deliveries
 *   - Branch 2 includes steps_completed, total_steps, and completed_at fields
 *
 * These fields were dropped by P725 and restored by P755.
 * Full canary: e2e/integration/p699-sender-inbox-in-progress.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail } from '../helpers/test-user';

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

test.describe('P755 migration: get_inbox_items() restored fields', () => {
  let senderId: string;
  let senderEmail: string;
  let receiverId: string;
  let receiverEmail: string;
  let senderClient: ReturnType<typeof createClient>;

  let docId: string | undefined;
  let letterId: string | undefined;
  let deliveryId: string | undefined;

  test.beforeAll(async () => {
    senderEmail = generateTestEmail();
    receiverEmail = generateTestEmail();
    const { user: sUser } = await createTestUser({ email: senderEmail });
    const { user: rUser } = await createTestUser({ email: receiverEmail });
    senderId = sUser.id;
    receiverId = rUser.id;
    senderClient = await makeUserClient(senderEmail);

    const { data: doc, error: docErr } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: `P755-test doc ${Date.now()}`, owner_id: senderId })
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

    // Seed a snapshot so total_steps is computable
    await supabaseAdmin
      .from('letter_story_snapshots')
      .insert({
        letter_id: letterId,
        story_id: null,
        version_id: null,
        position: 0,
        point_config: JSON.stringify({ storyText: 'Test', storyTitle: 'Test', points: [] }),
        visibility: 'public',
      })
      .select('id')
      .single();

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
    if (letterId) {
      await supabaseAdmin.from('letter_story_snapshots').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (senderId) await supabaseAdmin.auth.admin.deleteUser(senderId);
    if (receiverId) await supabaseAdmin.auth.admin.deleteUser(receiverId);
  });

  test('in-progress delivery appears with restored fields (steps_completed, total_steps, type)', async () => {
    const { data, error } = await senderClient.rpc('get_inbox_items');

    expect(error, `get_inbox_items RPC failed: ${error?.message}`).toBeNull();

    const items = data as Array<Record<string, unknown>>;
    const row = items.find((item) => item.delivery_id === deliveryId);

    expect(row, `P755: in-progress delivery missing — Branch 2 WHERE gate not restored`).toBeDefined();
    expect(row?.type).toBe('recipient_in_progress');
    expect(typeof row?.steps_completed).toBe('number');
    expect(typeof row?.total_steps).toBe('number');
    // completed_at should be null for in-progress (field must be present, not absent)
    expect('completed_at' in (row ?? {})).toBe(true);
  });
});
