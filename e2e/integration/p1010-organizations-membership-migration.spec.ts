/**
 * @file p1010-organizations-membership-migration.spec.ts
 * @description Integration test for the P1010 migration
 *   (supabase/migrations/20260724120000_p1010_organizations_membership.sql):
 *   `organization` + `membership` tables, RLS policies, and the
 *   `get_organization_members` RPC.
 *
 * Two-client pattern (P270, mandatory): supabaseAdmin proves the schema exists;
 * user-scoped JWT clients prove the RLS policies actually gate access the way
 * Decisions 1/2/3/5/6 and the Security Review + Reconciliation say they must.
 *
 * This file will FAIL LOUDLY if the migration was not applied — that is the point.
 *
 * Must-fix items this file specifically proves (Security Review + Reconciliation):
 *   (A) membership.terms_version is server-set (DEFAULT), never client-supplied.
 *   (B) organization has RLS enabled with a visibility='public' SELECT policy.
 *   Plus: role='member' WITH CHECK blocks client self-elevation to 'organizer'
 *   (Decision 1/5), and get_organization_members gates reason/linkedin_url
 *   per-row like get_profile_by_id, NOT like get_featured_profiles (Decision 6).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';
import {
  createTestOrganization,
  createTestMembership,
  deleteTestOrganization,
  type TestOrganization,
} from '../helpers/test-organization';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function makeUserClient(email: string) {
  const tmp = makeAnonClient();
  const { data: signIn, error } = await tmp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !signIn.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

test.describe('P1010: organization + membership migration', () => {
  test.describe.configure({ mode: 'serial' });

  let userAId: string, userAEmail: string;
  let userBId: string, userBEmail: string;
  let pledgedId: string;
  let unverifiedId: string;

  let publicOrg: TestOrganization;
  let privateOrg: TestOrganization;

  test.beforeAll(async () => {
    const userA = await createTestUser({ name: 'P1010-int UserA' });
    userAId = userA.user.id; userAEmail = userA.email;

    const userB = await createTestUser({ name: 'P1010-int UserB' });
    userBId = userB.user.id; userBEmail = userB.email;

    const pledged = await createTestUser({ name: 'P1010-int Pledged' });
    pledgedId = pledged.user.id;
    const { error: e1 } = await supabaseAdmin.from('profiles').update({
      is_verified: true,
      has_pledged: true,
      is_test_account: false,
      linkedin_url: 'https://linkedin.com/in/p1010-pledged',
      reason: 'P1010 integration test — public reason for a pledged member.',
    }).eq('id', pledgedId);
    expect(e1, `pledged setup: ${e1?.message}`).toBeNull();

    const unverified = await createTestUser({ name: 'P1010-int Unverified' });
    unverifiedId = unverified.user.id;
    const { error: e2 } = await supabaseAdmin.from('profiles').update({
      is_verified: false,
      has_pledged: false,
      linkedin_url: 'https://linkedin.com/in/p1010-unverified',
      reason: 'P1010 integration test — must never leak for an unverified member.',
    }).eq('id', unverifiedId);
    expect(e2, `unverified setup: ${e2?.message}`).toBeNull();

    publicOrg = await createTestOrganization({ name: 'P1010 Public Test Org', visibility: 'public' });
    privateOrg = await createTestOrganization({ name: 'P1010 Private Test Org', visibility: 'private' });
  });

  test.afterAll(async () => {
    await deleteTestOrganization(publicOrg.id);
    await deleteTestOrganization(privateOrg.id);
    await Promise.all(
      [userAId, userBId, pledgedId, unverifiedId].map((id) => deleteTestUser(id)),
    );
  });

  // ── 1. Schema existence ──────────────────────────────────────────────────
  test('organization table exists with expected columns', async () => {
    const { error } = await supabaseAdmin
      .from('organization')
      .select('id, slug, name, blurb, visibility, has_events, created_at')
      .limit(1);
    expect(error, `Migration not applied: run ./scripts/migrate.sh. Error: ${error?.message}`).toBeNull();
  });

  test('membership table exists with expected columns', async () => {
    const { error } = await supabaseAdmin
      .from('membership')
      .select('id, org_id, user_id, role, accepted_at, terms_version')
      .limit(1);
    expect(error, `Migration not applied: run ./scripts/migrate.sh. Error: ${error?.message}`).toBeNull();
  });

  // ── 2. Seeded orgs (Decision 9 + Done-When bullets 1 & 5) ───────────────
  test('seeded org /org/cm exists with the right flags, and champions was cut', async () => {
    const { data, error } = await supabaseAdmin
      .from('organization')
      .select('slug, visibility, has_events')
      .in('slug', ['cm', 'champions']);
    expect(error).toBeNull();
    const bySlug = Object.fromEntries((data ?? []).map((r) => [r.slug, r]));
    expect(bySlug.cm, 'seed migration must insert the cm org').toBeTruthy();
    expect(bySlug.cm.visibility).toBe('public');
    expect(bySlug.cm.has_events, 'cm has the calendar embed').toBe(true);

    // Asserting ABSENCE, not just dropping the old assertions. `champions` was cut
    // from the seed before it ever ran on prod (founder decision, 2026-07-29), and the
    // row had already been created on test by the earlier version of the migration —
    // so without this the removal is provable on prod and invisible on test, which is
    // exactly the drift this integration suite exists to catch.
    expect(bySlug.champions, 'champions was cut from the seed — no row may remain').toBeUndefined();
  });

  // ── 3. organization RLS (Reconciliation item B) ─────────────────────────
  test('organization RLS: anon can read a public org, cannot read a private org', async () => {
    const anon = makeAnonClient();

    const { data: pub, error: pubErr } = await anon
      .from('organization').select('id').eq('id', publicOrg.id).maybeSingle();
    expect(pubErr).toBeNull();
    expect(pub, 'anon must be able to read a public org row').toBeTruthy();

    const { data: priv, error: privErr } = await anon
      .from('organization').select('id').eq('id', privateOrg.id).maybeSingle();
    expect(privErr).toBeNull();
    expect(priv, 'anon must NOT be able to read a private org row').toBeNull();
  });

  // ── 4. membership INSERT (Decision 5, Security Review) ──────────────────
  test('membership INSERT: authenticated user joins as self — role and terms_version are server-set', async () => {
    const me = await makeUserClient(userAEmail);
    // Deliberately omit role AND terms_version — proves DEFAULTs apply (Reconciliation item A).
    const { data, error } = await me
      .from('membership')
      .insert({ org_id: publicOrg.id, user_id: userAId })
      .select('role, terms_version, accepted_at')
      .single();

    expect(error, `RLS blocked a self-join: ${error?.message}`).toBeNull();
    expect(data?.role, "role must default to 'member', never client-supplied").toBe('member');
    expect(data?.terms_version, 'terms_version must be server-set, never null').toMatch(/^(4|5)$/);
    expect(data?.accepted_at, 'accepted_at must be server-set (now())').toBeTruthy();
  });

  test('membership INSERT: client cannot self-elevate to organizer', async () => {
    const me = await makeUserClient(userBEmail);
    const { error } = await me
      .from('membership')
      .insert({ org_id: publicOrg.id, user_id: userBId, role: 'organizer' });
    expect(error, "WITH CHECK must reject role='organizer' from a client insert").not.toBeNull();
  });

  test('membership INSERT: user cannot insert a row impersonating another user_id', async () => {
    // userB attempts to insert a membership row AS userA (already joined above) into a
    // fresh org — impersonation via a client-passed user_id, the exact hole Decision 5's
    // "never a client-passed user_id" clause exists to close.
    const otherOrg = await createTestOrganization({ name: 'P1010 Impersonation Target Org' });
    try {
      const attacker = await makeUserClient(userBEmail);
      const { error } = await attacker
        .from('membership')
        .insert({ org_id: otherOrg.id, user_id: userAId });
      expect(error, 'RLS must reject user_id != auth.uid()').not.toBeNull();
    } finally {
      await deleteTestOrganization(otherOrg.id);
    }
  });

  test('membership INSERT: UNIQUE(org_id, user_id) rejects a duplicate join', async () => {
    // userA already joined publicOrg in the first INSERT test above.
    const me = await makeUserClient(userAEmail);
    const { error } = await me
      .from('membership')
      .insert({ org_id: publicOrg.id, user_id: userAId });
    expect(error, 'duplicate (org_id, user_id) must violate the UNIQUE constraint').not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  // ── 5. membership DELETE (Decision 5, Done-When bullet 7) ───────────────
  test('membership DELETE: user can leave (delete own row)', async () => {
    const me = await makeUserClient(userAEmail);
    const { error } = await me
      .from('membership')
      .delete()
      .eq('org_id', publicOrg.id)
      .eq('user_id', userAId);
    expect(error).toBeNull();

    const { data: check } = await supabaseAdmin
      .from('membership').select('id').eq('org_id', publicOrg.id).eq('user_id', userAId).maybeSingle();
    expect(check, 'row must actually be gone').toBeNull();
  });

  test('membership DELETE: user cannot delete another user\'s row', async () => {
    // Re-seed userA's membership (admin bypass) so userB has a target to attack.
    await createTestMembership(publicOrg.id, userAId);

    const attacker = await makeUserClient(userBEmail);
    await attacker
      .from('membership')
      .delete()
      .eq('org_id', publicOrg.id)
      .eq('user_id', userAId); // no error thrown — RLS just filters to zero matching rows

    const { data: stillThere } = await supabaseAdmin
      .from('membership').select('id').eq('org_id', publicOrg.id).eq('user_id', userAId).maybeSingle();
    expect(stillThere, "userB's delete must not remove userA's row").toBeTruthy();
  });

  // ── 6. get_organization_members RPC (Decision 6) ────────────────────────
  test('get_organization_members: anon can call it, organizer sorts first regardless of accepted_at', async () => {
    const org = await createTestOrganization({ name: 'P1010 Roster Order Org' });
    try {
      // Member joins FIRST (earlier accepted_at); organizer is seeded SECOND (later
      // accepted_at) — proves ORDER BY (org_role='organizer') DESC beats accepted_at ASC.
      await createTestMembership(org.id, unverifiedId, {
        role: 'member',
        acceptedAt: new Date(Date.now() - 60_000).toISOString(),
      });
      await createTestMembership(org.id, pledgedId, {
        role: 'organizer',
        acceptedAt: new Date().toISOString(),
      });

      const anon = makeAnonClient();
      const { data, error } = await anon.rpc('get_organization_members', { p_org_slug: org.slug });
      expect(error, `rpc error: ${error?.message}`).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data[0].org_role, 'organizer must sort first even though joined later').toBe('organizer');
      expect(data[0].profile_id).toBe(pledgedId);
    } finally {
      await deleteTestOrganization(org.id);
    }
  });

  test('get_organization_members: gates reason/linkedin_url PER ROW (get_profile_by_id style), never blanket-filters the roster', async () => {
    const org = await createTestOrganization({ name: 'P1010 PII Gate Org' });
    try {
      await createTestMembership(org.id, pledgedId, { role: 'member' });
      await createTestMembership(org.id, unverifiedId, { role: 'member' });

      const anon = makeAnonClient();
      const { data, error } = await anon.rpc('get_organization_members', { p_org_slug: org.slug });
      expect(error, `rpc error: ${error?.message}`).toBeNull();

      const rows = data as Array<Record<string, unknown>>;
      // Critical distinction from get_featured_profiles: the unverified member must
      // still APPEAR on the roster — org membership ≠ verified+pledged (Decision 6).
      expect(
        rows.some((r) => r.profile_id === unverifiedId),
        'unverified member must still appear on the roster (not blanket-filtered)',
      ).toBe(true);

      const pledgedRow = rows.find((r) => r.profile_id === pledgedId)!;
      const unverifiedRow = rows.find((r) => r.profile_id === unverifiedId)!;
      expect(pledgedRow.reason, 'pledged member reason is public').toBeTruthy();
      expect(pledgedRow.linkedin_url, 'pledged member linkedin is public').toBeTruthy();
      expect(unverifiedRow.reason, 'unverified member reason must be hidden').toBeNull();
      expect(unverifiedRow.linkedin_url, 'unverified member linkedin must be hidden').toBeNull();
      expect('email' in pledgedRow, 'roster rows must never carry an email key').toBe(false);
    } finally {
      await deleteTestOrganization(org.id);
    }
  });
});
