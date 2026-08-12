---
status: all-done
type: bug
rank: 1000963.0
severity: critical
date_reported: '2026-08-11'
created_date: '2026-08-11'
tags: [security, rls, ownership, content-integrity]
driver: anomaly
feature_type: backend
completed_at: 2026-08-12
---

# P1047: `clarity_sessions` UPDATE policy does not bind ownership for null-target rows

## Summary

The P1038 fix bound the INSERT policy's owner column. The UPDATE policy on the same table
still does not, for the majority of rows — so the same attribution forgery is reachable in
one UPDATE instead of one INSERT, and appears to need no authentication at all.

Exploit mechanics, live policy text, grants and row counts are in
`.private/docs/security-log.md` (2026-08-10, updated 2026-08-11). Per CLAUDE.md this public
spec carries the problem class only — the gap is fixed on test but **still open on prod**.

## Problem

The policy's `USING` clause leads with a branch that is true for any row whose target is
unset. Postgres short-circuits the OR, so no `auth.uid()` comparison is ever reached for
those rows, and the `WITH CHECK` in the same branch reduces to a not-null test on the owner
column rather than an equality test against the caller. The policy is granted to `public`
and contains no authenticated-caller conjunct; the anon role holds the table and
column-level UPDATE privilege.

The overwhelming majority of live production rows are in that shape.

This is **pre-existing**, not introduced by P1038 — the policy has been unchanged since
April. But P1038's fix interacts with it: the fix deliberately permits rows to be created
with a null owner, and those are precisely the rows anyone can subsequently claim.

Verification status: **empirically executed on the test database 2026-08-11.** The caveat
this section previously carried ("not empirically executed") is retired. Three forgery
canaries were run against the unfixed policy and all three persisted the forged value —
see `## Evidence` below. Live policy text and grants were re-read on both environments
first and are byte-identical, so test reproduces prod behaviour. The exploit has **not**
been run against prod and must not be.

## Evidence

Canary: `e2e/integration/p1047-reproduce-clarity_sessions-update.spec.ts`
(`npx playwright test --project=integration`).

**Against the unfixed policy (test DB, 2026-08-11): 3 failed / 6 passed.** Each forgery
assertion re-reads the row through the service-role client, because PostgREST reports the
two RLS denial paths differently — a `USING` filter-out returns HTTP 204 with no error at
all, so asserting on `error` alone would have passed vacuously.

| Canary | Unfixed | Fixed |
|---|---|---|
| anon steals `creator_profile_id` | FAIL — forged uuid persisted | PASS |
| anon forges `joiner_profile_id` | FAIL — forged uuid persisted | PASS |
| authenticated non-owner steals `creator_profile_id` | FAIL — forged uuid persisted | PASS |
| anon orphans `creator_profile_id` to NULL | PASS (blocked by the non-null CHECK) | PASS |
| 6 anonymous practice-room controls | PASS | PASS |

Final state after all four migrations: **P1047 canary 15/15 + P396 6/6 + P1038 3/3 = 24
passed** in one run. The two canaries pin opposite sides of the same policy and now hold together.

**Regression — 11 integration specs that touch `clarity_sessions`, single worker: 75 passed,
3 failed, 2 flaky.** P1038 canary 3/3, P396 canary 6/6.

An earlier multi-worker run of the same set reported 28 failures; 244 of the log's error
lines were Supabase auth `Request rate limit reached` from creating test users too fast.
Single-worker removed them. **That is an environmental limit, not a signal** — worth stating
because the first reading of it nearly became a second false finding.

The 3 remaining failures are attributable and are **not** this change:

| Spec | Cause |
|---|---|
| `20260409120000_patch_live_state_auto_reveal:83` | `beforeAll` INSERT rejected — P1038's verified-profile INSERT policy, not UPDATE |
| `p511-session-resilience-migration:128` | `last_activity_at` never set, so the freshness assertion sees ~6.6 years; `update_last_activity` is WHERE-gated to the creator and no-ops on a creator mismatch |
| `p674-live-state-machine:195` | Asserts `patch_live_state` returns an error for a non-participant. It is `SECURITY DEFINER` returning `void`, so a 0-row match returns success — a test-shape bug, the same "assert on `error` alone" trap this spec's own canary avoids |

Structural confirmation, not inference: stripped of comments, the three migrations contain
**zero** references to `INSERT`, `patch_live_state`, or `update_last_activity`, and zero
`permission denied` errors appear anywhere in the regression log — that being the exact
signature a wrong column revoke would produce.

Row-shape counts read live 2026-08-11 — prod: 239 total, 225 null-target, 112 null-creator.
Test: 211 total, 156 null-target, 0 null-creator.

### A wrong second finding, and what caught it

Mid-implementation this spec claimed a **second defect**: that `creator_profile_id IS NOT
NULL` in the same `WITH CHECK` bricks null-creator rows, rejecting every write to 112 of
239 live prod rows. A migration was written to drop that conjunct and applied to test.

**It was wrong.** That conjunct is P396, working as designed — it deliberately locks legacy
null-creator sessions against anonymous writes. The P396 canary
(`e2e/integration/p396-host-rls-migration.spec.ts:174`) went red the moment the drop landed
on test, and it was right.

The disproof, run against live prod:

```sql
SELECT count(*), min(created_at)::date, max(created_at)::date,
       count(*) FILTER (WHERE created_at > '2026-04-15')
FROM clarity_sessions WHERE creator_profile_id IS NULL;
-- 112 | 2025-12-21 | 2026-02-23 | 0
```

Every null-creator row predates `20260415120000`, the migration that added the conjunct.
Zero in the four months since. They are legacy rows from before sessions carried a creator
— so "un-updatable" is the intended lockdown, not breakage.

**The row count was real; the inference on top of it was not.** 112 rows *are* unwritable —
that fact was verified. "Therefore a live flow is broken" was never tested before it was
written into a migration, a spec, and the security log. `/clarity-demo` is routed
(`App.tsx:704`) and calls `createClaritySession` with no profile id, which made a live
null-creator producer look plausible; the row dates say it has not produced one since
February. Reversed by `20260811170000_p1047_restore_creator_not_null_check.sql`; net policy
text is now byte-identical to prod's, modulo associative paren nesting.

## Appetite

Low blast radius (one policy, `DROP` + recreate, matching the P1032/P1035/P1038 idiom) but
higher decision density than P1038: the null-target branch exists to serve anonymous
practice rooms, so tightening it must not break guest flows. That trade-off is a real design
question, not a mechanical predicate addition.

## Solution

1. Re-read the live policy on both environments first — migration files and the deploy
   manifest were both proven unreliable during P1046.
2. Establish what the null-target branch legitimately serves. Grep every UPDATE caller in
   `src/` and `supabase/functions/`. Anonymous practice rooms genuinely need guest writes;
   the question is which columns, not whether.
3. Prefer column-level restriction over row-level permissiveness: the caller needs to update
   session state, not `creator_profile_id`. Revoking the column grant may be a better fix
   than rewriting the predicate, and is harder to get subtly wrong.
4. Write the canary first, against the unfixed policy, and observe it fail (gate 7). It must
   cover the **anonymous** caller shape — P1038's canary only exercised an authenticated
   attacker, which is why this was invisible to it.
5. Fix, verify live on test, then prod as a separate approved step.

## What Was Built

Four migrations, all applied to **test** only. **Prod is unchanged and still carries the
forgery.**

**`20260811150000_p1047_bind_update_clarity_sessions.sql`** — binds ownership at the
*privilege* layer rather than the policy predicate, per Solution step 3. Revokes
table-level UPDATE from `anon` + `authenticated`, then re-grants UPDATE on the 18
non-ownership columns; `creator_profile_id` and `target_listener_id` are excluded and are
now writable only by `service_role` and by SECURITY DEFINER functions. Its section 2 also
dropped the `creator_profile_id IS NOT NULL` conjunct — that part was wrong and is reversed
by part 3 below.

A grant cannot be defeated by a permissive OR in any policy, present or future, which is
what makes it the right lever here. Requiring `auth.uid() IS NOT NULL` in the predicate
would have worked too and would have taken every anonymous practice room down with it.

**`20260811160000_p1047_pin_joiner_profile_id.sql`** — a BEFORE UPDATE trigger pinning
`joiner_profile_id`, which turned out to be reachable by the same forgery. Neither lever
above works on it: the column must stay writable for joins to function, and a `WITH CHECK`
sees only the NEW row, so `joiner_profile_id = auth.uid()` would reject the legitimate case
of a creator writing session state on a room a *different* user has joined. Only a trigger
can see OLD and therefore police the transition rather than the resulting value.

The trigger is `SECURITY INVOKER` deliberately. It distinguishes callers by `current_user`
(PostgREST sets this per request), because `auth.uid()` is NULL for an anonymous caller
*and* for `service_role` and so cannot separate them. Marking it SECURITY DEFINER would
rewrite `current_user` to the function owner for every caller and silently turn the guard
into a no-op that still reads green — three controls in the canary exist specifically to
falsify that.

**`20260811170000_p1047_restore_creator_not_null_check.sql`** — restores the conjunct part
1 dropped, after the P396 canary and a live prod row-date query proved the drop wrong (see
`## Evidence`). Net policy text returns to what prod has run since 2026-04-15. Kept as a
separate forward migration rather than by editing part 1, so both environments converge
through the same recorded history — editing an already-applied file is the P886 trap.

**`20260811180000_p1047_seat_occupancy_and_identifier_lockdown.sql`** — attempted F1 and
closed F4. Both canaries were observed FAILING against parts 1-3 first. The F4 half —
`REVOKE UPDATE (id, code, created_at)` — is correct and stands. The F1 half is reverted
below.

**`20260811190000_p1047_revert_seat_occupancy_check.sql`** — reverts part 4's occupancy
branch, restoring the trigger to its part-2 body byte-for-byte. Grants are untouched. See
F1 above for why; the short version is that it rejected a legitimate rejoin-after-leave.

**Also `src/app/data/api.ts`** — Sentry capture on the `joinClaritySession` failure path,
matching the P525 pattern already used by `updateLiveState`/`patchLiveState`. This is the
only call site the joiner trigger guards, and its failure is indistinguishable from a full
room at the UI layer, so a 42501 previously produced zero telemetry. Filed by the
availability review; added because the trigger ships without it otherwise.

### Deliberately not changed

- **The permissiveness of the null-target branch itself.** An anonymous caller can still
  write session *state* to any null-target row. That is the anonymous practice-room model,
  where the room code is the capability; redesigning it is an explicit Non-Goal.
- **Vacating the joiner seat.** Setting `joiner_profile_id` to NULL stays open to any
  caller — it is the guest-join path.
- **`code`, `source_letter_id`, `source_story_id` remain updatable** by anon. These are
  adjacent to the bug class (the INSERT policy validates `source_letter_id` ownership
  carefully while UPDATE does not) but are not the ownership columns this spec names.
  Flagged, not silently folded in.

## Review

The bypass-hunting subagent reported after the first draft of this section and **found a
real bypass that parts 1-3 did not close**. Every claim below was re-run in the main
session before being written here (gate 9); two of its findings survived, one did not, and
it corrected an error of mine.

### F1 — CONFIRMED, CRITICAL: seizing an occupied joiner seat (attempted in part 4, REVERTED in part 5 — still open)

> **Outcome first:** part 4's occupancy check broke a live flow and was reverted. F1 is
> **not** closed by this spec. It is pre-existing, and prod is still strictly improved by
> what ships — but do not read this spec as having fixed it.
>
> Part 4 rejected a claim when `OLD.joiner_profile_id` was already set. That assumed a
> non-null value means "seat occupied". It does not: `clearSessionJoiner` (api.ts:1235)
> nulls `joiner_name` but deliberately leaves `joiner_profile_id`, because the departed
> participant still needs it for transcript access. So a vacated room sits at
> `joiner_name = NULL, joiner_profile_id = <departed user>`, and the next signed-in joiner
> was rejected with `42501 "joiner seat is already held by another profile"` — surfacing as
> "Session not found or already full" after the mic prompt was granted. Caught by a canary
> written for exactly that flow, not by reasoning.
>
> The column carries two meanings at once — **current occupant** and **past participant** —
> and no trigger can separate them, because every vacancy signal available to it
> (`joiner_name`, `live_state.joinerEnded`) is itself in the client allowlist and so is
> forgeable in two steps: clear the signal, then claim. A guard keyed on any of them buys
> no security and manufactures false confidence — the same gate-7b failure this review
> already caught once.
>
> The exploit test is parked as `test.fixme`, not deleted: it is real and proven, and it
> becomes P1053's canary.


Parts 1-3 stopped an attacker naming **someone else** as owner. They did not stop an
attacker naming **themselves**. The trigger permitted `NEW.joiner_profile_id = auth.uid()`
with no check on whether the seat was already held, and RLS admits any caller on
null-target rows.

This matters because transcript access keys off exactly that column. Verified live on
**prod**: `session_transcripts` and `transcription_jobs` both gate SELECT on
`EXISTS (SELECT 1 FROM clarity_sessions cs WHERE cs.id = <t>.session_id AND
(cs.creator_profile_id = auth.uid() OR cs.joiner_profile_id = auth.uid()))`. So writing
your own uid into the seat grants read of that session's stored transcript.

Prod blast radius, re-derived independently — every number matched the reviewer's:
239 total, 225 null-target, **113 reachable, 64 already holding a real joiner, 20 with a
stored transcript**. Enumeration is free: the SELECT policy exposes all 225 null-target
rows to anon.

**Pre-existing, not a regression.** Before part 1, `joiner_profile_id` sat under the
table-level grant and this session's own canary proved an *anonymous* caller could set it
to any value at all. Parts 1-3 narrowed the hole; they did not open it. What was wrong was
the **claim**, not the code: this spec and its commit message said an attacker
"authenticated or fully anonymous can no longer forge ownership", which is false for the
self-claim direction.

**The canary asserted the exploit as a passing control.** The test "an authenticated user
can claim the joiner seat for themselves" performs F1's exact operation and asserts it
succeeds, labelled *"a signed-in user must be able to join"*. Gate 7b in its purest form:
green bounded what was modelled, and the model had the threat direction backwards. That
control is still correct and still passes — against an **empty** seat. At the database
layer a legitimate join and this attack differ only by prior occupancy, which is why the
fix is an occupancy check rather than a tighter identity check.

### F4 — CONFIRMED, MEDIUM: identifier rewriting (fixed in part 4)

`id`, `code` and `created_at` were left in part 1's allowlist to preserve the pre-existing
grant state and dodge the P886 trap. Right instinct, wrong columns — no UPDATE caller
writes any of them, so nothing deployed could break, while leaving them writable let a
caller re-point which row a shared join link resolves to (`code`, looked up at
api.ts:970/1002/1026/1184) or which row FK-bearing children resolve to (`id`). Ownership
was never forged — only the identifier that resolves to it.

### F3 — NOT CONFIRMED as an escalation

The reviewer rated "anon can NULL the seat, unlocking `patch_live_state`'s anonymous
branch" as HIGH. Re-checked: `live_state` is itself in the allowlist and anon can already
write it **directly** on those same rows — this spec's own passing control proves it. So
the laundering grants no capability anon lacks. The residual harm is real but is the
integrity/nuisance one already recorded: nulling the seat drops a session out of the
victim's history (`sessions-service.ts:68`). Downgraded, not dismissed.

### A correction to my own evidence

I wrote that `pg_auth_members` returns zero rows for `anon`/`authenticated`, concluding no
inherited grant path. The **query was wrong** — it filtered the *member* side. Asking the
correct direction returns six rows: `authenticator` (`rolinherit=false`, so it must
`SET ROLE` and cannot inherit) and `postgres` (already superuser, `rolbypassrls=true`).
The conclusion survives, but it did not follow from the evidence I cited. A false absence
produced by a probe that could not have returned anything — the exact failure my own
guidance names, and the second time this session that a verified-looking negative carried
an unverified inference.

### Still open — needs its own spec, deliberately NOT fixed here

Claiming an **empty** seat on a stranger's session. At the DB layer that is
indistinguishable from a legitimate join: the only occupancy check is client-side
JavaScript (api.ts:989) and the room id is freely readable by anon. Closing it needs
server-side join authorization — the room code as a bearer capability, or an invite row —
which is exactly the anonymous-session redesign this spec's Non-Goals forbid. Part 4
protects the 64 seated rows (the ones that have transcripts); it does not protect the 49
empty-seat rows.

### Availability review — no missed write path, independently corroborated

The availability subagent reported after the section below was written. Its answer to the
question that mattered — did anything write this table outside the 7 sites in
`api.ts`? — was **no**, reached by its own greps rather than by reading my list, and it
additionally confirmed the 20-column figure against **live prod** rather than migrations
alone (18 granted + 2 excluded = 20, nothing silently dropped). It found 9 server-side
UPDATE statements across 8 migrations rather than my 3 — but they resolve to the same 3
SECURITY DEFINER RPCs plus a migration-time backfill running as `postgres`, none touching
an ownership column. Conclusion unchanged, evidence broader.

It also confirmed line 4 independently: no legitimate flow sets `joiner_profile_id` to
anything but the caller's own uid or NULL, including the letter-sourced, event-practice-room
and host-adds-partner cases I most suspected. `target_listener_id` is written at INSERT only.

Three of its findings are actionable and are recorded as follow-ups below. One (`id`/`code`
re-grant) is already closed by part 4.

### Deploy risk — P1042 interaction (mitigated by verification, not by design)

Parts 1 and 3 fight over the same conjunct: part 1 recreates the policy without
`creator_profile_id IS NOT NULL`, part 3 puts it back. `features/p1042_*.md`
(`status: week`, `severity: high`, **still open**) documents `scripts/migrate.sh:328`
printing `already applied, skipping` and exiting 0 on a version collision. If part 3 were
skipped while part 1 applied, prod would silently lose P396's guard over 112 legacy rows
and the deploy would report success.

The four versions (…150000/160000/170000/180000) are distinct and collide with nothing
currently in the tree, so the path requires a *concurrent* session minting the same
version. The mitigation is not to trust that: the prod checklist below asserts the conjunct
is present in live policy text after the deploy, which converts a silent skip into a
detected one. Collapsing 1+3 into a single file would remove the window, but only by
editing a migration already applied to test — the P886 trap this spec has twice declined to
walk into.

## Pre-deploy Checklist

### Deploy command
- [x] `./scripts/migrate.sh --env prod` — run 2026-08-12. Applied 7 pending, not 4: the
      five P1047 files plus P1038 and P1034. migrate.sh has no per-migration selection; the
      wider scope was enumerated with the tool, surfaced, and approved before the run.
      Prod smoke 8/0.

### Post-deploy verification (all four are silent-failure detectors, not formalities)
- [x] UPDATE policy `with_check` on prod **contains** `creator_profile_id IS NOT NULL` —
      verified true; the P1042 skip did not occur —
      catches a P1042 skip of part 3 that would drop P396's guard
- [x] `pg_class.relacl` on prod reads `{postgres=arwdDxtm, anon=ardDxtm,
      authenticated=ardDxtm, service_role=arwdDxtm}` — no `w` for either client role — and
      column grants list
      exactly 15 columns (no `creator_profile_id`, `target_listener_id`, `id`, `code`,
      `created_at`) — the reviewer correctly noted a REVOKE does not remove a grant held
      via PUBLIC or another role, and that canaries ran against test only
- [x] Trigger `clarity_sessions_pin_joiner_profile_id` present on prod with
      `prosecdef = false` (verified) —
      SECURITY DEFINER would silently exempt anon and still read green
- [x] **Substituted, deliberately.** No guest practice-room *write* was made against prod —
      writing probe data to production is ALWAYS-ASK. Instead prod and test were compared and
      are **byte-identical** across column grants, all three policies and both triggers, so
      prod matches the exact state in which 24 canaries and 78 regression tests passed,
      including all six anonymous practice-room controls. Stronger than one probe write on
      coverage, weaker on one axis: **no real prod traffic has exercised the new grants.**
      The Sentry half is NOT satisfiable yet — the join-path capture is frontend code and is
      not deployed, so a 42501 on prod currently yields no telemetry. Watch it after the
      next frontend deploy.

## Follow-ups (filed from this spec's review, NOT fixed here)

1. **Filed as P1053 — server-side join authorization.** Covers seat seizure (F1), seat
   erasure and empty-seat claiming; one root cause, one mechanism. The `test.fixme` exploit
   canary in this spec's suite moves there. Both need server-side
   join authorization. **Erasure is more damaging than this spec first recorded**: an
   unauthenticated caller can NULL any session's `joiner_profile_id`, and four things key on
   it — the session vanishes from the joiner's history (`sessions-service.ts:68`), the
   joiner loses SELECT on their own transcript and jobs
   (`20260313120000_p495_transcription_tables.sql:77,92`), new enqueues raise "Not a
   participant" (`20260313140327_p495_...:15`), and they cannot close their practice room
   (`20260221160452_p406_...:35`). User-visible: mid-session, the joiner's recording
   silently stops being processed. It is **not** safely closable in the trigger:
   `clearSessionJoiner` (api.ts:1235) nulls `joiner_name` but leaves `joiner_profile_id`
   set, so a guest joining a room a signed-in user left is a legitimate non-null→NULL
   transition. Blocking it would break partner-left-then-guest-rejoins. Verified, not
   assumed.
2. **No runtime detector on the one call site this fix guards.** `joinClaritySession`
   (api.ts:1003-1009) `console.error`s and returns null; the caller renders "Session not
   found or already full" (`clarity-live-page.tsx:2926`) — after the mic prompt was already
   granted. `api.ts` has Sentry capture on `updateLiveState` (1074) and `patchLiveState`
   (1112) but none on the join path, so a 42501 from the new trigger is indistinguishable
   from a full room and produces zero telemetry. The safety argument for the trigger is
   entirely static; the detector for the failure it could cause does not exist.
3. **`/demo` passes `inviteNote` into the `creatorProfileId` parameter slot**
   (`clarity-demo-page.tsx:120` against the signature at `api.ts:896-902`). An authenticated
   verified user with an empty note mints a null-creator session that is then permanently
   un-updatable by the restored conjunct — a session dead on arrival. Pre-existing since
   April, not caused by this spec. Prod showing zero null-creator rows since 2026-02-23 is
   consistent with the route simply being unused; it does **not** prove the path cannot fire,
   and part 3's comment is worded to claim only the former.
4. **New-column trap has no detector.** After part 1, a newly added `clarity_sessions`
   column is not client-updatable until explicitly granted, and nothing in
   `pre-commit-checks.sh`, `.claude/rules/database.md` or CI checks for it. No pending
   migration or open spec adds one today — a landmine, not a live break.

**Grant-path surface — no bypass found (this is the part that held).**

- Raw `pg_class.relacl`: `w` absent for `anon` and `authenticated`, present for
  `postgres`/`service_role`, and no `PUBLIC` entry — so no grant path re-opens the column.
- Role membership: `authenticator` (`rolinherit=false`) and `postgres` (superuser) are
  the only members — neither is a client escalation path. (Corrected evidence; see above.)
- The three `SECURITY DEFINER` functions that UPDATE the table touch the ownership columns
  only in `WHERE`, never in a `SET` — read from live `pg_proc.prosrc` on prod *and* test.
- The trigger's three branches are each covered by a passing canary control: anon blocked,
  authenticated self-claim allowed, `service_role` exempt. That is what falsifies the
  `current_user` assumption the trigger rests on — the assumption itself is not testable
  from the migration.

**Availability — no breakage found; the P886 failure mode is ruled out.** Exhaustive sweep
for write paths: exactly 7 `.update()` + 1 `.insert()` on `clarity_sessions`, all in
`src/app/data/api.ts`; no `.upsert()`, no `.delete()`, no raw REST `PATCH`, nothing in
`supabase/functions/`. The one dynamic `from(table: string)`
(`src/app/data/points-service-real.ts:936`) is a read-only type declaration exposing only
`select`. `scripts/copy-prod-to-test.mjs` uses `SERVICE_ROLE_KEY` and is exempt from both
the grants and the trigger. Every column written by those 7 sites is in the 18-column
allowlist.

`joiner_profile_id` has exactly **one** write site (api.ts:1001) and five callers:
`clarity-live-page.tsx:2924,3179,3718` pass `user?.id` (the caller's own id) and
`clarity-demo-page.tsx:145` / `clarity-chat-page.tsx:476` pass nothing, resolving to NULL.
No caller ever passes another user's id, so the trigger cannot reject a legitimate join.

**Residual exposure, scoped honestly.** `code`, `source_letter_id` and `source_story_id`
stay anon-updatable, but only on the 225 null-target rows — which anon can already write
state to under the anonymous practice-room model. The 14 letter-sourced rows are protected
by the `USING` clause. So this is a nuisance/denial vector inside an already-permissive
surface, **not** a privilege escalation; an earlier note in this session called it a
"session-hijack shape", which overstated it.

**Not covered by any of the above:** whether a *deployed* client bundle older than current
`main` writes a column outside the allowlist. The sweep read the working tree, not the
artifact Vercel is currently serving.

## Risks / Non-Goals

### Risks
- **Breaking anonymous practice rooms.** MITIGATE — the null-target branch is load-bearing
  for guest flows. Enumerate callers before touching the predicate.
- **Fixing the predicate while the column grant stays open.** MITIGATE — check
  `information_schema.column_privileges`, not just `pg_policies`. A tightened policy with an
  open grant is a false fix.

### Non-Goals
- Do NOT redesign the anonymous-session model.
- Do NOT fold in the separate unauthenticated-write finding on the ML training table.

## Done-When

- [x] Live policy re-read on both environments before any change — `pg_policies` +
      `information_schema` grants pulled from prod and test via the Management API before
      any edit; byte-identical on both
- [x] Every legitimate UPDATE caller enumerated, with the columns each needs — 7 UPDATE
      call sites, all in `src/app/data/api.ts` (1001, 1047, 1069, 1130, 1235, 1271, 1411),
      writing only `joiner_name` / `joiner_profile_id` / `state` / `live_state` / `mode` /
      `demo_status`. Zero in `supabase/functions/`. `creator_profile_id` and
      `target_listener_id` appear in `src/` on INSERT only (api.ts:913, 922). DB-side
      writers are all SECURITY DEFINER RPCs, unaffected by client column grants
- [x] Canary observed FAILING against the unfixed policy, covering an anonymous caller —
      3 failed / 6 passed, forged uuids in the run report
- [x] Fix applied to test, canary green, guest practice-room writes confirmed still working
- [x] Applied to prod under explicit approval, then re-verified live — all 7 pending
      migrations applied 2026-08-12 (5 P1047 + P1038 + P1034; migrate.sh has no
      per-migration selection, and the wider scope was surfaced and approved before the
      run). Prod smoke 8/0. Post-deploy checks: the `creator_profile_id IS NOT NULL`
      conjunct is present (P1042 skip detector — did not fire); `relacl` shows
      `anon=ardDxtm`/`authenticated=ardDxtm` (no `w`) against `postgres`/`service_role`
      `arwdDxtm`; 15 granted UPDATE columns; trigger present with `prosecdef = false`.
      Prod and test are byte-identical across grants, all three policies and both triggers
      — i.e. prod now matches the state where 24 canaries and 78 regression tests passed
- [x] Private security log updated; public files stay problem-class only until the fix lands
      — `.private/docs/security-log.md` 2026-08-11, including the retraction of the wrong
      second finding. `docs/technical/database.md` still frames the ownership audit as
      "does INSERT bind the owner column, using UPDATE as the reference implementation" —
      the assumption P1047 disproves. That correction is deliberately **held until prod
      lands**, per this spec's own ordering rule (private log → fix → public summary)
- [x] No SECURITY DEFINER escape hatch — the three functions that UPDATE this table
      (`complete_clarity_session`, `patch_live_state`, `update_last_activity`; all owner
      `postgres`, all EXECUTE-granted to anon) reference `creator_profile_id` /
      `target_listener_id` only in WHERE comparisons, never in a SET. Verified by reading
      live `pg_proc.prosrc` on **both** prod and test — not migration files, which P1046
      proved unreliable. This is the surface the canary structurally cannot reach, since a
      SECURITY DEFINER body runs as owner and is unaffected by client column grants
- [x] The revoke is unbypassable by any grant path — raw `pg_class.relacl` on test reads
      `{postgres=arwdDxtm/postgres, anon=ardDxtm/postgres, authenticated=ardDxtm/postgres,
      service_role=arwdDxtm/postgres}`. `w` (UPDATE) is absent for both client roles and
      present for `postgres`/`service_role`, and there is **no `PUBLIC` entry**, so no
      PUBLIC grant can re-open it. `pg_auth_members` returns zero rows for `anon` and
      `authenticated`, so neither inherits UPDATE from another role either
- [x] Prod confirmed UNTOUCHED after all test work — table-level UPDATE still granted to
      anon + authenticated (2 rows), P1047 trigger absent
