-- P1010: Clarity Organizations — community container (v1, two hardcoded orgs).
--
-- client-safe: the only REVOKE is the standard REVOKE-then-GRANT idiom on a
--   BRAND-NEW function (get_organization_members) that no deployed client calls —
--   it is immediately re-granted to anon+authenticated in the same migration. No
--   existing table grant, RLS policy, or column is altered; all shapes are additive
--   (two new tables + one new function). Deployed clients are unaffected.
-- new function: get_organization_members (no prior version to diff against).
--
-- New tables: organization, membership. New RPC: get_organization_members.
-- Backs /org/:slug (OrgPage) — a Meetup-style org page with About/Members/Events
-- tabs and a single-party "Join = accept the Clarity Organization Agreement (COA)"
-- flow. The membership row IS the COA acceptance record (Decision 3).
--
-- Design source: features/p1010_clarity_organizations_community_container.md
-- (Architecture Decisions 1,2,3,5,6,9 + Security Review + Reconciliation A/B).
--
-- Security-load-bearing invariants proven by the P270 integration test
-- (e2e/integration/p1010-organizations-membership-migration.spec.ts):
--   (A) membership.terms_version + role are SERVER-set (DEFAULT), never client
--       payload — the client omits both. A stale/forged version cannot be recorded.
--   (B) organization has RLS ENABLED with a visibility='public' SELECT policy —
--       load-bearing because membership_select's EXISTS(... visibility='public')
--       subquery runs under the caller's rights.
--   (C) membership_insert WITH CHECK pins client rows to user_id=auth.uid() AND
--       role='member' — blocks both impersonation and self-elevation to organizer.
--   (D) get_organization_members gates reason/linkedin_url PER ROW (get_profile_by_id
--       style, P877) — an unverified member still appears on the roster, just without
--       PII. It never blanket-filters the roster to verified+pledged.

-- ============================================================================
-- 1. organization table + RLS (Decision 2, Reconciliation B)
-- ============================================================================
CREATE TABLE public.organization (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,                       -- 'cm', 'champions' — matches /org/:slug
  name        TEXT NOT NULL,
  blurb       TEXT CHECK (char_length(blurb) <= 200),
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  has_events  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organization ENABLE ROW LEVEL SECURITY;

-- Public orgs are world-readable (Done-When: rosters/pages readable signed-out).
-- Private orgs (deferred non-goal, modeled now) are invisible to anon/authenticated.
CREATE POLICY organization_select ON public.organization FOR SELECT
  USING (visibility = 'public');

GRANT SELECT ON public.organization TO anon, authenticated;

-- ============================================================================
-- 2. membership table + RLS (Decisions 1,3,5; Reconciliation A)
-- ============================================================================
-- terms_version + role are NOT NULL DEFAULT so a client insert that omits them
-- (which is exactly what organizationsService.joinOrganization does) records the
-- server's current values — never a client-supplied one. Bumping the live oath is
-- a one-line DEFAULT + CHECK change here (mirrors the P928 agreement_version bump).
CREATE TABLE public.membership (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organization(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','organizer')),
  accepted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),      -- the row IS the COA acceptance record
  terms_version  TEXT NOT NULL DEFAULT '5' CHECK (terms_version IN ('4','5')),
  UNIQUE (org_id, user_id)
);
CREATE INDEX idx_membership_org  ON public.membership (org_id);
CREATE INDEX idx_membership_user ON public.membership (user_id);

ALTER TABLE public.membership ENABLE ROW LEVEL SECURITY;

-- SELECT: own row always; anyone may read a public org's roster.
CREATE POLICY membership_select ON public.membership FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.organization o WHERE o.id = org_id AND o.visibility = 'public')
  );

-- INSERT: act as yourself only, as a plain member, into a public org.
-- role='member' is the sole guard against client self-elevation to organizer.
CREATE POLICY membership_insert ON public.membership FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'
    AND EXISTS (SELECT 1 FROM public.organization o WHERE o.id = org_id AND o.visibility = 'public')
  );

-- DELETE: leave your own membership only.
CREATE POLICY membership_delete ON public.membership FOR DELETE TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.membership TO authenticated;
-- anon may read public rosters directly too (no PII on this table); the roster UI
-- goes through the PII-safe RPC below, but a direct anon SELECT is harmless.
GRANT SELECT ON public.membership TO anon;

-- ============================================================================
-- 3. get_organization_members RPC (Decision 6)
-- ============================================================================
-- SECURITY DEFINER so it can read the P877-gated profiles PII columns
-- (email/linkedin_url/reason are revoked from anon/authenticated at the table level).
-- Gates reason/linkedin_url PER ROW on verified+pledged — the get_profile_by_id
-- pattern, NOT get_featured_profiles' blanket WHERE filter: an unverified org member
-- must still appear on the roster (membership != verified+pledged), just without PII.
-- Organizer sorts first regardless of accepted_at (Decision 6 organizer surfacing).
-- No email is ever serialized. Convention: SET search_path = '' + schema-qualified
-- refs + REVOKE-from-PUBLIC/anon/authenticated then GRANT (P877/P904).
CREATE OR REPLACE FUNCTION public.get_organization_members(p_org_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(row_obj ORDER BY is_organizer DESC, accepted_at ASC), '[]'::jsonb)
  FROM (
    SELECT
      (m.role = 'organizer') AS is_organizer,
      m.accepted_at,
      jsonb_build_object(
        'profile_id',   p.id,
        'slug',         p.slug,
        'name',         p.name,
        'avatar_color', p.avatar_color,
        'avatar_url',   p.avatar_url,
        'accepted_at',  m.accepted_at,
        'org_role',     m.role,
        'reason',
          CASE WHEN COALESCE(p.is_verified, false) AND COALESCE(p.has_pledged, false)
               THEN p.reason ELSE NULL END,
        'linkedin_url',
          CASE WHEN COALESCE(p.is_verified, false) AND COALESCE(p.has_pledged, false)
               THEN p.linkedin_url ELSE NULL END
      ) AS row_obj
    FROM public.membership m
    JOIN public.organization o ON o.id = m.org_id
    JOIN public.profiles p ON p.id = m.user_id
    WHERE o.slug = p_org_slug
      AND o.visibility = 'public'
  ) sub;
$$;

REVOKE EXECUTE ON FUNCTION public.get_organization_members(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_members(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_organization_members(text) IS
  'P1010: public org roster. reason/linkedin_url gated per-row on verified+pledged (get_profile_by_id style, never blanket-filtered). Organizer sorts first. No email.';

-- ============================================================================
-- 4. Seed the two hardcoded orgs (Decision 9) — idempotent
-- ============================================================================
-- Names come from the spec's UX mock (founder-approved). Blurbs are factual
-- placeholders — [FOUNDER DECISION]: review/replace the two blurb strings below.
INSERT INTO public.organization (slug, name, blurb, visibility, has_events) VALUES
  ('cm',        'Clarity Community · Chiang Mai', 'Calibrated communication practice in Chiang Mai.', 'public', true),
  ('champions', 'Clarity Champions',             'People committed to verified understanding.',       'public', false)
ON CONFLICT (slug) DO NOTHING;

-- Organizer membership seed (Decision 9): resolves the organizer by PUBLIC PROFILE
-- SLUG (never email). INSERT ... SELECT so a missing profile yields zero rows instead
-- of failing the migration (fresh test DBs have no such profile) — the integration
-- test proves organizer-first ordering with its own controlled fixture regardless.
-- [FOUNDER DECISION]: replace the two placeholder slugs with the real organizer
-- profile slugs, then re-run ./scripts/migrate.sh. Until then, the orgs launch with
-- no seeded organizer (acceptable for Wizard-of-Oz v1; one-row admin re-seed later).
INSERT INTO public.membership (org_id, user_id, role, terms_version)
SELECT o.id, p.id, 'organizer', '5'
FROM public.organization o
JOIN public.profiles p ON p.slug = 'REPLACE_WITH_CM_ORGANIZER_SLUG'
WHERE o.slug = 'cm'
ON CONFLICT (org_id, user_id) DO NOTHING;

INSERT INTO public.membership (org_id, user_id, role, terms_version)
SELECT o.id, p.id, 'organizer', '5'
FROM public.organization o
JOIN public.profiles p ON p.slug = 'REPLACE_WITH_CHAMPIONS_ORGANIZER_SLUG'
WHERE o.slug = 'champions'
ON CONFLICT (org_id, user_id) DO NOTHING;
