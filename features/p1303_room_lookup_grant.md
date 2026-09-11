---
status: week
type: bug
rank: 96
severity: medium
workstream: transcribe
date_reported: 2026-09-11
created_date: 2026-09-11
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, grants, p1065, transcribe]
disclosure: embargo
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1303: The room-code lookup RPC is executable by anonymous callers

## Summary

`get_transcribe_room_by_code(text)` (P1207) is executable by the `anon` role on **prod and test**,
although its defining migration grants EXECUTE to `authenticated` only and no anonymous call site
exists. Sixth instance of the P1065 `ALTER DEFAULT PRIVILEGES` role-direct-grant trap (P1063, P1093,
P1104, P1275, P1236-D).

## Root Cause

`20260901160000_p1207_transcribe_rooms_code_enumeration.sql:73` runs
`GRANT EXECUTE ... TO authenticated` and nothing else. Supabase's default privileges on `public`
grant EXECUTE on every new function to `anon` role-directly, so the function has been anon-callable
since P1207 applied. Nothing revoked it.

Recorded 2026-09-10 in `.private/docs/security-log.md` as OPEN with a founder decision pending
(revoke vs allowlist). **Decided 2026-09-11: revoke.** Founder, verbatim, on the proposal to file
and ship the revoke: *"yes then drive to fix , verify, if needed run opus and/or codex review ,
/ship, /kdd, comit"*. The allowlist entry proposed the same day was
already withdrawn by adversarial review because it cited an unguarded *route*, not a call site
(`docs/decisions.md` 2026-09-10; `scripts/anon-execute-allowlist.txt` comment block).

## Invariants

- A signed-in user holding a valid room code must still resolve that room (P1207's join path).
- Revoke from **both** `anon` and `PUBLIC` — the drift check's own instruction (P1066). Revoking one
  leaves the other path open and the check can read green.
- Verify by reading `has_function_privilege()` back from the live catalog, never from migration text.

## Reproduction Steps

1. `python3 scripts/function-grant-drift-check.py --no-probe`
2. Observe `get_transcribe_room_by_code(text)` under "ANON-EXECUTABLE, NOT ALLOWLISTED", with no
   single-environment marker, i.e. on both prod and test (baseline captured 2026-09-11, exit 1).
3. `e2e/integration/p1275-create-transcribe-room-rpc.spec.ts` uses this same grant as a
   **positive control** ("a function anon IS deliberately granted") — it passes today only because
   the defect exists.

**Reproduction rate:** 100%

## Expected Behavior

An anonymous caller is refused at the grant (`permission denied for function
get_transcribe_room_by_code`). Signed-in callers are unaffected.

## Actual Behavior

An anonymous caller reaches the function body. For a code that matches an active room it returns the
room's id, code, event id and timestamps.

## Affected Files

- `supabase/migrations/20260901160000_p1207_transcribe_rooms_code_enumeration.sql:73` — grant written authenticated-only, anon never revoked
- `src/app/pages/transcribe-room-page.tsx:120` (redirect when no user), `:215` (early return without user), `:224` (the only caller) — confirms no anon call site
- `e2e/integration/p1275-create-transcribe-room-rpc.spec.ts:215-220` — control depends on the defect
- `scripts/anon-execute-allowlist.txt` — comment block describing the withdrawn entry

## Severity

**Medium** — bounded exposure (a holder of a code can confirm an active room and read its id and
timestamps; joining still requires an account), but P1207's premise is that the code is a credential,
and an unauthenticated party was never meant to trade one.

## Fix Approach

1. New migration: `REVOKE ALL ... FROM anon;` + `REVOKE ALL ... FROM PUBLIC;` + re-assert
   `GRANT EXECUTE ... TO authenticated;` (house form: `20260908170300_p1236_d_revoke_anon_join_rpc.sql`).
2. Regression test: anon is refused **at the grant** (asserted by message, since a body-level
   refusal would share the error code), with an allowlisted-function control so the probe is not blind.
3. Re-point the P1275 control to a function on the allowlist.
4. Update the allowlist comment block to say the grant is revoked.

Out of scope: the other 16 gating findings in the same drift run. Each needs its own call-site
decision (P1065: "Do not auto-revoke").

## Acceptance Criteria

- [ ] `has_function_privilege('anon', 'public.get_transcribe_room_by_code(text)', 'execute')` is false on **test** and on **prod**; `authenticated` is true on both
- [ ] The drift check no longer lists `get_transcribe_room_by_code(text)` as anon-executable
- [ ] A new integration test proves anon is refused with `permission denied for function`, with a passing control — and it fails before the migration
- [ ] `p1207-transcribe-room-codes.spec.ts` still passes (signed-in stranger resolves a presented code)
- [ ] `p1275-create-transcribe-room-rpc.spec.ts` passes with its control re-pointed to an allowlisted function
- [ ] Signed-in join of `/transcribe/:code` still works in the browser
