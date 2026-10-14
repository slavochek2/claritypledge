---
status: in-progress
type: bug
rank: 67
severity: high
workstream: infrastructure
date_reported: '2026-10-14'
created_date: '2026-10-14'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [pre-commit, git-env, migrations, gates]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P1488: Grant-order gate (P1102) blocks every migration commit made from a worktree

## Summary

Since P1102 shipped (3e2435632, 82717a888, 8eb928e55), every `git commit` from a linked worktree that stages a migration fails the pre-commit hook with `ERROR: not found in the migrations being checked: <file>` / `The check did NOT run.` A commit that only renames or deletes a migration passes the gate over **0 migrations**, so it is never checked at all. Worktrees are the default for `/dev` and `/fix`. First hit: a P1245 migration commit in w4. The same command run by hand from inside that worktree passes, and so does a commit from the main checkout.

## Root Cause

This is the same class as P1273 and P1346. Git exports `GIT_DIR` to its hooks. From a **linked worktree** the value is absolute (`<repo>/.git/worktrees/wN`) and comes **without `GIT_WORK_TREE`**. From the main checkout git exports only a relative `GIT_INDEX_FILE=.git/index` and no `GIT_DIR`. When `GIT_DIR` is set and `GIT_WORK_TREE` is not, git treats the **current directory as the top of the work tree**.

`check-migration-grant-order.py --index` reads the index with `git -C supabase/migrations ls-files -s -- .`. Under the worktree hook env, git takes `supabase/migrations` to be the repo root, so every index entry in the repo comes back root-relative (`supabase/migrations/…`, `.agents/…`). `load_index` keeps only bare `*.sql` names with no `/`, which leaves the corpus **empty**. After that:
- with a staged migration as the target, `check_files` raises "not found" and exits 2;
- with no ACMR target (a rename or deletion only), `--invariant` holds vacuously and prints "holds across 0 migrations", exit 0.

The hook's P1102 call was one of the few in `pre-commit-checks.sh` that did not go through `run_quiet`. Since P1346, `run_quiet` drops exactly this env for every step it runs.

Confirmed by running the cheapest disproof on w11's real index, read-only. Without `GIT_DIR` the check passes over 413 migrations. With `GIT_DIR=$(git rev-parse --absolute-git-dir)` it fails with the incident's exact error, and `--invariant` alone reports `holds across 0 migrations`, exit 0. A real `git commit` in a throwaway linked worktree captured the hook env: `GIT_DIR` absolute, no `GIT_WORK_TREE`, `GIT_PREFIX` empty. From the main checkout the same hook got `GIT_INDEX_FILE=.git/index` and no `GIT_DIR`.

The manual run passed because a shell has no `GIT_DIR`. Exporting `GIT_INDEX_FILE` by hand does not trigger the bug.

## Invariants

- The gate reads **what the commit records**. A temporary `GIT_INDEX_FILE` (from `git commit -a` or a pathspec commit) must be honoured, never replaced by the default index.
- An empty corpus is a fault (exit 2), never a clean result.
- `./scripts/` in the hook resolves to the **committing** checkout's copy, while the hook script itself is main's. A fix in the checker reaches a branch only once that branch carries it. A fix in the hook reaches every checkout once it is on main. Both halves are needed.

## Reproduction Steps

1. In a linked worktree, stage a new file under `supabase/migrations/`.
2. Run `git commit`. Main's `pre-commit-checks.sh` runs as the hook.
3. Observe at the P1102 step: `ERROR: not found in the migrations being checked: <file>` and `The check did NOT run.`
4. Variant: stage only `git rm` of a migration. The step passes with `holds across 0 migrations`.

**Reproduction rate:** 100% from any linked worktree, 0% from the main checkout.

## Expected Behavior

From a worktree the gate judges the staged migrations against the full corpus in the index, exactly as it does on main. A harmless migration passes, a contradiction is refused with exit 1, and a deletion that leaves an unacknowledged re-grant as the last word is refused.

## Actual Behavior

From a worktree every migration commit is blocked with exit 2. Rename-only and deletion-only migration commits pass without being checked.

## Affected Files

- `scripts/check-migration-grant-order.py`: `_git`, and the `cat-file --batch` call in `load_index`, both run `git -C <dir>` under the inherited hook env.
- `scripts/pre-commit-checks.sh`, §14.97: the P1102 call runs bare instead of through `run_quiet`.

## Severity

**High.** It blocks every migration commit on the default worktree workflow, and it silently skips the gate for deletion and rename commits.

## Fix Approach

1. **Checker** (`_git_env`): drop git's repo-scoping variables (`git rev-parse --local-env-vars`, with a fixed fallback list) so git finds the repository from `--dir`. Keep `GIT_INDEX_FILE`. If an inherited `GIT_DIR` names a different repository than `--dir`, refuse with exit 2 rather than read one repo's paths through another's index. Separately, refuse an empty corpus with exit 2.
2. **Hook**: route the P1102 call through `run_quiet`, which drops the env (P1346) and keeps a temporary index. This is what unblocks branches cut before the checker fix lands.
3. **Canary**: scrub the inherited `GIT_*` env at the top (P1131 idiom). Add P1488 cases that run a real `git commit` through a hook in a fixture linked worktree, plus main-checkout controls.

## Acceptance Criteria

- [x] From a linked worktree, a real `git commit` through the hook passes a harmless migration and refuses a contradicting GRANT with exit 1, not exit 2. Evidence: `test-check-migration-grant-order.py` P1488 cases.
- [x] From a linked worktree, a deletion-only commit that removes a re-assert is refused. Before the fix it was a vacuous exit 0.
- [x] A pathspec commit is judged on the temporary index it records. A mutation that drops `GIT_INDEX_FILE` fails this case.
- [x] The main checkout is unchanged: a contradiction is refused and a harmless migration passes. These controls passed before the fix too.
- [x] An index holding no migrations exits 2. A `GIT_DIR` that names another repository exits 2. The second case is bound by a mutation.
- [x] The hook block alone, running the **pre-fix** checker, works from a worktree: harmless passes, contradiction refused, pathspec commit refused. It also works from the main checkout. Verified in a throwaway repo with the extracted block and the real `run-quiet.sh`.
- [ ] After ship to main: a migration commit from an existing worktree branch (for example the w4 P1245 commit) passes the P1102 step without a rebase.
</content>
</invoke>
