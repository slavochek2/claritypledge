/**
 * @file 20260412180000_fix_reading_rpc_drop_expiry_check.spec.ts
 * @description P270: Migration integration test — reading RPC expiry check removal.
 *
 * Verifies: get_letter_for_reading returns data even after invitation_expires_at
 * has been set to now() (simulating first-open replay defense).
 *
 * The bug: create-and-open-letter sets invitation_expires_at = now() on first open.
 * The reading RPC checked invitation_expires_at > now(), rejecting all subsequent reads.
 * The fix: removed the expiry predicate from get_letter_for_reading (same as P683).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';

test.describe('Migration fix: reading RPC expiry check removal', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let docId: string;
  let letterId: string;
  let deliveryId: string;
  let invitationToken: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ withProfile: true });

    // Create doc (required FK for clarity_letters)
    const { data: doc } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'Expiry check test doc' })
      .select('id')
      .single();
    docId = doc!.id;

    // Create letter directly (skip seal RPC — we only need a sealed letter with a delivery)
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

    // Create delivery with a known token and future expiry
    const { data: delivery } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'expiry-test@example.com',
        receiver_name: 'Test Reader',
        status: 'sent',
        invitation_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id, invitation_token')
      .single();

    deliveryId = delivery!.id;
    invitationToken = delivery!.invitation_token;
  });

  test.afterAll(async () => {
    if (deliveryId) {
      await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
    }
    if (letterId) {
      await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    }
    if (docId) {
      await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    }
    if (sender) await deleteTestUser(sender.user.id);
  });

  test('get_letter_for_reading works after invitation_expires_at is set to now()', async () => {
    // Step 1: Verify token works before expiry
    const { data: beforeExpiry } = await supabaseAdmin.rpc('get_letter_for_reading', {
      p_token: invitationToken,
    });
    expect(beforeExpiry, 'RPC should return data before expiry simulation').toBeTruthy();
    expect(beforeExpiry.letter.id).toBe(letterId);

    // Step 2: Simulate first-open replay defense (what create-and-open-letter does)
    await supabaseAdmin
      .from('letter_deliveries')
      .update({ invitation_expires_at: new Date().toISOString() })
      .eq('id', deliveryId);

    // Step 3: Verify token STILL works after expiry (the fix)
    const { data: afterExpiry, error } = await supabaseAdmin.rpc('get_letter_for_reading', {
      p_token: invitationToken,
    });

    expect(error, `RPC failed after expiry: ${error?.message}`).toBeNull();
    expect(afterExpiry, 'RPC should return data even after invitation_expires_at = now()').toBeTruthy();
    expect(afterExpiry.letter.id).toBe(letterId);
    expect(afterExpiry.delivery.id).toBe(deliveryId);
  });
});
