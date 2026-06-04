-- P886: re-apply the P877 profiles PII column gate (incident follow-up).
--
-- requires-frontend: 529544d8
-- (the P877 RPC-accessor client — reads profiles via get_profile_by_id /
--  get_featured_profiles / upsert_my_profile etc. instead of direct column reads.
--  Applying this gate while a pre-P877 bundle is live 403s every login/signup/
--  profile read — that is exactly the 2026-06-04 incident.)
--
-- Why a NEW file: the original P877 migration (20260602160000) swept onto prod on
-- 2026-06-04 with a pre-P877 bundle live (P858 backend-only ship ran migrate.sh,
-- which applied ALL pending migrations). Every prod login 403'd for ~1.5h. The
-- emergency mitigation re-granted table-level SELECT on profiles to anon +
-- authenticated via the Management API — untracked drift that re-opened the P877
-- PII exposure (email, linkedin_url, reason bulk-readable via the anon key).
-- Version 20260602160000 is already recorded in supabase_migrations.schema_migrations,
-- so the original can never re-apply; only this file restores the gate.
--
-- Scope: section 3 of the P877 migration ONLY. Sections 1–2 (the SECURITY DEFINER
-- accessors + their EXECUTE grants) survived the mitigation and are live on prod —
-- verified by /reproduce 2026-06-05 (get_featured_profiles + email_exists return 200).
--
-- Postgres semantics (decisions.md 2026-06-04, P877 trap 1): a column-level
-- REVOKE SELECT (col) is a no-op while the role holds a table-level SELECT grant.
-- The only correct gate is: drop the table-level SELECT, then re-grant SELECT at
-- the column level on the non-sensitive columns. Idempotent — converges to the same
-- grant state whether the gate was on (test DB) or off (prod post-mitigation).
--
-- email, linkedin_url, reason are deliberately OMITTED from the grant below — they
-- are reachable only via the P877 SECURITY DEFINER accessors (which run as the
-- function owner) or by service_role.
--
-- Maintenance note (unchanged from P877): a NEW profiles column is NOT readable by
-- anon/authenticated until added to this GRANT. That default-deny is intentional —
-- add new non-sensitive columns here; route new sensitive columns through an accessor.

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, name, role, avatar_color, is_verified, created_at, updated_at, slug,
  pledge_version, accepted_terms_version, has_pledged, avatar_url, avatar_provider,
  ears_count, verification_session_count, bio, banner_url, banner_generation_attempted,
  is_test_account, is_certifier
) ON public.profiles TO anon, authenticated;
