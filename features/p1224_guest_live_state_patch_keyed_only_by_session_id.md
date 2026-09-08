---
status: backlog
type: bug
disclosure: public
rank: 252
severity: high
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

**REPRODUCED 2026-09-08** on the test project, during P1058's Phase 3 adversarial review — this
section previously read "Not exercised". An anonymous caller holding only an enumerated session id,
no room code and no account, wrote to a guest-joined session's `live_state` and the write landed
(HTTP 204, verified by reading the row back as anon). Independently reproduced twice: once by the
review's evasion lens, once by the orchestrating session.

**Severity raised medium -> high on that evidence.** The impact is not only "arbitrary keys in
shared state": the keys that matter are read by `get_active_session_by_code`'s filter, so forging
them makes the room stop resolving for *everyone* — an unauthenticated denial of service against
any live room, product-wide by id enumeration. That is a strictly larger harm than the seat
eviction P1058 was filed for.

Exact predicate, the flags involved, the read paths that publish the id, and the request bodies:
`.private/docs/security-log.md`, 2026-09-08 entry (mechanics deliberately not repeated in this
public file, per the convention this spec already follows).

## What P1058 learned that constrains the fix

This spec's Expected Behavior already names the right shape — "presenting something minted at join
time that nobody else has". **P1058 built exactly that and had to revert it**, which is direct
evidence about how this fix must be sequenced:

`claim_joiner_seat`'s guest-reclaim arm authorizes on `joiner_name`, and `joiner_name` is in the
anon SELECT allowlist. So an attacker re-claims the seat under the seated guest's name and the
function **mints a fresh secret and returns it to the attacker**. Any per-seat secret minted at
join time is therefore void while that arm stands — reproduced 2026-09-08, two different tokens
issued for the same seat seconds apart to two different callers.

**So the reclaim arm has to be decided first, and it is a founder call, not an implementation
detail**: closing it costs a guest the ability to rejoin from a new device or after clearing
storage. Tracked with the event-room half in its own spec. Two further P1058 findings bind any
implementation here: a nullable per-seat column with no backfill strands every seat that exists
when it lands (200+ such rows measured on test), and the client must restore the secret after a
page reload or the guest cannot act on their own session.

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
