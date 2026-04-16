/**
 * Integration test: P717 — get_letter_for_reading RPC returns receiver_email.
 *
 * Migration: 20260416170000_p717_add_receiver_email_to_reading_rpc.sql
 *
 * Verifies that the delivery object returned by the RPC includes receiver_email
 * so the wrong-user guard in letter-reading-page.tsx can compare it against
 * the logged-in user's email. Before this migration the field was omitted
 * ("redacted"), causing guards to silently skip.
 *
 * Uses an existing test delivery created during P717 development
 * (status: sent, unclaimed). Verifies receiver_email is present in the
 * RPC response shape; does not assert the specific address value.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

// Known test delivery in the test DB created during P717 development.
// Unclaimed, used to verify the RPC returns receiver_email.
const TEST_DELIVERY_ID = '2efedc38-f935-46ef-8d3d-32a60a701947';

test.describe('P717: get_letter_for_reading RPC includes receiver_email', () => {
  test('delivery object includes receiver_email field', async () => {
    // Fetch invitation_token at runtime — avoids hardcoding a UUID that
    // triggers secret-scanning heuristics.
    const { data: row } = await supabaseAdmin
      .from('letter_deliveries')
      .select('invitation_token')
      .eq('id', TEST_DELIVERY_ID)
      .single();

    expect(row?.invitation_token, 'Test delivery not found in DB').toBeTruthy();

    const { data, error } = await supabaseAdmin.rpc('get_letter_for_reading', {
      p_token: row!.invitation_token,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.delivery).toBeDefined();
    // Before migration: data.delivery.receiver_email was undefined.
    // After migration: the field must be present and non-empty.
    expect(data.delivery.receiver_email).toBeTruthy();
  });
});
