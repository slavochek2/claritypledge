/**
 * P1230 — a pending agreement cannot be taken over through the table UPDATE
 * policy, and a party cannot reassign who the parties are.
 *
 * Runs against the TEST project only (npx playwright test --project=integration
 * e2e/integration/p1230-pending-agreement-hijack.spec.ts). Fixtures are created
 * and removed with the service-role client; every assertion uses the anon key,
 * optionally with a signed-in user's JWT — the same credentials a browser has.
 *
 * Red/green expectations against the PROD-shaped policy (P422): 'stranger
 * hijack', 'anon update', and both 'party reassigns' tests FAIL before
 * 20260902001000 and pass after. On the TEST project the stranger test is green
 * already (test carries a narrower out-of-band policy), so the red state there
 * is carried by the anon-grant and party-reassignment tests. The controls pin
 * every legitimate write path: creator cancels, partner terminates, token
 * acceptance through accept_agreement(), lazy expiry by a party.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestAgreement, deleteTestAgreement, type TestAgreement } from '../helpers/test-agreement';

function makeAnonClient(): SupabaseClient {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function makeUserClient(accessToken: string): SupabaseClient {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

async function signIn(email: string): Promise<SupabaseClient> {
  const { data, error } = await makeAnonClient().auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull();
  return makeUserClient(data!.session!.access_token);
}

async function readRow(id: string) {
  const { data, error } = await supabaseAdmin
    .from('clarity_agreements')
    .select('id, creator_profile_id, partner_profile_id, status, invitation_token')
    .eq('id', id)
    .single();
  expect(error, error?.message).toBeNull();
  return data!;
}

test.describe('P1230: pending agreements cannot be hijacked through UPDATE', () => {
  let creator: TestUser;
  let invitee: TestUser;
  let stranger: TestUser;
  const created: string[] = [];

  async function pendingAgreement(): Promise<TestAgreement> {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
    });
    created.push(a.id);
    return a;
  }

  async function activeAgreement(): Promise<TestAgreement> {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      partnerProfileId: invitee.user.id,
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
    });
    created.push(a.id);
    return a;
  }

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1230 Creator' });
    invitee = await createTestUser({ name: 'P1230 Invitee' });
    stranger = await createTestUser({ name: 'P1230 Stranger' });
  });

  test.afterAll(async () => {
    for (const id of created) await deleteTestAgreement(id);
    for (const u of [creator, invitee, stranger]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  // ── The defect ──────────────────────────────────────────────────────────────

  test('a signed-in stranger cannot make themselves the partner of a pending agreement', async () => {
    const a = await pendingAgreement();
    const strangerClient = await signIn(stranger.email);

    const { data, error } = await strangerClient
      .from('clarity_agreements')
      .update({ partner_profile_id: stranger.user.id })
      .eq('id', a.id)
      .select('id');

    // Either the policy filters the row out (0 rows, no error) or the trigger
    // refuses (42501). Both are correct; a written row is the defect.
    if (error) expect(error.code).toBe('42501');
    expect(data ?? []).toEqual([]);

    const row = await readRow(a.id);
    expect(row.partner_profile_id).toBeNull();
    expect(row.status).toBe('pending');
  });

  test('anon holds no UPDATE on agreements at all (42501, not a silent 0-row update)', async () => {
    const a = await pendingAgreement();
    const anon = makeAnonClient();

    const { error } = await anon
      .from('clarity_agreements')
      .update({ partner_profile_id: stranger.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, 'anon UPDATE should be refused by grant').not.toBeNull();
    expect(error!.code).toBe('42501');

    const row = await readRow(a.id);
    expect(row.partner_profile_id).toBeNull();
  });

  test('the creator cannot reassign the partner id (party ids are immutable to RLS roles)', async () => {
    const a = await pendingAgreement();
    const creatorClient = await signIn(creator.email);

    const { error } = await creatorClient
      .from('clarity_agreements')
      .update({ partner_profile_id: stranger.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, 'trigger should refuse').not.toBeNull();
    expect(error!.code).toBe('42501');
    expect((await readRow(a.id)).partner_profile_id).toBeNull();
  });

  test('a party cannot reassign the creator id', async () => {
    const a = await activeAgreement();
    const partnerClient = await signIn(invitee.email);

    const { error } = await partnerClient
      .from('clarity_agreements')
      .update({ creator_profile_id: stranger.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, 'trigger should refuse').not.toBeNull();
    expect(error!.code).toBe('42501');
    expect((await readRow(a.id)).creator_profile_id).toBe(creator.user.id);
  });

  // ── Controls: every legitimate write path still works ──────────────────────

  test('control: the creator cancels a pending invitation', async () => {
    const a = await pendingAgreement();
    const creatorClient = await signIn(creator.email);

    const { data, error } = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: creator.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect((await readRow(a.id)).status).toBe('terminated');
  });

  test('control: the creator resends (rotates the token) on a pending invitation', async () => {
    const a = await pendingAgreement();
    const creatorClient = await signIn(creator.email);
    const before = (await readRow(a.id)).invitation_token;

    const { data, error } = await creatorClient
      .from('clarity_agreements')
      .update({
        invitation_token: crypto.randomUUID(),
        invitation_expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        status: 'pending',
      })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect((await readRow(a.id)).invitation_token).not.toBe(before);
  });

  test('control: the partner terminates an active agreement', async () => {
    const a = await activeAgreement();
    const partnerClient = await signIn(invitee.email);

    const { data, error } = await partnerClient
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: invitee.user.id })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect((await readRow(a.id)).status).toBe('terminated');
  });

  test('control: token acceptance through accept_agreement() still sets the partner', async () => {
    const a = await pendingAgreement();
    const inviteeClient = await signIn(invitee.email);

    const { data, error } = await inviteeClient.rpc('accept_agreement', {
      p_agreement_id: a.id,
      p_token: a.invitationToken,
      p_partner_id: invitee.user.id,
    });

    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);
    const row = await readRow(a.id);
    expect(row.partner_profile_id).toBe(invitee.user.id);
    expect(row.status).toBe('active');
  });

  test('control: a party can lazily expire an overdue pending invitation', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
      invitationExpiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    });
    created.push(a.id);
    const creatorClient = await signIn(creator.email);

    const { data, error } = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'expired' })
      .eq('id', a.id)
      .select('id');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(1);
    expect((await readRow(a.id)).status).toBe('expired');
  });
});
