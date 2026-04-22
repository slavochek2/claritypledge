---
status: week
type: bug
rank: 1000745.0
severity: high
workstream: infrastructure
date_reported: '2026-04-22'
created_date: '2026-04-22'
tags: [p783, canary, pre-commit, worktrees, shell-safety]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P785: Canary test leaks git env vars into subshells, polluting outer worktree index when invoked by pre-commit hook

## Summary

`scripts/test-worktree-setup.sh` (P783 L4 canary) does not clear `GIT_DIR` / `GIT_INDEX_FILE` / `GIT_WORK_TREE` before its internal `git init` / `git add` / `git commit` subshells. When invoked by git's pre-commit hook (which sets these env vars), the canary's nested git commands operate on the **outer worktree's real index** instead of the hermetic scratch repo, polluting the caller's stage and failing with exit 1.

## Root Cause

The canary builds a fake "main repo" under `$SCRATCH/main` and expects nested `git` invocations there to operate on `$SCRATCH/main/.git`. But `git init -q` with an inherited `GIT_DIR` does NOT override it to the current directory — git respects the env var and operates there. The subsequent `git add .env.local .env.test.local` resolves the paths relative to the subshell's cwd (`$SCRATCH/main/.env.local` exists as the canary's sentinel file, so the add succeeds), but writes the entry to **the outer worktree's index** because `GIT_DIR` still points there.

Result in `scripts/test-worktree-setup.sh:54-60`:
```bash
(
  cd "$SCRATCH/main"
  git init -q                                       # operates on outer GIT_DIR
  git -c user.email=canary@test -c user.name=canary add \
      .env.local .env.test.local                    # adds to outer index
  git -c user.email=canary@test -c user.name=canary commit -qm "canary init" \
      -- .env.local .env.test.local                 # tries to commit on outer branch
) >/dev/null 2>&1
```

When invoked directly (`bash scripts/test-worktree-setup.sh`), `GIT_DIR` is unset → fresh `git init` at `$SCRATCH/main/.git` → hermetic. When invoked by pre-commit (`./scripts/pre-commit-checks.sh` → `run_quiet` → `bash scripts/test-worktree-setup.sh`), `GIT_DIR` is set by the hook environment → non-hermetic → pollution.

This is a class of bug (shell env inheritance between nested git invocations) that belongs in `.claude/rules/shell-safety.md` alongside the P783 redirect-injection rule — both are "the script's environment contract matters, not caller discipline" patterns.

## Reproduction Steps

1. On any feature branch in a worktree (e.g., `.claude/worktrees/w4`).
2. Simulate the pre-commit hook's environment:
   ```bash
   env GIT_DIR=$(git -C .claude/worktrees/w4 rev-parse --git-dir | xargs realpath) \
       bash scripts/test-worktree-setup.sh
   ```
3. Observe: exit code 1 (canary failure).
4. Then: `git -C .claude/worktrees/w4 diff --cached --name-only` → includes `.env.local` and `.env.test.local` (outer index polluted).

**Alternative reproduction (end-to-end):**
1. Cd into any worktree: `cd .claude/worktrees/wN`
2. Make a change to any of: `scripts/setup-worktree.sh`, `scripts/git-ops.sh`, `scripts/lib/env-sentinel.sh`, `scripts/check-worktree-env.sh`, `scripts/test-worktree-setup.sh`
3. `git add <that-file>` (explicit, not `-A`)
4. `git commit -m "any message"` → pre-commit hook triggers canary (per `scripts/pre-commit-checks.sh:111-122`)
5. Observe commit blocked with 3 errors:
   - `Worktree setup canary (P783)... ✗` (empty "Last 30 lines of output")
   - `Possible secrets found in: .env.local / .env.test.local`
   - `Database connection string with embedded credentials: .env.local:18:SUPABASE_DB_URL=...`

**Reproduction rate:** 100% — any commit touching worktree-setup files from a worktree.

## Expected Behavior

The canary produces identical output whether invoked standalone OR inside a pre-commit hook. Exit 0 with `PASS:`. No side effects on the outer worktree's index. Pre-commit completes cleanly when user's staged files are clean.

## Actual Behavior

Canary fails with exit 1 and empty output when invoked by hook. Outer worktree's index gains `.env.local` and `.env.test.local` entries (both gitignored, neither intentionally staged by the user). Downstream secrets scanner in `pre-commit-checks.sh` then flags both files because `git diff --cached --name-only` surfaces them as "staged". Three errors block the commit.

The failure is self-propagating: every retry re-runs the canary, re-pollutes the index.

## Affected Files

- `scripts/test-worktree-setup.sh` — the fix location. Add `unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR` near the top (before any nested git invocation — line ~20, before the `trap` on line 24 is fine).
- `scripts/pre-commit-checks.sh:115-122` — the invocation path (no change needed, but worth verifying the invocation still works after fix).
- `.claude/rules/shell-safety.md` — worth a follow-up note that nested git invocations in shell scripts must clear env vars, same severity class as the redirect-token rule. (Update in this fix or as separate doc-only task — TBD.)

## Severity

**High** — blocks every commit touching worktree-setup files from any worktree. This class of commit is expected to be common as P781 progresses (T11, T07, T10 all touch these files). Not data-loss severity (index pollution is recoverable via `git reset HEAD -- .env.local .env.test.local`), but it is a progress-blocker with a non-obvious failure mode (the failure message doesn't point at the env-leak root cause).

## Fix Approach

**Structural (2 lines in `scripts/test-worktree-setup.sh`):**

```bash
# After `set -euo pipefail` and before any nested git invocation
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
```

Alternative: wrap each nested git call with `env -u GIT_DIR -u GIT_INDEX_FILE ...`. Rejected — per-call repetition is error-prone; single top-of-file `unset` is the contract.

**Verification:**

1. The reproducer (with `env GIT_DIR=...`) must now exit 0.
2. Pre-commit hook invocation must complete cleanly. Test by staging an unrelated edit to `scripts/test-worktree-setup.sh` itself in w4 and running `git commit` — should complete without the 3 errors.
3. Outer worktree index MUST NOT contain `.env.local` / `.env.test.local` after the canary runs.
4. The existing L4 invariants (env file hashes preserved, no redirect-parseable output, adversarial eval cannot wipe sandbox) must still hold after the env-var fix.

**Follow-up (out of scope for this fix):** add a rule entry to `.claude/rules/shell-safety.md` capturing the "nested git invocations must clear env" pattern. Can be bundled in this fix or filed separately — TBD at implementation time.

## Acceptance Criteria

- [ ] Running `env GIT_DIR=<any-worktree-git-dir> bash scripts/test-worktree-setup.sh` exits 0 and prints `PASS:`
- [ ] Running `bash scripts/test-worktree-setup.sh` directly (no env) still exits 0 and prints `PASS:`
- [ ] After the canary runs (either invocation path), `git diff --cached --name-only` in the outer worktree does NOT contain `.env.local` or `.env.test.local`
- [ ] A full pre-commit hook run (via `git commit` on a worktree-setup file change) completes without the "Worktree setup canary ✗" or "Possible secrets found" errors — assuming user's staged files are clean
- [ ] The three L4 invariants still pass: (a) main env files byte-identical after run, (b) output log contains no `>`/`<`/`|` characters, (c) adversarial eval of output cannot wipe sandbox `.env.local`
- [ ] Regression test: canary grep/sanity check against a fresh `env GIT_DIR=... bash ...` invocation in `e2e/p785-canary-env-isolation.spec.ts` OR inline as Invariant 4 inside `scripts/test-worktree-setup.sh` itself (reproducer becomes part of the canary's own self-test)
