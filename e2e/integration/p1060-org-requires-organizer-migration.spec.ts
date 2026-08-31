/**
 * @file p1060-org-requires-organizer-migration.spec.ts
 * @description Integration test for the events_org_requires_organizer trigger
 *   (20260831150000_p1060_events_org_requires_organizer.sql).
 *
 * WHY THIS FILE EXISTS. The events INSERT policy is only
 * `WITH CHECK (auth.uid() = host_id)` (20260118_create_events.sql:46) and says nothing
 * about org_id. Once the client could send org_id, any authenticated user could have
 * filed an event into ANY organization by editing the ?org= slug in a URL. The UI
 * refuses to carry an org the caller does not organize, but a UI gate is a suggestion —
 * this trigger is the enforcement, so it is tested against a real database.
 *
 * PL/pgSQL defers symbol resolution: a broken function body applies cleanly and fails
 * only at call time. Both paths below are therefore exercised for real, not asserted
 * from the SQL text.
 *
 * THREE PATHS, and all three matter:
 *   1. REFUSE  — a non-organizer naming an org must be rejected.
 *   2. ALLOW   — an actual organizer of that org must succeed.
 *   3. ALLOW   — org_id NULL must be untouched. This is the standalone hosting funnel
 *                (a first-time host with no group) and is the most expensive thing
 *                this change could have broken.
 * A suite containing only (1) would pass against a trigger that rejected everything.
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';
import {
  createTestOrganization,
  createTestMembership,
  deleteTestOrganization,
} from '../helpers/test-organization';

async function insertEvent(hostId: string, orgId: string | null) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  return supabaseAdmin.from('events').insert({
    slug: `p1060-trigger-${suffix}`,
    title: 'P1060 trigger fixture',
    description: 'Disposable fixture for the org-requires-organizer trigger.',
    datetime: new Date(Date.now() + 86_400_000).toISOString(),
    duration_minutes: 60,
    timezone: 'Asia/Bangkok',
    location: 'Online',
    host_id: hostId,
    org_id: orgId,
  }).select('id, org_id').single();
}

test.describe('P1060: events.org_id requires the host to be an organizer', () => {
  let orgId: string;
  let organizerId: string;
  let strangerId: string;
  const createdEventIds: string[] = [];

  test.beforeAll(async () => {
    const org = await createTestOrganization({ name: 'P1060 Trigger Org' });
    orgId = org.id;
    const organizer = await createTestUser();
    const stranger = await createTestUser();
    organizerId = organizer.user.id;
    strangerId = stranger.user.id;
    await createTestMembership(orgId, organizerId, { role: 'organizer' });
    // Deliberately a MEMBER, not an organizer — membership alone must not grant
    // hosting (P1060 D4: joining a public org is one click, so "any member" would be
    // close to "anyone").
    await createTestMembership(orgId, strangerId, { role: 'member' });
  });

  test.afterAll(async () => {
    for (const id of createdEventIds) {
      await supabaseAdmin.from('events').delete().eq('id', id);
    }
    await deleteTestOrganization(orgId);
    await deleteTestUser(organizerId);
    await deleteTestUser(strangerId);
  });

  test('REFUSES an event whose org_id names an org the host only belongs to', async () => {
    const { data, error } = await insertEvent(strangerId, orgId);
    expect(data, 'a non-organizer must not be able to file into the org').toBeNull();
    expect(error, 'the trigger must raise, not silently drop the row').not.toBeNull();
    // The named error is the point: an RLS refusal returns "0 rows", which is
    // indistinguishable from a no-match and gives the client nothing to show a human.
    expect(error?.message ?? '').toContain('not an organizer of organization');
  });

  test('ALLOWS an organizer of that org', async () => {
    const { data, error } = await insertEvent(organizerId, orgId);
    expect(error, error?.message).toBeNull();
    expect(data?.org_id).toBe(orgId);
    if (data?.id) createdEventIds.push(data.id);
  });

  test('ALLOWS a NULL org_id from any host — the standalone hosting funnel', async () => {
    const { data, error } = await insertEvent(strangerId, null);
    expect(error, error?.message).toBeNull();
    expect(data?.org_id).toBeNull();
    if (data?.id) createdEventIds.push(data.id);
  });

  test('REFUSES re-pointing an existing event at an org the host does not organize', async () => {
    const { data: created } = await insertEvent(strangerId, null);
    if (created?.id) createdEventIds.push(created.id);
    const { error } = await supabaseAdmin
      .from('events')
      .update({ org_id: orgId })
      .eq('id', created!.id);
    expect(error, 'UPDATE must be guarded too, not just INSERT').not.toBeNull();
    expect(error?.message ?? '').toContain('not an organizer of organization');
  });
});
