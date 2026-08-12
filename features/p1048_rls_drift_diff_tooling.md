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
- [ ] Runs on a schedule, with results reaching somewhere a human actually reads
      — **BLOCKED on a founder action.** Needs `SUPABASE_ACCESS_TOKEN` for both project
      refs as GitHub repo secrets; workflows currently reference only `SUPABASE_DB_URL`.
      The workflow itself is a copy of `.github/workflows/check-deploy-drift.yml` (daily
      cron, `continue-on-error` + `set -o pipefail`, find-or-append one GitHub issue,
      self-close on recovery). Deliberately not committed yet — a scheduled job that exits
      2 for missing credentials every morning would train the reader to ignore the channel.
- [x] Documented in `docs/technical/` as the first step of any future RLS audit — P1038's
      Decision 1 held file grep to be primary and sufficient, and P1046 falsified that twice
      — `docs/technical/database.md` §"Start every RLS audit with the live drift check".

## Findings from the first live run

Six unallowlisted security-relevant findings, detail in `.private/docs/security-log.md`
(2026-08-12) — deliberately not enumerated here, as this repo is public and the policies
are unpatched. Summary: one is an anonymous-writable UPDATE policy on a live prod table
with `USING (true) WITH CHECK (true)`, the same shape as P1046 on the write side. Three
whole tables turned out to have no `CREATE TABLE` in any migration.

Per this spec's Non-Goal, nothing was auto-remediated. Each needs its own spec.

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
