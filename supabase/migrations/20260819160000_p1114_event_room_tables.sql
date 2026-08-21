-- P1114: the event room — presence + CMP opt-in tables.
--
-- Two tables, not one — a deliberate deviation from the spec's Appetite ("one new table"),
-- explained in Architecture Decision 6 of
-- features/p1114_event_room_presence_and_cmp_opt_in.md:
--
--   event_room_members — current state, one row per person per event, mutated in place
--     ONLY by the RPCs in the companion migration (20260819170000). Everyone in the room:
--     event, display name, profile id when the person has one, when they joined, current
--     opt-in state (three-valued), current readiness value, and their edit secret.
--
--   event_room_answers — append-only answer history + cascade counter. Service-role-only,
--     zero client-facing surface (no RLS policy, no grant), never in the realtime
--     publication. Exists purely to make "full history is kept" true without also making
--     "opt-outs are never shown" false — a single append-only table with a `SELECT ...
--     WHERE opted_in = true` policy would still return a person's STALE opted-in row after
--     they later opted out, because that row still satisfies the policy.
--
-- client-safe: brand-new tables, unreferenced by any deployed client code — nothing for
-- the REVOKE/GRANT/POLICY statements below to break. `event_room_answers` is genuinely
-- append-only: no client anywhere ever reads or writes it directly, matching the
-- ready_submissions precedent (20260816120000_p1083_ready_submissions.sql) for an
-- anonymous, no-owner-column ephemeral-ish table, but going further — that table grants
-- clients a narrow write path; this one grants clients nothing at all.

-- ============================================================================
-- 1. event_room_members
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- NULL = walk-in (never had an account, or chose to join by name only). Set = registered
  -- attendee. ON DELETE SET NULL, not CASCADE: a room's presence record is history ("the
  -- record of who was there is never deleted" — spec Risks) and must survive a profile
  -- being removed, degrading to an anonymized walk-in-shaped row rather than vanishing.
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Input Validation (Security Review ⚠): 1-100 chars after trim (matches the shipped
  -- MAX_NAME_LENGTH = 100, src/app/data/api.ts:56 -- NOT the Security Review's illustrative
  -- "e.g. 1-60", which would reject names the existing /live guest form already accepts;
  -- Build Sequence step 1 explicitly widens the bound to 100 to match). The character-class
  -- exclusion below uses \uXXXX escapes (PostgreSQL ARE syntax, exactly 4 hex digits) rather
  -- than embedded invisible characters, so the banned codepoints stay legible in plain ASCII:
  -- C0 controls + DEL + C1 controls (\u0000-\u001F, \u007F-\u009F), zero-width/bidi marks
  -- ZWSP/ZWNJ/ZWJ/LRM/RLM (\u200B-\u200F), bidi embedding/override LRE/RLE/PDF/LRO/RLO
  -- (\u202A-\u202E), bidi isolates LRI/RLI/FSI/PDI (\u2066-\u2069), and the zero-width
  -- no-break space / BOM (\uFEFF). A real impersonation / display-corruption vector on a
  -- projected wall: a bidi override can visually reverse a name, and a zero-width character
  -- can make two visually-identical names hash as distinct rows. Enforced server-side because
  -- the RPC that inserts through this column (join_event_room, companion migration) is
  -- reachable directly -- client-side validation alone is not a boundary.
  display_name TEXT NOT NULL CHECK (
    length(btrim(display_name)) BETWEEN 1 AND 100
    AND display_name !~ '[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]'
  ),

  -- Decision 1: the bearer edit-token, minted at join and returned once via RETURNING.
  -- Never client-INSERT-able (no client INSERT grant exists on this table at all — see
  -- below) and never client-SELECT-able (column-level REVOKE below) — same idiom as
  -- clarity_sessions.code (20260817140001_p1057_revoke_code_select.sql). Every subsequent
  -- mutation re-validates this value inside a SECURITY DEFINER RPC before touching the row.
  client_secret UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Decision 2/6: three valid states, not two. NULL = has not answered yet. false =
  -- explicitly opted out (a real, load-bearing state per decisions.md 2026-08-12 — opt-outs
  -- are a carrier mechanic, not the absence of a signal). true = opted in, and therefore
  -- visible on the roster per the SELECT policy below.
  opted_in BOOLEAN,

  -- Decision 6 / spec §7: the room's OWN readiness, no expiry (unlike ready_submissions'
  -- 10-minute window) — a room is bounded and has an evening. Same 0-10 bound as
  -- ready_submissions.value (20260816120000_p1083_ready_submissions.sql:12).
  readiness_value SMALLINT CHECK (readiness_value IS NULL OR readiness_value BETWEEN 0 AND 10),

  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_room_members_event ON public.event_room_members(event_id);

-- Solution §1 / Decision 6: one registered row per person per event; unlimited walk-ins.
-- Partial (not plain UNIQUE) because profile_id IS NULL must never collide — every walk-in
-- gets their own row, including two walk-ins with the same display name.
CREATE UNIQUE INDEX IF NOT EXISTS event_room_members_event_profile_unique
  ON public.event_room_members(event_id, profile_id)
  WHERE profile_id IS NOT NULL;

ALTER TABLE public.event_room_members ENABLE ROW LEVEL SECURITY;

-- Decision 1 / RLS ⚠️ finding 1: no identity exists to bind a client UPDATE to (the person
-- may be nickname-only, no auth.uid()). A naive USING(true) UPDATE/INSERT policy would let
-- anyone with the anon key edit or mass-edit every row — flip opt-ins, forge cascade
-- counters, rewrite names. Required handling: no client INSERT/UPDATE/DELETE grant on this
-- table AT ALL. Every mutation goes through a SECURITY DEFINER RPC (companion migration
-- 20260819170000) which validates client_secret before touching a row. This is STRICTER
-- than the Security Review's fallback suggestion (a client-writable INSERT column list) —
-- that suggestion is superseded here because a column grant alone cannot express the
-- freeze-boundary and cascade-counter integrity checks the RPCs enforce.
REVOKE INSERT, UPDATE, DELETE ON public.event_room_members FROM anon, authenticated;

-- client_secret column-level confidentiality (Authentication ⚠️): revoke SELECT on the
-- whole table first (both grant forms — PUBLIC and role-direct, same belt-and-suspenders
-- as P1057, since either alone can be a silent no-op against the other), then re-grant
-- every column except client_secret. A wildcard `SELECT *` on a visible (opted-in) row must
-- never expose the token that would let someone else impersonate that row.
REVOKE SELECT ON public.event_room_members FROM PUBLIC;
REVOKE SELECT ON public.event_room_members FROM anon, authenticated;
GRANT SELECT (id, event_id, profile_id, display_name, opted_in, readiness_value, joined_at)
  ON public.event_room_members TO anon, authenticated;

-- Decision 2 — THE ONLY SELECT policy granted to anon/authenticated. This is the
-- data-layer guarantee behind "opt-ins are shown, opt-outs are never shown": true for
-- anyone hitting the table directly with the anon key (and therefore true of what
-- postgres_changes broadcasts too — RLS gates both, per the P1057 finding this reuses),
-- not just true of what a UI component chooses to render. A not-yet-answered (NULL) row is
-- exactly as invisible as an opted-out (false) row — both fail `opted_in = true`.
--
-- REVISED 2026-08-21 (decisions.md) — SUPERSEDED. This policy was widened to show every
-- room member regardless of answer. See 20260821120000_p1114_public_roster_reversal.sql
-- for the reversal and its rationale; that migration is authoritative for the CURRENT
-- policy text. Left here, unedited, as the historical record of what originally shipped
-- and why — do not edit this block to describe the new behavior; describe it there.
--
-- The participant's own device reads its own row — including a legitimate opt-out — through
-- get_my_room_status (companion migration), which is SECURITY DEFINER and therefore bypasses
-- this policy once the caller proves it holds the row's client_secret.
DROP POLICY IF EXISTS "opted-in room members are visible" ON public.event_room_members;
CREATE POLICY "opted-in room members are visible"
  ON public.event_room_members FOR SELECT
  TO anon, authenticated
  USING (opted_in = true);

-- ============================================================================
-- 2. event_room_answers — append-only history, service-role only
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.event_room_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_member_id UUID NOT NULL REFERENCES public.event_room_members(id) ON DELETE CASCADE,
  opted_in BOOLEAN NOT NULL,

  -- Decision 6 / Authorization ⚠️: "the single most important integrity requirement in the
  -- spec" — computed server-side inside set_room_opt_in (companion migration) at the moment
  -- of insert, from `count(*) ... WHERE opted_in = true` BEFORE this answer is applied.
  -- Never accepted as a function argument, so there is no client-controllable value here to
  -- forge. The CHECK below is a floor, not the integrity control itself — that control is
  -- the RPC signature having no cascade-count parameter at all.
  cascade_count INTEGER NOT NULL CHECK (cascade_count >= 0),

  answered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_room_answers_member ON public.event_room_answers(room_member_id);

ALTER TABLE public.event_room_answers ENABLE ROW LEVEL SECURITY;

-- Decision 6: ZERO product-facing surface, by design — not merely unused today. RLS is
-- enabled with no policy at all (default-deny for every command from anon/authenticated),
-- and every grant is revoked too, belt-and-suspenders, so a policy added here by mistake in
-- a future migration still has no grant to act on. The only writer is set_room_opt_in
-- (SECURITY DEFINER, runs as the table owner, bypasses RLS entirely). The only reader is
-- service_role, for the research question spec §7 names ("do people who arrive more ready
-- opt in more?") — queried directly, never through a client-facing view or RPC.
REVOKE ALL ON public.event_room_answers FROM PUBLIC;
REVOKE ALL ON public.event_room_answers FROM anon, authenticated;

-- ============================================================================
-- 3. Realtime — event_room_members only, and READ THIS BEFORE TOUCHING IT
-- ============================================================================
-- Decision 3 / Decision 2's UNVERIFIED block. Added so a second browser's opt-in reaches a
-- first browser's roster without a reload (Done-When #6). This rests on an assumption
-- nobody in this repo has measured: that Postgres logical replication (and therefore
-- postgres_changes) respects the ROW-LEVEL RLS policy above for an anon subscriber. P1057
-- (20260817140001_p1057_revoke_code_select.sql) measured that Realtime enforces
-- COLUMN-level grants correctly on this project, and closed with: "This does NOT
-- generalise to row-level questions." Nobody has measured the row-level case this table's
-- whole opt-out guarantee depends on.
--
-- CANARY RESULT (2026-08-19): GREEN, three consecutive runs, no retries, with its live
-- control confirmed firing. Row-level RLS DOES filter Realtime postgres_changes for this
-- table. Decision 2 stands and this table correctly stays in the publication. This closes
-- the row-level gap that decisions.md 2026-08-17 (P1057) left open after measuring only
-- the column-level case. It remains a MEASUREMENT, not a vendor guarantee: any change to
-- this table's SELECT policy silently changes what Realtime delivers, so the canary must
-- be kept in step with the policy.
--
-- THE GATING CANARY: e2e/integration/p1114-realtime-payload.spec.ts, asserting both
-- directions — (a) an opted_in = false row never appears in any payload, and (b) an UPDATE
-- flipping a row from true to false never delivers the new false state. IF THAT CANARY IS
-- RED: remove event_room_members from this publication (the P1048 move — see
-- 20260812130000_p1048_close_chat_realtime_channel.sql for the precedent of pulling a table
-- out of supabase_realtime rather than trusting a row-level filter) and drive the roster
-- from the Decision 3 reconciliation poll alone, client-side. Do NOT "fix" a red canary by
-- loosening the SELECT policy above — that reopens the exact leak Decision 2 exists to close.
--
-- REVISED 2026-08-21 (decisions.md) — SUPERSEDED. The "do NOT loosen the SELECT policy"
-- warning above described a leak; 20260821120000_p1114_public_roster_reversal.sql widens
-- the policy on purpose, for a different reason than that warning anticipated (see that
-- migration's own comment for the rationale). That file also carries the canary's rewrite
-- to the new invariant. Left here, unedited, as the historical record.
--
-- event_room_answers is never added here. It has no client-facing surface at all
-- (section 2 above), so there is nothing for any client to subscribe to.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.event_room_members;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
