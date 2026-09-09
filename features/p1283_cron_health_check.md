---
status: qa
type: task
rank: 3
tags: [monitoring, infra, cron, alerting]
disclosure: public
intent: cold-start
flow: dev
driver: anomaly
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1283 — Nothing watches the pg_cron jobs the migrations schedule

**Provenance:** `intent: cold-start` is accurate and not a shortcut. There was no founder
conversation to mine — the work arrived as an autonomous overnight task assignment, and
the code existed before this spec did (see Numbering below). No founder sentence exists to
quote, so none is invented.

**Numbering:** the script and test were written by an earlier agent under two P-numbers
that were already taken — p1279 shipped as an unrelated fix, and p1280 is an
article-container spec on main. Neither had a spec file. Renumbered to p1283, verified
free against branches, `features/`, `features/done/`, every worktree, and `scripts/`.

## Problem

Three pg_cron jobs are scheduled on prod by migrations, and no automated check has ever
read `cron.job_run_details`. A job that dies, never gets created, or errors on every run
is invisible until a person notices the downstream effect by hand.

This is not hypothetical. P1256 found that a job dispatching every event reminder and
feedback email had failed on **all 328 of its runs**, from 2026-06-17 to 2026-09-07, with
the same error each time. Measured on prod on 2026-09-09:

| jobid | status | runs | last run |
|---|---|---|---|
| 1 | failed | 328 | 2026-09-07 06:00Z |
| 2 | succeeded | 6330 | 2026-09-09 08:10Z |
| 3 | succeeded | 96 | 2026-09-09 08:00Z |

The failure was as loud as a failure can be — 328 identical error rows sitting in a table.
Nothing read the table, so a hard error was operationally indistinguishable from silence
for roughly three months.

None of the seven existing detectors can see this class. `auth-canary` watches the Google
sign-in chain, `csp-smoke` and `prod-health-smoke` watch public HTTP routes,
`check-deploy-drift` and `backup-staleness` watch deploy and backup state, and
`stranded-signups` watches confirmation-mail outcomes. A dead cron job breaks none of
their surfaces.

## Appetite

One check script, one workflow, two registry rows, and — after the founder decision below —
one migration that creates the job the check found missing. No new infrastructure, no new
dependency.

## Solution

`scripts/check-cron-health.mjs` reads prod's `cron.job` and `cron.job_run_details` and
compares them against the jobs the migrations declare.

**The expected-job list is derived from `supabase/migrations/*.sql` by grep, never
restated.** A second hardcoded list would drift from the migrations, and the drift would be
exactly as invisible as the outage this check exists to catch. The parser replays
`cron.schedule` and `cron.unschedule` across files in filename order and, within a file,
in the order the calls actually appear. Text order is correct in both directions: the
repo's "unschedule then reschedule" idempotency pattern keeps its job because the
schedule comes last, and a migration that schedules a job and then removes it further
down drops it. Whole-line SQL comments are stripped first, so a commented-out call
cannot invent an expected job.

**Tolerance is per job, from that job's own cron expression** — two intervals of grace with
a 15-minute floor. One global window would either alarm constantly on the 5-minute job or
stay blind for hours on the hourly one. An expression the parser cannot read returns `null`
and is reported as "tolerance unknown", never guessed.

A job fails the check when it is absent from `cron.job`, inactive, has failed runs in the
last 24h, has never succeeded, or has not succeeded within its tolerance. A job present on
prod that no migration declares is **reported and not failed on** — several such jobs have
been created out of band, and failing on them would make this check permanently red and
therefore ignored.

**Read path.** `cron.job_run_details` lives in the `cron` schema, which PostgREST does not
expose. Verified against prod on 2026-09-09 with the prod service-role key:

```
PGRST106  Invalid schema: cron
hint: Only the following schemas are exposed: public, graphql_public
```

So the Supabase Management API query endpoint is the only read path that needs no new
migration, authenticated with `SUPABASE_ACCESS_TOKEN`. That is the same path `/day` already
uses.

**Alerting** copies the shape of the seven existing detectors: `.github/workflows/cron-health.yml`
runs 6-hourly, is `continue-on-error` so a finding cannot post a red X on the repo, and
opens or appends to a GitHub issue found by the P1155 author-bound exact-title lookup. Two
rows in `.github/alert-registry.json` put both of its titles on the escalation ladder, plus
a `producer-freshness` row so a workflow that stops running does not read as health.

**Exit status is read directly rather than inferred.** The script separates "a job is
unhealthy" (exit 1) from "the check could not run" (exit 2), and the workflow branches on
the recorded status. `stranded-signups.yml` has to infer that distinction from an empty
summary because its script cannot say so directly. Collapsing the two would let a rotated
token masquerade as a clean database — the precise failure shape that already cost three
months.

## Risks / Non-Goals

**A green run does not prove delivery.** A `succeeded` row proves the job's SQL ran without
error. `net.http_post` is asynchronous, so a tick that queues a request records success
whatever the response turns out to be, a 401 from a rotated secret included. This check's
scope is scheduling and SQL-level execution. Delivery is asserted separately against
`net._http_response`, and this work does not change that.

**The workflow needs a repository secret that is not yet set.** `SUPABASE_ACCESS_TOKEN` is
in `.env.local` but appears in no workflow — `grep -rl SUPABASE_ACCESS_TOKEN .github/`
returns nothing, and `gh secret list` is refused by the available token, so whether it
exists as a repository secret could not be confirmed either way. If it is absent the
workflow exits 2 and opens the "check is not running" issue: the designed behaviour for a
missing credential, loud rather than silent. Listed in the Pre-deploy Checklist.

**Issue lookup reads the newest 100 open issues.** `gh issue list --limit 100` is a
bounded newest-first slice, so once more than 100 newer issues are open, an older
bot-authored incident becomes invisible and a duplicate is created instead of a comment.
Raised by adversarial review. It is **not** introduced here: all eight producers and
`alert-escalator.mjs` share this exact lookup, and `test-producer-author-bind.sh` asserts
that one canonical filter is used across every producer — diverging in this one workflow
would break that invariant while fixing nothing elsewhere. Measured 2026-09-09: the repo
has 2 open issues, so the bound is 50x away. Recorded here as a known repo-wide property
rather than patched asymmetrically.

**The check fails against prod today, correctly.** See Findings.

## Findings from the first real run against prod

**`cleanup_stale_live_invites` is declared by a migration and does not exist on prod.**
`20260414100002_p703_live_invites_cron.sql` schedules it hourly to close
`clarity_live_invites` rows left open more than 24h. Prod's `cron.job` holds two rows and
this is not one of them. The orphan-clearing safety net that migration describes has
therefore never run on prod, and the unique partial index it backstops has been relying on
`completeClaritySession()` alone.

**[FOUNDER DECISION — TAKEN 2026-09-09: create the job on production.]** Of the two ways
to resolve it, the founder chose to make the job exist rather than to unschedule it. The
deliverable is therefore a new migration, `20260909120000_p1283_schedule_stale_live_invites_cleanup.sql`,
plus the health check that would have caught the absence. **This work still does not run
migrations on prod** — applying it is founder-only and remains the second Pre-deploy item.

### Why the April migration produced nothing

Diagnosed with read-only probes against prod on 2026-09-09, not inferred:

| Fact | Evidence |
|---|---|
| It WAS applied — so it will never re-run | `supabase_migrations.schema_migrations` holds version `20260414100002` |
| pg_cron was installed AFTER it ran | OIDs come from one monotonic counter: `clarity_live_invites` 125931 (April migration's own table) < pg_cron extension 127993 < `cron` schema 127994 < `ready_submissions` 129320 (August migration's table) |
| The guard shape is not the difference | `20260816120000_p1083` uses a byte-identical guard and its job exists, because by August the extension did |
| The lowest surviving jobid is 2 | jobid 1 was the out-of-band job P1256 dates to 2026-06-17 — two months after this migration |

So `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')` was false at apply
time, the `DO` block did nothing, and the migration reported success. **A new migration
written the same way would silently no-op the same way**, which is why the repair changes
the mechanism rather than repeating the file.

### The cost, measured

One `clarity_live_invites` row has been open for **90 days** (created 2026-06-11). The anon
REST key reports **zero** open rows because RLS hides it; a role that bypasses RLS sees it.
Any claim about this backlog made through the anon key is coverage-blind. The job's first
run after deploy closes it — no data migration is needed or included.

### How the repair fails loudly without breaking a local instance

The two requirements pull against each other, and the reconciliation is the condition
being tested, not the volume of the complaint:

- **p703 tested a REMOVABLE condition** — "the extension is not created" — which was merely
  not-yet-true and became true eight weeks later with nothing to notice.
- **The repair tests an IRREDUCIBLE one** — `shared_preload_libraries` does not contain
  pg_cron. That is a postmaster-level setting; where it holds, no migration, extension or
  privilege can produce a cron job on that server, so skipping is a statement of fact.
- Where pg_cron **is** preloaded, the migration installs the extension itself and then
  **asserts the post-condition**: no active `cron.job` row afterwards raises, the
  transaction aborts, and the version is never recorded as applied. A silent no-op is
  unreachable on a cron-capable server.
- The skip branch is not silent either: it raises a `WARNING` naming the job, and
  `check-cron-health.mjs` reads prod's real `cron.job` from outside the migration and exits
  non-zero when a declared job is missing — the layer p703 lacked entirely.

Verified against real containers: the Supabase Postgres image (the one the local stack
runs) preloads pg_cron and ships the extension uninstalled, so a local stack takes the
install-and-schedule path and ends up matching prod; a bare `postgres:17` takes the
WARNING branch and exits 0.

## Invariants

- The expected-job list is derived from the migrations at run time. Never hardcode it.
- Exit 2 (the check is broken) must never be reported as exit 1 (prod is broken), in
  either direction.
- A job on prod that no migration declares is reported, never failed on.

## Acceptance Criteria

- [x] The expected-job list is parsed from `supabase/migrations/*.sql`, with
      `cron.unschedule` subtracting in filename order — 29 passing assertions in
      `src/tests/p1283-cron-health.test.ts`, including one against the real migrations
      directory and one against the near-identical hyphen/underscore job-name pair that
      migrations 20260907140000 and 20260907160000 actually contain.
- [x] Last successful run and 24h failure count are read per job from
      `cron.job_run_details` — verified against prod, which returned rows grouped by
      jobid and status.
- [x] A job with no successful run inside its own tolerance fails the check — simulated
      through the real CLI, exit 1, output quoted in Done-When.
- [x] Alerting matches the existing detectors: a GitHub issue opened through the P1155
      author-bound lookup, plus `.github/alert-registry.json` rows —
      `scripts/test-producer-author-bind.sh` exits 0 reporting
      `cron-health 2/2 lookups author-bound` and `10 title(s) match byte for byte`.
- [x] The check distinguishes "prod unhealthy" from "check misconfigured" by exit code,
      and the workflow branches on the recorded status — exit 2 proven two ways.
- [x] The cause of the April migration's silent no-op is named with evidence, not guessed
      — prod's migration ledger holds `20260414100002`, and OID ordering puts pg_cron's
      creation between that migration's own table (125931) and the August migration's
      (129320). See Findings.
- [x] A migration creates `cleanup_stale_live_invites` idempotently and cannot no-op
      silently on a cron-capable server — applied twice to the Supabase Postgres image,
      `cron.job` holds exactly 1 row after each, and the post-condition assert aborts with
      a non-zero exit when it cannot confirm the row.
- [x] The same migration is safe on a Postgres without pg_cron — a bare `postgres:17`
      raises a WARNING naming the job and exits 0, creating nothing.
- [x] A declared-but-missing job is reported, not only a job that ran and failed — the
      real prod run exits 1 on `cleanup_stale_live_invites: not scheduled on the database`.

## Done-When

- [x] `node scripts/check-cron-health.mjs` runs against prod and reports per-job status.
      Real run, exit 1, correctly finding `cleanup_stale_live_invites` missing.
- [x] A simulated stale job exits non-zero (epistemic gate 7):
      `dispatch_event_emails: no successful run for 300 min (schedule */30 * * * *,
      tolerance 60 min)`, `EXIT=1`.
- [x] An all-healthy database exits 0 (epistemic gate 7c): `PASS — 3/3 expected job(s)
      healthy`, `EXIT=0`, with an out-of-band job listed in a note and not failed on.
- [x] Misconfiguration exits 2, never 1: missing token `EXIT=2`, unreadable migrations
      directory `EXIT=2`.
- [x] Two defects in the unreviewed first draft are fixed and pinned by regression tests.
      The Management API answers a successful read with **201** and the draft tested
      `status !== 200`, so it would have exited 2 on every run. `Date.parse` returns NaN
      on the one-part `+00` offset Postgres actually emits, so every healthy job would
      then have reported an unparseable timestamp. Both fired on every possible run;
      neither had ever been executed. 29/29 tests pass.
- [x] The existing alert-escalator and producer-bind suites still pass with the new
      producer enrolled (epistemic gate 7c): `31 passed, 0 failed` and
      `all checks passed (6 filter cases + 8 producers)`, both exit 0. The escalator's
      exact-count assertion was loosened to a floor, and re-proven to still reject a
      shrunk registry, an empty one, and a row missing `match_title`.
- [x] Codex adversarial review run. Verdict FAIL on the first pass with three findings;
      two were real defects and are fixed with regression tests, the third is the
      repo-wide issue-lookup bound recorded under Risks. Verdict and disposition
      recorded in `.finish-reviewed`.
- [x] Review defect A fixed: the migration parser applied a file's unschedules before
      its schedules, so a job scheduled and then removed **later in the same file**
      stayed in the expectation forever — the check would raise an unclearable incident
      against a correct database. Now replayed in true text order, which is right in
      both directions; the repo's real unschedule-then-reschedule shape is pinned as the
      control so the fix cannot regress the other way.
- [x] Review defect B fixed: a Management API response whose row SHAPE was wrong flowed
      into the comparison, every expected job looked absent, and a healthy database was
      reported as a total cron outage under exit 1. That inverted this spec's own
      invariant. Row shape is now validated and the failure exits 2 — proven through the
      real CLI with `[{"unexpected":"schema-change"}]`, `EXIT=2`.
- [x] Every gate-7 and gate-7c proof re-run after the parser rewrite: stale job `EXIT=1`,
      all-healthy `EXIT=0`, real prod run `EXIT=1` on the genuine finding. 29/29 tests.
- [x] `npm run lint` and `./scripts/typecheck-gate.sh` pass.

### Second pass — the migration and the review it triggered (2026-09-09)

- [x] Root cause of the April no-op established by read-only prod probes and recorded in
      Findings as a table of facts with the command evidence behind each.
- [x] Migration applied twice to the Supabase Postgres image
      (`public.ecr.aws/supabase/postgres:17.6.1.134`, the image the local stack runs, in an
      isolated container so no co-tenant session was touched): `EXIT=0` both times,
      `cron.job` holds `1|cleanup_stale_live_invites|0 * * * *|t`, and
      `count(*) = 1` after the second apply. The extension went from uninstalled to
      `pg_cron|1.6.4` on the first apply.
- [x] Migration applied to a bare `postgres:17` (empty `shared_preload_libraries`):
      `WARNING: P1283: pg_cron is not in shared_preload_libraries …`, `EXIT=0`, and
      `count(*) from pg_extension where extname='pg_cron'` is `0`. Nothing created, nothing
      silent.
- [x] Epistemic gate 7 on the migration's own assert: the RAISE EXCEPTION statement under
      test was run byte-identical with only the asserted job name changed to a sentinel —
      `ERROR: P1283: pg_cron accepted the scheduling call but cron.job holds no active row
      for cleanup_stale_live_invites`, `EXIT=3`, transaction aborted.
- [x] Epistemic gate 7 on the check, re-derived rather than inherited: declared-but-missing
      job `EXIT=1`; stale job `no successful run for 400 min (schedule 0 * * * *, tolerance
      120 min)` `EXIT=1`. Gate 7c: all three jobs healthy `PASS — 3/3` `EXIT=0`. Real prod
      run `EXIT=1` on the genuine finding. Misconfiguration still exits 2 two ways (no
      token, unreadable migrations dir), each proven in a project directory with no
      `.env.local` — a first attempt reported `EXIT=1` because the harness leaked the real
      token from the worktree's own `.env.local`, which was a fault in the probe, not the
      check.
- [x] `./scripts/check-migration-client-safety.sh` on the new migration: `EXIT=0`.
- [x] Applied to the **test** project (`gfjctyxqlwexxwsmkakq`) through `./scripts/migrate.sh`
      — the strongest available verification, a real hosted Supabase project rather than a
      container. Blast radius was computed before running: the local tree held **1**
      migration absent from test's 323-row ledger, and it was this one. Result:
      `✓ 20260909120000_… applied`, `cron.job` now holds
      `2|cleanup_stale_live_invites|0 * * * *|t|postgres`, and the ledger carries
      `20260909120000 / p1283_schedule_stale_live_invites_cleanup`. Test already had
      pg_cron installed, so the `CREATE EXTENSION` branch was not exercised there — the
      container runs cover it. **Nothing was applied to prod.**
- [x] `supabase/deploy-manifest.json` stamped on the branch. `stamp-deploy-manifest.sh`
      refuses to run inside a worktree and the main checkout was off limits, so the entry
      was appended by hand to match exactly what the stamp writes. A first attempt
      rebuilt the whole list from the worktree's migrations directory and would have
      **dropped** `20260908130000`, a co-tenant's migration this branch predates; caught
      by diffing before committing and redone as a pure append. Final diff is one added
      version plus the timestamp.

**P270 integration test — deliberately not written, and why.** The gate warns that every
migration needs `e2e/integration/pN-db-schema.spec.ts`. That template exists to prove a new
column or table is reachable, and it reaches it through PostgREST. This migration adds
neither; it adds a row to `cron.job`, and PostgREST does not expose the `cron` schema —
already measured on prod as `PGRST106 Invalid schema: cron`, with the service-role key. A
test written from the template could assert nothing. The equivalent verification is
`check-cron-health.mjs`, which reads `cron.job` over the Management API and is what
`cron-health.yml` runs every six hours. Recorded here rather than satisfied with a test
that cannot fail.
- [x] Codex adversarial review of the migration. Verdict **REJECT**, three findings — none
      against the migration, all three against the health checker, all three reproduced by
      command before being accepted, all three fixed:
- [x] Review defect C fixed: the parser stripped only whole-line `--` comments, so a
      **block** comment containing `cron.schedule('phantom', …)` invented an expected job
      that prod can never have — a permanent false incident no database change could clear.
      Reproduced: `{"phantom":"0 3 * * *"}`. A trailing `--` comment after code on the same
      line was unreachable by the regex for the same reason. Replaced with a scanner that
      tracks single-quoted and dollar-quoted strings and nested block comments, so comments
      are removed and literals — which is where `cron.schedule`'s own arguments live — are
      not.
- [x] Review defect D fixed: `fetchCronRows` checked only for a `jobname` and the presence
      of `active`, so a row could be scored **green on telemetry that never arrived**. A
      row with no `failed_24h` made `Number(undefined)` NaN and `NaN > 0` false, reporting
      zero failures; `active: "false"` is truthy, reporting a disabled job as running. Both
      reproduced (`{"ok":true,"failures":[]}`) before the fix. Every field the evaluator
      reads is now typed at the boundary and anything else exits 2.
- [x] Gate 7c for both fixes: the real prod response is accepted verbatim, a
      never-succeeded job (`last_ok: null`) is accepted, a `--` inside a string literal is
      still parsed as data, and the real migrations still resolve to the same three jobs.
      41/41 tests pass, up from 29.
- [x] The two sibling suites this branch touches still pass: `test-alert-escalator.mjs`
      `EXIT=0`, `test-producer-author-bind.sh` `EXIT=0`. `npm run lint` and
      `./scripts/typecheck-gate.sh` re-run after the parser rewrite, both `EXIT=0`.

## Pre-deploy Checklist

- [ ] Add `SUPABASE_ACCESS_TOKEN` as a repository secret so `cron-health.yml` can read
      prod. Until then the workflow exits 2 and opens the "check is not running" issue.
      An agent cannot set a repository secret.
- [ ] Apply `20260909120000_p1283_schedule_stale_live_invites_cleanup.sql` to prod
      (`./scripts/migrate.sh --env prod`). Running migrations on prod is founder-only, so
      this box stays unticked here by design. Until it is applied the check is legitimately
      red; after it is applied, the next hourly run closes the 90-day-old open invite and
      the check goes green with no further change.
