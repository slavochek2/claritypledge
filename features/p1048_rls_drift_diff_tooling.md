---
status: today
type: task
rank: 1000964.0
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

- [ ] Script reports the three-way diff for both environments, read-only
- [ ] Observed exiting non-zero against a known-drifted state, naming the offending policies
- [ ] Allowlist contains only today's justified differences
- [ ] Runs on a schedule, with results reaching somewhere a human actually reads
- [ ] Documented in `docs/technical/` as the first step of any future RLS audit — P1038's
      Decision 1 held file grep to be primary and sufficient, and P1046 falsified that twice
