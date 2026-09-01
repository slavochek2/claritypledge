/**
 * P1222 — a public agreement must not publish the invitee's email or the
 * invitation token, and a JWT email claim is not possession of the inbox.
 *
 * Runs against the TEST project only (npx playwright test --project=integration
 * e2e/integration/p1222-public-agreement-pii.spec.ts). Fixtures are created and
 * removed with the service-role client; every assertion below uses the anon key
 * (optionally with a signed-in user's JWT), i.e. the same credentials a browser
 * has.
 *
 * Migrations under test: 20260901233000 + 20260901235000 (the column-scoped
 * readers), 20260901234000 + 20260901236000 (the parties-only SELECT policy,
 * then the same policy without the email-claim branch). On the TEST project the
 * anon/stranger table-read tests are green before 234000 because test carried
 * an out-of-band parties-only policy; the red state against the prod-shaped
 * policy is reproduced by the last describe, which swaps the P422 policy in
 * inside a transaction through the Management API and rolls it back.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
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

test.describe('P1222: public agreements do not expose partner_email / invitation_token', () => {
  let creator: TestUser;
  let partner: TestUser;
  let stranger: TestUser;
  let publicActive: TestAgreement;
  let publicPending: TestAgreement;
  let privateActive: TestAgreement;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1222 Creator' });
    partner = await createTestUser({ name: 'P1222 Partner' });
    stranger = await createTestUser({ name: 'P1222 Stranger' });

    // Public + active: the row a profile page lists and /agreements/:id renders to anyone.
    publicActive = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });
    // Public + pending: the shape whose token would still be live for accept/decline.
    publicPending = await createTestAgreement(creator.user.id, partner.email, {
      status: 'pending',
      visibility: 'public',
    });
    // Private + active: must never be readable by anyone but the parties.
    privateActive = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'private',
      partnerSignedAt: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    for (const a of [publicActive, publicPending, privateActive]) {
      if (a?.id) await deleteTestAgreement(a.id);
    }
    for (const u of [creator, partner, stranger]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  // ── The defect (red against the prod-shaped policy, green after 234000) ────

  test('anon direct table read of a public agreement returns no row (so no email, no token)', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon
      .from('clarity_agreements')
      .select('id, partner_email, invitation_token')
      .in('id', [publicActive.id, publicPending.id]);

    // The parties-only policy filters the rows out rather than erroring.
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  test('signed-in non-party direct table read of a public agreement returns no row', async () => {
    const strangerClient = await signIn(stranger.email);
    const { data, error } = await strangerClient
      .from('clarity_agreements')
      .select('id, partner_email, invitation_token')
      .in('id', [publicActive.id, publicPending.id, privateActive.id]);

    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  // ── Controls (green before AND after) ──────────────────────────────────────

  test('control: anon renders a public agreement through get_public_agreement, without the party-only columns', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_public_agreement', { p_id: publicActive.id });

    expect(error, error?.message).toBeNull();
    const rows = (data ?? []) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(publicActive.id);
    expect(rows[0].terms_text).toBeTruthy();
    expect(rows[0].creator_profile_id).toBe(creator.user.id);
    expect(rows[0]).not.toHaveProperty('partner_email');
    expect(rows[0]).not.toHaveProperty('invitation_token');
    expect(rows[0]).not.toHaveProperty('terminated_by');

    // The private row is not reachable through the public reader either.
    const { data: priv } = await anon.rpc('get_public_agreement', { p_id: privateActive.id });
    expect(priv ?? []).toEqual([]);
  });

  test('control: anon lists a profile\'s public active agreements through get_public_agreements_for_profile', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_public_agreements_for_profile', {
      p_profile_id: creator.user.id,
    });

    expect(error, error?.message).toBeNull();
    const rows = (data ?? []) as Record<string, unknown>[];
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(publicActive.id);
    expect(ids).not.toContain(publicPending.id); // active only
    expect(ids).not.toContain(privateActive.id); // public only
    for (const r of rows) {
      expect(r).not.toHaveProperty('partner_email');
      expect(r).not.toHaveProperty('invitation_token');
      expect(r).not.toHaveProperty('terminated_by');
    }
  });

  test('control: a party still reads its own rows in full from the table', async () => {
    const creatorClient = await signIn(creator.email);
    const { data, error } = await creatorClient
      .from('clarity_agreements')
      .select('id, partner_email, invitation_token, visibility')
      .in('id', [publicActive.id, publicPending.id, privateActive.id])
      .order('created_at');

    expect(error, error?.message).toBeNull();
    expect(data).toHaveLength(3);
    for (const row of data!) {
      expect(row.partner_email).toBe(partner.email);
      expect(row.invitation_token).toBeTruthy();
    }

    // The partner (by profile id) sees the two rows they are bound to. The
    // pending one is NOT theirs through the table any more — the email-claim
    // branch is gone (20260901236000); it reaches them via
    // get_my_pending_invitations (next describe).
    const partnerClient = await signIn(partner.email);
    const { data: partnerRows } = await partnerClient
      .from('clarity_agreements')
      .select('id')
      .in('id', [publicActive.id, publicPending.id, privateActive.id]);
    expect((partnerRows ?? []).map((r) => r.id).sort()).toEqual(
      [publicActive.id, privateActive.id].sort(),
    );
  });

  test('control: the token flow still resolves a pending agreement (get_agreement_by_token)', async () => {
    const anon = makeAnonClient();
    const { data, error } = await anon.rpc('get_agreement_by_token', {
      p_token: publicPending.invitationToken,
    });
    expect(error, error?.message).toBeNull();
    const rows = (data ?? []) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(publicPending.id);
  });
});

test.describe('P1222: pending invitations require a CONFIRMED auth email', () => {
  let creator: TestUser;
  let confirmedInvitee: TestUser;
  let unconfirmedEmail: string;
  let unconfirmedUserId: string;
  let forConfirmed: TestAgreement;
  let forUnconfirmed: TestAgreement;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1222 Creator B' });
    confirmedInvitee = await createTestUser({ name: 'P1222 Confirmed Invitee' });

    // An auth user whose address was never confirmed — the JWT still carries
    // the email claim, which is exactly the case the table policy trusted.
    unconfirmedEmail = generateTestEmail();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: unconfirmedEmail,
      password: TEST_PASSWORD,
      email_confirm: false,
      user_metadata: { name: 'P1222 Unconfirmed' },
    });
    expect(error, error?.message).toBeNull();
    unconfirmedUserId = created!.user!.id;

    forConfirmed = await createTestAgreement(creator.user.id, confirmedInvitee.email, {
      status: 'pending',
      visibility: 'private',
    });
    forUnconfirmed = await createTestAgreement(creator.user.id, unconfirmedEmail, {
      status: 'pending',
      visibility: 'private',
    });
  });

  test.afterAll(async () => {
    for (const a of [forConfirmed, forUnconfirmed]) {
      if (a?.id) await deleteTestAgreement(a.id);
    }
    if (unconfirmedUserId) await supabaseAdmin.auth.admin.deleteUser(unconfirmedUserId);
    for (const u of [creator, confirmedInvitee]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  async function unconfirmedClient(): Promise<SupabaseClient | null> {
    // With confirmations required, GoTrue refuses the password grant for an
    // unconfirmed address. Mint the session with the admin API instead so the
    // test exercises "a JWT exists for an unconfirmed email" regardless of the
    // project's grant setting.
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: unconfirmedEmail,
    });
    if (error || !data?.properties?.hashed_token) return null;
    const anon = makeAnonClient();
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
      token_hash: data.properties.hashed_token,
      type: 'magiclink',
    });
    if (verifyError || !verified.session) return null;
    return makeUserClient(verified.session.access_token);
  }

  test('an unconfirmed-email user cannot read the pending row via the table or the RPC', async () => {
    const client = await unconfirmedClient();
    test.skip(client === null, 'could not mint a session for an unconfirmed email on this project — table/RPC checks not exercised');

    const { data: tableRows, error: tableError } = await client!
      .from('clarity_agreements')
      .select('id, invitation_token')
      .eq('id', forUnconfirmed.id);
    expect(tableError).toBeNull();
    expect(tableRows ?? []).toEqual([]);

    const { data: rpcRows, error: rpcError } = await client!.rpc('get_my_pending_invitations');
    expect(rpcError, rpcError?.message).toBeNull();
    expect(rpcRows ?? []).toEqual([]);
  });

  test('a confirmed invitee reads their pending invitation via get_my_pending_invitations (with the token), not via the table', async () => {
    const client = await signIn(confirmedInvitee.email);

    const { data: rpcRows, error: rpcError } = await client.rpc('get_my_pending_invitations');
    expect(rpcError, rpcError?.message).toBeNull();
    const rows = (rpcRows ?? []) as Record<string, unknown>[];
    expect(rows.map((r) => r.id)).toEqual([forConfirmed.id]);
    expect(rows[0].invitation_token).toBe(forConfirmed.invitationToken);
    expect(rows[0]).not.toHaveProperty('terminated_by');

    const { data: tableRows, error: tableError } = await client
      .from('clarity_agreements')
      .select('id')
      .eq('id', forConfirmed.id);
    expect(tableError).toBeNull();
    expect(tableRows ?? []).toEqual([]);
  });

  test('anon cannot call get_my_pending_invitations', async () => {
    const { error } = await makeAnonClient().rpc('get_my_pending_invitations');
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});

/**
 * Migration-level red state. The TEST project never carried the prod-shaped
 * P422 SELECT policy, so the defect cannot be observed there through REST. This
 * reproduces it inside ONE transaction on the Management API: create the P422
 * policy, read the public row as the anon role, then ROLLBACK — nothing
 * persists. Skipped when SUPABASE_ACCESS_TOKEN is not in the environment.
 */
test.describe('P1222: red state against the prod-shaped policy (transactional, rolled back)', () => {
  let creator: TestUser;
  let partner: TestUser;
  let publicActive: TestAgreement;

  test.beforeAll(async () => {
    creator = await createTestUser({ name: 'P1222 Creator C' });
    partner = await createTestUser({ name: 'P1222 Partner C' });
    publicActive = await createTestAgreement(creator.user.id, partner.email, {
      partnerProfileId: partner.user.id,
      status: 'active',
      visibility: 'public',
      partnerSignedAt: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    if (publicActive?.id) await deleteTestAgreement(publicActive.id);
    for (const u of [creator, partner]) {
      if (u?.user?.id) await deleteTestUser(u.user.id);
    }
  });

  test('with the P422 policy in place, anon sees partner_email and invitation_token; the transaction is rolled back', async () => {
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
    const ref = process.env.VITE_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
    test.skip(!accessToken || !ref, 'SUPABASE_ACCESS_TOKEN / project ref not available — transactional red-state check not run');

    const sql = `
      BEGIN;
      CREATE POLICY "p1222_redstate_p422" ON public.clarity_agreements FOR SELECT
        USING (visibility = 'public' OR creator_profile_id = auth.uid() OR partner_profile_id = auth.uid());
      SET LOCAL ROLE anon;
      SELECT id, partner_email, invitation_token
      FROM public.clarity_agreements
      WHERE id = '${publicActive.id}';
    `;
    // The Management API runs the text in a single transaction; an explicit
    // ROLLBACK closes it. A failure anywhere also rolls back.
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql + '\nROLLBACK;' }),
    });
    expect(res.ok, `management API ${res.status}`).toBe(true);
    const rows = (await res.json()) as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(publicActive.id);
    expect(rows[0].partner_email).toBe(partner.email);
    expect(rows[0].invitation_token).toBe(publicActive.invitationToken);

    // Rolled back: the temporary policy is gone and anon sees nothing.
    const { data: after } = await makeAnonClient()
      .from('clarity_agreements')
      .select('id')
      .eq('id', publicActive.id);
    expect(after ?? []).toEqual([]);
    const check = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "SELECT count(*)::int AS n FROM pg_policies WHERE tablename='clarity_agreements' AND policyname='p1222_redstate_p422'" }),
    });
    expect(((await check.json()) as { n: number }[])[0].n).toBe(0);
  });
});
