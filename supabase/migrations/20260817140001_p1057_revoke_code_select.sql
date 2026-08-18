-- P1057 (Migration B): stop publishing the room code to the people it excludes.
--
-- requires-frontend: 636d1e91
--   REPOINTED 2026-08-18. Was 29587a64, the pre-cherry-pick sha on
--   feature/p1057-room-code-confidentiality — a commit that exists on no branch, so
--   migrate.sh hard-blocked this migration and, because it exit 1s on ANY blocked pending
--   migration, every client-safe migration queued behind it too.
--
--   636d1e91 is the post-merge sha of the same change ("feat(p1057): move code-keyed session
--   reads onto definer RPCs (Migration A + frontend)"), verified with
--   `git merge-base --is-ancestor 636d1e91 origin/main`.
--
--   Why it was missed: the P1057 ship aborted before this step and left its worktree live, so
--   the repoint never happened and nothing said the ship was incomplete. That stranding bug is
--   fixed in a70f9e18; P1071 needed the identical repoint and got it in 93df60a4.
--   This is exactly the defect that stalled P1053's prod migrations silently from
--   2026-08-12 to 2026-08-17 — its marker pointed at a pre-cherry-pick commit that existed
--   on no branch, and migrate.sh exit 1s on ANY blocked pending migration, so the harmless
--   client-safe migrations behind it never applied either.
--
-- ---------------------------------------------------------------------------------------
-- WHAT THIS DOES
-- ---------------------------------------------------------------------------------------
-- Replaces the table-level SELECT grant on clarity_sessions with an explicit per-column
-- grant that omits `code`. The P877/P886 idiom — third application in this repo, second on
-- this table (P1047 did the same for UPDATE).
--
-- The ROW policy is deliberately untouched (20260414100001_p703_letter_sourced_live.sql).
-- Rows stay exactly as visible as they are today; only the column set narrows. Narrowing the
-- `target_listener_id IS NULL` branch is a STANDING FOUNDER REJECTION — that branch is what
-- makes anonymous practice rooms reachable at all, and closing it takes guest rooms down.
--
-- ---------------------------------------------------------------------------------------
-- WHY BOTH REVOKE FORMS
-- ---------------------------------------------------------------------------------------
-- `REVOKE ... FROM PUBLIC` and `REVOKE ... FROM anon, authenticated` are each a silent no-op
-- against the other's grant: the first leaves a role-direct `anon=r/postgres` entry intact,
-- the second leaves an empty-grantee PUBLIC entry intact. REVOKE is idempotent, so writing
-- both costs nothing and closes the case where the live ACL is not the shape the migration
-- text implies. Prod has twice held grants/policies no migration explains (P886's Management
-- API re-grant; P1046's out-of-band policy on THIS table) — which is why the verification at
-- the bottom reads the live catalog rather than trusting these statements.
--
-- The FROM PUBLIC form also strips PUBLIC-derived access from `authenticated`; the GRANT
-- immediately below re-asserts what is intended, in the same transaction.
--
-- ---------------------------------------------------------------------------------------
-- SCOPE — read this before adding anything
-- ---------------------------------------------------------------------------------------
-- * SELECT only. INSERT on `code` is deliberately NOT revoked: createClaritySession mints the
--   code client-side and inserts it, and INSERT of a column requires INSERT privilege, not
--   SELECT. Revoking INSERT here would take room creation down.
-- * service_role is unaffected — its grant is role-direct from the initial schema's ALTER
--   DEFAULT PRIVILEGES, not PUBLIC-derived. Every e2e fixture reads `code` through
--   supabaseAdmin, so the verification block below asserts this rather than assuming it.
-- * DEFAULT-DENY is now in force on this table: a column added later is unreadable by
--   anon/authenticated until it is added to the GRANT below. That is intentional and
--   identical to P877 and P1047. Add new columns here deliberately.
-- * The 21 columns are the table's full set MINUS `code`, verified against the LIVE prod
--   catalog on 2026-08-17 (all 22 selectable; `ended_at` and `joiner_seat_claimed_at` were
--   missing from prod as recently as 2026-08-13, before P1053 applied). Grant everything
--   except the one column being closed — a gate narrower than the deployed bundle is exactly
--   what caused the P886 outage.

REVOKE SELECT ON public.clarity_sessions FROM PUBLIC;
REVOKE SELECT ON public.clarity_sessions FROM anon, authenticated;

GRANT SELECT (
  id, creator_name, creator_note, joiner_name, joiner_profile_id, state,
  demo_status, partnership_status, created_at, expires_at, mode, live_state,
  is_private, last_activity_at, source_letter_id, source_story_id, status,
  creator_profile_id, target_listener_id, joiner_seat_claimed_at, ended_at
) ON public.clarity_sessions TO anon, authenticated;

-- ============================================================================
-- Verification — has_column_privilege, never information_schema
-- ============================================================================
-- information_schema.column_privileges filtered by grantee returns ZERO ROWS both when the
-- privilege is gone AND when it is held via PUBLIC. That blindness is what made four RPC
-- lockdowns silent no-ops (docs/decisions.md 2026-08-13 [technical]). has_column_privilege
-- resolves PUBLIC and role inheritance, so it answers the question actually being asked.

DO $$
DECLARE
  v_missing text;
BEGIN
  -- 1. The point of the migration: `code` must be unreadable by both client roles.
  IF has_column_privilege('anon', 'public.clarity_sessions', 'code', 'SELECT') THEN
    RAISE EXCEPTION 'P1057: anon can still SELECT clarity_sessions.code — the REVOKE did not hold';
  END IF;
  IF has_column_privilege('authenticated', 'public.clarity_sessions', 'code', 'SELECT') THEN
    RAISE EXCEPTION 'P1057: authenticated can still SELECT clarity_sessions.code — the REVOKE did not hold';
  END IF;

  -- 2. The positive control. Without this, a REVOKE that took the whole table down would
  --    satisfy check 1 and read as success — anonymous practice rooms would be dark.
  SELECT string_agg(c.column_name, ', ')
    INTO v_missing
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'clarity_sessions'
     AND c.column_name <> 'code'
     AND NOT has_column_privilege('anon', 'public.clarity_sessions', c.column_name, 'SELECT');

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'P1057: anon lost SELECT on non-code column(s): % — the grant is narrower than the deployed bundle (P886 shape)', v_missing;
  END IF;

  -- 3. service_role must keep reading `code`: claim_joiner_seat's callers, the e2e fixtures
  --    and every admin path depend on it.
  IF NOT has_column_privilege('service_role', 'public.clarity_sessions', 'code', 'SELECT') THEN
    RAISE EXCEPTION 'P1057: service_role lost SELECT on code — the FROM PUBLIC revoke over-reached';
  END IF;

  -- 4. INSERT on `code` must survive, or room creation breaks.
  IF NOT has_column_privilege('anon', 'public.clarity_sessions', 'code', 'INSERT') THEN
    RAISE EXCEPTION 'P1057: anon lost INSERT on code — createClaritySession cannot mint a room';
  END IF;

  RAISE NOTICE 'P1057 Migration B: code is SELECT-gated; all 21 other columns still readable by anon.';
END;
$$;
