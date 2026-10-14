---
status: all-done
type: bug
rank: 1000113
severity: high
workstream: security
date_reported: 2026-10-14
created_date: 2026-10-14
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, live, guest, privacy, rls]
disclosure: public
pipeline_ran: [create-bug, fix, ship]
flow: fix
completed_at: 2026-10-14
---

# P1493: A room code reads more of a session than the join screen needs

## Summary

Holding a `/live` room code — which is shared by link, and published for event practice rooms
to attendees — is enough to read the whole session: everything the two participants have done
in it, not only what someone needs to decide whether to join. It also keeps working after the
session has ended. The participants themselves are the only people who need that state.

## Root Cause

The room code is the guest's bearer capability (P1053/P1302), and two read surfaces treat
"presents the code" as "is a participant":

1. the anonymous room lookup the join screen and the guest poll use, and its grace-window
   sibling;
2. the session row policy and the shared predicate the child tables inherit (P1302/P1207).

P1269 gave the seated guest a per-seat credential and P1224 made guest **writes** require it,
but reads were deliberately left unchanged (P1224 header: "WHAT DELIBERATELY DOES NOT CHANGE …
Reads"). So the seat credential distinguishes the seated guest from any other holder of the
code for writes only.

Reproduction, exact predicates and prod catalog evidence: private security log
(`.private/docs/security-log.md`, entry dated 2026-10-14, P1493).

## Invariants

- A **participant** is: the creator, the seated signed-in joiner, the named listener (identity),
  or the seated guest presenting the seat credential its claim returned (P1269), while that seat
  is occupied. Participants read everything they read before, ended sessions included — the
  ended-session screens (P769/P921) depend on it.
- Anyone else holding the code reads, from the lookup, only what the pre-join screen uses
  (room id, host display name, privacy flag), and only while the session has not ended. After it
  has ended they get the same empty result as an unknown code — one refusal channel, no oracle.
  This covers the read paths. The join path: once the seat's occupant has left, the seat stays
  closed — nobody can claim it again (founder decision 2026-10-14, "seat closes").
- Direct row reads and child-table reads by code require the seat credential too; a code alone
  reads nothing directly.
- Return shapes and signatures do not change (21 columns, never `code`), so deployed callers
  keep resolving; withheld columns come back `NULL`.
- The credential parser is internal (no client EXECUTE), byte-identical to P1224's, so either
  migration may land first.

## Reproduction Steps

See the private security log. Role level: an account-less caller holding only a room code
calls the room lookup (and, separately, reads the row directly presenting the code) and gets
the session's full state — for an open session and for an ended one.

**Reproduction rate:** 100% on the test project before the fix (see Evidence).

## Expected Behavior

Non-participants get the pre-join fields of an open room and nothing of an ended one;
participants are unaffected.

## Actual Behavior

Any code holder gets the full session state, before and after the session ends.

## Affected Files

- `supabase/migrations/20261014180000_p1493_session_reads_need_a_participant.sql`
- `e2e/integration/20261014180000_p1493_session_reads_need_a_participant.spec.ts` (new)
- `src/app/data/api.ts` — the guest presents its seat credential on reads AND direct row writes
  of its session (an UPDATE that filters on a column must also pass the row's SELECT policy); the
  lookup remembers code→room id (localStorage, only for rooms this browser holds a credential
  for) and re-asks once with the credential when it learns the id.
- `src/tests/p1493-session-read-credential.test.ts` (new)
- `e2e/p1493-guest-reads-after-reload.spec.ts` (new) — real-browser guest reload + visitor join.
- Existing tests whose premise was "a code alone reads the room" — updated to present the
  credential (`p1302-session-select-scope`, `p1207-session-child-scope`) or to read an ended
  room as a party (`p1057-db-schema`).

## Severity

**High** — participant activity in any open session, readable by anyone holding the link,
indefinitely.

## Fix Approach

1. One migration: the two lookups split participant (full row) from visitor (pre-join fields,
   open rooms only); the row SELECT policy's code arm and `can_read_clarity_session()`'s code
   arm additionally require the occupied seat's credential. Credential read from the same
   `x-clarity-seat-secret` header P1224 uses for writes.
2. Client: session reads made by a guest present that tab's credential for that session (per
   request, not globally); the lookup remembers code→room id so a reloaded guest's first call
   learns the id and re-asks once with the stored credential.
3. No rate limiter (see Risks).

## Risks / Non-Goals

- **ACCEPT — no SQL-side rate limit on the lookup.** After the fix a non-participant learns only
  the host display name and privacy flag of an open room, and the code space is large relative to
  the number of open rooms (figures in the private log). A SQL limiter would
  need a trusted client address (not available to SQL in a spoof-proof form) and a write on the
  1-second guest poll path; the P1225 limiter function is service-role only. Revisit if a
  non-participant lookup ever returns more.
- **ACCEPT — cold link to an ended room from a non-participant shows "not found" instead of
  "this session has ended".** Participants still see the ended screen: signed-in ones by identity,
  a signed-out guest because the browser remembers which room the code is (set at join), so even
  a reload or a new tab presents the credential on its first request.
- **MITIGATE — deploy order.** The client must ship first: measured on TEST, the pre-fix client
  against the new migration does not reach the room view after a guest join (UI test red).
  Hence `requires-frontend`.
- **Coupling with P1224 (in QA, not yet on main).** Both use the same credential header and an
  identical parser function; either may land first. P1224's write-side tests were re-run on
  TEST with this migration applied: 81 passed, 2 skipped, 0 failed. `p1302-session-select-scope`
  on this branch is P1224's version of that file plus this change's three reads, so the shared
  hunks are identical. P1493's client presents the credential on its own guest writes as well,
  because without it a P1493-only database would hide the row from the write's filter (reviewer
  finding H1). If P1224 lands first, its request wrapper sets the credential header on
  non-GET requests from the tab's held credentials and would replace the per-request value set
  here; that is harmless while the held set contains this room's credential (P1224 restores it
  whenever a session row reaches the client).
- **Join-path residual — closed by founder decision "seat closes" (2026-10-14)**: migration
  `20261014200000_p1493_b_left_seat_stays_closed.sql`. Consequence: P1224's C11 (a guest who left
  re-joins) now asserts the opposite, by that decision.
- **One credential path (review finding 6):** after P1224 landed, the client attaches the seat
  credential in exactly one place — P1224's request wrapper, now on reads as well as writes. The
  P1493 call sites only make sure the session's credential is held (`restoreSeatSecret`).

## Acceptance Criteria

- [x] A non-participant holding the code of an open room gets only the pre-join fields from the
      lookup (and from the grace-window lookup) — integration D1, D2, D3 (signed-in stranger),
      D4 (wrong credential).
- [x] A non-participant holding the code of an ended room gets the empty result from both
      lookups — D5 (same `[]` as an unknown code); the grace-window lookup already refused ended
      rooms (P1057 suite, green).
- [x] A code alone reads no session row and no child row directly — D6, D7.
- [x] Controls: creator, seated signed-in joiner, seated guest with credential all read the full
      row (ended included) via the lookup; the seated guest reads the row and its child rows
      directly; the pre-join fields are present for a visitor; return shape unchanged (21
      columns, never `code`); anon EXECUTE kept; the parser is not client-executable — C1–C8,
      plus the migration's own catalog assertions.
- [x] Client: a reloaded guest (code + stored credential, room id not yet known) ends up with
      the full row; the poll sends the credential on the first request once the id is known;
      no credential is sent when the tab holds none — unit tests 1–3, and the real-browser
      reload test.
- [x] Every defect test failed before the migration and every control passed before and after —
      see Evidence.
- [x] Seat closes: after the occupant leaves, neither a guest nor a signed-in newcomer can claim
      the seat; a seat carrying an earlier client's departure marker stays closed — integration
      `20261014200000_p1493_b_left_seat_stays_closed` D1–D3 (red before the migration, green after).
- [x] Seat-closes controls: a fresh guest claims an open seat; the seated guest reclaims with its
      credential and keeps it; a signed-in joiner who left returns to their own seat; a held seat
      still refuses a second caller — C1–C4, green before and after.
- [x] One credential-carrying request path: the request wrapper presents held credentials on
      reads and writes; the code lookup holds the credential before its first request — unit
      tests (P1493 10/10, P1224 24/24, room-capability 10/10); removing the hold makes 3 P1493
      unit tests fail.

## Done-When

- [x] Migration applied to TEST and recorded in the test ledger (`20261014180000`).
- [x] Integration + unit tests green on TEST; affected neighbouring suites green or explained.
- [x] `./scripts/pre-commit-checks.sh` run against the staged files.

## Evidence

Test project, 2026-10-14.

**Integration, before the migration** (`--retries=0`): D1–D7 FAILED (visitor received
`created_at`/live state; ended room returned the full row; a code alone read the row and the
transcript), C1–C8 PASSED. **After** `./scripts/migrate.sh` (ledger row `20261014180000`
present; anon keeps EXECUTE on both lookups and on `can_read_clarity_session`; the parser has no
anon EXECUTE; the SELECT policy carries the credential term): 15/15 PASSED. After review, the
suite gained D1b (no withheld column of a seated signed-in room or a directed room, with a
non-vacuity check on the fixture), D4b (a credential presented against a signed-in seat), D5b
(each ended signal on its own: guest left, cancelled) and C9 (named listener): 19/19 PASSED.

**Unit** (`src/tests/p1493-session-read-credential.test.ts`): against the pre-fix `api.ts`
6 FAILED / 3 PASSED (the passing three are controls); after: 9/9, with `api-coverage` (43) and
`room-capability` (10) green. Full unit suite: 570 files / 6301 tests passed.

**Real browser** (`e2e/p1493-guest-reads-after-reload.spec.ts`, chromium): 2/2 PASSED. Against
the pre-fix client the guest never reached the room view after joining (FAILED) — the client
half is required, hence `requires-frontend`.

**Neighbouring suites, one worker:** P1493, P1302 (C5/C7/C9 now present the credential),
P1207 (open-session controls now present it), P1057 schema (ended-room control now reads as the
creator), P1278, P1303, P1327, P1321, P1314, P1245 — 110/110 PASSED after review fixes. P1224's branch suites
(its new file plus its versions of P1047, P1053, P1058, P1314c), copied temporarily into this
slot and run against TEST: 81 passed, 2 skipped, 0 failed. On this branch, main's versions of
P1047/P1053/P1058/P1314c guest-write controls fail on TEST because P1224's write migration is
already applied there (their P1224 versions pass, above); not caused by this change. The P1269
anon realtime canary fails because an anon subscriber cannot see the row since P1302 (no code
header reaches Realtime) — unchanged by this change, whose anon arm still needs that header.
The P1057 realtime canary failed once under load and passed twice alone. A wider parallel run
also hit the auth sign-in rate limit (environmental).

**Round 3 (rebase onto P1224 + seat closes), TEST 2026-10-14:** branch rebased onto main with
P1224. Seat-closes integration: 3 failed / 4 passed before `20261014200000` (D1–D3 red,
"Expected 42501, Received undefined"), 7/7 after. Integration one worker (P1224, P1493, P1493b,
P1057 schema, P1207 child scope, P1302, P1269): 99 passed, 3 failed — P1224 C11 (superseded by
seat closes, updated: then 32/33 with P1269), P1269 realtime (known, above), P1269 LEGACY / anon
UPDATE (auth fetch failure under load; pass alone). P1047/P1053/P1058/P1314c: 62 passed,
2 skipped (pre-existing design skips). Browser: P1493 reload 2/2, P1224 3 of 4 — "a tab whose
seat someone else now holds" fails identically with the pre-round-3 client (open, see report).

## Post-deploy verification


**Review (1 of 1 reviewer reported):** 1 HIGH, 3 MEDIUM. H1 (a guest's direct row writes match no
row on a database with this migration but without P1224, because an UPDATE that filters on a
column must also pass the SELECT policy) — confirmed against the prod catalog (UPDATE policy
needs only the code) and fixed: the guest's direct writes present the credential, unit-tested.
M2 (a reloaded guest could not reach an ended room) — fixed with the remembered room id,
unit-tested. M3 (vacuous fixture columns, untested ended arms, no listener control) — fixed, see
above. M1 (join-path residual) — recorded in the private log as a founder decision; the
invariant now states that it covers read paths only.

## Post-deploy verification

Run after the prod apply/deploy (not a completion gate — prod cannot be verified pre-merge):

- [post-deploy] Client commit live on prod for at least one session length before the
      migration is applied.
- [post-deploy] Migration applied to prod; read-only catalog check shows the new lookup
      bodies, the policy's credential term, and anon EXECUTE kept.
- [post-deploy] Authenticated prod smoke passes after apply.
**Review round 2 (coordinator):** P1302 A3, A10 and C8 now present a valid seat credential, so
each is refused only by its own clause (wrong code / third code ignored / named-listener room);
P1057 asserts the grace-window lookup's ended/stale filter for the creator too. The remembered
room id is stored under a digest of the code (the offline read cache's helper) and forgotten when
the guest leaves — unit test red against the committed client, green after. The predicate
function schema-qualifies its table; the migration was re-applied to TEST (catalog confirms).
TEST: P1493 + P1302 + P1207 + P1057 one worker 64/65 (P1302 C13, realtime, failed under load and
passed twice alone); browser 2/2; unit 71/71 across the P1493, api-coverage and offline-cache files.
