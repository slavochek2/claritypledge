/**
 * P1207 — reproduce F0a, F0b and F9 on clarity_agreements.
 *
 * Written to FAIL against the current schema. Every assertion here is the fix's acceptance
 * criterion, so the file is the RED half of the canary pair; the migration is what turns it
 * GREEN. Nothing in it touches prod.
 *
 * The live SELECT policy is:
 *   (visibility='public') OR (creator_profile_id=auth.uid()) OR (partner_profile_id=auth.uid())
 *     OR (status='pending' AND lower(partner_email)=lower(auth.email()))
 * The last three branches are all "the caller is a party to this agreement" and are correctly
 * built. The FIRST branch is unconditional and sits ahead of them, and Postgres RLS is
 * row-level — it cannot withhold a column — so a public agreement hands its whole row, including
 * partner_email (a real address) and invitation_token (a capability), to anyone at all.
 *
 * The live UPDATE policy adds a third qual branch, (status='pending' AND invitation_token IS NOT
 * NULL), which admits ANY caller to a pending row. Its with_check requires the caller to be a
 * party of the RESULTING row — but an attacker satisfies that by writing themselves in.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

const anonClient = () => createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

test.describe('P1207: clarity_agreements exposes party data and is hijackable', () => {
  let creatorId: string;
  let attackerId: string;
  let attackerEmail: string;
  let agreementId: string;
  let inviteeEmail: string;
  const TOKEN = crypto.randomUUID();

  test.beforeAll(async () => {
    const creator = await createTestUser({ name: 'P1207 Creator' });
    creatorId = creator.user.id;

    attackerEmail = generateTestEmail();
    const attacker = await createTestUser({ name: 'P1207 Attacker', email: attackerEmail });
    attackerId = attacker.user.id;

    // The invitee is a THIRD party who never signs in — their address is the data F0a leaks.
    inviteeEmail = generateTestEmail();

    const { data, error } = await supabaseAdmin
      .from('clarity_agreements')
      .insert({
        creator_profile_id: creatorId,
        partner_email: inviteeEmail,
        terms_text: 'p1207 fixture terms',
        status: 'pending',
        visibility: 'public',
        invitation_token: TOKEN,
        invitation_expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`p1207 fixture: could not seed agreement: ${error.message}`);
    agreementId = data.id;
  });

  test.afterAll(async () => {
    if (agreementId) await supabaseAdmin.from('clarity_agreements').delete().eq('id', agreementId);
    for (const id of [creatorId, attackerId]) {
      if (id) await supabaseAdmin.auth.admin.deleteUser(id);
    }
  });

  test('F0a: an anonymous visitor must not read partner_email off a public agreement', async () => {
    const anon = anonClient();

    // CONTROL — the agreement exists and anon CAN still reach its public view. Without this,
    // every assertion below would pass against a database where the fixture was never seeded,
    // or where anon reaches nothing at all. The control runs through the RPC rather than the
    // table, because closing the table to non-parties is precisely what the fix does.
    const pub = await anon.rpc('get_public_agreement', { p_id: agreementId });
    expect(pub.error, `control: public projection must be callable: ${pub.error?.message}`).toBeNull();
    expect(pub.data ?? [], 'control: the public agreement must still be publicly viewable').toHaveLength(1);

    // The projection must carry the useful fields and NOT the two sensitive ones.
    const projected = (pub.data as Record<string, unknown>[])[0]!;
    expect(projected.terms_text, 'the public view must still carry the terms').toBe('p1207 fixture terms');
    expect(projected.partner_email, 'the public projection must omit partner_email').toBeUndefined();
    expect(projected.invitation_token, 'the public projection must omit invitation_token').toBeUndefined();

    // THE ASSERTION — the row is unreachable to a non-party, so partner_email cannot be read by
    // any column list, filter or embed. RLS filters the ROW rather than refusing the column,
    // which is why this asserts zero rows rather than the 42501 a column revoke would give.
    const leak = await anon.from('clarity_agreements').select('partner_email').eq('id', agreementId);
    expect(leak.data ?? [],
      `anon must reach no row at all; instead got ${JSON.stringify(leak.data)}`).toEqual([]);
  });

  test('F0b: an anonymous visitor must not read invitation_token off a public agreement', async () => {
    const anon = anonClient();
    const leak = await anon.from('clarity_agreements').select('invitation_token').eq('id', agreementId);
    expect(leak.data ?? [],
      `anon must reach no row carrying the token; instead got ${JSON.stringify(leak.data)}`).toEqual([]);

    // And the token must not be confirmable by FILTERING on it either — a filter is a read.
    // This is the F0b chain's actual entry point: obtain a token, then hand it to
    // create-and-sign for a session bound to the invitee's email.
    const byToken = await anon.from('clarity_agreements').select('id').eq('invitation_token', TOKEN);
    expect(byToken.data ?? [],
      'anon must not be able to confirm a token by filtering on it').toEqual([]);
  });

  test('F0a/F0b: select(*) must not smuggle the two columns through for anon either', async () => {
    const anon = anonClient();
    const star = await anon.from('clarity_agreements').select('*').eq('id', agreementId);
    // Either the row comes back without the columns, or the request is refused. What must never
    // happen is a row that carries them.
    const row = star.data?.[0] as Record<string, unknown> | undefined;
    if (row) {
      expect(row.partner_email, 'select(*) must not return partner_email to anon').toBeUndefined();
      expect(row.invitation_token, 'select(*) must not return invitation_token to anon').toBeUndefined();
    }
  });

  test('F9: an authenticated stranger must not be able to make themselves the partner', async () => {
    const attacker = anonClient();
    const signIn = await attacker.auth.signInWithPassword({
      email: attackerEmail, password: TEST_PASSWORD,
    });
    expect(signIn.error, `control: attacker must be able to sign in: ${signIn.error?.message}`).toBeNull();
    expect(signIn.data.user?.id, 'control: attacker session must be the attacker').toBe(attackerId);

    // The hijack: the UPDATE policy's token branch admits any caller to a pending row, and the
    // with_check is satisfied by writing yourself in as the partner.
    const hijack = await attacker
      .from('clarity_agreements')
      .update({ partner_profile_id: attackerId, status: 'active' })
      .eq('id', agreementId)
      .select();

    expect(hijack.data ?? [], 'a stranger must not be able to update this agreement').toEqual([]);

    // Read the stored row back with the service role — an empty PostgREST result is not by
    // itself proof the write was refused.
    const after = await supabaseAdmin
      .from('clarity_agreements').select('partner_profile_id, status').eq('id', agreementId).single();
    expect(after.data?.partner_profile_id, 'the agreement must still have no partner').toBeNull();
    expect(after.data?.status, 'the agreement must still be pending').toBe('pending');
  });
});
