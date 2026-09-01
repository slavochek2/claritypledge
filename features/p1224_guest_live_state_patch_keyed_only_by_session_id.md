---
status: backlog
type: bug
rank: 252
severity: medium
workstream: infra
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, rls, live, guest, rpc]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1224: Guest live-state patch RPC is authorized by session id alone

## Summary

The anon-callable `SECURITY DEFINER` RPC that lets a **guest** joiner (no profile) merge a
partial update into a `/live` session's `live_state` takes the session's id as its only
authorization input. Session ids are not secret — several public read paths return them — so
any anonymous caller who obtains one can write arbitrary keys into that guest-joined session's
shared state. Found as G2 of the 2026-09-01 general security sweep; the exact predicate,
the read paths that leak the id, and the second statement in the function body are recorded in
`.private/docs/security-log.md` under that date (mechanics deliberately not repeated here).

## Root Cause

`claim_joiner_seat` binds an *authenticated* joiner to the row via `joiner_profile_id`, but a
guest has no profile to bind to, so the guest write path (P399 partial-merge contract,
`docs/technical/database.md` — live_state mutation contract) was gated on "the row looks
guest-joined" rather than on anything only that guest holds. There is no per-seat secret.

## Reproduction Steps

Not exercised — it is a write against another user's session. Confirmed by reading the
function body in the TEST catalogue and the migration that last redefined it.

## Expected Behavior

Only the two participants of a session can change its `live_state`. For a guest that means
presenting something minted at join time that nobody else has.

## Actual Behavior

Any anonymous caller holding a session id can merge keys into a guest-joined session's
`live_state` (and, via the same function, advance its rating phase).

## Affected Files

- `supabase/migrations/20260220130000_patch_live_state_rpc.sql` and the later `fix_guest_patch_live_state` redefinition
- `src/app/data/api.ts` — `updateLiveState()` partial-merge caller
- `claim_joiner_seat` (P1047) — the natural place to mint a per-seat secret

## Severity

**Medium** — integrity of a live session's shared state for guest-joined sessions; no data
read, no account impact. Theoretical (no evidence of exploitation).

## Fix Approach

Two candidates, decide in `/architect`: (a) mint a per-seat secret in `claim_joiner_seat`,
store it hashed, require it as a third RPC argument for the guest path (the `client_secret`
pattern P1114's `event_room_members` already uses); or (b) restrict the anon path to an
allowlist of keys and drop the rating-phase statement from the anon-reachable branch. (a) closes
the class; (b) shrinks it. Prefer (a).

## Acceptance Criteria

- [ ] An anon caller with a valid session id but no seat secret gets a permission error from the guest patch path
- [ ] A guest who joined normally can still merge live_state updates (P399 partial-merge contract unchanged)
- [ ] An authenticated joiner's path is unchanged (`joiner_profile_id = auth.uid()`)
- [ ] Integration test under `e2e/integration/` proves the rejection and the two allowed paths
