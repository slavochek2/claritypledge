---
status: in-progress
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
delivery_stage: dev
pipeline_ran: [create-bug, dev]
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

- [x] Running `./scripts/test-git-ops-extensions.sh` leaves `git config core.bare` reporting `false`
      on the invoking repo, verified before and after
- [x] The same holds with `GIT_DIR` deliberately exported, which is how a hook invokes it
- [x] `scripts/test-push-snapshot-pinning.sh` confirmed path-explicit or fixed
- [x] A canary asserts the invoking repo's `core.bare` is unchanged, and that assertion has been
      **watched to fail** against the old form (paste the non-zero exit)
- [x] `git rev-parse --show-toplevel` still resolves after a full `pre-commit-checks.sh` run with
      `scripts/git-ops.sh` staged

## Related

- `docs/decisions.md` (P1131) — `GIT_DIR` inherited by hooks from worktrees; same defect class
- `features/p1131_banned_git_canary_fixture_leaks_git_dir_in_worktrees.md`
- `docs/decisions.md` 2026-09-07 — the session where this surfaced, four manual resets

## Implementation Findings (2026-09-07)

### The spec's causal attribution does not hold — the true cause of the 2026-09-07 flips is still unfound

The defect at `scripts/test-git-ops-extensions.sh:75` is **real and was fixed**, but it cannot be the
cause of the observed incident. Line 32 of that same file — present since `3dc1bdb32` (2026-04-22,
the commit that created the file) — already runs:

```bash
unset GIT_DIR GIT_INDEX_FILE GIT_WORK_TREE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR
```

That unset executes unconditionally, in the same process, ~40 lines before the `git init --bare`.
So `GIT_DIR` is guaranteed empty at the call site, and the no-path form had nothing to redirect it.
The guard predates the incident by four and a half months.

**Mechanism verification** (discriminating controls, git 2.50.1):

| form | `GIT_DIR` set | victim `core.bare` after |
|---|---|---|
| `git init --bare -q` (no path) | yes | **true** ← known-bad |
| `git init --bare -q "$PATH"` (explicit) | yes | false ← known-good |
| `git init -q` (no path, non-bare) | yes | false |

The mechanism the spec describes is exactly right. Its application to this call site is not.

**Repo-wide audit** — every `git init`/`git clone` under `scripts/` was checked. The only three
`--bare` sites are the ones the spec names; two were already path-explicit, and the third was
guarded by the unset. **No code path in this repository can currently set `core.bare = true` on the
main checkout**, and `grep -rn 'core\.bare'` across all `.sh`/`.py`/`.mjs` returns no writer at all.
The four flips on 2026-09-07 therefore came from something outside this audit's scope — a
hand-typed command, a tool outside the repo, or a checkout of a script version not in git history.

**This spec's fix is still worth having**, as hardening rather than as the cure: it removes the
dependency on a guard 40 lines away, and adds an assertion that will *name the culprit* if this
recurs — which is the thing the 2026-09-07 session lacked for an hour.

### A masking effect that would have defeated a naive end-to-end reproduction

Re-introducing the full pre-P1263 shape (unset removed **and** no-path form) does not leave
`core.bare = true`: the canary's later `git init -q` at line ~96 — also no-path, also redirected by
`GIT_DIR` — **re-initialises the victim as non-bare and resets the flag**. The end-to-end symptom
self-heals while the intermediate damage is real (the scratch `origin.git` is never created, and the
run dies later at `git push` with an unrelated-looking error). Any reproduction that only checks
`core.bare` at the end reads as "not reproduced".

### Invariant M had to be wired into three traps, not one

`test-git-ops-extensions.sh` re-arms `trap ... EXIT` twice mid-file (lines ~391 and ~435). A single
`trap` installed at the top is silently replaced by those — the guard would have looked present in
review and never run. This was caught only because the expected `PASS: M` line was missing from an
otherwise-green run. The assertion is now a function called from all three trap bodies, with a
comment telling future editors to keep the call.

This is the same defect class as P1263 itself: **a guard that is present in the source and absent at
runtime.**

## Review (Opus, adversarial) — 1 of 1 reviewer reported

**0 HIGH, 2 MEDIUM, 2 LOW.** All four findings verified by command before acting on them, and all
four fixed.

- **MEDIUM — an aborted run printed an affirmative `PASS: M`.** On SIGTERM the trap's `rc=$?` reads
  0 (the last command succeeded), so the invariant printed "invoking repo core config untouched" for
  a suite that died at invariant J. Verified: `TERM exit=143`, suite-completed count `0`,
  `PASS: M` count `1`. Fixed with a `CANARY_COMPLETED` flag set immediately before the final
  summary; the PASS is gated on it. Re-verified: `PASS: M` count now `0` on the same abort. The
  FAIL path is deliberately **not** gated — a mutation must be reported however the run ends.
- **MEDIUM — `core.bare` alone is narrower than the threat class.** Widened to a hash of the
  `core.`/`extensions.` namespace. **Not** widened to all of `config --list --local`, as the
  reviewer proposed: a concurrent session setting branch upstream tracking writes
  `branch.<name>.{remote,merge}` into the same shared config while this canary runs, so the broader
  hash would fail on other sessions' legitimate work (epistemic gate 7c — a new gate must be run
  against workflows that already exist). Verified both directions: a simulated concurrent
  `branch.sim.*` write during a run still exits 0, while a `core.bare` flip exits 1.
- **LOW — the printed recovery command was wrong in the `unset` branch.** `git config core.bare unset`
  succeeds (`rc=0`) writing the literal string `unset`, after which every read fails with
  `fatal: bad boolean config value 'unset'` — strictly worse than the state it claimed to repair.
  Now emits `config --unset core.bare` when the pre-state was unset.
- **LOW — dead fallback / misleading tolerance.** The script dies at `git rev-parse --show-toplevel`
  before invariant M is ever reached outside a repo, so the `|| echo unset` fallback is unreachable.
  Left in place as a cheap guard; noted here so nobody reads it as evidence the script supports
  non-repo invocation.

**Reviewer claim independently confirmed, load-bearing for the fix:** `git -C <dir>` does **not**
override an inherited `GIT_DIR` — `GIT_DIR` wins. So the assertion's reads follow the same
repository a stray command's write would land in, which is what makes it a valid guard.

### Verification evidence

| Check | Result |
|---|---|
| Normal run | `exit=0`, `PASS: M: invoking repo core config untouched (core.bare=false)` |
| Run with `GIT_DIR` exported | `exit=0`, `core.bare` false before and after |
| SIGTERM mid-run | `exit=143`, suite incomplete, **no** `PASS: M` |
| Known-bad control (`core.bare` flip) | `EXIT=1`, `FAIL: M. canary mutated the invoking repo's core git config` |
| Known-good control (concurrent `branch.*` write) | `EXIT=0`, PASS |
| Full `pre-commit-checks.sh` | `✓ All checks passed`; canary P787 ✓; `toplevel` resolves |
