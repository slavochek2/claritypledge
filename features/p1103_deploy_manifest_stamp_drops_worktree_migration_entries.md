---
status: backlog
type: bug
rank: 219
severity: medium
workstream: infrastructure
date_reported: 2026-08-18
created_date: 2026-08-18
tags: [migrations, deploy-manifest, worktrees, tooling]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

- [ ] A stamp run from the main checkout preserves an environment's manifest entry whose `.sql` file exists only in a worktree
- [ ] A stamp run still adds the version(s) it just applied
- [ ] Running `migrate.sh` twice in a row produces no manifest diff on the second run (idempotent)
- [ ] The failure path is exercised before the fix is trusted: reproduce the deletion on a scratch copy, apply the fix, re-run the same reproduction, and paste both manifest diffs (epistemic gate 7)
- [ ] `./scripts/check-deploy-manifest.sh --env test` reports no new drift after the change

## Key Files

- `scripts/stamp-deploy-manifest.sh`
- `scripts/migrate.sh`
- `supabase/deploy-manifest.json`

## Branch

`fix/p1103-deploy-manifest-stamp-union`
