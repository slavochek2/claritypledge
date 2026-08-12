---
status: in-progress
type: task
rank: 1000964.0
delivery_stage: dev
severity: high
created_date: '2026-08-11'
tags: [security, rls, tooling, drift]
driver: anomaly
feature_type: backend
---

# P1048: Detect RLS drift between live prod, live test, and migration files

## Problem

P1046 found four PERMISSIVE policies live on prod and absent from test. Each silently
defeated the tightened policy beside it, because Postgres ORs permissive policies together.
One caused a proven unauthenticated read of private data.

The two origins matter more than the four policies:

1. Three are dropped by a migration that `deploy-manifest.json` records as **applied to
   prod**. Prod never reflected the drops. The manifest is not evidence of live state.
2. The fourth exists in **no migration at all** — applied out-of-band.

P1035 already established that migration *files* can lie about live state. P1046 extends
that to the manifest, and adds a second failure mode the file-based view cannot see at all:
objects that exist live and nowhere in the repo. Nothing currently detects either.

Three findings in three days, all in RLS, all found by accident. The one check that would
have caught all four policies at once took three queries.

## Appetite

Small, self-contained, read-only. One script plus a scheduled invocation. No schema change,
no migration, no product surface. The design question is narrow: what counts as an expected
difference between environments, so the check is not noisy enough to be ignored.

## Solution

1. Script that pulls `pg_policies` (plus table and column grants) for `public` from both
   projects via the Management API `/database/query`, using `SUPABASE_ACCESS_TOKEN` — the
   same path `scripts/migrate.sh` already falls back to. Read-only.
2. Three-way compare: live prod vs live test vs the policy set derivable from migration
   files. Report each direction separately — prod-only, test-only, live-but-not-in-files.
   Prod-only and live-but-not-in-files are the security-relevant ones.
3. An allowlist for legitimate divergence, kept small and justified per entry. Test-only
   dev-support policies (e.g. worktree tooling) are expected; prod-only rarely is.
4. Exit non-zero on any unallowlisted prod-only or live-but-absent-from-files policy.
5. **Exercise the failure path before trusting it (gate 7).** Run it against the pre-P1046
   state — or synthesise an equivalent — and confirm it exits non-zero and names the four
   policies. A drift checker never observed catching drift is unproven.

## Risks / Non-Goals

### Risks
- **Noise leading to the check being ignored.** MITIGATE — start by allowlisting exactly
  today's known-benign differences and nothing more; every future entry needs a reason.
- **Believing green means prod is clean.** MITIGATE — the check only covers what it queries.
  State in its output what it does not cover (grants beyond the tables queried, RPCs,
  `SECURITY DEFINER` bodies).

### Non-Goals
- Do NOT auto-remediate. Report only — an agent silently dropping prod policies is worse
  than the drift.
- Do NOT extend to non-RLS schema drift in this spec.
- Do NOT replace the pre-commit RLS gates; this is a live-state check, they are file checks,
  and P1046 is the proof that those are different things.

## Done-When

- [x] Script reports the three-way diff for both environments, read-only
      — `scripts/rls-drift-check.py`. First live run: prod 134 policies, test 136,
      210 migrations scanned, 6 unallowlisted security-relevant findings, exit 1.
- [x] Observed exiting non-zero against a known-drifted state, naming the offending policies
      — `scripts/test-rls-drift-check.py`, 25/25 assertions. Replays the pre-P1046 state
      offline and asserts all four policies are named, that all four are classified
      `prod-only`, and that only the out-of-band one also surfaces as `not-in-files`
      (the other three were created by a migration, so must NOT read as out-of-band).
      Mutation-checked: emptying `FAILING_DIRECTIONS` flips 3 assertions to FAIL, so the
      suite binds the exit-code logic rather than merely running it.
- [x] Allowlist contains only today's justified differences
      — `scripts/rls-drift-allowlist.txt`. Exactly one entry (worktree tooling, test-only),
      in two directions. Nothing else suppressed: the check exits 1 until the live findings
      are resolved, which is the intended behaviour, not a defect.
- [~] Runs on a schedule, with results reaching somewhere a human actually reads
      — **DEFERRED by founder decision, 2026-08-12.** Not descoped for effort: the only
      credential available today is a Supabase personal access token, which grants full
      management of every project in the account. Putting that in GitHub Actions secrets
      means anyone able to push a workflow file can print it, in exchange for a daily
      email. The check runs on demand in the meantime, which is how the six findings
      below were found. Revisit with a read-only Postgres role scoped to `pg_policies`,
      whose leak value is approximately zero — **unverified** whether Supabase PATs can
      be scope-limited; confirm before promising that route. Workflow shape when it
      lands: copy `.github/workflows/check-deploy-drift.yml` (daily cron,
      `continue-on-error` + `set -o pipefail`, find-or-append one GitHub issue,
      self-close on recovery).
- [x] Documented in `docs/technical/` as the first step of any future RLS audit — P1038's
      Decision 1 held file grep to be primary and sufficient, and P1046 falsified that twice
      — `docs/technical/database.md` §"Start every RLS audit with the live drift check".

## Findings from the first live run

Six unallowlisted security-relevant findings. Detail in `.private/docs/security-log.md`
(2026-08-12) — not enumerated here, as this repo is public and five remain unpatched.

**One is fixed and live** (`20260812120000_p1048_lockdown_dead_chat_table.sql`): a
decommissioned table carried SELECT `qual=true` and UPDATE `USING(true) WITH CHECK(true)`
granted to `{public}`, so any holder of the anon key that ships in the public JS bundle
could read all of its rows and rewrite their content. Demonstrated read-side on prod
(`content-range: 0-0/15` with no session); write side inferred from the policy, not
attempted against live rows. Revoked rather than scoped, because no code path reaches the
table. After: anon reads `*/0`, all 15 rows intact, RLS on, zero policies.

Regression cover: `e2e/integration/p1048-db-schema.spec.ts`. Observed failing — the
vulnerable SELECT policy was re-created on **test** only, which flipped 2 of 5 assertions
to FAIL, then dropped again (test verified back to zero policies).

The remaining five are untouched, per this spec's Non-Goal. They include an
unauthenticated INSERT surface and three tables with no `CREATE TABLE` in any migration.
Each needs its own spec.

**Method note.** The founder's initial read was that the fixed table was unreachable
because no UI links to it. That is true of the UI and irrelevant to the exposure: the
table is served over the REST API to anyone holding the public anon key, and the table
name is in this open-source repo. Obscurity of the route is not a control on the data.

## Design decision — the migration-files leg is a membership test, not a replay

§Solution says "the policy set derivable from migration files" without choosing a method.
The corpus is 210 migrations, 226 `CREATE POLICY`, 134 `DROP POLICY`. Two options:

- **Replay** into a scratch database and read `pg_policies` — resolves true final state,
  and adds a Docker daemon, an image pull and a 210-file replay to every run.
- **Membership** — does this live policy's name appear in any `CREATE POLICY` in the repo?

Chose membership, on correctness: it answers exactly the question P1046 origin 2 poses
("was this ever created by a file here?") and it cannot produce a false positive, because
a name absent from every `CREATE POLICY` was necessarily applied out-of-band. A parser
that mis-resolves a re-create emits phantom drift, and phantom drift is precisely what
gets a check ignored (Risk 1). What it gives up: it cannot tell you that a policy which
*is* in the files still matches what the files would produce today — that is the
prod-vs-test leg's job. The limitation is printed in the check's own output.

Verified rather than assumed: the six absence claims were independently re-grepped
(0 files each), and a known-present control — `Service role can insert profiles`, which
*is* in migrations — returned 2, confirming the probe is not simply blind.
