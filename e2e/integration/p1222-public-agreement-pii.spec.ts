/**
 * P1222 — a public agreement must not publish the invitee's email or the
 * invitation token.
 *
 * Runs against the TEST project only (npx playwright test --project=integration
 * e2e/integration/p1222-public-agreement-pii.spec.ts). Fixtures are created and
 * removed with the service-role client; every assertion below uses the anon key
 * (optionally with a signed-in user's JWT), i.e. the same credentials a browser
 * has.
 *
 * Before the P1222 policy migration (20260901234000) the two "anon" tests FAIL:
 * the table SELECT policy admits every visibility='public' row, and the table
 * grant covers every column. After it they pass. The three control tests must
 * pass before AND after — they pin the behaviour the fix is not allowed to break:
 * the public page still renders through the column-scoped RPC, a party still
 * reads its own row in full, and the token flows still resolve the agreement.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

  // ── The defect (red before the policy migration, green after) ──────────────

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

  test('control: anon renders a public agreement through get_public_agreement, without the two columns', async () => {
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

    // The partner (by profile id) sees the two rows they are bound to; the
    // pending one is theirs by email (auth.email() branch of the policy).
    const partnerClient = await signIn(partner.email);
    const { data: partnerRows } = await partnerClient
      .from('clarity_agreements')
      .select('id')
      .in('id', [publicActive.id, publicPending.id, privateActive.id]);
    expect((partnerRows ?? []).map((r) => r.id).sort()).toEqual(
      [publicActive.id, publicPending.id, privateActive.id].sort(),
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
