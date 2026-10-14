---
status: all-done
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
pipeline_ran: [create-bug, inline, ship]
completed_at: 2026-10-14
---

# P1224: Guest live-state patch RPC is authorized by session id alone

## Summary

**Scope narrowed (2026-10-14).** The original hole below was closed by P1302. The blocker this
spec named (the guest-reclaim arm) was decided and closed by P1269. This spec now tracks the
remaining hardening: **guest writes now require the seat credential** that only the seated guest
holds. Details are in `.private/docs/security-log.md` (2026-10-14 entries), not here.

*Original summary, kept for history:* The anon-callable `SECURITY DEFINER` RPC that lets a **guest** joiner (no profile) merge a
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

Changed by the fix (2026-10-14): `supabase/migrations/20261014093000_p1224_guest_writes_require_seat_secret.sql`,
`src/lib/room-capability.ts`, `src/app/data/seat-secret.ts`, `src/app/data/api.ts` (`mapSessionFromDb`),
`docs/technical/database.md`; guest controls in existing integration suites (P1047, P1053, P1058,
P1302, P1314) now act as the seated guest, presenting its credential.

## Severity

**Medium** — integrity of a live session's shared state for guest-joined sessions; no data
read, no account impact. Theoretical (no evidence of exploitation).

## Fix Approach

**Decided and built (2026-10-14): option (a), reusing the seat credential P1269 already mints.**
Guest writes now require the seat credential. Seats claimed before P1269 carry none and fail
closed (no backfill); their guest recovers through the normal join path, which issues a fresh one.
The client keeps the credential across reloads (the P1058 lesson).

Deploy order: **client first, then the migration**, with at least one session length between. The
migration carries a `requires-frontend:` marker for this.

*Original options, kept for history:* Two candidates, decide in `/architect`: (a) mint a per-seat secret in `claim_joiner_seat`,
store it hashed, require it as a third RPC argument for the guest path (the `client_secret`
pattern P1114's `event_room_members` already uses); or (b) restrict the anon path to an
allowlist of keys and drop the rating-phase statement from the anon-reachable branch. (a) closes
the class; (b) shrinks it. Prefer (a).

## Founder Decisions

**[FOUNDER DECISION: guest seat-lost message]** Shown on the join form when a guest's write is
refused and re-joining cannot restore the seat (someone else holds it). Proposed and implemented:

> You are no longer in this session. Open the session link again to rejoin.

Defined once as `GUEST_SEAT_LOST_MESSAGE` in `src/app/data/api.ts`, used by the live and demo
pages; pinned by `e2e/p1224-guest-writes-after-reload.spec.ts` and `src/tests/p1224-demo-seat-lost.test.tsx`.

## Acceptance Criteria

- [x] A caller who is not the seated guest is refused on every guest write path, with a permission error where the path reports one, and the row is unchanged — integration A1-A4, A6 (each failed before the migration, passes after)
- [x] Seats claimed before P1269 accept no guest write (fail closed) and their guest recovers by re-joining — integration A4, C4
- [x] A guest who joined normally can still merge live_state updates (P399 partial-merge contract unchanged), write its other session fields, and leave its seat — integration C1, C2, C9; real-browser rounds `e2e/p1278-real-browser-round.spec.ts` B/C/D pass
- [x] A guest who reloads keeps writing — integration C3; real-browser `e2e/p1224-guest-writes-after-reload.spec.ts` (fails with the client restore removed, passes with it); unit `src/tests/p1224-seat-secret-header.test.ts`
- [x] An authenticated joiner's path is unchanged (`joiner_profile_id = auth.uid()`) — integration C5, C10; real-browser round A
- [x] The creator's path is unchanged — integration C6; a signed-in non-participant is still refused with the unchanged contract — C7
- [x] Integration test under `e2e/integration/` proves the rejections and the allowed paths — `20261014093000_p1224_guest_writes_require_seat_secret.spec.ts`
- [x] A guest who has left its seat keeps no write authority; re-joining issues a new credential — integration A8 (failed before, passes after), C11
- [x] A guest tab whose write is refused for a missing or stale credential is never told to retry: it re-joins once (seat free or abandoned → the write lands) or, when someone else holds the seat, returns to the join form with a non-retry message — real-browser `e2e/p1224-guest-writes-after-reload.spec.ts` (both fail with the client's handling disabled, pass with it); unit `src/tests/p1224-seat-secret-header.test.ts`
- [x] The demo page handles the same refusal the same way, and moves its local state only after a write lands — unit `src/tests/p1224-demo-seat-lost.test.tsx` (start, advance, complete; 5 of 6 fail with unhandled rejections before the change); the rating step with the real rating card shows "submitted" only once the rating landed, and the creator's state initialisation uses the same path — `src/tests/p1224-demo-rating-real-card.test.tsx` (2 of 3 fail before the change; the third is a control)
- [x] A newly issued credential is never shadowed by a stale stored one when storage writes fail — unit `src/tests/p1224-seat-secret-header.test.ts` (3 fail before the change)
- [x] [FOUNDER DECISION] Copy for the non-retry message (see below) — approved by founder 2026-10-14 as proposed

## Post-deploy verification

Run after the prod apply/deploy (not a completion gate — prod cannot be verified pre-merge):

- [post-deploy] Client deployed to prod, then the migration applied to prod; installed function body and row policy read back from prod; prod smoke passes
