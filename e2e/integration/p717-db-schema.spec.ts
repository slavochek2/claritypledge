/**
 * Integration test: P717 — the wrong-user guard's RPC-sourced field is present.
 *
 * Migration (original): 20260416170000_p717_add_receiver_email_to_reading_rpc.sql
 * Migration (current):  20260818134500_p1071_redact_reading_rpc_response.sql
 *
 * WHAT THIS TEST IS FOR (unchanged since P717): the wrong-user guard in
 * letter-reading-page.tsx depends on a field sourced from this RPC. Unit tests
 * mock the service and cannot see whether the real RPC actually supplies it —
 * P717 shipped two green fix commits while the guard silently skipped on every
 * real request, because the field was absent in production. This test is the
 * standing check that the guard has data to work with
 * (docs/decisions.md 2026-04-16, "integration tests verify data availability").
 *
 * WHAT CHANGED (P1071): the guard no longer compares the address client-side, so
 * the RPC no longer returns it. Returning receiver_email to any token holder
 * disclosed the recipient's address to whoever held a forwarded or logged link.
 * The comparison moved into the function; the response carries the verdict
 * `is_intended_recipient` instead. This is a contract migration, not a weakened
 * assertion — the guarantee under test is still "the guard's field is really
 * there", and the redaction P651 asked for is now additionally asserted.
 *
 * Full three-way verdict coverage (true / false / null) lives in
 * 20260818134500_p1071_redact_reading_rpc_response.spec.ts, which signs in as
 * real users. This file uses the service-role client, whose auth.uid() is NULL,
 * so the verdict here is legitimately null.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';

// Known test delivery in the test DB created during P717 development.
// Unclaimed, addressed by email.
const TEST_DELIVERY_ID = '2efedc38-f935-46ef-8d3d-32a60a701947';

test.describe('P717/P1071: get_letter_for_reading supplies the guard field, not the address', () => {
  test('delivery object carries is_intended_recipient and omits receiver_email', async () => {
    // Fetch invitation_token at runtime — avoids hardcoding a UUID that
    // triggers secret-scanning heuristics.
    const { data: row } = await supabaseAdmin
      .from('letter_deliveries')
      .select('invitation_token, receiver_email')
      .eq('id', TEST_DELIVERY_ID)
      .single();

    expect(row?.invitation_token, 'Test delivery not found in DB').toBeTruthy();
    expect(row?.receiver_email, 'Fixture must be an email-addressed delivery').toBeTruthy();

    const { data, error } = await supabaseAdmin.rpc('get_letter_for_reading', {
      p_token: row!.invitation_token,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.delivery).toBeDefined();

    // P717's guarantee, restated for the current contract: the field the guard
    // reads must actually be delivered by the RPC. `toHaveProperty` — not a
    // truthiness check — because null is a meaningful value here, and an absent
    // key is the failure this test exists to catch.
    expect(data.delivery).toHaveProperty('is_intended_recipient');
    // Service-role caller has no auth.uid(), so there is nothing to compare.
    expect(data.delivery.is_intended_recipient).toBeNull();

    // P651/P1071: the address itself must never come back.
    expect(data.delivery).not.toHaveProperty('receiver_email');
    expect(JSON.stringify(data)).not.toContain(row!.receiver_email);
  });
});
