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

export const organizationsService: OrganizationsService = {
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

  async joinOrganization(orgId) {
    const userId = await requireUserId();
    // role + terms_version omitted on purpose — server DEFAULTs set them (Reconciliation A).
    const { error } = await supabase
      .from('membership')
      .insert({ org_id: orgId, user_id: userId });
    // Idempotent: a duplicate join is a no-op, not an error (UAT — Join clicked twice).
    if (error && error.code !== UNIQUE_VIOLATION) {
      throw new Error(`Failed to join organization: ${error.message}`);
    }
  },

  async leaveOrganization(orgId) {
    const userId = await requireUserId();
    const { error } = await supabase
      .from('membership')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to leave organization: ${error.message}`);
  },
};
