/**
 * @file p928-db-schema.spec.ts
 * @description Integration test for the P928 migration
 *   (20260611095343_p928_agreement_version_v5.sql), which widens the
 *   clarity_agreements.agreement_version CHECK to allow '5'.
 *
 * Verifies (against the test DB, so it FAILS if the migration was not applied):
 * - '5' is now an accepted agreement_version (the new oath, "intended meaning")
 * - 'legacy' and '4' are still accepted (grandfathered versions unaffected)
 * - an unknown value is still rejected by the CHECK (constraint not dropped)
 * - the pin trigger keeps a signed row on its stored version (cannot be PATCHed)
 *
 * Two-client note: only supabaseAdmin is needed — this is a schema/constraint
 * check, not an RLS check. Inserts are server-role to exercise the constraint
 * directly without RLS interference.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';

test.describe('P928: agreement_version CHECK allows v5', () => {
  let creatorId: string;
  const insertedIds: string[] = [];

  const baseRow = (version: string) => ({
    creator_profile_id: creatorId,
    partner_email: 'p928-int-partner@example.com',
    status: 'pending',
    visibility: 'private',
    terms_text: 'P928 integration terms',
    agreement_version: version,
  });

  test.beforeAll(async () => {
    const creator = await createTestUser({ name: 'P928-int Creator' });
    creatorId = creator.user.id;
  });

  test.afterAll(async () => {
    if (insertedIds.length) {
      await supabaseAdmin.from('clarity_agreements').delete().in('id', insertedIds);
    }
    if (creatorId) await deleteTestUser(creatorId);
  });

  test("accepts agreement_version '5' (migration applied)", async () => {
    const { data, error } = await supabaseAdmin
      .from('clarity_agreements')
      .insert(baseRow('5'))
      .select('id, agreement_version')
      .single();

    expect(
      error,
      "Migration not applied: CHECK still rejects '5'. Run ./scripts/migrate.sh",
    ).toBeNull();
    expect(data?.agreement_version).toBe('5');
    if (data?.id) insertedIds.push(data.id);
  });

  test("still accepts 'legacy' and '4' (grandfathered versions unaffected)", async () => {
    for (const v of ['legacy', '4']) {
      const { data, error } = await supabaseAdmin
        .from('clarity_agreements')
        .insert(baseRow(v))
        .select('id, agreement_version')
        .single();
      expect(error, `CHECK should still allow '${v}'`).toBeNull();
      expect(data?.agreement_version).toBe(v);
      if (data?.id) insertedIds.push(data.id);
    }
  });

  test('still rejects an unknown agreement_version (CHECK not dropped)', async () => {
    const { data, error } = await supabaseAdmin
      .from('clarity_agreements')
      .insert(baseRow('99'))
      .select('id')
      .single();
    // The CHECK must reject '99' — a non-null error proves the constraint is intact.
    expect(error, "CHECK should reject unknown version '99'").not.toBeNull();
    if (data?.id) insertedIds.push(data.id);
  });

  test('pin trigger keeps a signed row on its stored version (v5 cannot be downgraded)', async () => {
    const { data: row } = await supabaseAdmin
      .from('clarity_agreements')
      .insert(baseRow('5'))
      .select('id, agreement_version')
      .single();
    expect(row?.agreement_version).toBe('5');
    if (row?.id) insertedIds.push(row.id);

    // Attempt to downgrade the version post-insert — the pin trigger must reset it.
    const { data: updated } = await supabaseAdmin
      .from('clarity_agreements')
      .update({ agreement_version: '4' })
      .eq('id', row!.id)
      .select('agreement_version')
      .single();
    expect(updated?.agreement_version).toBe('5');
  });
});
