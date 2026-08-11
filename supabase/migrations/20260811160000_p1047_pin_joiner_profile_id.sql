-- P1047 (part 2): pin joiner_profile_id against forgery on UPDATE.
--
-- new function: public.clarity_sessions_pin_joiner_profile_id() has no prior definition.
-- Verified with `grep -rn "clarity_sessions_pin_joiner_profile_id" supabase/migrations/`
-- (this file is the only hit). The one pre-existing BEFORE UPDATE trigger on this table,
-- trg_prevent_is_private_change (20260313120000_p495_transcription_tables.sql), is a
-- separate function guarding a different column; the two are independent.
--
-- client-safe: the only writes this rejects are ones that set joiner_profile_id to a
-- uuid OTHER than the calling user's. joinClaritySession (src/app/data/api.ts:1001) —
-- the single UPDATE call site that writes the column — sends
-- `joiner_profile_id: joinerProfileId ?? null`, where joinerProfileId is the CURRENT
-- user's own profile id (guests resolve it to null). Both of those paths are
-- explicitly permitted below. service_role and the SECURITY DEFINER RPC owner are
-- exempted, so admin tooling and patch_live_state / complete_clarity_session are
-- unaffected. No CREATE POLICY / REVOKE here — this file only adds a trigger.
--
-- Companion to 20260811150000_p1047_bind_update_clarity_sessions.sql, which closed the
-- same forgery class on creator_profile_id + target_listener_id by revoking the column
-- grant. That lever does NOT work here, for two reasons established empirically:
--
--   1. The column must stay writable — revoking it 42501s joinClaritySession even on a
--      null payload, taking every guest join down.
--   2. A WITH CHECK conjunct cannot express it. WITH CHECK sees only the NEW row, so
--      `joiner_profile_id = auth.uid()` would reject the entirely legitimate case of a
--      creator writing session state on a room that a DIFFERENT user has joined.
--
-- A BEFORE UPDATE trigger is the only mechanism here that can see OLD, so it can police
-- the TRANSITION rather than the resulting value.
--
-- What was wrong: an UNAUTHENTICATED caller could set joiner_profile_id to any profile's
-- uuid on any row with target_listener_id IS NULL (225 of 239 live prod rows).
-- src/app/data/sessions-service.ts:68 lists a user's session history with
-- `.or('creator_profile_id.eq.<id>,joiner_profile_id.eq.<id>')`, so the forged value
-- injects an attacker-controlled session into the victim's own history. Proven on test
-- 2026-08-11 by e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts.
--
-- SECURITY INVOKER is deliberate and load-bearing. The guard distinguishes callers by
-- `current_user`, which PostgREST sets per request (anon / authenticated / service_role).
-- Marking this SECURITY DEFINER would rewrite current_user to the function owner for
-- EVERY caller and silently exempt anon — turning the guard into a no-op that still
-- looks green. auth.uid() alone is not sufficient to distinguish either: it is NULL for
-- an anonymous caller AND for service_role.

CREATE OR REPLACE FUNCTION public.clarity_sessions_pin_joiner_profile_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Untouched column: the overwhelming majority of updates (state, live_state, mode,
  -- demo_status, joiner_name) take this branch and pay one NULL-safe comparison.
  IF NEW.joiner_profile_id IS NOT DISTINCT FROM OLD.joiner_profile_id THEN
    RETURN NEW;
  END IF;

  -- Trusted roles keep full control: service_role (admin + E2E tooling) and the owner
  -- role, which is what every SECURITY DEFINER RPC on this table executes as.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Vacating the seat stays open to any caller. This is the guest-join path: a guest
  -- entering a room previously held by a signed-in joiner sends NULL, and the room
  -- code is the capability in the anonymous practice-room model. Consistent with the
  -- pre-existing design, which this spec's Non-Goals forbid redesigning.
  IF NEW.joiner_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Otherwise a caller may only claim the seat for THEMSELVES. auth.uid() is NULL for
  -- an anonymous caller, so this rejects anon setting any profile id whatsoever.
  IF auth.uid() IS NULL OR NEW.joiner_profile_id <> auth.uid() THEN
    RAISE EXCEPTION 'joiner_profile_id may only be set to the calling user'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clarity_sessions_pin_joiner_profile_id ON public.clarity_sessions;

CREATE TRIGGER clarity_sessions_pin_joiner_profile_id
  BEFORE UPDATE ON public.clarity_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.clarity_sessions_pin_joiner_profile_id();
