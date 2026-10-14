/**
 * @file 20261014150000_p1487_claim_requires_intended_recipient.spec.ts
 * @description Migration integration test for P1487 (P270 rule).
 *
 * Claiming a letter delivery by its token binds the delivery to the caller's account. Only the
 * account the delivery was addressed to (confirmed email equal to the delivery's address,
 * case-insensitive) may claim it; any other signed-in account is refused and the delivery stays
 * unclaimed. Controls: the addressed recipient claims (and re-claims idempotently), address
 * case does not matter, and the sender is still refused as before.
 *
 * Run: npx playwright test --project=integration e2e/integration/20261014150000_p1487_claim_requires_intended_recipient.spec.ts
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';

const URL_ = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const opts = { auth: { autoRefreshToken: false, persistSession: false } };

async function signedIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL_, ANON_KEY, opts);
  const { error } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return client;
}

test.describe('P1487: only the addressed recipient can claim a delivery', () => {
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  const users: string[] = [];
  let senderEmail = '';
  let recipientEmail = '';
  let recipientId = '';
  let otherEmail = '';
  let docId = '';
  let letterId = '';

  /** A fresh delivery on this suite's letter (one per address is allowed, so the last one goes). */
  async function delivery(address: string): Promise<{ id: string; token: string }> {
    await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
    const { data, error } = await supabaseAdmin.from('letter_deliveries')
      .insert({ letter_id: letterId, receiver_email: address, status: 'sent' })
      .select('id, invitation_token').single();
    expect(error, error?.message).toBeNull();
    return { id: data!.id, token: data!.invitation_token };
  }

  async function receiverOf(id: string) {
    const { data } = await supabaseAdmin.from('letter_deliveries').select('receiver_profile_id').eq('id', id).single();
    return data?.receiver_profile_id ?? null;
  }

  test.beforeAll(async () => {
    const s = await createTestUser({ name: 'P1487 Claim Sender' });
    const r = await createTestUser({ name: 'P1487 Claim Recipient' });
    const o = await createTestUser({ name: 'P1487 Claim Other' });
    users.push(s.user.id, r.user.id, o.user.id);
    senderEmail = s.email; recipientEmail = r.email; recipientId = r.user.id; otherEmail = o.email;

    const { data: doc } = await supabaseAdmin.from('clarity_docs').insert({ owner_id: s.user.id, title: 'P1487 claim doc' }).select('id').single();
    docId = doc!.id;
    const { data: letter } = await supabaseAdmin.from('clarity_letters')
      .insert({ source_doc_id: docId, sender_id: s.user.id, mode: 'one-to-one', status: 'draft' }).select('id').single();
    letterId = letter!.id;
    await supabaseAdmin.from('clarity_letters').update({ status: 'sealed', sealed_at: new Date().toISOString() }).eq('id', letterId);
  });

  test.afterAll(async () => {
    if (letterId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    for (const id of users) await deleteTestUser(id);
  });

  test('a signed-in account the delivery was not addressed to cannot claim it', async () => {
    const d = await delivery(recipientEmail);
    const other = await signedIn(otherEmail);
    const { data, error } = await other.rpc('claim_letter_delivery', { p_token: d.token });
    expect(error, error?.message).toBeNull();
    expect((data as { claimed?: boolean } | null)?.claimed ?? false, `claimed by a different account: ${JSON.stringify(data)}`).toBe(false);
    expect(await receiverOf(d.id), 'delivery must stay unclaimed').toBeNull();

    // Control: the addressed recipient can still claim it afterwards.
    const recipient = await signedIn(recipientEmail);
    const ok = await recipient.rpc('claim_letter_delivery', { p_token: d.token });
    expect((ok.data as { claimed?: boolean })?.claimed).toBe(true);
    expect(await receiverOf(d.id)).toBe(recipientId);
  });

  test('control: the addressed recipient claims, and re-claiming is idempotent', async () => {
    const d = await delivery(recipientEmail);
    const recipient = await signedIn(recipientEmail);
    for (let i = 0; i < 2; i++) {
      const { data, error } = await recipient.rpc('claim_letter_delivery', { p_token: d.token });
      expect(error, error?.message).toBeNull();
      expect((data as { claimed?: boolean })?.claimed).toBe(true);
    }
    expect(await receiverOf(d.id)).toBe(recipientId);
  });

  test('control: address case and surrounding spaces do not matter', async () => {
    const d = await delivery(`  ${recipientEmail.toUpperCase()} `);
    const recipient = await signedIn(recipientEmail);
    const { data } = await recipient.rpc('claim_letter_delivery', { p_token: d.token });
    expect((data as { claimed?: boolean })?.claimed).toBe(true);
  });

  test('control: the sender is still refused', async () => {
    const d = await delivery(recipientEmail);
    const sender = await signedIn(senderEmail);
    const { data } = await sender.rpc('claim_letter_delivery', { p_token: d.token });
    expect((data as { error?: string })?.error).toBe('cannot_claim_own_letter');
    expect(await receiverOf(d.id)).toBeNull();
  });
});
