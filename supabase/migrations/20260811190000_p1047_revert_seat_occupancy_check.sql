-- P1047 (part 5): revert part 4's seat-occupancy check. It broke a live flow.
--
-- diffed against: 20260811180000_p1047_seat_occupancy_and_identifier_lockdown.sql
-- The ONLY change to clarity_sessions_pin_joiner_profile_id() is the removal of the
-- `IF OLD.joiner_profile_id IS NOT NULL THEN RAISE` branch that part 4 added. The
-- function returns to its part-2 body byte-for-byte. Part 4's REVOKE of id/code/created_at
-- is CORRECT and is deliberately left in place — this file does not touch grants.
--
-- client-safe: strictly widens what clients may do, back to the part-2 state that ran
-- green across the full canary and regression set.
--
-- ---------------------------------------------------------------------------
-- Why part 4's check was wrong
-- ---------------------------------------------------------------------------
--
-- Part 4 rejected setting joiner_profile_id when OLD.joiner_profile_id was already set,
-- to stop an attacker displacing a seated participant and inheriting their transcript
-- read. The intent was right. The predicate was not, because it assumed a non-null
-- joiner_profile_id means "seat occupied". It does not.
--
-- clearSessionJoiner (src/app/data/api.ts:1235) nulls joiner_name and deliberately LEAVES
-- joiner_profile_id set — the departed participant still needs it, because
-- session_transcripts and transcription_jobs gate SELECT on
-- `joiner_profile_id = auth.uid()`. So a vacated room sits at
-- `joiner_name = NULL, joiner_profile_id = <departed user>`, and joinClaritySession's
-- client-side guard only inspects joiner_name (api.ts:989) — so the next signed-in user
-- proceeds to UPDATE and hits the trigger.
--
-- Observed, not reasoned: the canary
-- "a signed-in user can join a room a previous signed-in joiner left" failed with
-- 42501 "joiner seat is already held by another profile". User-visible symptom is
-- "Session not found or already full" (clarity-live-page.tsx:2926), rendered after the
-- mic permission prompt was already granted.
--
-- The column carries two meanings at once — CURRENT OCCUPANT and PAST PARTICIPANT — and
-- no trigger can separate them, because every vacancy signal available to it
-- (joiner_name, live_state.joinerEnded) is itself in the client UPDATE allowlist and so
-- is forgeable. A guard keyed on any of them is a two-step bypass: clear the signal,
-- then claim. Shipping that would buy no security and would manufacture false confidence
-- in exactly the way this spec's own review already caught once.
--
-- ---------------------------------------------------------------------------
-- What this leaves open, and where it is fixed
-- ---------------------------------------------------------------------------
--
-- Reverting re-opens F1: any authenticated user can write their own uid into
-- joiner_profile_id on a stranger's session and thereby read its stored transcript.
-- On prod: 113 reachable rows, 64 seated, 20 with a stored transcript.
--
-- That is PRE-EXISTING — before part 1 an ANONYMOUS caller could set the column to any
-- value at all — so parts 1-3 + part 4's grant revoke still leave production strictly
-- better off than it is today. They close the unauthenticated forgery of
-- creator_profile_id / target_listener_id and stop identifier rewriting outright.
--
-- The correct fix for F1, seat erasure, and empty-seat claiming is one mechanism, not
-- three: a SECURITY DEFINER `claim_joiner_seat` RPC that checks vacancy and writes
-- joiner_name + joiner_profile_id atomically, with client UPDATE on joiner_name revoked
-- so the vacancy signal stops being forgeable. That is server-side join authorization —
-- the anonymous-session redesign P1047's Non-Goals explicitly forbid — and it needs its
-- own spec with its own canary. Filed as a follow-up; deliberately NOT attempted here.

CREATE OR REPLACE FUNCTION public.clarity_sessions_pin_joiner_profile_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Untouched column: the overwhelming majority of updates take this branch.
  IF NEW.joiner_profile_id IS NOT DISTINCT FROM OLD.joiner_profile_id THEN
    RETURN NEW;
  END IF;

  -- Trusted roles keep full control: service_role (admin + E2E tooling) and the owner
  -- role, which is what every SECURITY DEFINER RPC on this table executes as.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Vacating the seat stays open — it is the guest-join path. Residual: this lets any
  -- caller drop a session out of a victim's history and revoke their transcript access.
  -- Closed by the same follow-up spec as F1, for the same reason.
  IF NEW.joiner_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A caller may only ever name THEMSELVES. auth.uid() is NULL for an anonymous caller,
  -- so this rejects anon setting any profile id whatsoever. This is what parts 1-2
  -- actually bought and it still holds: an anonymous caller cannot forge ownership onto
  -- anyone, and no caller can name a third party.
  IF auth.uid() IS NULL OR NEW.joiner_profile_id <> auth.uid() THEN
    RAISE EXCEPTION 'joiner_profile_id may only be set to the calling user'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
