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

**Amended 2026-08-12 — scope grew, recorded rather than absorbed.** "No migration" did not
survive first contact: the check's first live run found an anonymously-writable policy on a
live prod table, and shipping a detector while knowingly leaving the thing it detected in
place was not defensible. Two migrations now ride with this spec (see Findings). Both are
DROP/REVOKE only, both were applied with explicit founder go-ahead in conversation, and
neither touches data. The read-only claim still holds for the **checker**, which is the
artifact this Appetite was written about — but a reader should not have to infer that.

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
  than the drift. **Held.** The two migrations this spec ships were not auto-remediation:
  each finding was reported first, the founder said go, and only then was a migration
  written and applied. The distinction that matters is *silently* — the checker itself has
  no write path to either database and never will. Any future agent reading this spec
  should note that "we found it and fixed it in the same breath" is exactly the failure
  this Non-Goal exists to prevent, and is not what happened here.
- **Descoped 2026-08-12 — scheduled invocation.** The original fourth Done-When item
  ("runs on a schedule, with results reaching somewhere a human actually reads") is out of
  scope, on the credential rather than on effort. The only key available today is a
  Supabase personal access token granting full management of every project in the account;
  storing it in GitHub Actions secrets means anyone able to push a workflow file can print
  it, in exchange for a daily email. The check runs on demand meanwhile — which is how
  every finding below was found. Revisit with a read-only Postgres role scoped to
  `pg_policies`, whose leak value is approximately zero. **UNVERIFIED:** whether Supabase
  PATs can be scope-limited at all, and whether a custom read-only role is reachable from
  CI — confirm both before committing to that route. Workflow shape when it lands:
  `.github/workflows/check-deploy-drift.yml` (daily cron, `continue-on-error` +
  `set -o pipefail`, find-or-append one GitHub issue, self-close on recovery).
  *Falsifier:* a drift finding live on prod for more than a week retires the on-demand
  model and makes the scheduled run worth the credential risk.
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
- [x] Documented in `docs/technical/` as the first step of any future RLS audit — P1038's
      Decision 1 held file grep to be primary and sufficient, and P1046 falsified that twice
      — `docs/technical/database.md` §"Start every RLS audit with the live drift check".

**This list is 4/4, but it started as 5.** A fifth item (scheduled invocation) was descoped
by founder decision on 2026-08-12 — reasoning and falsifier under `## Risks / Non-Goals`.
Do not read 4/4 as "everything originally asked for."

## Findings from the first live run

Six unallowlisted security-relevant findings. Detail in `.private/docs/security-log.md`
(2026-08-12) — not enumerated here, as this repo is public and five remain unpatched.

**One is fixed** — and it turned out to have TWO live paths, not one.

*Path 1, REST — fixed and verified live* (`20260812120000_p1048_lockdown_dead_chat_table.sql`):
a decommissioned table carried SELECT `qual=true` and UPDATE `USING(true) WITH CHECK(true)`
granted to `{public}`, so any holder of the anon key that ships in the public JS bundle
could read all of its rows and rewrite their content. Demonstrated read-side on prod
(`content-range: 0-0/15` with no session); write side inferred from the policy, not
attempted against live rows. Revoked rather than scoped, because no code path reaches the
table. After: anon reads `*/0`, all 15 rows intact, RLS on, zero policies.

*Path 2, realtime — found by code review, not by me*
(`20260812130000_p1048_close_chat_realtime_channel.sql`): the same table is a member of the
`supabase_realtime` publication — verified live on both prod and test — so row changes are
replicated to the Realtime service and delivered over `postgres_changes` WebSocket channels.
The path-1 fix never considered it, and the REST-based regression suite **structurally
cannot see it**: it speaks only `@supabase/supabase-js` `.from()` calls and never opens a
WebSocket. Vendor documentation says RLS gates `postgres_changes` too, which would make this
already-closed — but that is untested here, and depending on an untested platform guarantee
to protect a table nothing uses is the wrong trade when the dependency can be removed
outright. This is epistemic gate 7b landing on the fix itself: the green suite bounded what
was modelled, and this channel was never modelled.

Regression cover for path 1: `e2e/integration/p1048-db-schema.spec.ts`. Observed failing —
the vulnerable SELECT policy was re-created on **test** only, which flipped 2 of 5
assertions to FAIL, then dropped again (test verified back to zero policies).
**No regression cover exists for path 2.** Stated plainly rather than implied: the fix is a
publication drop plus a `REVOKE`, both verifiable by inspection, and no test in this repo
opens a realtime subscription.

The remaining five findings are untouched, per this spec's Non-Goal. Detail — including
which surfaces and which tables — is in the private log, not here. Each needs its own spec.

**Method note.** The founder's initial read was that the fixed table was unreachable
because no UI links to it. That is true of the UI and irrelevant to the exposure: the
table is served over the REST API to anyone holding the public anon key, and the table
name is in this open-source repo. Obscurity of the route is not a control on the data.

## Technical Architecture

### Architecture Decisions

**The migration-files leg is a membership test, not a replay.**

§Solution says "the policy set derivable from migration files" without choosing a method.
The corpus at the time of this decision was 210 migrations, **236** `CREATE POLICY`, **140**
`DROP POLICY`. (An earlier draft of this section said 226/134 — those came from a grep
anchored to line-start, which silently missed every indented statement. Corrected after a
review re-derived them; the design conclusion does not depend on the exact figures, but a
wrong number in a spec is a wrong number.) Two options:

- **Replay** into a scratch database and read `pg_policies` — resolves true final state,
  and adds a Docker daemon, an image pull and a 210-file replay to every run.
- **Membership** — was this live (table, policy) pair ever created by a file in the repo?

Chose membership, on correctness: it answers exactly the question P1046 origin 2 poses
("was this ever created by a file here?") and a pair absent from every `CREATE POLICY` was
necessarily applied out-of-band. A parser that mis-resolves a re-create emits phantom drift,
and phantom drift is precisely what gets a check ignored (Risk 1). What it gives up: it
cannot tell you that a policy which *is* in the files still matches what the files would
produce today — that is the prod-vs-test leg's job. The limitation is printed in the check's
own output.

**Keyed by (table, name), and comments stripped first.** Code review found the first
implementation keyed membership on the policy *name* alone and ran the regex over raw file
text. Both are laundering vectors against the one leg that detects origin 2: a name created
on table B would vouch for an out-of-band policy on table A, and a `CREATE POLICY "Foo"`
sitting inside a `--` comment would enter the known set from prose. Neither is reachable in
the corpus today — verified: zero cross-table name collisions, zero commented-out
`CREATE POLICY` statements — so both fixes close holes rather than repair live bugs. The
quoted-identifier branch was also widened to survive `""` escapes, which previously
truncated such a name and would have raised a *false* out-of-band alarm.

### Known gaps, carried deliberately

Surfaced by code review, recorded rather than fixed, each needing a decision this spec is
not the place to force:

1. **`differs` does not gate the exit code.** A policy present under the same name in both
   environments but *widened on prod* is reported and not failed — the same shape as P1046,
   produced by mutating a policy in place instead of adding one beside it. Making it gate
   would immediately red-flag eight `Test data: service_role bypass for <table>` policies
   that differ benignly between environments (`auth.role()` vs `current_setting('role')`),
   so the change needs a triage pass, not a one-line edit.
2. **Allowlist entries carry no fingerprint of the policy body.** Once `(direction, table,
   name)` is allowlisted, that identity stays suppressed even if its definition later
   changes to something dangerous. Only one allowlist entry exists today (worktree dev
   tooling), so the exposure is small — but it grows with every entry added.

Both are printed in the check's own `NOT_COVERED` output, so no reader of a green run is
misled about them.

Verified rather than assumed: the six absence claims were independently re-grepped
(0 files each), and a known-present control — `Service role can insert profiles`, which
*is* in migrations — returned 2, confirming the probe is not simply blind.
