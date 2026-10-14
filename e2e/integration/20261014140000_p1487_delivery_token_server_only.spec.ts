/**
 * @file 20261014140000_p1487_delivery_token_server_only.spec.ts
 * @description Migration integration test for P1487 (P270 rule).
 *
 * A letter delivery's invitation token must not be readable by client roles — not by the
 * letter's sender, not by the signed-in receiver, not by anon — whether read off the table or
 * through the sender's delivery-progress RPC. Controls prove the reads the app performs still
 * work: the named client column list, the progress RPC's other fields, the receiver's status
 * update, token-only reading and claiming by token.
 *
 * Run: npx playwright test --project=integration e2e/integration/20261014140000_p1487_delivery_token_server_only.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';
import { DELIVERY_COLUMNS } from '../../src/app/data/letter-delivery-columns';

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const opts = { auth: { autoRefreshToken: false, persistSession: false } };

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL_, ANON_KEY, opts);
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

test.describe('P1487: delivery invitation token is server-only', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  let senderId = '';
  let senderEmail = '';
  let receiverId = '';
  let receiverEmail = '';
  let docId = '';
  let letterId = '';
  let linkedDelivery = { id: '', token: '' };
  let openDelivery = { id: '', token: '' };
  let sender: SupabaseClient;
  let receiver: SupabaseClient;

  test.beforeAll(async () => {
    const s = await createTestUser({ name: 'P1487 Sender' });
    senderId = s.user.id; senderEmail = s.email;
    const r = await createTestUser({ name: 'P1487 Receiver' });
    receiverId = r.user.id; receiverEmail = r.email;

    const { data: doc, error: dErr } = await supabaseAdmin.from('clarity_docs')
      .insert({ owner_id: senderId, title: 'P1487 grant doc' }).select('id').single();
    expect(dErr).toBeNull();
    docId = doc!.id;
    const { data: letter, error: lErr } = await supabaseAdmin.from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: senderId, mode: 'one-to-one', status: 'draft' }).select('id').single();
    expect(lErr).toBeNull();
    letterId = letter!.id;
    await supabaseAdmin.from('clarity_letters').update({ status: 'sealed', sealed_at: new Date().toISOString() }).eq('id', letterId);

    // One delivery already linked to the receiver, one still waiting to be claimed.
    const { data: d1, error: e1 } = await supabaseAdmin.from('letter_deliveries')
      .insert({ letter_id: letterId, receiver_email: receiverEmail, receiver_profile_id: receiverId, status: 'opened' })
      .select('id, invitation_token').single();
    expect(e1).toBeNull();
    linkedDelivery = { id: d1!.id, token: d1!.invitation_token };
    const { data: d2, error: e2 } = await supabaseAdmin.from('letter_deliveries')
      .insert({ letter_id: letterId, receiver_email: `p1487-open-${Date.now()}@example.com`, status: 'sent' })
      .select('id, invitation_token').single();
    expect(e2).toBeNull();
    openDelivery = { id: d2!.id, token: d2!.invitation_token };

    sender = await signedIn(senderEmail);
    receiver = await signedIn(receiverEmail);
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await Promise.all([senderId && deleteTestUser(senderId), receiverId && deleteTestUser(receiverId)]);
  });

  // ── The hole ────────────────────────────────────────────────────────────────

  test('the sender cannot read the token off the table', async () => {
    const { data, error } = await sender.from('letter_deliveries').select('invitation_token').eq('id', openDelivery.id);
    expect(data ?? [], `sender read the token: ${JSON.stringify(data)}`).toEqual([]);
    expect(error?.code).toBe('42501');
  });

  test('the sender cannot read the token through the delivery-progress RPC', async () => {
    const { data, error } = await sender.rpc('get_deliveries_with_progress', { p_letter_ids: [letterId] });
    expect(error).toBeNull();
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row, 'progress row carries the token').not.toHaveProperty('invitation_token');
    // Control: the fields the sent tab renders are still there.
    for (const row of rows) {
      expect(row).toHaveProperty('steps_completed');
      expect(row).toHaveProperty('total_steps');
      expect(row).toHaveProperty('status');
      expect(row).toHaveProperty('receiver_email');
    }
  });

  test('the signed-in receiver cannot read the token off the table either', async () => {
    const { data, error } = await receiver.from('letter_deliveries').select('invitation_token').eq('id', linkedDelivery.id);
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe('42501');
  });

  test('anon cannot read the token', async () => {
    const anon = createClient(URL_, ANON_KEY, opts);
    const { data } = await anon.from('letter_deliveries').select('invitation_token').eq('id', openDelivery.id);
    expect(data ?? []).toEqual([]);
  });

  test('select(*) is refused for client roles (why the app names its columns)', async () => {
    const { error } = await sender.from('letter_deliveries').select('*').eq('id', openDelivery.id);
    expect(error?.code).toBe('42501');
  });

  // ── Controls: what the app does still works ─────────────────────────────────

  test('control: the app column list reads both deliveries for the sender', async () => {
    const { data, error } = await sender.from('letter_deliveries').select(DELIVERY_COLUMNS).eq('letter_id', letterId);
    expect(error, error?.message).toBeNull();
    expect((data ?? []).length).toBe(2);
    expect((data ?? []).map((r) => (r as { id: string }).id).sort()).toEqual([linkedDelivery.id, openDelivery.id].sort());
  });

  test('control: the app column list reads the receiver row, and the receiver can update its status', async () => {
    const { data, error } = await receiver.from('letter_deliveries').select(DELIVERY_COLUMNS).eq('id', linkedDelivery.id).single();
    expect(error, error?.message).toBeNull();
    expect((data as unknown as { receiver_profile_id: string }).receiver_profile_id).toBe(receiverId);

    const { error: upErr } = await receiver.from('letter_deliveries').update({ status: 'in_progress' }).eq('id', linkedDelivery.id);
    expect(upErr, upErr?.message).toBeNull();
    const { data: after } = await supabaseAdmin.from('letter_deliveries').select('status').eq('id', linkedDelivery.id).single();
    expect(after?.status).toBe('in_progress');
  });

  test('control: the letter is still readable with the token alone', async () => {
    const anon = createClient(URL_, ANON_KEY, opts);
    const { data, error } = await anon.rpc('get_letter_for_reading', { p_token: openDelivery.token });
    expect(error, error?.message).toBeNull();
    expect((data as { delivery?: { id?: string } } | null)?.delivery?.id).toBe(openDelivery.id);
  });

  test('control: a signed-in recipient can still claim a delivery by its token', async () => {
    const r2 = await createTestUser({ name: 'P1487 Claimer' });
    try {
      await supabaseAdmin.from('letter_deliveries').update({ receiver_email: r2.email }).eq('id', openDelivery.id);
      const client = await signedIn(r2.email);
      const { data, error } = await client.rpc('claim_letter_delivery', { p_token: openDelivery.token });
      expect(error, error?.message).toBeNull();
      expect((data as { claimed?: boolean })?.claimed).toBe(true);
    } finally {
      await supabaseAdmin.from('letter_deliveries').update({ receiver_profile_id: null }).eq('id', openDelivery.id);
      await deleteTestUser(r2.user.id);
    }
  });
});
