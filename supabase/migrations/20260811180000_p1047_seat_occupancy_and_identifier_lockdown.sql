-- P1047 (part 4): block seizing an OCCUPIED joiner seat, and stop clients rewriting
-- the row's identifiers.
--
-- diffed against: 20260811160000_p1047_pin_joiner_profile_id.sql
-- The ONLY change to clarity_sessions_pin_joiner_profile_id() is one added branch —
-- `IF OLD.joiner_profile_id IS NOT NULL THEN RAISE` — placed after the existing
-- self-identity check. Signature, SECURITY INVOKER, `SET search_path = ''`, the
-- unchanged-column early return, the trusted-role exemption and the NULL-vacate branch
-- are all carried over byte-for-byte.
--
-- client-safe: no UPDATE call site writes `id`, `code`, or `created_at` — the 7 sites in
-- src/app/data/api.ts (1001, 1047, 1069, 1130, 1235, 1271, 1411) write only joiner_name /
-- joiner_profile_id / state / live_state / mode / demo_status. `code` is written at INSERT
-- (api.ts:918), which column-level UPDATE grants do not affect. The trigger change only
-- rejects claiming a seat that a *profile* already holds; joinClaritySession refuses to
-- proceed when joiner_name is set (api.ts:989), so no legitimate client reaches that state.
--
-- ---------------------------------------------------------------------------
-- Found by adversarial review of parts 1-3. Both are PRE-EXISTING, not regressions.
-- ---------------------------------------------------------------------------
--
-- Parts 1-3 closed forging ownership onto SOMEONE ELSE. They left open forging your OWN
-- identity onto someone else's session — a direction the canary not only missed but
-- asserted as a passing control ("a signed-in user must be able to join"). Gate 7b
-- exactly: green bounded what was modelled, and the model had the threat direction
-- backwards.
--
-- WHY IT MATTERS: session_transcripts and transcription_jobs both gate SELECT on
--   EXISTS (SELECT 1 FROM clarity_sessions cs WHERE cs.id = <t>.session_id
--           AND (cs.creator_profile_id = auth.uid() OR cs.joiner_profile_id = auth.uid()))
-- (verified live on PROD, 2026-08-11). So writing your uid into joiner_profile_id grants
-- read of that session's stored transcript. Live prod counts at time of writing: 239 rows
-- total, 225 null-target, 113 reachable, 64 of those already holding a real joiner, and
-- 20 with a stored transcript.
--
-- Enumeration is free: the SELECT policy exposes every null-target row to anon, so an
-- attacker does not need to guess ids.
--
-- WHAT THIS FILE DOES AND DOES NOT FIX. It stops an attacker DISPLACING a joiner who is
-- already seated — the 64 rows, which are precisely the two-party sessions that have
-- transcripts. It does NOT stop someone claiming an EMPTY seat on a stranger's room,
-- because at the database layer that is indistinguishable from a legitimate join: the
-- only occupancy check today is client-side JavaScript (api.ts:989), and the room id is
-- freely readable. Closing that needs a server-side join authorization — the room code as
-- a bearer capability, or an invite row — which is a design change this spec's Non-Goals
-- forbid ("do NOT redesign the anonymous-session model"). It needs its own spec; this
-- file deliberately does not attempt it.

-- ============================================================================
-- 1. Trigger: a seat held by a profile cannot be taken
-- ============================================================================

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

  -- Vacating the seat stays open — it is the guest-join path (a guest entering a room
  -- previously held by a signed-in joiner sends NULL). Note this still lets any caller
  -- drop a session out of a victim's history view, which reads
  -- `creator_profile_id.eq.X,joiner_profile_id.eq.X` (sessions-service.ts:68). Tracked as
  -- residual nuisance, not closed here: forbidding it would break guest joins outright.
  IF NEW.joiner_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A caller may only ever name THEMSELVES. auth.uid() is NULL for an anonymous caller,
  -- so this rejects anon setting any profile id whatsoever.
  IF auth.uid() IS NULL OR NEW.joiner_profile_id <> auth.uid() THEN
    RAISE EXCEPTION 'joiner_profile_id may only be set to the calling user'
      USING ERRCODE = '42501';
  END IF;

  -- NEW: and only into a seat no profile already holds. Without this, "name yourself"
  -- is enough to displace an existing participant and inherit their transcript read.
  IF OLD.joiner_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'joiner seat is already held by another profile'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Identifiers are not client-writable
-- ============================================================================
-- `id` and `code` were left in part 1's allowlist to preserve the pre-existing grant
-- state and avoid the P886 trap of a gate narrower than the live bundle. That was the
-- right instinct applied to the wrong columns: no UPDATE caller writes either, so nothing
-- deployed can break, and leaving them writable let a caller re-point which row a shared
-- join link resolves to (`code` is looked up at api.ts:970/1002/1026/1184) or which row
-- FK-bearing children resolve to (`id`). Ownership was never forged — only the identifier
-- that resolves to it. `created_at` goes with them: nothing writes it and a rewritable
-- timestamp defeats the row-age reasoning that part 3 depends on.

REVOKE UPDATE (id, code, created_at) ON public.clarity_sessions FROM anon, authenticated;
