/**
 * @file p1060-events-org-migration.spec.ts
 * @description Integration test for the P1060 migration (adds `events.org_id`,
 *   nullable FK → organization, indexed) and the org #2 seed
 *   (`Clarity Practice Community · Online`, slug `online`).
 *
 * Two-client pattern (P270, mandatory): supabaseAdmin proves the schema exists
 * and the seed landed; a user-scoped client is not needed here because events
 * RLS is explicitly UNCHANGED by this spec (Risks: "MITIGATE — RLS drift") —
 * the RLS-unchanged assertion below is the regression guard for that.
 *
 * IMPORTANT — what this file can and cannot prove about the backfill:
 * The migration (Solution item 2) enumerates 8 real prod event slugs literally
 * and sets org_id for exactly those rows; it is NOT a location-classifier
 * function. A synthetic event seeded here with a Chiang-Mai-shaped location
 * would NOT be touched by that migration — there is no classification logic to
 * exercise against synthetic data. So:
 *   - Schema/FK/index/nullability: tested directly and must pass on every DB
 *     the migration has been applied to (test or prod).
 *   - The exact-8-rows backfill: tested BEST-EFFORT against the named prod
 *     slugs from the spec. If this suite runs against a DB that never had
 *     those prod rows (e.g. a fresh test project), the check SKIPS with an
 *     explicit console warning — it does not silently pass. Treat a skip here
 *     as "unverified on this DB," not as "backfill confirmed correct." The
 *     row-count-exactly-8 guarantee is enforced by the migration SQL itself
 *     (per Solution item 2 — "fail loudly if it did not touch exactly 8"),
 *     which is out of this file's reach to test directly (it only runs once,
 *     at migrate time).
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser } from '../helpers/test-user';
import { deleteTestEvent } from '../helpers/test-event';

// Explicit slug lists — copied verbatim from features/p1060_link_events_to_organizations.md
// Solution item 2. Source of truth: the spec, not this file — if the spec's lists ever
// change, update here too.
const CM_BACKFILL_SLUGS = [
  'clarity-dinner-1-exploring-coordination-understanding-2026-02-12-ld5e',
  'ai-run-1',
  'ai-running-club-chiang-mai-2-sun-may-24-2026-05-17-b0rc',
  'ai-running-club-chiang-mai-3-sun-may-31-2026-05-24-gfmi',
  'how-well-do-your-ai-clients-and-partners-understand-your-business-model-2026-06-08-bpl3',
  'clarity-hike-doi-pui-peak-double-loop-2026-06-21-w4k2mj',
  'clarity-hike-buddha-footprint-doi-pui-peak-2026-07-05-76dde6',
  'social-hike-buddhas-footprint-trail-2026-08-30-9099c3',
];
const KO_PHANGAN_NULL_SLUGS = [
  'clarity-run-phaeng-noi-waterfall-loop-2026-02-25-jizou5',
  'clarity-lab-koh-phangan-2026-03-12-ad3385',
];

test.describe('P1060: events.org_id migration + · Online seed', () => {
  let hostId: string;

  test.beforeAll(async () => {
    const host = await createTestUser({ name: 'P1060-int Host' });
    hostId = host.user.id;
    // P1060 D4 is now enforced in the database (events_org_requires_organizer):
    // setting org_id requires the host to be an ORGANIZER of that org. Two tests
    // below deliberately insert an org-scoped event, so the host needs that role.
    // Seeded directly (service role) because the client-facing insert policy forces
    // role='member' — self-elevation is exactly what p1010 blocks.
    const { data: cmForRole } = await supabaseAdmin
      .from('organization').select('id').eq('slug', 'cm').maybeSingle();
    if (cmForRole) {
      await supabaseAdmin.from('membership').insert({
        org_id: cmForRole.id, user_id: hostId, role: 'organizer',
      });
    }
  });

  test.afterAll(async () => {
    if (hostId) await deleteTestUser(hostId);
  });

  // ── 1. Schema existence ──────────────────────────────────────────────────
  test('events.org_id column exists', async () => {
    const { error } = await supabaseAdmin
      .from('events')
      .select('org_id')
      .limit(1);
    expect(error, `Migration not applied: run ./scripts/migrate.sh. Error: ${error?.message}`).toBeNull();
  });

  test('events.org_id accepts NULL (D1 — nullable, not NOT NULL)', async () => {
    let eventId: string | undefined;
    try {
      const { data, error } = await supabaseAdmin
        .from('events')
        .insert({
          slug: `p1060-int-null-org-${Date.now()}`,
          title: 'P1060 integration test — orgless event',
          description: 'Proves D1: org_id is nullable',
          datetime: new Date(Date.now() + 86_400_000).toISOString(),
          location: 'Test Location',
          host_id: hostId,
          org_id: null,
        })
        .select('id, org_id')
        .single();
      eventId = data?.id;
      expect(error, `null org_id must be accepted: ${error?.message}`).toBeNull();
      expect(data?.org_id).toBeNull();
    } finally {
      if (eventId) await deleteTestEvent(eventId);
    }
  });

  test('events.org_id rejects a non-existent organization (FK enforced)', async () => {
    const { error } = await supabaseAdmin
      .from('events')
      .insert({
        slug: `p1060-int-bad-fk-${Date.now()}`,
        title: 'P1060 integration test — invalid org_id',
        description: 'Proves the FK constraint is real, not just a UUID column',
        datetime: new Date(Date.now() + 86_400_000).toISOString(),
        location: 'Test Location',
        host_id: hostId,
        org_id: '00000000-0000-0000-0000-000000000000',
      });
    expect(error, 'a non-existent org_id must violate the FK constraint').not.toBeNull();
    expect(error?.code).toBe('23503'); // foreign_key_violation
  });

  test('events.org_id accepts a real organization id', async () => {
    const { data: cmOrg } = await supabaseAdmin
      .from('organization').select('id').eq('slug', 'cm').maybeSingle();
    test.skip(!cmOrg, 'seeded "cm" org not present on this DB — run p1010 migration first');

    let eventId: string | undefined;
    try {
      const { data, error } = await supabaseAdmin
        .from('events')
        .insert({
          slug: `p1060-int-valid-org-${Date.now()}`,
          title: 'P1060 integration test — org-linked event',
          description: 'Proves the FK accepts a real org id',
          datetime: new Date(Date.now() + 86_400_000).toISOString(),
          location: 'Test Location',
          host_id: hostId,
          org_id: cmOrg!.id,
        })
        .select('id, org_id')
        .single();
      eventId = data?.id;
      expect(error).toBeNull();
      expect(data?.org_id).toBe(cmOrg!.id);
    } finally {
      if (eventId) await deleteTestEvent(eventId);
    }
  });

  // ── 2. RLS unchanged (Risk: "MITIGATE — RLS drift") ─────────────────────
  test('events RLS is unchanged: an org-scoped event stays world-readable to anon', async () => {
    const { data: cmOrg } = await supabaseAdmin
      .from('organization').select('id').eq('slug', 'cm').maybeSingle();
    test.skip(!cmOrg, 'seeded "cm" org not present on this DB');

    let eventId: string | undefined;
    try {
      const { data } = await supabaseAdmin
        .from('events')
        .insert({
          slug: `p1060-int-rls-${Date.now()}`,
          title: 'P1060 RLS regression guard',
          description: 'org_id must not add a policy-level visibility filter',
          datetime: new Date(Date.now() + 86_400_000).toISOString(),
          location: 'Test Location',
          host_id: hostId,
          org_id: cmOrg!.id,
        })
        .select('id')
        .single();
      eventId = data!.id;

      // Anon client — respects RLS. The `events` SELECT policy is
      // `USING (true)` (20260118_create_events.sql) and this spec's Non-Goals
      // explicitly forbid touching it: "the scoping is a query filter, not a
      // policy." An org-scoped row must be exactly as readable as an orgless one.
      const anonRes = await fetch(
        `${process.env.VITE_SUPABASE_URL}/rest/v1/events?id=eq.${eventId}&select=id,org_id`,
        { headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY! } },
      );
      const anonRows = await anonRes.json();
      expect(anonRes.status).toBe(200);
      expect(anonRows.length, 'anon must still be able to read an org-scoped event row').toBe(1);
      expect(anonRows[0].org_id).toBe(cmOrg!.id);
    } finally {
      if (eventId) await deleteTestEvent(eventId);
    }
  });

  // ── 3. Backfill — best-effort against real prod slugs (see file header) ──
  test('backfill: the 8 named Chiang Mai slugs carry org_id=cm; the 2 named Ko Phangan slugs are NULL', async () => {
    const { data: rows, error } = await supabaseAdmin
      .from('events')
      .select('slug, org_id, organization:org_id(slug)')
      .in('slug', [...CM_BACKFILL_SLUGS, ...KO_PHANGAN_NULL_SLUGS]);
    expect(error).toBeNull();

    if (!rows || rows.length === 0) {
      console.warn(
        '[P1060] None of the named prod slugs exist on this DB — backfill correctness ' +
        'is UNVERIFIED here (expected on a fresh test project; this DB never had the ' +
        'prod rows the migration operates on). Re-run this suite against a DB seeded ' +
        'from prod, or verify manually against prod, before treating the backfill as proven.',
      );
      test.skip(true, 'no matching prod rows on this DB — see console warning above');
      return;
    }

    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
    for (const slug of CM_BACKFILL_SLUGS) {
      const row = bySlug[slug];
      if (!row) { console.warn(`[P1060] CM slug not found on this DB, skipping: ${slug}`); continue; }
      expect((row.organization as unknown as { slug: string } | null)?.slug, `${slug} must carry org_id=cm`).toBe('cm');
    }
    for (const slug of KO_PHANGAN_NULL_SLUGS) {
      const row = bySlug[slug];
      if (!row) { console.warn(`[P1060] Ko Phangan slug not found on this DB, skipping: ${slug}`); continue; }
      expect(row.org_id, `${slug} must stay NULL — it belonged to no organization`).toBeNull();
    }
  });

  // ── 4. Org #2 seed (D3, D7, Done-When bullets 3-4) ───────────────────────
  test('seeded org /org/online exists, public, has_events, carries founder copy, organizer membership', async () => {
    const { data: org, error } = await supabaseAdmin
      .from('organization')
      .select('id, slug, name, blurb, visibility, has_events')
      .eq('slug', 'online')
      .maybeSingle();
    expect(error).toBeNull();
    expect(org, 'seed migration must insert the "online" org').toBeTruthy();
    expect(org!.visibility).toBe('public');
    expect(org!.has_events).toBe(true);
    // D7 originally asserted blurb IS NULL — the Non-Goal was "do NOT invent the
    // · Online blurb", and NULL was the honest state while no founder copy existed.
    // The founder supplied it on 2026-08-31 (20260831160000_p1060_online_org_copy.sql),
    // so the condition the Non-Goal waited on has been met. What must still hold is
    // the thing D7 actually protected: never a guessed placeholder. Asserting the
    // real string keeps that guarantee — a regression to "A Clarity Organization."
    // or back to NULL now fails here.
    expect(org!.blurb, 'D7: blurb must be the founder-approved line, never a placeholder')
      .toBe('Calibrated communication practice with people outside your own field — no local group needed.');

    const { data: membership, error: memErr } = await supabaseAdmin
      .from('membership')
      .select('role, profiles:user_id(slug)')
      .eq('org_id', org!.id)
      .eq('role', 'organizer');
    expect(memErr).toBeNull();
    expect(
      (membership ?? []).length,
      'the online org must have at least one organizer membership row',
    ).toBeGreaterThan(0);
  });
});
