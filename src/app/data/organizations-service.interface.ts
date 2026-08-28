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

/**
 * P1060 D9/D10: a PARTICIPANT is a distinct profile with an RSVP to an event whose
 * org_id is this organization. Distinct from a MEMBER, who has accepted the Clarity
 * Organization Terms (the membership row IS that acceptance record).
 *
 * Public avatar fields ONLY. `event_rsvps` is already world-readable
 * (`SELECT USING (true)`, 20260118_create_events.sql:70) and these four profile
 * columns are the same ones the events list already exposes to anon — no PII column
 * is added to any payload here. The browsable roster and its gated accessor are p1192.
 */
export interface OrgParticipant {
  profileId: string;
  name: string;
  slug: string | null;
  avatarColor: string | null;
  avatarUrl: string | null;
  hasPledged: boolean;
}

/** Per-organization participation: the total distinct count plus a display sample. */
export interface OrgParticipation {
  /** Distinct profiles with an RSVP to one of this org's events. */
  count: number;
  /** A bounded sample for the avatar row — never the full roster (that is p1192). */
  sample: OrgParticipant[];
}

/** P1060: what the directory card's meta row and footer badge need per organization. */
export interface OrgEventSummary {
  /** Events already held. Absent (0) organizations print no count line. */
  pastCount: number;
  /** ISO datetime of the next upcoming event, or null when nothing is scheduled. */
  nextEventAt: string | null;
}

export interface OrganizationsService {
  /**
   * Every PUBLIC organization, for the /org directory (D5). Private orgs are
   * excluded twice over: RLS (`organization_select USING (visibility = 'public')`)
   * and the explicit filter. A listing, never a creation surface.
   */
  listPublicOrganizations(): Promise<Organization[]>;
  /** Member counts keyed by org id. Reads `membership`, which anon may read for public orgs. */
  getMemberCounts(orgIds: string[]): Promise<Record<string, number>>;
  /** Participation (count + avatar sample) keyed by org id. Zero-participant orgs are absent. */
  getParticipation(orgIds: string[]): Promise<Record<string, OrgParticipation>>;
  /** Org ids the signed-in caller belongs to. Empty for a signed-out visitor. */
  getMyMembershipOrgIds(): Promise<string[]>;
  /** Next-event date + past-event count per org id, for the directory card. */
  getEventSummaries(orgIds: string[]): Promise<Record<string, OrgEventSummary>>;
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
   *
   * `invitedBy` (P1076) — the inviter's profile id, from the invite link's `?from=`
   * param. Silent attribution only; never displayed. A value that does not resolve
   * to an existing profile is nulled server-side (membership_validate_invited_by
   * trigger) — the join always succeeds regardless of what this param contains.
   */
  joinOrganization(orgId: string, invitedBy?: string): Promise<{ joined: boolean; termsVersion?: string }>;
  /**
   * Leave — deletes the caller's own membership row. `left: false` means zero
   * rows matched (already left / double-click); callers should skip leave-analytics.
   */
  leaveOrganization(orgId: string): Promise<{ left: boolean }>;
}
