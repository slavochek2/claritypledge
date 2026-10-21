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
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
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

- [ ] Deleting a batch of 100 test users on the test project takes at most 5 API calls, and the
      gateway log shows no 23503 errors for it. Counts before and after recorded here.
- [ ] One full e2e run leaves the e2e-namespace user count unchanged, within the teardown batch.
      Users created per run recorded before and after.
- [ ] `sweep-e2e-test-users.ts --apply` with no flags processes a bounded batch, stops within its
      time budget including listing, and exits non-zero after repeated 5xx. Each behaviour is shown
      with a simulated failure.
- [ ] The batch delete refuses non-e2e users, and is absent from or refuses on prod, as decided.
      Shown by a test.
- [ ] Hiding and showing a tab mid-pack 5 times costs no more requests than one full pack, and a
      hidden tab still makes zero requests (`e2e/p1522-idle-request-budget.spec.ts` stays green).
- [ ] `measure-idle-requests.mjs` reports failed requests; proven by a run against a blocked
      endpoint.
- [ ] Regression test with a request-volume assertion for the cleanup path
      (`e2e/p1532-*.spec.ts` or a unit test).

## Related

P1531 (cost gate; source of the findings), P1530 (log-ingestion attribution), P1522, P1523,
INBOX-204.
