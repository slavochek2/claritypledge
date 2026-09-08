---
status: qa
type: bug
disclosure: public
rank: 219
severity: medium
workstream: infrastructure
date_reported: 2026-08-18
created_date: 2026-08-18
tags: [migrations, deploy-manifest, worktrees, tooling]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P1103: stamp-deploy-manifest rebuilds the migration list from the local checkout, silently deleting entries for migrations that live in another worktree

## Summary

`stamp-deploy-manifest.sh --migrations-only` **replaces** the environment's migration array with the versions it finds in its own checkout's `supabase/migrations/`, so any migration applied to that environment from a different worktree is deleted from `deploy-manifest.json` — silently, on every `migrate.sh` run from the main checkout.

## Root Cause

Two lines, verified by reading the script rather than inferring:

- `scripts/stamp-deploy-manifest.sh:82` — `build_migrations_json()` enumerates `"$MIGRATIONS_DIR"/*.sql`, i.e. the migration files present in **this** checkout. A migration authored in a worktree is not in that glob.
- `scripts/stamp-deploy-manifest.sh:117` — the merge is `env['migrations'] = json.loads(migrations_json)`, a whole-array **assignment**. Nothing unions with the entries already in the file.

So the manifest ends up recording "the migrations this checkout knows about", while the field it claims to record is "the migrations applied to this environment". Those two sets diverge the moment a co-tenant session authors a migration in a worktree and applies it — which is the normal worktree workflow, not an edge case.

`migrate.sh:350` calls the stamp after every successful run and `migrate.sh:355` auto-stages the result, so the deletion arrives pre-staged for commit.

## Observed occurrence

2026-08-18, while fixing P1065 grant drift from the main checkout:

- Worktree `w4` held `20260818090000_p1093_close_unchecked_payload_writer.sql`, already applied to test and already recorded in the manifest by that session (staged, uncommitted).
- A `migrate.sh` run from the main checkout applied an unrelated migration and rewrote the array **without** `20260818090000` — because that file exists only in `w4`.
- Restored by hand before committing. Nothing warned; the run reported success.

This is at least the third instance. `docs/decisions.md` 2026-08-11 [process] records the manifest "about to delete an entry another session had added", noting **"Both were caught, neither by a gate."** Commits `262165f6` / `8ed5ba86` ("fix(p1057): restore two manifest entries main gained after this branch was cut") are the same deletion from the branch-staleness direction.

## Reproduction Steps

1. From the main checkout, confirm `supabase/deploy-manifest.json` records a test migration version whose `.sql` file lives only in a worktree (or simply add a version string by hand and note it).
2. Author any new migration in the main checkout's `supabase/migrations/`.
3. Run `./scripts/migrate.sh` (test env).
4. Run `git diff HEAD supabase/deploy-manifest.json`.
5. Observe: the new version was added **and** the worktree-only version was removed from the `migrations` array. Exit code is 0 and the run prints no warning.

**Reproduction rate:** 100% — it is unconditional array replacement, not a race.

## Expected Behavior

A stamp run adds what it applied and preserves every entry already recorded for that environment. An applied migration is a historical fact about the environment; nothing about running a *different* migration from a *different* checkout makes that fact false. If the tool believes an entry is stale, it should say so on stdout, not remove it silently.

## Actual Behavior

The array is rebuilt from the local file glob. Entries with no corresponding file in this checkout vanish. `migrate.sh` then stages the file, so the deletion is one `git commit` away from becoming the record.

## Affected Files

- `scripts/stamp-deploy-manifest.sh:80-96` — `build_migrations_json()`, the local-glob enumeration
- `scripts/stamp-deploy-manifest.sh:112-118` — the assignment that replaces rather than merges
- `scripts/migrate.sh:348-356` — calls the stamp and auto-stages the result

## Fix Approach

Make the migrations array a **union** of what is already recorded for that environment and what this run enumerated, rather than an assignment. The union direction is the safe one here: an applied migration never becomes un-applied, so preserving an unknown entry can only ever be correct, while dropping one destroys the only record.

Consistent with `docs/decisions.md` 2026-08-11 [process] ("rebuild the manifest from `main`'s current copy plus only what was verified live per environment") — this bug is that entry's guidance not being implemented in the tool that does the writing.

Deliberately **not** proposed, because `docs/decisions.md` has already settled them:

- Stamping from the live `schema_migrations` list instead. The manifest is a "record of intent, never evidence of state" (2026-08-11 [technical], line 724) — sourcing it from the live catalog would collapse the two artifacts whose disagreement is exactly what the `/ship` drift gate reads.
- Re-running the stamp to resolve cherry-pick conflicts. Rejected 2026-08-11 [process] (line 2181) in favour of hand-merging the arrays.

Removal of genuinely stale entries becomes manual under a union. That is the intended trade: `check-deploy-manifest.sh` already reports drift in both directions, so a stale entry is visible, whereas a deleted one is not.

## Related — separately fileable, not in this spec's scope

The same session hit a second defect with the same root environment. A migration filed in the main checkout was given timestamp `20260818090000`, which worktree `w4` had already claimed for a different migration. `migrate.sh` matched the version against test's history, printed `already applied, skipping`, exited 0 — and the migration never ran. It was caught only by querying the live grant afterwards, not by any output. Two checkouts cannot see each other's pending version numbers, so nothing prevents the collision and nothing reports it after the fact.

## Acceptance Criteria

- [x] A stamp run from the main checkout preserves an environment's manifest entry whose `.sql` file exists only in a worktree — canary scenario 1: with `20260818090000` recorded and no file present, the stamped array is `20260101000000 20260818090000 20260901000000`
- [x] A stamp run still adds the version(s) it just applied — canary scenario 2: `20260901000000` is present in that same array
- [x] Running `migrate.sh` twice in a row produces no manifest diff on the second run (idempotent) — canary scenario 4 runs the stamp twice and compares the arrays; identical. The union is by multiplicity, so it cannot grow
- [x] The failure path is exercised before the fix is trusted — `P1103_STAMP_SRC=<main copy> ./scripts/test-p1103-manifest-migration-union.sh` reports `11 passed, 3 failed`, exit 1 (worktree entry deleted, spurious entry deleted, and deleted silently). Against the fixed script: `14 passed, 0 failed`, exit 0
- [x] `./scripts/check-deploy-manifest.sh --env test` reports no new drift — exit 1 with 8 drift lines, all `FUNCTION_STALE`/`FUNCTION_MISSING` and pre-existing; `grep -c '^MIGRATION_'` is 0, and `supabase/deploy-manifest.json` is byte-identical to `HEAD` (this change touches no manifest data)

## Fix as shipped

`scripts/stamp-deploy-manifest.sh`, one hunk inside the python merge block: the migrations array is
now a **union by multiplicity** of what was already recorded for the environment and what this run
enumerated. Each version is kept `max(prior_count, enumerated_count)` times and the result sorted,
which preserves worktree-authored entries, keeps the grandfathered shared-version-prefix pairs that
`decisions.md` 2026-08-25 forbids deduping, and makes a re-run a no-op (plain concatenation would
pass the preservation test and grow the array without bound — canary scenario 4 exists to catch it).

The cost the union creates is that a genuinely stale entry now survives forever. It is therefore
**named on stderr**, not kept silently: keeping it quietly would mask exactly the drift
`check-deploy-manifest.sh` exists to report, which is the risk of this fix direction. Canary
scenario 5 asserts both halves — the spurious entry survives AND appears in the run output.

Companion canary `scripts/test-p1103-manifest-migration-union.sh`: 14 assertions, hermetic
(throwaway project dirs under `mktemp` holding a copy of the real script; no network, no database,
no git operations against this repo), parameterised by `P1103_STAMP_SRC` so the pre-fix revision
runs through identical fixtures. The existing P1173 stamp canary still passes 16/16.

**Found by adversarial review, in this change:** a backtick inside the double-quoted
`python3 -c "..."` block made bash run command substitution on it, printing
`env[migrations]: command not found` while the merge still produced a plausible manifest. Every
canary assertion passed through it, because a canary that only reads the resulting JSON cannot see
that class of failure. The `stamp()` helper now asserts exit 0 **and** greps the run output for
`command not found|Traceback|Error:|SyntaxError|IndentationError`; reintroducing the backtick makes
6 assertions fail.

## Related — separately fileable, not in this spec's scope

Alongside the pre-existing collision defect already recorded above, adversarial review surfaced
three more, all in `scripts/stamp-deploy-manifest.sh` and all untouched by this change (the diff is
a single hunk inside the merge block, `git diff main -- scripts/stamp-deploy-manifest.sh` shows
`@@ -281,7 +281,46 @@` and nothing else):

- **TOCTOU between the P1173 dirty-manifest guard and the read it protects.** The guard validates
  the on-disk manifest against `HEAD`, then the file is read some lines later; the lock serializes
  stamp writers only, so a foreign edit landing in that window is merged and staged. Reproduced by
  the reviewer in a scratch repo by pausing between the two points. This is the bystander-edit
  absorption P1173 was built to prevent, reached through the gap rather than the check.
- **The same guard cannot distinguish a legitimate prior stamp from a forged one.** It classifies
  the diff's *shape* (only the four stamp fields changed), which is the deliberate P1173 decision
  recorded in `decisions.md` 2026-08-27 — a hand-added bogus migration version passes it.
- **The `--env` parser is permissive.** `--env production` creates a `production` key beside `prod`
  and `test`, and `--env --migrations-only` consumes the mode flag as the environment name,
  producing a full stamp under a `--migrations-only` key. Both exit 0.

Each needs a founder decision on whether to file.

## Key Files

- `scripts/stamp-deploy-manifest.sh`
- `scripts/migrate.sh`
- `supabase/deploy-manifest.json`

## Branch

`fix/p1103-deploy-manifest-stamp-union`
