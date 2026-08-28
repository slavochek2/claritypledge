/**
 * P1010: Clarity Organizations service — single real implementation (Decision 8).
 *
 * Join/Leave are "act as yourself, on your own row" mutations gated entirely by RLS
 * (Decision 5): the client omits role + terms_version so the server DEFAULTs apply,
 * and the INSERT/DELETE policies bind to auth.uid(). No RPC, no SECURITY DEFINER for
 * the mutations. The roster read DOES go through get_organization_members (a PII-safe
 * SECURITY DEFINER accessor) because profiles PII is column-gated (P877, Decision 6).
 */

import { supabase } from '@/lib/supabase';
import type {
  Organization,
  OrganizationsService,
  OrgMember,
  OrgEventSummary,
  OrgParticipant,
  OrgParticipation,
  OrgRole,
} from './organizations-service.interface';

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  blurb: string | null;
  description: string | null;
  visibility: 'public' | 'private';
  has_events: boolean;
}

interface MemberRow {
  profile_id: string;
  slug: string | null;
  name: string;
  avatar_color: string | null;
  avatar_url: string | null;
  accepted_at: string;
  org_role: OrgRole;
  has_pledged: boolean | null;
  reason: string | null;
  linkedin_url: string | null;
}

// Postgres unique_violation — a duplicate (org_id, user_id) join. Makes Join idempotent.
const UNIQUE_VIOLATION = '23505';

function mapOrg(row: OrgRow): Organization {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    blurb: row.blurb,
    description: row.description,
    visibility: row.visibility,
    hasEvents: row.has_events,
  };
}

function mapMember(row: MemberRow): OrgMember {
  return {
    profileId: row.profile_id,
    slug: row.slug,
    name: row.name,
    avatarColor: row.avatar_color,
    avatarUrl: row.avatar_url,
    acceptedAt: row.accepted_at,
    role: row.org_role,
    // Default FALSE, never true: an older RPC that omits the key must under-claim
    // (no ring) rather than assert a pledge the member may not have taken.
    hasPledged: row.has_pledged ?? false,
    reason: row.reason,
    linkedinUrl: row.linkedin_url,
  };
}

async function requireUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

/**
 * P1060: how many avatars the participant row draws before it collapses into a
 * `+N` badge. The badge is computed from what is actually DRAWN, never from this
 * constant (social-proof.tsx's own comment records the off-by-N bug that caused).
 */
export const PARTICIPANT_AVATAR_LIMIT = 5;

/** Rows read for the avatar sample. Bounded — the full roster is p1192, not this. */
const PARTICIPANT_SAMPLE_ROWS = 200;

interface RsvpProfileRow {
  profile_id: string;
  profiles: {
    name: string | null;
    slug: string | null;
    avatar_color: string | null;
    avatar_url: string | null;
    has_pledged: boolean | null;
  } | null;
}

export const organizationsService: OrganizationsService = {
  async listPublicOrganizations() {
    // `.eq('visibility','public')` is redundant with RLS on purpose: the directory
    // is a public surface, and a policy change elsewhere must not silently turn it
    // into a private-org index.
    const { data, error } = await supabase
      .from('organization')
      .select('id, slug, name, blurb, description, visibility, has_events')
      .eq('visibility', 'public')
      .order('name', { ascending: true });
    if (error) throw new Error(`Failed to list organizations: ${error.message}`);
    return ((data ?? []) as OrgRow[]).map(mapOrg);
  },

  async getMemberCounts(orgIds) {
    if (orgIds.length === 0) return {};
    const { data, error } = await supabase
      .from('membership')
      .select('org_id')
      .in('org_id', orgIds);
    if (error) throw new Error(`Failed to count members: ${error.message}`);
    const counts: Record<string, number> = {};
    for (const row of (data ?? []) as { org_id: string }[]) {
      counts[row.org_id] = (counts[row.org_id] ?? 0) + 1;
    }
    return counts;
  },

  async getParticipation(orgIds) {
    if (orgIds.length === 0) return {};

    // Two hops, not a join: `events` carries the org edge, `event_rsvps` carries the
    // people. Both are anon-readable already — this adds no visibility surface.
    const { data: eventRows, error: eventErr } = await supabase
      .from('events')
      .select('id, org_id')
      .in('org_id', orgIds);
    if (eventErr) throw new Error(`Failed to load org events: ${eventErr.message}`);

    const orgOfEvent = new Map<string, string>();
    for (const row of (eventRows ?? []) as { id: string; org_id: string | null }[]) {
      if (row.org_id) orgOfEvent.set(row.id, row.org_id);
    }
    if (orgOfEvent.size === 0) return {};

    const { data: rsvpRows, error: rsvpErr } = await supabase
      .from('event_rsvps')
      .select('event_id, profile_id, profiles(name, slug, avatar_color, avatar_url, has_pledged)')
      .in('event_id', [...orgOfEvent.keys()])
      .limit(PARTICIPANT_SAMPLE_ROWS);
    if (rsvpErr) throw new Error(`Failed to load participants: ${rsvpErr.message}`);

    // DISTINCT PROFILE, not distinct RSVP: one person who came to four events is one
    // participant. Counting rows would inflate a small community into a busy one.
    const seen = new Map<string, Set<string>>();
    const sample = new Map<string, OrgParticipant[]>();
    for (const row of (rsvpRows ?? []) as unknown as (RsvpProfileRow & { event_id: string })[]) {
      const orgId = orgOfEvent.get(row.event_id);
      if (!orgId) continue;
      const seenForOrg = seen.get(orgId) ?? new Set<string>();
      if (seenForOrg.has(row.profile_id)) continue;
      seenForOrg.add(row.profile_id);
      seen.set(orgId, seenForOrg);

      const list = sample.get(orgId) ?? [];
      if (list.length < PARTICIPANT_AVATAR_LIMIT) {
        list.push({
          profileId: row.profile_id,
          name: row.profiles?.name ?? 'Participant',
          slug: row.profiles?.slug ?? null,
          avatarColor: row.profiles?.avatar_color ?? null,
          avatarUrl: row.profiles?.avatar_url ?? null,
          // Default FALSE, never true — the pledge ring must never be shown to
          // someone who has not earned it (same rule as mapMember above).
          hasPledged: row.profiles?.has_pledged ?? false,
        });
      }
      sample.set(orgId, list);
    }

    const out: Record<string, OrgParticipation> = {};
    for (const [orgId, profileIds] of seen) {
      // A zero-participant org is ABSENT from this map, not present with count 0 —
      // D9's "no row, no 0" is enforced at the data layer, not left to the caller.
      if (profileIds.size === 0) continue;
      out[orgId] = { count: profileIds.size, sample: sample.get(orgId) ?? [] };
    }
    return out;
  },

  async getEventSummaries(orgIds) {
    if (orgIds.length === 0) return {};
    // Same grace-period convention as the events service: an event stays
    // "upcoming" for a few hours past its start, so a session running right now
    // is not reported as already over.
    const graceCutoff = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('events')
      .select('org_id, datetime, status')
      .in('org_id', orgIds);
    if (error) throw new Error(`Failed to load org events: ${error.message}`);

    const out: Record<string, OrgEventSummary> = {};
    for (const row of (data ?? []) as { org_id: string | null; datetime: string; status: string }[]) {
      if (!row.org_id) continue;
      const summary = out[row.org_id] ?? { pastCount: 0, nextEventAt: null };
      const isUpcoming = row.datetime >= graceCutoff && row.status !== 'completed';
      if (isUpcoming) {
        if (!summary.nextEventAt || row.datetime < summary.nextEventAt) summary.nextEventAt = row.datetime;
      } else {
        summary.pastCount += 1;
      }
      out[row.org_id] = summary;
    }
    return out;
  },

  async getMyMembershipOrgIds() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from('membership')
      .select('org_id')
      .eq('user_id', user.id);
    if (error) throw new Error(`Failed to load memberships: ${error.message}`);
    return ((data ?? []) as { org_id: string }[]).map((r) => r.org_id);
  },

  async getOrganizationBySlug(slug) {
    const { data, error } = await supabase
      .from('organization')
      .select('id, slug, name, blurb, description, visibility, has_events')
      .eq('slug', slug)
      .maybeSingle();
    // RLS returns null (not an error) for a private/unknown slug.
    if (error) throw new Error(`Failed to load organization: ${error.message}`);
    return data ? mapOrg(data as OrgRow) : null;
  },

  async getMembers(slug) {
    const { data, error } = await supabase.rpc('get_organization_members', { p_org_slug: slug });
    if (error) throw new Error(`Failed to load members: ${error.message}`);
    return ((data ?? []) as MemberRow[]).map(mapMember);
  },

  async getMyMembership(orgId) {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('membership')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to check membership: ${error.message}`);
    return data ? { role: (data as { role: OrgRole }).role } : null;
  },

  async joinOrganization(orgId, invitedBy) {
    const userId = await requireUserId();
    // role + terms_version omitted on purpose — server DEFAULTs set them (Reconciliation A).
    // invited_by passes through raw; the membership_validate_invited_by trigger is the
    // authority on whether it resolves to an existing profile (P1076).
    const { data, error } = await supabase
      .from('membership')
      .insert({ org_id: orgId, user_id: userId, invited_by: invitedBy ?? null })
      .select('terms_version')
      .maybeSingle();
    // Idempotent: a duplicate join is a no-op, not an error (UAT — Join clicked twice).
    // `joined: false` on the no-op path lets callers skip analytics for a row that
    // wasn't actually created (an already-member re-accepting terms creates nothing).
    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { joined: false };
      throw new Error(`Failed to join organization: ${error.message}`);
    }
    return { joined: true, termsVersion: (data as { terms_version: string } | null)?.terms_version };
  },

  async leaveOrganization(orgId) {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from('membership')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .select('user_id');
    if (error) throw new Error(`Failed to leave organization: ${error.message}`);
    // `left: false` when zero rows matched (double-click, or already left) — nothing changed.
    return { left: (data ?? []).length > 0 };
  },
};
