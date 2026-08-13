/**
 * @file 20260813170000_p1066_null_identity_authz_guards.spec.ts
 * @description P1066: SECURITY DEFINER RPCs must refuse a caller with no identity.
 *
 * Migration: 20260813170000_p1066_null_identity_authz_guards.sql
 *
 * The property under test: these functions must refuse a caller that carries no
 * identity, and must not be reachable without one. Analysis and review notes are
 * deliberately NOT in this file — see .private/docs/security-log.md.
 *
 * THREE INDEPENDENT LAYERS — each is asserted separately on purpose.
 *
 *   A. GUARD layer. Called with a role that still holds EXECUTE but carries no
 *      identity claim. This exercises the guard itself, independent of who is
 *      allowed to call it. Without this layer the grant revoke in layer B would
 *      mask whether the guard was ever fixed.
 *
 *   B. GRANT layer. Called as `anon` over REST. Defense in depth: a correct
 *      guard AND no grant, not either alone.
 *
 *   C. OVERLOAD layer. A signature change applied with `CREATE OR REPLACE`
 *      leaves the old arity live and separately granted. While two arities
 *      coexist, a call naming only the shared arguments cannot be resolved and
 *      PostgREST rejects it as PGRST203.
 *
 * WHY LAYER A USES THE ADMIN CLIENT: a service-role key carries no identity
 * claim, so `auth.uid()` is NULL for it just as it is for an unauthenticated
 * caller — the same input, still reachable after the anon grant is gone.
 *
 * NOT COVERED BY THIS FILE (gate 7b — stating the fixture's blind spots):
 *   - The prod-only orphaned `get_inbox_items(uuid)` overload. It does not
 *     exist on test, so no assertion here can discriminate. It must be
 *     verified by querying live `pg_proc` on prod after deploy; a green
 *     migration run is not evidence, because the identical DROP is already
 *     recorded as applied on prod and the function is still there.
 *   - The edge function's own end-to-end path. A5b covers the trusted
 *     server-side caller at the RPC boundary, but the function that invokes it
 *     is not exercised here.
 *
 * If tests fail before the fix: that is the point. Run `./scripts/migrate.sh`.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import {
  createTestUser,
  deleteTestUser,
  generateTestEmail,
  TEST_PASSWORD,
} from '../helpers/test-user';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

/** Unauthenticated client — role `anon`, no `sub` claim. */
function makeAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function makeUserClient(email: string): Promise<SupabaseClient> {
  const temp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await temp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !data.session) throw new Error(`Sign-in failed: ${error?.message}`);
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A refusal is either a thrown DB exception or a revoked grant. */
function expectRefused(error: { message: string; code?: string } | null, what: string) {
  expect(error, `${what}: expected a refusal, got success`).not.toBeNull();
  expect(
    error!.message,
    `${what}: expected an authorization refusal, got "${error!.message}"`,
  ).toMatch(/not authorized|permission denied|denied|42501|unauthenticated|authentication required/i);
}

test.describe('P1066 — SECURITY DEFINER RPCs refuse a caller with no identity', () => {
  test.setTimeout(90000);

  let senderId: string;
  let receiverId: string;
  let thirdPartyId: string;
  let thirdPartyEmail: string;

  let docId: string;
  let letterId: string;
  /** Claimed by `receiverId` — layer A2 must not be able to un-claim it. */
  let claimedDeliveryId: string;
  let claimedToken: string;
  /** `receiver_profile_id IS NULL` — layer A4's nullable-operand target. */
  let unclaimedDeliveryId: string;
  let agreementId: string;
  let agreementToken: string;

  test.beforeAll(async () => {
    const sender = await createTestUser({ name: 'P1066 Sender' });
    senderId = sender.user.id;

    const receiver = await createTestUser({ name: 'P1066 Receiver' });
    receiverId = receiver.user.id;

    thirdPartyEmail = generateTestEmail();
    const thirdParty = await createTestUser({ name: 'P1066 Third Party', email: thirdPartyEmail });
    thirdPartyId = thirdParty.user.id;

    const { data: doc, error: docErr } = await supabaseAdmin
      .from('clarity_docs')
      .insert({ title: 'P1066 guard fixture', owner_id: senderId })
      .select('id')
      .single();
    if (docErr) throw new Error(`clarity_docs insert failed: ${docErr.message}`);
    docId = doc!.id;

    const { data: letter, error: letterErr } = await supabaseAdmin
      .from('clarity_letters')
      .insert({
        source_doc_id: docId,
        sender_id: senderId,
        mode: 'one-to-one',
        status: 'sealed',
        sealed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (letterErr) throw new Error(`clarity_letters insert failed: ${letterErr.message}`);
    letterId = letter!.id;

    const { data: claimed, error: claimedErr } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'p1066-claimed@example.com',
        receiver_profile_id: receiverId,
        status: 'opened',
      })
      .select('id, invitation_token')
      .single();
    if (claimedErr) throw new Error(`claimed delivery insert failed: ${claimedErr.message}`);
    claimedDeliveryId = claimed!.id;
    claimedToken = claimed!.invitation_token;

    const { data: unclaimed, error: unclaimedErr } = await supabaseAdmin
      .from('letter_deliveries')
      .insert({
        letter_id: letterId,
        receiver_email: 'p1066-unclaimed@example.com',
        status: 'sent',
      })
      .select('id')
      .single();
    if (unclaimedErr) throw new Error(`unclaimed delivery insert failed: ${unclaimedErr.message}`);
    unclaimedDeliveryId = unclaimed!.id;

    agreementToken = crypto.randomUUID();
    const { data: agreement, error: agreementErr } = await supabaseAdmin
      .from('clarity_agreements')
      .insert({
        creator_profile_id: senderId,
        partner_email: 'p1066-partner@example.com',
        invitation_token: agreementToken,
        status: 'pending',
        visibility: 'private',
        terms_text: 'P1066 guard fixture terms',
      })
      .select('id')
      .single();
    if (agreementErr) throw new Error(`clarity_agreements insert failed: ${agreementErr.message}`);
    agreementId = agreement!.id;
  });

  test.afterAll(async () => {
    if (agreementId) await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreementId);
    if (letterId) await supabaseAdmin.from('letter_deliveries').delete().eq('letter_id', letterId);
    if (letterId) await supabaseAdmin.from('clarity_letters').delete().eq('id', letterId);
    if (docId) await supabaseAdmin.from('clarity_docs').delete().eq('id', docId);
    await Promise.all(
      [senderId, receiverId, thirdPartyId].filter(Boolean).map((id) => deleteTestUser(id)),
    );
  });

  // =========================================================================
  // Layer A — the guard itself, with EXECUTE held but auth.uid() NULL
  // =========================================================================

  test('A1: get_letter_overview returns nothing to a caller with no identity', async () => {
    const { data, error } = await supabaseAdmin.rpc('get_letter_overview', {
      p_letter_id: letterId,
    });

    // Before the fix the guard is skipped and the sender's overview is returned.
    if (error) {
      expectRefused(error, 'get_letter_overview');
    } else {
      expect(
        data,
        'get_letter_overview returned letter data to a caller with no identity',
      ).toEqual([]);
    }
  });

  test('A2: claim_letter_delivery does not un-claim a delivery for a caller with no identity', async () => {
    const { error } = await supabaseAdmin.rpc('claim_letter_delivery', {
      p_token: claimedToken,
    });

    // The write is the damage, so assert the row regardless of how it refused.
    const { data: row } = await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_profile_id')
      .eq('id', claimedDeliveryId)
      .single();

    expect(
      row?.receiver_profile_id,
      'claim_letter_delivery altered receiver_profile_id for a caller with no identity',
    ).toBe(receiverId);
    expect(error, 'claim_letter_delivery: expected a refusal').not.toBeNull();
  });

  test('A3: reveal_prediction refuses a caller with no identity', async () => {
    const { error } = await supabaseAdmin.rpc('reveal_prediction', {
      p_delivery_id: claimedDeliveryId,
      p_story_id: crypto.randomUUID(),
    });

    // Latent before the fix: it returns NULL only because a later check happens
    // to match no rows. The guard must refuse on its own.
    expectRefused(error, 'reveal_prediction');
  });

  test('A4: mark_inbox_item_read does not mark an unclaimed delivery for a caller with no identity', async () => {
    const { error } = await supabaseAdmin.rpc('mark_inbox_item_read', {
      p_delivery_id: unclaimedDeliveryId,
    });

    const { data: row } = await supabaseAdmin
      .from('letter_deliveries')
      .select('read_at')
      .eq('id', unclaimedDeliveryId)
      .single();

    expect(
      row?.read_at,
      'mark_inbox_item_read wrote read_at for a caller with no identity',
    ).toBeNull();
    expect(error, 'mark_inbox_item_read: expected a refusal').not.toBeNull();
  });

  test('A5b: accept_agreement still succeeds for a trusted server-side caller', async () => {
    // The negative case below proves the forgery is blocked. That is only half
    // the property: the sign-up path creates a partner account server-side and
    // accepts on its behalf BEFORE that account has a session, so a guard that
    // refused every identity-less caller would silently break sign-up and no
    // other test here would notice.
    const token = crypto.randomUUID();
    const { data: row, error: insertErr } = await supabaseAdmin
      .from('clarity_agreements')
      .insert({
        creator_profile_id: senderId,
        partner_email: 'p1066-serverside@example.com',
        invitation_token: token,
        status: 'pending',
        visibility: 'private',
        terms_text: 'P1066 server-side fixture terms',
      })
      .select('id')
      .single();
    if (insertErr) throw new Error(`server-side fixture insert failed: ${insertErr.message}`);

    try {
      const { data, error } = await supabaseAdmin.rpc('accept_agreement', {
        p_agreement_id: row!.id,
        p_token: token,
        p_partner_id: thirdPartyId,
        p_partner_display_name: 'Server Side Partner',
      });

      expect(error, `service-role accept was refused: ${error?.message}`).toBeNull();
      expect(data, 'service-role accept returned false').toBe(true);

      const { data: after } = await supabaseAdmin
        .from('clarity_agreements')
        .select('status, partner_profile_id')
        .eq('id', row!.id)
        .single();

      expect(after?.status).toBe('active');
      expect(
        after?.partner_profile_id,
        'the server-supplied partner id must still be honoured for a trusted caller',
      ).toBe(thirdPartyId);
    } finally {
      await supabaseAdmin.from('clarity_agreements').delete().eq('id', row!.id);
    }
  });

  test('A5: accept_agreement refuses to bind an identity the caller does not hold', async () => {
    const attacker = await makeUserClient(thirdPartyEmail);

    // Authenticated as the third party, but naming the RECEIVER as the partner.
    const { error } = await attacker.rpc('accept_agreement', {
      p_agreement_id: agreementId,
      p_token: agreementToken,
      p_partner_id: receiverId,
      p_partner_display_name: 'Forged Partner',
    });

    const { data: row } = await supabaseAdmin
      .from('clarity_agreements')
      .select('status, partner_profile_id')
      .eq('id', agreementId)
      .single();

    expect(
      row?.partner_profile_id,
      'accept_agreement bound a profile id the caller does not hold',
    ).not.toBe(receiverId);
    expect(row?.status, 'accept_agreement activated for a caller binding another profile').toBe('pending');
    expect(error, 'accept_agreement: expected a refusal').not.toBeNull();
  });

  // =========================================================================
  // Layer B — the grant. anon must not reach these at all.
  // =========================================================================

  const ANON_CASES: Array<{ fn: string; args: Record<string, unknown> }> = [
    { fn: 'get_letter_overview', args: { p_letter_id: '00000000-0000-0000-0000-000000000000' } },
    { fn: 'claim_letter_delivery', args: { p_token: '00000000-0000-0000-0000-000000000000' } },
    {
      fn: 'reveal_prediction',
      args: {
        p_delivery_id: '00000000-0000-0000-0000-000000000000',
        p_story_id: '00000000-0000-0000-0000-000000000000',
      },
    },
    { fn: 'mark_inbox_item_read', args: { p_delivery_id: '00000000-0000-0000-0000-000000000000' } },
    {
      fn: 'accept_agreement',
      args: {
        p_agreement_id: '00000000-0000-0000-0000-000000000000',
        p_token: 'not-a-real-token',
        p_partner_id: '00000000-0000-0000-0000-000000000000',
        p_partner_display_name: 'anon',
      },
    },
  ];

  for (const { fn, args } of ANON_CASES) {
    test(`B: anon cannot execute ${fn}`, async () => {
      const anonClient = makeAnonClient();
      const { error } = await anonClient.rpc(fn, args);

      expect(error, `${fn}: anon still holds EXECUTE`).not.toBeNull();
      expect(error!.message, `${fn}: expected a permission error, got "${error!.message}"`).toMatch(
        /permission denied|not authorized|denied|42501|does not exist|could not find/i,
      );
    });
  }

  // =========================================================================
  // Layer C — orphaned overload left live by a signature change
  // =========================================================================

  test('C: accept_agreement resolves unambiguously when the display name is omitted', async () => {
    const token = crypto.randomUUID();
    const { data: row, error: insertErr } = await supabaseAdmin
      .from('clarity_agreements')
      .insert({
        creator_profile_id: senderId,
        partner_email: 'p1066-overload@example.com',
        invitation_token: token,
        status: 'pending',
        visibility: 'private',
        terms_text: 'P1066 overload fixture terms',
      })
      .select('id')
      .single();
    if (insertErr) throw new Error(`overload fixture insert failed: ${insertErr.message}`);

    try {
      const { error } = await supabaseAdmin.rpc('accept_agreement', {
        p_agreement_id: row!.id,
        p_token: token,
        p_partner_id: receiverId,
      });

      // Two live overloads make this call ambiguous. PostgREST reports PGRST203
      // before Postgres is reached, so the caller never gets a real answer.
      expect(
        error?.code,
        'accept_agreement: the three-argument call did not resolve to a single function',
      ).not.toBe('PGRST203');
      expect(error?.message ?? '').not.toMatch(/could not choose the best candidate|is not unique/i);
    } finally {
      await supabaseAdmin.from('clarity_agreements').delete().eq('id', row!.id);
    }
  });
});
