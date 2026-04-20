/**
 * @file 20260420120000_p768_get_letter_point_responses_by_token.spec.ts
 * @description P270/P768: Migration integration test — SECURITY DEFINER RPC that
 *   returns prior letter_point_responses for a delivery looked up by token.
 *
 * Verifies: get_letter_point_responses_by_token returns rows for a valid token,
 * empty for an invalid token, works for both anon and authenticated callers
 * (bypasses RLS via SECURITY DEFINER — matches P642 pattern).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

test.describe('P768 migration: get_letter_point_responses_by_token', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let docId: string;
  let pointId: string;
  let letterId: string;
  let deliveryId: string;
  let invitationToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P768 migration sender' });

    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P768 migration doc' })
      .select('id')
      .single();
    docId = doc!.id;

    const { data: point } = await supabaseAdmin
      .from('points')
      .insert({
        author_id: sender.user.id,
        statement: 'P768 migration point statement.',
      })
      .select('id')
      .single();
    pointId = point!.id;

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
    letterId = letter!.id;

    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'p768-migration@example.com',
        invitation_expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .select('id, invitation_token')
      .single();
    deliveryId = delivery!.id;
    invitationToken = delivery!.invitation_token;

    await supabaseAdmin.from('letter_point_responses').insert({
      delivery_id: deliveryId,
      point_id: pointId,
      position: 'agree',
    });
  });

  test.afterAll(async () => {
    if (deliveryId) {
      await supabaseAdmin
        .from('letter_point_responses')
        .delete()
        .eq('delivery_id', deliveryId);
      await supabaseAdmin
        .from('letter_deliveries')
        .delete()
        .eq('id', deliveryId);
    }
    if (letterId) {
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (pointId) {
      await supabaseAdmin.from('points').delete().eq('id', pointId);
    }
    if (docId) {
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('returns prior responses for valid token (anon caller)', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.rpc(
      'get_letter_point_responses_by_token',
      { p_token: invitationToken },
    );

    expect(error, `RPC errored: ${error?.message}`).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ point_id: pointId, response_position: 'agree' });
  });

  test('returns empty array for unknown token', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anonClient.rpc(
      'get_letter_point_responses_by_token',
      { p_token: '00000000-0000-0000-0000-000000000000' },
    );

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
