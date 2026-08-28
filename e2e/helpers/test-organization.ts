/**
 * @file test-organization.ts
 *
 * E2E test helpers for P1010 (Clarity Organizations).
 *
 * The app has no user-facing org-creation UI (P1010 Non-Goals: no `/org/new`) —
 * only ONE hardcoded org (`cm`) exists via migration seed, plus `online` (P1060).
 * Tests that need another disposable org (no-events state, empty-roster state,
 * private-org state, zero-participant state, controlled organizer-ordering
 * fixtures) must seed it directly via supabaseAdmin, the same way the migration
 * itself seeds `cm`/`online` (Decision 9). This mirrors the existing per-entity
 * helper pattern (test-event.ts, test-story.ts, test-point.ts).
 *
 * Column names verified against Architecture Decisions 2 & 3 in
 * features/p1010_clarity_organizations_community_container.md.
 */

import { supabaseAdmin } from './supabase-admin';

export interface TestOrganization {
  id: string;
  slug: string;
  name: string;
}

/**
 * Creates a throwaway `organization` row via service-role (bypasses RLS —
 * there is no client-side create path for orgs in v1).
 *
 * `blurb: null` is a deliberate, explicit value (P1060 D7 — "· Online launches
 * with a NULL blurb, not a placeholder string") — distinct from omitting the
 * option, which falls back to the disposable-fixture default string below.
 */
export async function createTestOrganization(overrides?: Partial<{
  slug: string;
  name: string;
  blurb: string | null;
  visibility: 'public' | 'private';
  hasEvents: boolean;
}>): Promise<TestOrganization> {
  const slug = overrides?.slug
    ?? `p1010-test-org-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const { data, error } = await supabaseAdmin
    .from('organization')
    .insert({
      slug,
      name: overrides?.name ?? 'P1010 Test Org',
      blurb: 'blurb' in (overrides ?? {}) ? overrides!.blurb : 'A disposable org fixture for P1010 test coverage.',
      visibility: overrides?.visibility ?? 'public',
      has_events: overrides?.hasEvents ?? false,
    })
    .select('id, slug, name')
    .single();

  if (error || !data) throw new Error(`Failed to create test organization: ${error?.message}`);
  return data;
}

/**
 * Seeds a `membership` row directly (bypasses RLS + server-set defaults) — needed
 * for tests that must control `accepted_at` ordering or `role` (e.g. proving the
 * organizer-first sort, Decision 6) that a real user's Join click cannot express,
 * since Join always inserts role='member' with accepted_at=now().
 */
export async function createTestMembership(
  orgId: string,
  userId: string,
  overrides?: Partial<{ role: 'member' | 'organizer'; acceptedAt: string; termsVersion: string }>,
): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from('membership')
    .insert({
      org_id: orgId,
      user_id: userId,
      role: overrides?.role ?? 'member',
      ...(overrides?.acceptedAt && { accepted_at: overrides.acceptedAt }),
      ...(overrides?.termsVersion && { terms_version: overrides.termsVersion }),
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`Failed to create test membership: ${error?.message}`);
  return data;
}

/** Deletes a test org's membership rows, then the org row itself (FK-order convention). */
export async function deleteTestOrganization(id: string): Promise<void> {
  await supabaseAdmin.from('membership').delete().eq('org_id', id);
  await supabaseAdmin.from('organization').delete().eq('id', id);
}

export async function deleteTestMembership(orgId: string, userId: string): Promise<void> {
  await supabaseAdmin.from('membership').delete().eq('org_id', orgId).eq('user_id', userId);
}
