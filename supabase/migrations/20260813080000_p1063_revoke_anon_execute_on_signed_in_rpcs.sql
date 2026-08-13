-- P1063: close four SECURITY DEFINER functions that are meant to be signed-in-only but are
-- executable by unauthenticated callers on BOTH test and production.
--
-- client-safe: this only REMOVES a privilege no legitimate client path uses. Every caller of
--   these four functions in src/ is an authenticated path, verified by grep (listed per-function
--   below). No signature change, no behavior change for authenticated callers.
--
-- ---------------------------------------------------------------------------------------
-- TWO DISTINCT CAUSES — read the ACL, do not infer from the migration text
-- ---------------------------------------------------------------------------------------
-- An earlier draft of this migration asserted a single mechanism and was WRONG, which is worth
-- recording because the wrong version looked entirely plausible and half of it even worked.
-- `pg_proc.proacl` on the live database is the only thing that settles this. The two causes:
--
--   (1) A role-direct grant to `anon`. ACL contains `anon=X/postgres`.
--       Closed by:  REVOKE EXECUTE ... FROM anon;
--       Observed on: complete_clarity_session, create_letter_delivery.
--
--   (2) A grant to PUBLIC that was never actually removed. ACL contains `=X/postgres` — an
--       EMPTY grantee, which is PUBLIC, and `anon` inherits it. A `REVOKE ... FROM anon` here
--       is a silent NO-OP: it succeeds, returns no error, and changes nothing, because anon
--       holds no direct grant to remove. That is exactly what happened on the first attempt.
--       Closed by:  REVOKE EXECUTE ... FROM PUBLIC;
--       Observed on: seal_and_send_letter (both overloads), persist_anonymous_completion.
--
-- Default privileges on a newly created function are EXECUTE TO PUBLIC. `CREATE OR REPLACE`
-- preserves an existing ACL, but creating a function under a NEW SIGNATURE (P952 added the
-- p_responses_mode argument to seal_and_send_letter) creates a genuinely new function that gets
-- the default PUBLIC grant — so a REVOKE written against the old signature never covers it.
-- This migration therefore revokes from BOTH PUBLIC and anon on every target. REVOKE is
-- idempotent, so the redundant half is free, and it removes the need for a future reader to
-- work out which of the two causes applied to which function.
--
-- The failure mode this whole migration exists to close is that the lock LOOKS applied. The
-- migration text says REVOKE, review passes, and the privilege is still there. Nothing short of
-- querying has_function_privilege() on the live database detects it, and nothing in this repo
-- did that until now.
--
-- ---------------------------------------------------------------------------------------
-- WHY THE GUARDS INSIDE THESE FUNCTIONS DO NOT SAVE THEM
-- ---------------------------------------------------------------------------------------
-- Their authorization checks are written in the shape
--
--     IF v_owner_id != auth.uid() THEN RAISE EXCEPTION '...'; END IF;
--
-- For an unauthenticated caller auth.uid() is NULL, so the comparison is NULL, and plpgsql SKIPS
-- an IF whose condition is NULL. A skipped refusal guard is an allow — the check does not fail to
-- match, it never runs. (Identical to P1053's F5. The same expression inside a WHERE would be
-- fail-CLOSED, because NULL excludes the row; inside an IF it is fail-OPEN.)
--
-- REPRODUCED on the test project, not reasoned about:
--   * complete_clarity_session — an unauthenticated caller ended a live session by id. ended_at
--     was stamped, status set to 'completed', no error returned. ended_at is what
--     claim_joiner_seat gates on, so the room becomes permanently unjoinable by either person.
--   * seal_and_send_letter — an unauthenticated caller sealed ANOTHER USER'S draft letter.
--     HTTP 200, returned true, status moved draft -> sealed with sealed_at stamped. The test row
--     was restored to draft afterwards. There is no unseal path in the product, so on production
--     this is unauthenticated, irreversible destruction of another person's work in progress.
--
-- ---------------------------------------------------------------------------------------
-- PER-FUNCTION JUSTIFICATION (call sites verified by grep before revoking)
-- ---------------------------------------------------------------------------------------
-- complete_clarity_session      — src/app/data/api.ts:4351 (completeClaritySession) and :4388
--   (completeClaritySessionKeepalive, which THROWS if there is no access token). Gated in
--   clarity-live-page.tsx:3576 behind `if (isCreator)`. The joiner/guest exit path calls
--   clearSessionJoiner -> release_joiner_seat instead, and is untouched here. No anon caller.
-- seal_and_send_letter          — src/app/data/letters-service.ts:103. The letter's author,
--   signed in. BOTH overloads are revoked: the legacy 3-arg and the current 4-arg form both exist
--   in pg_proc on test and prod, and revoking only the current signature would leave the older
--   overload reachable — the exact gap this migration exists to close.
-- create_letter_delivery        — src/app/data/letters-service.ts:1088. Signed-in sender.
-- persist_anonymous_completion  — no client caller anywhere in the repo (grep over ts/tsx/mjs/sql
--   finds only migration comments referring to it "at signup/registration"). Despite the name it
--   is not an anonymous-visitor entry point; the anonymous data it persists is written once the
--   person has registered, i.e. as an authenticated caller.
--
-- NOT touched: claim_joiner_seat / release_joiner_seat and the token-based letter RPCs are
-- deliberately anon-reachable — that is the product working (guests join rooms with a code,
-- recipients open letters from a link). claim_joiner_seat's ACL correctly reads `anon=X`, and
-- this migration removes nothing those flows rely on.

-- Cause (1): role-direct anon grants.
REVOKE EXECUTE ON FUNCTION public.complete_clarity_session(uuid)                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.seal_and_send_letter(uuid, jsonb, jsonb)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.seal_and_send_letter(uuid, jsonb, jsonb, text)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_letter_delivery(uuid, integer)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.persist_anonymous_completion(uuid, uuid, jsonb, jsonb) FROM anon;

-- Cause (2): the PUBLIC grant that the original REVOKE never removed. Without these lines the
-- statements above are silent no-ops on seal_and_send_letter and persist_anonymous_completion.
REVOKE EXECUTE ON FUNCTION public.complete_clarity_session(uuid)                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seal_and_send_letter(uuid, jsonb, jsonb)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seal_and_send_letter(uuid, jsonb, jsonb, text)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_letter_delivery(uuid, integer)                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.persist_anonymous_completion(uuid, uuid, jsonb, jsonb) FROM PUBLIC;

-- Re-assert the intended grant. REVOKE ... FROM PUBLIC also strips PUBLIC-derived access for
-- `authenticated`, so without this the fix would lock out the legitimate signed-in callers.
GRANT EXECUTE ON FUNCTION public.complete_clarity_session(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.seal_and_send_letter(uuid, jsonb, jsonb)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.seal_and_send_letter(uuid, jsonb, jsonb, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_letter_delivery(uuid, integer)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.persist_anonymous_completion(uuid, uuid, jsonb, jsonb) TO authenticated;
