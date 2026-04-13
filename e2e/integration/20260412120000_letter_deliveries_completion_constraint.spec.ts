/**
 * Integration test: letter_deliveries completion constraint
 *
 * Verifies the CHECK constraint `completed_at_status_sync` is applied:
 * - completed_at IS NULL requires status != 'completed'
 * - completed_at IS NOT NULL requires status = 'completed'
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

async function getSourceLetterId(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('clarity_letters')
    .select('id')
    .limit(1)
    .single();
  if (error || !data) throw new Error(`Could not fetch a letter for FK: ${error?.message}`);
  return data.id;
}

async function insertTestDelivery(letterId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('letter_deliveries')
    .insert({
      letter_id: letterId,
      receiver_email: `constraint-test-${Date.now()}@example.com`,
      status: 'sent',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`Insert failed: ${error?.message}`);
  return data.id;
}

test.describe('Migration: letter_deliveries completed_at_status_sync constraint', () => {
  test('constraint rejected: setting completed_at without status=completed', async () => {
    const letterId = await getSourceLetterId();
    const deliveryId = await insertTestDelivery(letterId);

    try {
      const { error } = await supabaseAdmin
        .from('letter_deliveries')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', deliveryId);

      expect(error, 'Expected constraint violation but update succeeded').not.toBeNull();
      expect(error!.message).toMatch(/completed_at_status_sync|check constraint/i);
    } finally {
      await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
    }
  });

  test('constraint allowed: setting both completed_at and status=completed', async () => {
    const letterId = await getSourceLetterId();
    const deliveryId = await insertTestDelivery(letterId);

    try {
      const { error } = await supabaseAdmin
        .from('letter_deliveries')
        .update({
          completed_at: new Date().toISOString(),
          status: 'completed',
        })
        .eq('id', deliveryId);

      expect(error, `Valid completion update was rejected: ${error?.message}`).toBeNull();
    } finally {
      await supabaseAdmin.from('letter_deliveries').delete().eq('id', deliveryId);
    }
  });
});
