---
status: in-progress
type: bug
rank: 54
severity: high
workstream: infrastructure
date_reported: '2026-10-21'
created_date: '2026-10-21'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [supabase, e2e, cost, egress]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/integration/p1532-cleanup-request-volume.spec.ts
  test_files_extra: [src/tests/p1532-offline-pack-resume.test.ts]
  root_cause: "deleteTestUser learns FK blockers by provoking 23503 deletes (7 requests, one 409, for one user with one blocker); the offline pack restarts from entry 1 after a hidden-tab cut and refetches stored entries (40 reads for 5 cuts vs 30 for a full pack)"
  confidence: high
  surfaces_in_scope: [deleteTestUser, sweep-e2e-test-users-cli, global-teardown, createTestUser-minting, offline-pack-resume, measure-idle-requests]
  surfaces_deferred: []
  reproduced_at: 2026-10-21
---

# P1532: E2E user cleanup and the offline pack still multiply Supabase requests after P1522/P1523

## Summary

A cost-only review of shipped P1522 and P1523 (P1531, "Review findings", rows A1-A4 and C1-C7, each
checked against the code) found that test-user minting and cleanup still cost several API calls and
error log lines per user. The cleanup CLI is unbounded. The offline pack can re-download its entries
on every hide and show. The test project shares the production organisation's free-plan quota, and
production is restricted from 11 Nov 2026.

> Founder, verbatim: "when it started to delete users it started to create many logs for each
> deletion which is weird you know."

## Root Cause

Three separate mechanisms:

1. **Per-user, error-driven cleanup.** `deleteTestUser` deletes one user through about six REST and
   auth calls. `deleteClearingReferences` discovers FK blockers by **sending a delete it expects to
   fail**, then reads the blocking table from the 23503 error. Every blocker therefore costs a
   failing request, which writes a Postgres ERROR and a gateway error line, plus the nested delete.
   For rows selected by a non-key column, it also loops one owned row at a time (P1523 branch). The
   cost is 6 + 2k calls per user (k = blockers), plus S + 2 per blocker class over S owned stories.
2. **Nothing bounds the bulk path, and minting never stopped.** The CLI sweep defaults to
   `limit: Infinity` with no time budget, pacing or stop on repeated 5xx. It ran against 17,500
   leftovers and the test project went down on 2026-10-21; the exact trigger is UNVERIFIED. The
   teardown's 60 s deadline starts after listing, so paging through every auth user (full objects)
   is unbounded. P1522's planned fixed user pool (its Solution item 4) was not built: about 1,500
   users are minted and deleted per full run (Codex AST census: 1,286 `createTestUser` calls in 480
   files). P1530's private readings put most of the organisation's log ingestion on the test
   project, with daily logs moving with new test users.
3. **Offline pack restart.** A run cut short by hiding the tab restores the previous stamp. The next
   show starts the pack from the beginning, and `prefetchThrough` always calls its fetcher, so
   entries already stored are fetched again.

Plus one blind spot: `scripts/measure-idle-requests.mjs` counts only `requestfinished`, so failed
requests (which still produce gateway logs) never appear in P1522-style measurements. A failure storm
would read as zero.

### Reproduction evidence (2026-10-21, test project)

- **Cleanup (A1), live:** `e2e/integration/p1532-cleanup-request-volume.spec.ts` creates one user
  who owns one `clarity_docs` row (`owner_id` is ON DELETE NO ACTION and not in the hand-kept
  pre-cleans). `deleteTestUser` then made **7 requests, 1 of them an error**:
  `DELETE story_verifications 204`, `DELETE stories 204`, `GET clarity_sessions 200`,
  **`DELETE profiles 409`** (the provoked 23503), `DELETE clarity_docs 204`, `DELETE profiles 204`,
  `DELETE auth/v1/admin/users 200`. The sweeper adds `getUserById` per user. That is 5 + 2k calls
  inside `deleteTestUser` plus 1 in the sweeper, matching the spec's 6 + 2k. The canary fails on
  "no provoked 4xx/5xx" and on the 1-request budget.
- **Offline pack (C6), unit:** `src/tests/p1532-offline-pack-resume.test.ts`. One uninterrupted pack
  makes 30 data reads. Five mid-pack hide/show cycles followed by completion made **40**: each
  restart re-read the two entries stored before the hide.
- **Sweeper (C1, C3), from code, no run:** the CLI passes `limit: Infinity` and no `timeBudgetMs`
  (`scripts/sweep-e2e-test-users.ts:126`). The deadline is set after the listing loop (`:89`), and
  the dry run lists every page, so listing is unbounded. The dry run was **not** executed: a
  read-only count gives the same fact without the egress. Test has 12,721 auth users, so 13 pages
  of full user objects per sweep. 11,976 are e2e-namespace, 11,890 of them older than 24 h.
- **Measurement (C7), from code:** `scripts/measure-idle-requests.mjs:67` listens only to
  `requestfinished`.
- **FK graph, read-only catalog query:** 179 FKs in `public` or onto `auth.users`. The ON DELETE
  NO ACTION/RESTRICT edges onto `profiles` include `clarity_docs.owner_id`, `clarity_letters.sender_id`,
  `clarity_sessions.{creator,joiner,target_listener}_profile_id`, `clarity_agreements.*`,
  `email_send_log.profile_id`, `letter_deliveries.receiver_profile_id`, `story_explain_backs.recorder_id`,
  `story_verifications.{speaker,listener}_id` and `witnesses.witness_profile_id`. Only three
  of them are in the hand-kept pre-cleans.
- **PostgREST timeout:** `authenticator` runs with `statement_timeout=8s`, so one batch RPC must
  finish inside 8 s. This bounds the server-side batch size.

## Invariants

- **FK order is derived from the database, never a hand-kept table list** (decisions.md 2026-10-21,
  P1523 entry: the hand-kept pre-clean list is the class P1522 retired; epistemic.md gate 7e). A
  server-side batch must read blockers from the catalog (`pg_constraint`), not from provoked errors
  and not from a list.
- **A bulk delete function must be unusable against production.** It refuses unless the rows are
  e2e-namespace users (the `E2E_EMAIL` pattern), and the spec states how prod is excluded: either
  not deployed there, or refusing there. Deciding which is part of the fix.
- **Hidden tabs make no requests** (P1522). The offline-pack fix must not make a run continue while
  the tab is hidden.
- The P1345 contract stays: a failed cleanup step fails the test softly and never skips the
  remaining cleanups.

## Reproduction Steps

1. On the test project, with e2e users present: `npx tsx scripts/sweep-e2e-test-users.ts` (dry run
   only, **never `--apply` as a diagnostic**, epistemic.md gate 2b). Observe that listing pages
   through every auth user.
2. Read `e2e/helpers/test-user.ts:438-545` and count the calls for one user with k FK blockers:
   6 + 2k, matching the founder's "about 12".
3. In a browser on a real (non-automation) session, open a page while the pack is due and switch tabs
   every few seconds. Count `supabase.co` requests per show: the pack restarts each time (UNVERIFIED
   live; established from code at `src/lib/offline-pack.ts:175-184` and
   `src/app/components/offline/offline-pack-preloader.tsx:27-40`).

**Reproduction rate:** 100% for 1 and 2 (deterministic from code); 3 conditional on tab switching
mid-pack.

## Expected Behavior

- Deleting N test users costs O(1) requests per batch, not O(N x blockers), and writes no error log
  lines on the normal path.
- A full e2e run creates a bounded number of users (a worker-scoped pool where freshness is not under
  test) and leaves the e2e user count unchanged.
- Every bulk script has a default batch size, a time budget that includes listing, and stops after
  repeated failures.
- An interrupted pack resumes, or skips entries it already stored this cycle, instead of restarting.
- The idle-request measurement counts failed requests as well as finished ones.

## Actual Behavior

See Root Cause. Codex verdict: "FAIL — cleanup and sweeper request amplification remain capable of
exhausting shared quotas or overwhelming the test project."

## Affected Files

- `e2e/helpers/test-user.ts:438-545`: `deleteClearingReferences`, `deleteTestUser` (A1, C2, C5)
- `e2e/helpers/test-user.ts:148-209`: `createTestUser`, no pool (A2, C4)
- `e2e/helpers/test-user.ts:550-630`: `deleteTestUserByEmail`, `cleanupAllTestUsers` call
  `listUsers()` without paging. Latent; no live callers (A3)
- `scripts/sweep-e2e-test-users.ts:52-133`: unbounded CLI, listing outside the deadline (C1, C3)
- `e2e/global-teardown.ts:15`: a sweep after every run (A4)
- `src/lib/offline-pack.ts:175-184`, `src/app/components/offline/offline-pack-preloader.tsx:27-40`,
  `src/lib/offline-read-cache.ts:818-846` (C6)
- `scripts/measure-idle-requests.mjs:67` (C7)

## Severity

**High.** It drives the shared free-plan overrun ahead of the 11 Nov restriction, and the unbounded
path coincided with the test project going down.

## Fix Approach

1. **One server-side batch delete** (SQL function, test project only per the Invariant). It takes an
   array of user ids, deletes dependent rows in catalog-derived FK order in one transaction, then
   the profiles. Auth users are deleted in bounded, paced batches. `deleteTestUser` and the sweeper
   call it.
2. **Worker-scoped user pool** in the e2e helpers for specs that do not assert on a fresh account.
   Fresh accounts are kept where account creation is under test. Report users created per run.
3. **Bound the sweeper:** a default limit and a time budget that covers listing; page ids only where
   the API allows; stop after N consecutive 5xx or timeouts; propagate auth-delete failure.
4. **Offline pack:** skip entries stored during the current cycle when resuming after a hide.
5. **Measurement:** also count `requestfailed`, and report it separately.

Per P1531, the fix states its cost budget (calls, egress, log lines per run) before and after, and
carries a request-volume assertion. Closes INBOX-204's "no net new users per full e2e run" check.

## Acceptance Criteria

- [x] Deleting a batch of 100 test users on the test project takes at most 5 API calls, and the
      gateway log shows no 23503 errors for it. Counts before and after recorded here.
      *Evidence (2026-10-21, founder's go):* `sweep-e2e-test-users.ts --apply --limit 100` on test:
      before 10,091 e2e users (10,048 older than 24h); "deleted 100, failed 0, 3 requests (0 failed),
      stopped: limit", exit 0. Test-project log (`/analytics/endpoints/logs`): the 3 requests at
      12:25:42-44 UTC (1 count + 2 purges), all 200, and no foreign-key error line in that window.
      The 23503 lines in the surrounding 30 min (17, every few minutes from 12:05) come from other
      sessions' e2e runs still on main's per-row cleanup, which is the pattern this spec removes.
- [x] One full e2e run leaves the e2e-namespace user count unchanged, within the teardown batch. **Deferred to P1550 by the founder, 2026-10-23.** Partial evidence: a 3-worker full run on the new TEST project was stopped at 387/4151 tests (it held TEST at 97-99% CPU); its ledger purge deleted 612 of 649 recorded users (37 already gone) in 13 requests, 0 failed, and the count returned to 58. A complete run at one worker takes about 33 h.
      Users created per run recorded before and after. *Evidence so far:* every run this session
      ended with the run ledger deleting all users it created (e.g. a 7-file sample: "created 35
      users; deleted 35 still alive, 1 request"); users created per run, see Cost Budget. **Open:**
      one full run (hours, and quota), the founder's call.
- [x] `sweep-e2e-test-users.ts --apply` with no flags processes a bounded batch, stops within its
      time budget including listing, and exits non-zero after repeated 5xx. Each behaviour is shown
      with a simulated failure. `src/tests/p1532-sweeper-bounds.test.ts`, 8 tests: default limit
      500 (11 requests), budget counted from the counting request, 3 consecutive 503s or timeouts
      give exit 1, a 403 stops at once, no-progress stops. Mutation control: with the failure stop
      disabled, two of them go red.
- [x] The batch delete refuses non-e2e users, and is absent from or refuses on prod, as decided.
      Shown by a test. Decided: **refuses** (Resolution below). `p1532-e2e-purge-test-users.spec.ts`:
      the guard answers true only for the test ref (false for the prod ref, no ref, no claims),
      anon is refused, a non-e2e user comes back `refused` and untouched.
- [x] Hiding and showing a tab mid-pack 5 times costs no more requests than one full pack, and a
      hidden tab still makes zero requests (`e2e/p1522-idle-request-budget.spec.ts` stays green).
      `src/tests/p1532-offline-pack-resume.test.ts`: 40 reads before, at most 30 (one full pack)
      after; `p1522-idle-request-budget.spec.ts` 5/5 passed on this branch.
- [x] `measure-idle-requests.mjs` reports failed requests; proven by a run against a blocked
      endpoint. `/feed`, 1 min, `--block /rest/v1/`: new script "17 requests, of which 14 failed";
      the old script under the same block saw 3.
- [x] Regression test with a request-volume assertion for the cleanup path
      (`e2e/p1532-*.spec.ts` or a unit test). `e2e/integration/p1532-cleanup-request-volume.spec.ts`:
      7 requests with one 409 before, 1 request and 0 errors after.

## Resolution

**Fixed on `feature/p1532-e2e-cleanup-amplification`; migrations applied to the test project only.**

1. **Server-side batch delete** (`20261021120000_p1532_e2e_purge_test_users.sql`).
   `e2e_purge_test_users(ids | older_than, limit)` walks `pg_constraint` from `auth.users` on every
   call. NO ACTION/RESTRICT children are deleted first, CASCADE children are walked for their own
   blockers, and a cycle raises. Then the auth users go, all in one transaction, at most 200 per
   call (PostgREST's 8 s statement timeout); callers send 50. If the batch fails, each user is
   retried alone and the failures come back with their SQLSTATE.
   **Prod exclusion, decided: deployed everywhere, refuses off test.** It refuses unless
   `request.jwt.claims ->> 'ref'` is the test ref, which a claims-less call also fails. EXECUTE is
   granted to service_role only, and only e2e-namespace emails are deleted (others are returned
   `refused`). Not deploying it to prod was rejected: there is no test-only migration lane, and
   objects on test that no migration defines are treated as drift and dropped (P1095).
2. **Helpers** (`e2e/helpers/test-user.ts`). `deleteTestUsers(ids)` and `deleteTestUser` make one
   request per 50 users. The per-row path stays only for refused (non-namespace) users and other
   projects, and a failed auth delete there now fails the test (C5). `deleteTestUserByEmail` and
   `cleanupAllTestUsers` are removed (A3: unpaged `listUsers()`, no callers in any checkout).
3. **Worker user pool + run ledger** (`20261021130000_p1532_e2e_user_pool.sql`, fix
   `20261021140000`). Inside a Playwright run on test, `deleteTestUser` releases a user this worker
   created: all its public rows go, so it is invisible while waiting. The next `createTestUser()`
   without an email claims it in one request. A claim is refused when the auth state differs from
   a fresh user's (namespace, password, confirmation, pending email change, phone, ban, MFA,
   non-email identity), and the cached sign-in is kept only while its session exists. Every user a
   run creates is recorded (`e2e/helpers/run-ledger.ts`), and global teardown deletes the
   survivors, 50 per request, before the bounded 6 h backstop sweep. `P1532_POOL=off` opts out.
   Off the test project nothing is deleted, except on a local Supabase.
4. **Sweeper** (`scripts/sweep-e2e-test-users.ts`). The dry run is one counting request
   (`e2e_test_user_counts`), with no listing. `--apply` defaults to 500 users, 50 per request, and a
   120 s budget that starts at the first request. It stops after 3 consecutive 5xx or timeouts
   (backoff with jitter), stops at once on a 4xx, stops when a batch makes no progress, and exits
   non-zero on any of these.
5. **Offline pack** (`src/lib/offline-pack.ts`). A hidden-tab cut records when its cycle began
   (`resumeFrom`). The next run of that cycle takes entries stored since then from the cache (a local
   read) instead of fetching them again. Hidden tabs still stop the pack.
6. **Measurement** (`scripts/measure-idle-requests.mjs`). It counts `requestfailed` and reports it
   in a separate column, and `--block <substring>` simulates a failing endpoint.

### Review (/finish, 2026-10-21)

Reviewers: Codex (`gpt-6.1-sol`, BLOCK SHIP, 5 findings), a criteria reviewer (2 HIGH, 10 MEDIUM)
and an Opus adversary (1 HIGH, 3 MEDIUM, 5 LOW; "no path that modifies a production row"). Gemini
**refused the payload** (`delegate-gemini` exit 2, the fake test-password fixture), and Codex stood
in as the evidence reviewer. **3 of 4 lanes reported.** Fixed in `20261021163700` (candidate
locks), `20261021174500` (the rest of the SQL) and the TS commit that follows:

| Finding | Disposition |
|---|---|
| TS per-row fallback ran off the test project and for any refused id (Codex 1, criteria 10) | FIXED: off test nothing is deleted except on a local Supabase (`localhost:54321`); a refused id falls back only if this process created it |
| Purge deletes a blocking row that also belongs to a non-e2e user (Opus H1) | FIXED: refuses (the user lands in `failed`); test: a non-e2e host's session an e2e user joined survives, and the rest of the batch is deleted |
| Namespace check raced with deletion (Codex 2) | FIXED: candidates locked `FOR UPDATE` / `FOR UPDATE SKIP LOCKED` |
| A resumed pack could fetch after the tab hid during the cache read (Codex 3) | FIXED: visibility rechecked after the lookup; test fails without it (mutation run) |
| One bad user could make a batch hit the 8 s timeout (criteria 1, Opus M3) | FIXED: the per-user retry stops at 5 s and returns `deferred`; callers re-send once; the ledger purge halves its batch after a transient failure |
| Pool users aged out by another run's 6 h sweep (Opus M1) | FIXED: release and claim stamp `updated_at`, and the sweep ages by last activity |
| Released users keep rows in id-keyed tables with no FK, and GoTrue's per-user email limit (criteria 5, Opus M2) | FIXED: the claim refuses such users (columns found from the catalog) and users sent an email in the last 60 s |
| The guard checked ref but not role (Opus L1) | FIXED: requires `role = service_role` too |
| Entry functions' refusal path untested (criteria 2) | FIXED structurally: a live-catalog test asserts each entry function opens with the guard before any DELETE/UPDATE, with an unguarded helper as the known-bad control. The refusal itself cannot be exercised from here (no prod-ref JWT can be minted) |
| Ledger purge dropped refused ids silently (Codex 5, criteria 7) | FIXED: counted and logged per id |
| Pool spec FIFO order-dependence; claim returned a stale email (criteria 3, 4) | FIXED: LIFO pool; the claim returns the server's email |
| 429/408 treated as refusals; last request cut short by the budget (criteria 14, 16) | FIXED |
| Measurement missed HTTP 4xx/5xx, and counted its own shutdown aborts (criteria 9) | FIXED: a separate 4xx/5xx column, and the listener is detached before close |
| Specs erased an operator's `P1532_POOL` (criteria 15) | FIXED |
| `dependent_rows` counted a rolled-back batch (Opus L3) | FIXED |
| No database.md entry (criteria 17) | FIXED |
| A budget stop exits 0 with users left (Codex 4) | Set aside: a limit or budget stop is the designed bound, not a failure; the remaining count is logged |
| A test that deletes one user mid-test and creates another may get the same id (criteria 6) | Set aside: using a deleted user is already broken; documented in e2e-testing-guide.md |
| `P1522_SKIP_SWEEP` now skips only the sweep, not the ledger purge (criteria 7) | Set aside: the ledger purge deletes only this run's own users; no lane sets the flag except this session |
| Depth > 1 walk, cycle RAISE and SET NULL edges untested (criteria 8) | Partly: the H1 test walks a NO ACTION edge with a non-e2e owner, and the sweep branch is now run. Depth > 1 and the cycle RAISE stay untested (Known limitation) |
| Peek skips `viewerMatchesOwner`; resumed staleness up to 2x the refresh window (criteria 13) | Set aside: the stamp and the cache are both per owner, so a resume never crosses owners; 12 h worst-case staleness for pre-loaded offline copies is acceptable |
| Prod safety rests on one constant compare (Opus L2), shared `/tmp` ledger (L5) | Set aside: the ref claim is signed with the project's own JWT secret; the ledger only feeds ids to a function that re-checks namespace and project |
| Cost budget rests on a sampled 34% reuse rate (criteria 11) | Stated as an extrapolation in the Cost Budget; a full-run figure is the open AC |

**Re-review (round 2: Gemini served, Codex; 2 of 2 external reviewers reported)** on the round-1 fix
diff. Fixed in `20261021183000_p1532_review_fixes_2.sql` and the commit that follows:
- the blocking rows are locked before their owners are read (Codex 1, the row half);
- a retried user's dependent rows are counted only once it succeeds (Gemini 3, Codex);
- `e2e_test_user_counts` uses the sweep's activity age (Codex 5);
- the sweep halves its batch after a transient failure or a deferral, and a batch that only
  defers counts as a failed attempt (Codex 2, 3);
- `deleteTestUsers` shrinks its batch after a deferral (Gemini 2's intent; its premise of a
  200-id batch was wrong, the batch is 50);
- the Cost Budget now carries the failure-path arithmetic, egress and log lines (Codex 4).

Set aside:
- **Ownership check on CASCADE edges (Gemini 1).** The example it gave is wrong:
  `clarity_sessions.creator_profile_id` is NO ACTION (catalog read). In general a CASCADE edge is
  the schema's own decision that the row dies with the user, which is what deleting the user does
  anyway.
- **An owner's email changing concurrently to a non-e2e one (Codex 1, the owner half).** Exotic on
  the test project; recorded as a known limitation.
- **One attempt can still exceed 8 s (Codex 2).** The server checks the clock only between users.
  A timeout rolls the whole call back (nothing is half-deleted), and the callers halve their batch.

**Known limitations:** the purge's ownership check covers rows that reference a non-e2e user
directly. A blocking row owned through a parent (a snapshot inside a non-e2e user's letter) is still
deleted, as before P1532. Depth > 1 and the cycle RAISE have no test. Both are test-project-only.

## Cost Budget

Arithmetic from measured values unless marked. Request counts include auth admin calls. Each
request writes at least one gateway log line, and GoTrue writes its own lines for create, delete
and sign-in calls.

| Measure | Before | After |
|---|---|---|
| Requests to delete 1 user with k FK blockers | 5 + 2k in `deleteTestUser` (measured 7 at k = 1), +1 in the sweeper | 1 (measured) |
| Provoked error responses per deleted user | k (each a 409 plus a Postgres ERROR line) | 0 (measured) |
| Requests per test user over its life | create 2 + delete 7 = 9 at k = 1, + up to 1 sign-in | fresh: create 2 + release 1 + 1/50 teardown ≈ 3.02; reused: claim 1 + release 1 = 2, sign-in reused while the session lives |
| Users created per run, 7-file sample | 53 (one per `createTestUser` call) | 35 created, 18 claimed from the pool (measured, run ledger) |
| Requests per run, 7-file sample (user lifecycle only) | 53 x 9 = 477, + 53 provoked 409s | 35 x 2 + 18 + 53 + 1 = 142, 0 provoked errors |
| Requests per full run (~1,500 users, sample reuse rate 18/53 = 34% assumed) | 1,500 x 9 = 13,500, + ~1,500 409s | 990 x 2 + 510 + 1,500 + 30 ≈ 4,020, 0 provoked errors |
| Teardown per run | listing until 900 candidates (≥ 1 page of 1,000 users x 663 B ≈ 663 KB uncompressed) + up to ~600 calls in 60 s | 1 ledger request per 50 survivors + 1 count + ≤ 6 purge requests; no listing |
| CLI sweeper, dry run | 13 pages x 1,000 users x 663 B ≈ 8.4 MB uncompressed (12,721 users) | 1 request, 3 numbers |
| CLI sweeper, `--apply`, no flags | unbounded: 17,500 users x (6 + 2k) | ≤ 1 + 10 requests for the default 500 users |
| Offline pack, 5 hide/show cycles mid-pack | 40 reads (measured, unit test) | ≤ 30 = one full pack (measured) |
| Egress per cleanup request | listing: 663 B per auth user listed (measured, uncompressed) | purge answer ≈ 40 B per id (a uuid in JSON) x 50 ≈ 2 KB; count answer ≈ 100 B (estimated from the response shape) |
| Postgres ERROR lines, normal path | k per deleted user (each provoked 23503) | 0 |

**Failure paths (bounded, not typical).** A transient failure (5xx, 408, 429, timeout) costs one
gateway error line, plus one Postgres ERROR when it is a statement timeout. Three consecutive
failures stop the run with exit 1. Each failure halves the batch, which never grows back, so the
hard bounds are the user limit and the time budget, not the request count:
- **CLI sweeper:** `--apply` with no flags runs ≤ 120 s and ≤ 500 users. On the normal path that is
  1 + 10 requests. Failures shrink the batch for the rest of the run (50, 25, 12, 6, 3, 1). For
  example, two failures before each success give successful batches of 12, then 3, then 1. Past that
  point every request deletes at most one user, so the 120 s budget, not the 500-user limit, ends
  the run. The worst case is therefore "as many requests as fit in 120 s", each costing one gateway
  line, and three consecutive failures still stop it early.
- **Teardown ledger purge:** on the normal path ⌈survivors/50⌉ requests. On failure the batch halves
  the same way. It is capped at 30 s either way.
- **A batch the server cannot finish:** it returns `deferred` instead of timing out. Each deferred id
  is re-sent once in a smaller batch; a second deferral is a failure.

**Today and at 10x.** Per full run the user lifecycle drops from ≈ 13,500 requests to ≈ 4,020, and
from ≈ 1,500 provoked error responses to 0. At 10x the tests, both scale linearly; deletion stays
one request per 50 users.

1. **Fits the plan limit today?** It cannot be shown from public figures. The Supabase registry row
   in [metered-services.md](../docs/technical/metered-services.md) has no log-ingestion number, and
   account usage is private (`.private/docs/usage/`). What is measured is the direction and size:
   about 70% fewer requests per full run, no provoked error lines, and no listing egress.
2. **Fits at 10x?** Per-run cost grows linearly with tests, as before, but the per-user constant
   drops from about 9 requests to 2-3, and deletion is O(1) per 50 users.
3. **If not:** the Pro plan (from $25/month, registry row) remains a founder call tracked in P1530.

**Not verified here:** gateway and Postgres log line counts (read from the dashboard or logs
endpoint), and a full-run figure (the per-run row is extrapolated from a 7-file sample).

## Related

P1531 (cost gate; source of the findings), P1530 (log-ingestion attribution), P1522, P1523,
INBOX-204.
