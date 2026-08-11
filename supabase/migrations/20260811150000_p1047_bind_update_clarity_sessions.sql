-- P1047: bind ownership on clarity_sessions UPDATE.
--
-- client-safe: the only UPDATE access removed is on creator_profile_id and
-- target_listener_id. Every one of the 7 clarity_sessions UPDATE call sites in the
-- deployed bundle (src/app/data/api.ts:1001, 1047, 1069, 1130, 1235, 1271, 1411)
-- writes only joiner_name / joiner_profile_id / state / live_state / mode /
-- demo_status; grep for both column names across src/ returns writes at INSERT only
-- (api.ts:913, 922), never UPDATE. All 18 other columns stay granted, so no column a
-- deployed bundle writes today can start 403ing — this is the specific mistake that
-- caused the P886 outage. The DROP POLICY is immediately followed by a CREATE POLICY
-- that only removes a conjunct which was rejecting legitimate writes.
--
-- Canary: e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts
-- Detail: .private/docs/security-log.md, 2026-08-10 "THE INSERT FIX IS NOT SUFFICIENT".
--
-- ---------------------------------------------------------------------------
-- What was wrong (both defects live on prod AND test, empirically proven on test)
-- ---------------------------------------------------------------------------
--
-- `clarity_sessions_creator_update` is granted TO public and reads:
--
--   USING ((target_listener_id IS NULL) OR (auth.uid() = target_listener_id)
--                                       OR (auth.uid() = creator_profile_id))
--   CHECK ((creator_profile_id IS NOT NULL)
--          AND ((target_listener_id IS NULL) OR (auth.uid() = target_listener_id)
--                                            OR (auth.uid() = creator_profile_id)))
--
-- DEFECT 1 — ownership forgery. For any row with target_listener_id IS NULL,
-- Postgres short-circuits the leading OR to TRUE, so no auth.uid() comparison is
-- ever evaluated. The policy has no auth.uid() IS NOT NULL conjunct anywhere, and
-- anon holds table-level UPDATE. WITH CHECK then reduces to a not-null test on the
-- owner column rather than an equality test against the caller. Net effect: an
-- UNAUTHENTICATED caller could reassign creator_profile_id on 225 of 239 live prod
-- rows. That is the attribution forgery P1038 closed on INSERT, reachable on UPDATE
-- against existing rows and without authenticating at all — strictly worse than the
-- bug P1038 fixed. Proven on test 2026-08-11: three forgery canaries failed with the
-- forged uuid persisted.
--
-- DEFECT 2 — the same CHECK clause bricks null-creator rows. `creator_profile_id IS
-- NOT NULL` is evaluated against the NEW row, so EVERY update to a row whose creator
-- is null is rejected with 42501, including guests writing their own practice-room
-- state. 112 of 239 live prod rows are in that shape. P1038's INSERT fix deliberately
-- permits new null-creator rows, so this was set to grow. Proven on test 2026-08-11.
--
-- ---------------------------------------------------------------------------
-- The fix: bind ownership at the PRIVILEGE layer, not the policy predicate
-- ---------------------------------------------------------------------------
--
-- The null-target branch is load-bearing: anonymous practice rooms are entered by
-- callers with no session, and the room UUID/code is the capability. Requiring
-- auth.uid() IS NOT NULL in the predicate would take guest rooms down. But a guest
-- needs to write session STATE, never OWNERSHIP — so the correct lever is the column
-- grant, which cannot be defeated by a permissive OR in any policy, present or future.
-- Same idiom as P904 (story_explain_backs) and P877/P886 (profiles).
--
-- Postgres semantics (decisions.md 2026-06-04, P877 trap 1): a column-level REVOKE is
-- a NO-OP while the role holds the table-level grant. Table-level UPDATE must be
-- dropped first, then re-granted per column.
--
-- Why an explicit 18-column allowlist rather than revoke-and-allowlist-what-we-use:
-- the P886 incident (2026-06-04, ~1.5h of prod 403s) was caused by a column gate that
-- was narrower than the live frontend bundle's actual reads. Every column that is
-- writable today stays writable here except the two ownership columns; nothing a
-- deployed bundle writes can start failing. A NEW column is not updatable by
-- anon/authenticated until added below — that default-deny is intentional.

-- ============================================================================
-- 1. Column-level write grants — creator_profile_id + target_listener_id excluded
-- ============================================================================

REVOKE UPDATE ON public.clarity_sessions FROM anon, authenticated;

GRANT UPDATE (
  id,
  code,
  creator_name,
  creator_note,
  joiner_name,
  joiner_profile_id,
  state,
  demo_status,
  partnership_status,
  created_at,
  expires_at,
  mode,
  live_state,
  is_private,
  last_activity_at,
  source_letter_id,
  source_story_id,
  status
) ON public.clarity_sessions TO anon, authenticated;

-- creator_profile_id and target_listener_id are now writable only by service_role and
-- by SECURITY DEFINER functions (which run as their owner). No client role can set
-- either column on UPDATE. INSERT is unaffected — it is bound separately by
-- clarity_sessions_verified_host_insert (P1038).

-- ============================================================================
-- 2. Drop the WITH CHECK conjunct that bricks null-creator rows (defect 2)
-- ============================================================================
-- With the column grant revoked, `creator_profile_id IS NOT NULL` can no longer
-- contribute any security value: the column is unreachable on UPDATE regardless of
-- what the predicate says. Its only remaining effect is to 42501 every legitimate
-- write to a null-creator row. Removing it makes WITH CHECK match USING exactly.

DROP POLICY IF EXISTS clarity_sessions_creator_update ON public.clarity_sessions;

CREATE POLICY clarity_sessions_creator_update
  ON public.clarity_sessions
  FOR UPDATE
  USING (
    (target_listener_id IS NULL)
    OR (auth.uid() = target_listener_id)
    OR (auth.uid() = creator_profile_id)
  )
  WITH CHECK (
    (target_listener_id IS NULL)
    OR (auth.uid() = target_listener_id)
    OR (auth.uid() = creator_profile_id)
  );

-- ============================================================================
-- 3. Known remaining exposure — deliberately NOT fixed here
-- ============================================================================
-- joiner_profile_id stays granted, and the policy cannot bind it: WITH CHECK sees only
-- the NEW row, so `joiner_profile_id = auth.uid()` would reject the legitimate case of
-- a creator writing session state on a room a DIFFERENT user has joined. Revoking the
-- column instead would break joinClaritySession (api.ts:1001), which sends the key
-- explicitly as `joinerProfileId ?? null` — a revoked column 42501s even on a null
-- payload. A correct fix needs either a BEFORE UPDATE trigger (which can see OLD) or
-- routing the join through a SECURITY DEFINER RPC. Both are design changes this spec
-- explicitly non-goals ("Do NOT redesign the anonymous-session model").
--
-- Impact: an anonymous caller can set joiner_profile_id to any profile's uuid.
-- sessions-service.ts:68 lists history via
-- `creator_profile_id.eq.X,joiner_profile_id.eq.X`, so this injects an
-- attacker-controlled session into a victim's session history. Proven on test
-- 2026-08-11 by the canary's joiner-forgery case. Tracked separately — see the
-- security log entry for P1047.
