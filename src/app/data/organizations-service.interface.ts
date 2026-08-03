/**
 * P1010: Clarity Organizations service contract.
 *
 * Real-only — there is NO mock/real facade + VITE_USE_REAL_* flag here (Decision 8).
 * The mock/real feature-flag pattern used by agreements/events/points/stories/
 * calibration is a documented, repeated prod-incident source in this codebase, and
 * the two orgs are DB-seeded from day one, so there is no mock-data era to outgrow.
 * Tests mock at the module boundary (`vi.mock('@/app/data/organizations-service')`).
 */

export type OrgVisibility = 'public' | 'private';
export type OrgRole = 'member' | 'organizer';

export interface Organization {
  id: string;
  slug: string;
  name: string;
  /** One-line header subtitle (<=200 chars). */
  blurb: string | null;
  /** About-tab prose describing what the organization is. */
  description: string | null;
  visibility: OrgVisibility;
  hasEvents: boolean;
}

/** A roster entry as returned by the get_organization_members RPC (PII gated per-row). */
export interface OrgMember {
  profileId: string;
  slug: string | null;
  name: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  acceptedAt: string;
  role: OrgRole;
  /**
   * Has this member taken the Clarity Pledge? Membership does NOT imply pledging —
   * most members will not have. Drives the avatar's pledge ring, which must never
   * be shown to someone who has not earned it. Ungated (not PII).
   */
  hasPledged: boolean;
  /** null unless the member's profile is verified+pledged (public-by-design). */
  reason: string | null;
  /** null unless the member's profile is verified+pledged (public-by-design). */
  linkedinUrl: string | null;
}

export interface OrganizationsService {
  /** Public org by slug, or null for a private/unknown slug (RLS-gated). */
  getOrganizationBySlug(slug: string): Promise<Organization | null>;
  /** The org's roster (organizer-first), via the PII-safe SECURITY DEFINER RPC. */
  getMembers(slug: string): Promise<OrgMember[]>;
  /** The authenticated caller's own membership in this org, or null. */
  getMyMembership(orgId: string): Promise<{ role: OrgRole } | null>;
  /**
   * Accept the COA and join as a plain member. Idempotent (duplicate = no-op) —
   * `joined: false` means no row was created (already a member); callers should
   * skip join-analytics on that path since nothing actually changed.
   */
  joinOrganization(orgId: string): Promise<{ joined: boolean; termsVersion?: string }>;
  /**
   * Leave — deletes the caller's own membership row. `left: false` means zero
   * rows matched (already left / double-click); callers should skip leave-analytics.
   */
  leaveOrganization(orgId: string): Promise<{ left: boolean }>;
}
