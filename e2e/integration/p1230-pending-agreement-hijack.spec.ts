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

  // P1230 part B (20260902001500/001600) moved this path: the creator resends
  // through rotate_invitation_token(), and the direct PATCH that used to do it
  // is now refused by the trigger. Both halves are asserted — the control that
  // the path still works, and the defect test that the old one is closed.
  test('control: the creator resends (rotates the token) through rotate_invitation_token', async () => {
    const a = await pendingAgreement();
    const creatorClient = await signIn(creator.email);
    const before = await readRow(a.id);

    const { data, error } = await creatorClient.rpc('rotate_invitation_token', {
      p_agreement_id: a.id,
    });

    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);
    const after = await readRow(a.id);
    expect(after.invitation_token).not.toBe(before.invitation_token);
    expect(after.status).toBe('pending');
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

/**
 * P1230 part B — the composed takeover codex found, and the false-positive
 * check for the guards that close it.
 *
 * The staged attack is: a party returns an active row to status='pending', sets
 * an invitation_token they know, hands it to another authenticated account, and
 * that account calls accept_agreement() — which runs as the function owner and
 * is therefore exempt from the party-id trigger. Three of those five steps are
 * now refused, and each is asserted separately so a regression names itself.
 *
 * Red state: every test in the first group passes only with 20260902001500 +
 * 20260902001600 applied. Against part A alone, 'returns an active agreement to
 * pending' and 'sets the invitation token' write a row, and 'does not displace a
 * partner' returns true.
 */
test.describe('P1230 part B: the staged active -> pending -> rotate -> accept takeover', () => {
  let creator: TestUser;
  let invitee: TestUser;
  let stranger: TestUser;
  const created: string[] = [];

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1230B Creator' });
    invitee = await createTestUser({ name: 'P1230B Invitee' });
    stranger = await createTestUser({ name: 'P1230B Stranger' });
  });

  test.afterAll(async () => {
    for (const id of created) await deleteTestAgreement(id);
    for (const u of [creator, invitee, stranger]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

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

  // ── Step 1 of the attack ───────────────────────────────────────────────────

  test('a party cannot return an active agreement to pending', async () => {
    const a = await activeAgreement();
    const creatorClient = await signIn(creator.email);

    const { error } = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'pending' })
      .eq('id', a.id)
      .select('id');

    expect(error, 'trigger should refuse the status reversion').not.toBeNull();
    expect(error!.code).toBe('42501');
    expect((await readRow(a.id)).status).toBe('active');
  });

  test('a party cannot revive a terminated agreement into pending either', async () => {
    const a = await activeAgreement();
    const partnerClient = await signIn(invitee.email);

    const { error: termError } = await partnerClient
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: invitee.user.id })
      .eq('id', a.id)
      .select('id');
    expect(termError, termError?.message).toBeNull();

    const { error } = await partnerClient
      .from('clarity_agreements')
      .update({ status: 'pending' })
      .eq('id', a.id)
      .select('id');

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
    expect((await readRow(a.id)).status).toBe('terminated');
  });

  // ── Step 2 of the attack ───────────────────────────────────────────────────

  test('a party cannot set the invitation token to a value they choose', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
    });
    created.push(a.id);
    const creatorClient = await signIn(creator.email);
    const chosen = crypto.randomUUID();

    const { error } = await creatorClient
      .from('clarity_agreements')
      .update({ invitation_token: chosen })
      .eq('id', a.id)
      .select('id');

    expect(error, 'trigger should refuse a party-written token').not.toBeNull();
    expect(error!.code).toBe('42501');
    const row = await readRow(a.id);
    expect(row.invitation_token).not.toBe(chosen);
    expect(row.invitation_token).toBe(a.invitationToken);
  });

  // ── Step 5 of the attack, independently ────────────────────────────────────
  //
  // Even granting the attacker steps 1-4 (staged here with service_role, which
  // is exempt from the trigger by design), acceptance itself refuses to write
  // over a partner already on the row. This is the guard added to
  // accept_agreement, tested without relying on the trigger.

  test('accept_agreement does not displace a partner already on the row, even with a valid token', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      partnerProfileId: invitee.user.id,
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
    });
    created.push(a.id);

    // Steps 1 + 2, staged as service_role: the state the attack would have
    // produced before part B closed those steps off.
    const rotated = crypto.randomUUID();
    const { error: stageError } = await supabaseAdmin
      .from('clarity_agreements')
      .update({ status: 'pending', invitation_token: rotated })
      .eq('id', a.id);
    expect(stageError, stageError?.message).toBeNull();

    // Step 4: the stranger holds the token and calls the RPC as themselves.
    const strangerClient = await signIn(stranger.email);
    const { data, error } = await strangerClient.rpc('accept_agreement', {
      p_agreement_id: a.id,
      p_token: rotated,
      p_partner_id: stranger.user.id,
    });

    expect(error, error?.message).toBeNull();
    expect(data, 'acceptance must not write over an assigned partner').toBe(false);
    const row = await readRow(a.id);
    expect(row.partner_profile_id).toBe(invitee.user.id);
  });

  // ── False-positive check: every legitimate path these guards touch ─────────
  //
  // A guard whose tests contain only inputs it should reject has an unmeasured
  // false-positive rate. These are the paths the client actually issues.

  test('control: an email-addressed invitation (no partner id yet) still accepts', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
    });
    created.push(a.id);
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

  test('control: an invitation pre-assigned to the caller still accepts', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      partnerProfileId: invitee.user.id,
      status: 'pending',
      visibility: 'private',
    });
    created.push(a.id);
    const inviteeClient = await signIn(invitee.email);

    const { data, error } = await inviteeClient.rpc('accept_agreement', {
      p_agreement_id: a.id,
      p_token: a.invitationToken,
      p_partner_id: invitee.user.id,
    });

    expect(error, error?.message).toBeNull();
    expect(data, 'a pre-assigned partner must still be able to sign').toBe(true);
    expect((await readRow(a.id)).status).toBe('active');
  });

  test('control: the creator resends a pending invitation (token rotates, expiry extends)', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
      invitationExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    created.push(a.id);
    const creatorClient = await signIn(creator.email);

    const { data, error } = await creatorClient.rpc('rotate_invitation_token', {
      p_agreement_id: a.id,
    });

    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);
    const row = await readRow(a.id);
    expect(row.invitation_token).not.toBe(a.invitationToken);
    expect(row.status).toBe('pending');

    const { data: expiry } = await supabaseAdmin
      .from('clarity_agreements')
      .select('invitation_expires_at')
      .eq('id', a.id)
      .single();
    expect(new Date((expiry as { invitation_expires_at: string }).invitation_expires_at).getTime())
      .toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
  });

  test('control: the creator resends an EXPIRED invitation, which returns to pending', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'expired',
      visibility: 'private',
      invitationExpiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    });
    created.push(a.id);
    const creatorClient = await signIn(creator.email);

    const { data, error } = await creatorClient.rpc('rotate_invitation_token', {
      p_agreement_id: a.id,
    });

    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);
    const row = await readRow(a.id);
    expect(row.status).toBe('pending');
    expect(row.invitation_token).not.toBe(a.invitationToken);
  });

  test('control: a party still cancels, terminates and lazily expires', async () => {
    const creatorClient = await signIn(creator.email);
    const partnerClient = await signIn(invitee.email);

    const toCancel = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
    });
    created.push(toCancel.id);
    const cancel = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: creator.user.id })
      .eq('id', toCancel.id)
      .select('id');
    expect(cancel.error, cancel.error?.message).toBeNull();
    expect(cancel.data).toHaveLength(1);

    const toTerminate = await activeAgreement();
    const terminate = await partnerClient
      .from('clarity_agreements')
      .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: invitee.user.id })
      .eq('id', toTerminate.id)
      .select('id');
    expect(terminate.error, terminate.error?.message).toBeNull();
    expect(terminate.data).toHaveLength(1);

    const toExpire = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
      invitationExpiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    });
    created.push(toExpire.id);
    const expire = await creatorClient
      .from('clarity_agreements')
      .update({ status: 'expired' })
      .eq('id', toExpire.id)
      .select('id');
    expect(expire.error, expire.error?.message).toBeNull();
    expect(expire.data).toHaveLength(1);
    expect((await readRow(toExpire.id)).status).toBe('expired');
  });

  // ── The RPC's own authorization ────────────────────────────────────────────

  test('rotate_invitation_token refuses a caller who is not the creator', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
    });
    created.push(a.id);
    const strangerClient = await signIn(stranger.email);

    const { error } = await strangerClient.rpc('rotate_invitation_token', {
      p_agreement_id: a.id,
    });

    expect(error, 'only the creator may resend').not.toBeNull();
    expect(error!.code).toBe('42501');
    expect((await readRow(a.id)).invitation_token).toBe(a.invitationToken);
  });

  test('rotate_invitation_token refuses an active agreement (no invitation to resend)', async () => {
    const a = await activeAgreement();
    const creatorClient = await signIn(creator.email);

    const { error } = await creatorClient.rpc('rotate_invitation_token', {
      p_agreement_id: a.id,
    });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
    const row = await readRow(a.id);
    expect(row.status).toBe('active');
    expect(row.invitation_token).toBe(a.invitationToken);
  });

  test('anon cannot call rotate_invitation_token at all', async () => {
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      status: 'pending',
      visibility: 'private',
    });
    created.push(a.id);

    const { error } = await makeAnonClient().rpc('rotate_invitation_token', {
      p_agreement_id: a.id,
    });

    expect(error, 'anon holds no EXECUTE on the RPC').not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});
