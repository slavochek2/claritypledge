-- P1010 follow-up: the org roster must be able to tell members from pledgers.
--
-- client-safe: CREATE OR REPLACE on get_organization_members adds ONE key
--   ('has_pledged') to each row object. Purely additive to the payload — the
--   deployed client destructures named fields and ignores unknown ones, and every
--   existing key keeps its name, type, and PII gating. Signature, volatility,
--   search_path, and grants are unchanged. No table, column, policy, or grant is
--   touched.
-- new function: none — replaces get_organization_members(text) from
--   20260724120000. Diff vs that version: + 'has_pledged' key. Nothing else.
--
-- Why: membership is NOT pledging. Most members will never have taken the Clarity
-- Pledge, but the roster card rendered every one of them with the pledger
-- verification ring, because the RPC returned no signal to distinguish them and
-- the card hardcoded isPledger={true}. That asserts something untrue about a real
-- person. `reason` is not a usable proxy — it is null both for a non-pledger AND
-- for a pledger who left it blank.
--
-- has_pledged is NOT PII: it is already returned ungated by get_featured_profiles,
-- get_profile_by_id, and the letter/results accessors (P877, P725, P843). It stays
-- OUTSIDE the verified+pledged CASE gate for that reason — gating it on itself
-- would make every non-pledger indistinguishable from a pledger, which is the bug.

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
        'has_pledged',  COALESCE(p.has_pledged, false),
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
  'P1010: public org roster. reason/linkedin_url gated per-row on verified+pledged (get_profile_by_id style, never blanket-filtered). has_pledged returned ungated so the roster can distinguish members from pledgers. Organizer sorts first. No email.';
