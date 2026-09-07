---
status: week
type: bug
rank: 1000079
severity: high
workstream: infra
date_reported: '2026-09-07'
created_date: '2026-09-07'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [git, hooks, canary, worktrees, GIT_DIR]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1263: A canary's `git init --bare` flips `core.bare` on the real repo, breaking git for every session

## Summary

`scripts/test-git-ops-extensions.sh:75` runs `git init --bare -q` with **no path argument**, so an
inherited `GIT_DIR` redirects it onto the real repository — setting `core.bare = true` on the main
checkout and making git refuse almost every command until someone resets it by hand.

## Root Cause

**Found and reproduced**, not hypothesised. `git init --bare` with no path operates on `$GIT_DIR`
when that variable is set, regardless of the current directory. `cd`-ing into a scratch directory
does not protect against it — `GIT_DIR` wins.

Verified in a sandbox (throwaway repo, no project files touched):

```
victim core.bare BEFORE: false
( cd "$T/scratch/origin.git" && GIT_DIR="$T/victim/.git" git init --bare -q )
victim core.bare AFTER:  true
victim still a work tree? false
```

That is the exact observed symptom. The call site matches the pattern precisely:

```bash
# scripts/test-git-ops-extensions.sh:75
( cd "$SCRATCH/origin.git" && git init --bare -q )
```

**Why `GIT_DIR` is set at all** is already documented: `docs/decisions.md` records (P1131) that
*"From a worktree, git sets `GIT_DIR` to an absolute path for the hook's environment, which wins"* —
so any canary invoked from a git hook inherits it. This is the same fourth-surface defect class,
in a different script.

`scripts/test-hook-sha-gate.sh:20` uses `git init --bare "$ORIGIN" -q` — an **explicit path**, which
is safe and is the model for the fix.

## Invariants

- **Any `git init` / `git clone` inside a test or canary must name its target path explicitly**, and
  must not rely on the working directory to scope it. `cd` does not scope git when `GIT_DIR` is set.
- Canaries must not be able to mutate the repository that invoked them. A canary that can write to
  the real repo's config is a canary that can break every concurrent session.

## Reproduction Steps

1. From the main checkout, ensure `git config core.bare` reports `false`
2. Run a commit that stages `scripts/git-ops.sh`, so `pre-commit-checks.sh` runs the git-ops
   extensions canary (it is skipped otherwise — which is why this is intermittent)
3. Run `git config core.bare`

**Reproduction rate:** mechanism reproduced 100% in a sandbox (above). The end-to-end trigger is
intermittent because the canary only runs when specific files are staged, which matches the
observed pattern: four flips across one day with unrelated work in between.

## Expected Behavior

Running any canary leaves the invoking repository's config untouched. `core.bare` stays `false` on
the main checkout.

## Actual Behavior

`core.bare` becomes `true`. Afterwards `git rev-parse --show-toplevel` fails with
`fatal: this operation must be run in a work tree`, and every tool that derives paths from it
breaks with misleading errors — observed 2026-09-07:

- `git-ops.sh ship` failed mid-run: `audit-privacy.sh missing — blocking commit`, leaving the ship
  incomplete with 7 commits already cherry-picked
- `git push` failed with `/scripts/audit-privacy.sh missing` (note the leading slash — an empty
  toplevel interpolated into a path)
- `git-ops.sh` refused to run: `must be called from the main repo root (got toplevel: '(not in repo)')`

None of these name the real cause, so the failure reads as a broken tool or a missing file.

## Affected Files

- `scripts/test-git-ops-extensions.sh:75` — `( cd "$SCRATCH/origin.git" && git init --bare -q )`, the
  confirmed defect
- `scripts/test-hook-sha-gate.sh:20` — already correct (explicit path); reference implementation
- `scripts/test-push-snapshot-pinning.sh` — also matched a `--bare` grep; **UNVERIFIED**, check
  whether its invocation is path-explicit before assuming it is safe

## Severity

**High** — it silently breaks git for every concurrent session on the shared checkout, and the
resulting errors point at unrelated files. It cost roughly an hour on 2026-09-07 and produced a
half-completed ship that needed manual convergence.

## Fix Approach

Pass the path explicitly, matching `test-hook-sha-gate.sh`:

```bash
git init --bare -q "$SCRATCH/origin.git"
```

Belt and braces, since these scripts run from hooks: clear the inherited environment for the whole
canary — `env -u GIT_DIR -u GIT_WORK_TREE` — rather than relying on every future git call in the
file being path-explicit.

Then audit the other two `--bare` call sites the grep found, and add a canary assertion that the
invoking repo's `core.bare` is unchanged after the test runs — per epistemic gate 7, exercise it by
temporarily restoring the bad form and confirming the assertion fails.

## Acceptance Criteria

- [ ] Running `./scripts/test-git-ops-extensions.sh` leaves `git config core.bare` reporting `false`
      on the invoking repo, verified before and after
- [ ] The same holds with `GIT_DIR` deliberately exported, which is how a hook invokes it
- [ ] `scripts/test-push-snapshot-pinning.sh` confirmed path-explicit or fixed
- [ ] A canary asserts the invoking repo's `core.bare` is unchanged, and that assertion has been
      **watched to fail** against the old form (paste the non-zero exit)
- [ ] `git rev-parse --show-toplevel` still resolves after a full `pre-commit-checks.sh` run with
      `scripts/git-ops.sh` staged

## Related

- `docs/decisions.md` (P1131) — `GIT_DIR` inherited by hooks from worktrees; same defect class
- `features/p1131_banned_git_canary_fixture_leaks_git_dir_in_worktrees.md`
- `docs/decisions.md` 2026-09-07 — the session where this surfaced, four manual resets
