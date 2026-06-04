/**
 * Integration test: letter_deliveries.notified_at column (P884).
 *
 * Migration: 20260604100000_p884_letter_deliveries_notified_at.sql
 *
 * Guarantees under test:
 *   1. notified_at column exists and is selectable on letter_deliveries
 *   2. New deliveries default to notified_at NULL (eligible for notification)
 *   3. Conditional claim UPDATE (SET notified_at WHERE notified_at IS NULL)
 *      claims a row exactly once — the idempotency primitive send-letter-emails
 *      relies on to never email the same delivery twice
 *
 * The one-time backfill (existing rows with receiver_email stamped at migration
 * time) is verified manually post-migration; it is not repeatably assertable
 * because pre-migration rows cannot be created after the column exists.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import {
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

test.describe('P884: letter_deliveries.notified_at', () => {
  // serial: the three tests mutate the same delivery row in sequence
  // (claim → re-claim → unclaim); fullyParallel would race them.
  test.describe.configure({ mode: 'serial', timeout: 60000 });

  let sender: TestUser;
  let docId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P884 Migration Sender' });

    const { data: doc, error } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ owner_id: sender.user.id, title: 'P884 Migration Test Doc' })
      .select('id')
      .single();
    if (error || !doc) throw new Error(`Doc creation failed: ${error?.message}`);
    docId = doc.id;

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
    const delivery = await createTestDelivery(letterId, {
      receiverEmail: `p884-mig-${Date.now()}@example.com`,
    });
    deliveryId = delivery.id;
    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id);
  });

  test('column exists and new deliveries default to NULL', async () => {
    const { data, error } = await supabaseAdmin
      .from('letter_deliveries')
      .select('id, notified_at')
      .eq('id', deliveryId)
      .single();

    expect(error, `notified_at must be selectable: ${error?.message}`).toBeNull();
    expect(data!.notified_at, 'new delivery must default to notified_at NULL').toBeNull();
  });

  test('conditional claim UPDATE claims a row exactly once', async () => {
    // First claim — must succeed (row returned)
    const first = await supabaseAdmin
      .from('letter_deliveries')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', deliveryId)
      .is('notified_at', null)
      .select('id');

    expect(first.error, `first claim must not error: ${first.error?.message}`).toBeNull();
    expect(first.data!.length, 'first conditional claim must affect the row').toBe(1);

    // Second claim — must affect zero rows (already claimed)
    const second = await supabaseAdmin
      .from('letter_deliveries')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', deliveryId)
      .is('notified_at', null)
      .select('id');

    expect(second.error).toBeNull();
    expect(second.data!.length, 'second conditional claim must affect zero rows').toBe(0);
  });

  test('notified_at can be reset to NULL (unclaim on send failure)', async () => {
    const { data, error } = await supabaseAdmin
      .from('letter_deliveries')
      .update({ notified_at: null })
      .eq('id', deliveryId)
      .select('id, notified_at');

    expect(error, `unclaim must not error: ${error?.message}`).toBeNull();
    expect(data![0].notified_at, 'notified_at must be resettable to NULL').toBeNull();
  });
});
