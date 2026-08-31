/**
 * @file p1193-last-organizer-guard.spec.ts
 * @description Integration test for
 *   supabase/migrations/20260831190000_p1193_last_organizer_cannot_leave.sql —
 *   the BEFORE DELETE trigger that stops the sole organizer of a group leaving it.
 *
 * THIS IS THE TEST THAT MATTERS. The UI half is a button; the DELETE policy is still
 * `USING (user_id = auth.uid())`, so the orphaned state stays reachable from the API
 * by anyone who can call it. Every assertion here goes at the database — through a
 * user-scoped JWT, the same path `leaveOrganization` uses — so a UI-only
 * implementation fails this file and passes everything else.
 *
 * FOUR PROPERTIES, and the last two are the ones a careless guard breaks:
 *   1. the sole organizer's own DELETE is refused
 *   2. an organizer with a co-organizer, and any plain member, still leave
 *   3. deleting the ORGANIZATION still cascades through its organizer rows
 *   4. deleting the PROFILE still cascades through its organizer rows
 *
 * (3) and (4) are epistemic gate 7c in the concrete: a gate whose fixture contains
 * only inputs it should reject has an unmeasured false-positive rate. Both org_id and
 * user_id are ON DELETE CASCADE, so a guard that merely checks "is this the last
 * organizer" makes organizations undeletable and strands any profile whose owner
 * organizes a group. The trigger discriminates on pg_trigger_depth(); these two tests
 * are the only thing that proves that discriminator actually works, since it is a
 * claim about Postgres internals that cannot be settled by reading the migration.
 *
 * This file FAILS LOUDLY if the migration was not applied — that is the point.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD } from '../helpers/test-user';
import {
  createTestOrganization,
  createTestMembership,
  deleteTestOrganization,
  type TestOrganization,
} from '../helpers/test-organization';

async function makeUserClient(email: string) {
  const tmp = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error } = await tmp.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (error || !signIn.session) throw new Error(`sign-in failed for ${email}: ${error?.message}`);
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Counts membership rows via service role — the ground truth, unfiltered by RLS. */
async function membershipCount(orgId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('membership')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  if (error) throw new Error(`membershipCount failed: ${error.message}`);
  return count ?? 0;
}

test.describe('P1193: the last organizer cannot leave', () => {
  test.describe.configure({ mode: 'serial' });

  let org: TestOrganization;
  let soleOrganizer: Awaited<ReturnType<typeof createTestUser>>;
  let coOrganizer: Awaited<ReturnType<typeof createTestUser>>;
  let plainMember: Awaited<ReturnType<typeof createTestUser>>;

  test.beforeAll(async () => {
    org = await createTestOrganization({ name: 'P1193 Guard Fixture' });
    soleOrganizer = await createTestUser();
    coOrganizer = await createTestUser();
    plainMember = await createTestUser();
  });

  test.afterAll(async () => {
    // Org first — the cascade takes the memberships, which is the only teardown the
    // guard permits (see deleteTestOrganization's own note).
    if (org) await deleteTestOrganization(org.id);
    for (const u of [soleOrganizer, coOrganizer, plainMember]) {
      if (u) await deleteTestUser(u.user.id);
    }
  });

  test('the SOLE organizer cannot delete their own membership row', async () => {
    await createTestMembership(org.id, soleOrganizer.user.id, { role: 'organizer' });
    const before = await membershipCount(org.id);

    const client = await makeUserClient(soleOrganizer.email);
    const { error } = await client
      .from('membership')
      .delete()
      .eq('org_id', org.id)
      .eq('user_id', soleOrganizer.user.id);

    // A RAISE, not a silent zero-row delete. leaveOrganization already reads zero rows
    // as "you had already left" ({ left: false }), so a guard that merely matched no
    // rows would be indistinguishable from a double-click and the caller would never
    // learn why. The error is the whole contract.
    expect(error, 'the sole organizer\'s DELETE must be REFUSED, not silently ignored').not.toBeNull();
    expect(error!.message).toMatch(/only organizer/i);

    // And the row is still there. An error message with a deleted row would be worse
    // than no guard at all.
    expect(await membershipCount(org.id)).toBe(before);
  });

  test('a plain MEMBER can still leave', async () => {
    await createTestMembership(org.id, plainMember.user.id, { role: 'member' });
    const before = await membershipCount(org.id);

    const client = await makeUserClient(plainMember.email);
    const { error } = await client
      .from('membership')
      .delete()
      .eq('org_id', org.id)
      .eq('user_id', plainMember.user.id);

    expect(error, 'a plain member is never at risk of stranding the group').toBeNull();
    expect(await membershipCount(org.id)).toBe(before - 1);
  });

  test('an organizer WITH a co-organizer can still leave', async () => {
    // Two organizers now: the sole one from the first test, plus this one. Removing
    // either leaves the group with an organizer, so neither is blocked.
    await createTestMembership(org.id, coOrganizer.user.id, { role: 'organizer' });
    const before = await membershipCount(org.id);

    const client = await makeUserClient(coOrganizer.email);
    const { error } = await client
      .from('membership')
      .delete()
      .eq('org_id', org.id)
      .eq('user_id', coOrganizer.user.id);

    expect(error, 'a second organizer exists — this leave must succeed').toBeNull();
    expect(await membershipCount(org.id)).toBe(before - 1);

    // The negative control for the whole file: the group is back to ONE organizer, so
    // that one must now be refused. If this passes while the first test also passed,
    // the guard is reading the count rather than merely rejecting all organizers.
    const stuck = await makeUserClient(soleOrganizer.email);
    const { error: reblocked } = await stuck
      .from('membership')
      .delete()
      .eq('org_id', org.id)
      .eq('user_id', soleOrganizer.user.id);
    expect(reblocked, 'with the co-organizer gone, the remaining one is blocked again').not.toBeNull();
  });
});

test.describe('P1193: cascade deletes are NOT blocked (gate 7c — the false-positive half)', () => {
  test.describe.configure({ mode: 'serial' });

  test('deleting an ORGANIZATION cascades through its sole organizer row', async () => {
    const org = await createTestOrganization({ name: 'P1193 Org Cascade' });
    const organizer = await createTestUser();
    try {
      await createTestMembership(org.id, organizer.user.id, { role: 'organizer' });
      expect(await membershipCount(org.id)).toBe(1);

      // The exact operation the guard would break: this row IS a sole organizer's.
      const { error } = await supabaseAdmin.from('organization').delete().eq('id', org.id);
      expect(error, 'deleting an organization must not be blocked by the leave guard').toBeNull();

      // Exercised, not reasoned about — the membership is really gone, and so is the org.
      expect(await membershipCount(org.id)).toBe(0);
      const { data } = await supabaseAdmin.from('organization').select('id').eq('id', org.id);
      expect(data ?? []).toHaveLength(0);
    } finally {
      await deleteTestOrganization(org.id);
      await deleteTestUser(organizer.user.id);
    }
  });

  test('deleting a PROFILE cascades through its sole organizer row', async () => {
    // Distinct from the case above and NOT covered by it: here the organization still
    // exists throughout, so the trigger's "org is already gone" stand-aside cannot
    // help. Only the pg_trigger_depth() discriminator saves this one.
    const org = await createTestOrganization({ name: 'P1193 Profile Cascade' });
    const organizer = await createTestUser();
    try {
      await createTestMembership(org.id, organizer.user.id, { role: 'organizer' });
      expect(await membershipCount(org.id)).toBe(1);

      await deleteTestUser(organizer.user.id);

      expect(await membershipCount(org.id), 'the membership must cascade away with the profile').toBe(0);
      // The organization itself survives — proving the cascade came from the profile
      // side, not from the org being torn down underneath it.
      const { data } = await supabaseAdmin.from('organization').select('id').eq('id', org.id);
      expect(data ?? []).toHaveLength(1);
    } finally {
      await deleteTestOrganization(org.id);
    }
  });
});
