---
status: week
type: task
rank: 1000080
workstream: infrastructure
created_date: '2026-09-08'
tags: [pre-commit, worktree, git-index, tooling]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, inline]
flow: inline
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1273: Commits from a worktree are blocked by other sessions' files, because the hook judges a tree that is not the commit

## Problem

**Situation:** `git commit` from a worktree runs `pre-commit-checks.sh`. Several of its gates
select their inputs from git rather than from an explicit file list — `check-disclosure.sh` uses
`git diff --cached --diff-filter=A`, the doc-link validator and the spec-intent gate scope
similarly.

**Complication:** During the hook run the index expands from the handful of staged paths to ~1500,
and the gates then judge files the commit never touched. Measured this session on
`feature/p1268-worktree-lock-adoption`, four consecutive attempts, byte-identical failure each time:

```
staged before commit : 6 paths (all mine)
gates report         : 5 errors, 0 of them on my files
blocking files       : p1155, p1162, p1220, p1234, p1237, p1240, p803
                       + dead links in docs/decisions.md
index after the failed commit : 1497 paths
```

Two controls locate it. `pre-commit-checks.sh` run **standalone** on the identical 6-path index
exits **0**. `check-disclosure.sh` with an **empty** index exits **0** and reports zero violations.
So the content is fine and the trigger is the hook invocation itself.

**The blocking files exist nowhere.** Not on disk in the worktree, not in the main checkout, not
tracked on `main`, and `git cat-file -e` finds them in **no branch** — checked against `main` and
all four sibling feature branches. They are specs long since moved into `features/done/`. The
expanded index therefore reconstructs an **old tree**, not any current state, which is why gates
that only look at *added* files see hundreds of them.

One contributing mechanism is confirmed: with `GIT_DIR` pointed at the common dir rather than the
worktree's, `git diff --cached --name-only` reports **18** paths where the worktree reports **5**,
because HEAD resolves to `main`'s HEAD instead of the branch's. That is a real amplifier and it is
**not sufficient** to explain 1497.

**Question:** What expands the index during a hook run, and which gates must stop selecting their
own inputs?

> Founder framing, verbatim: *"we need to fix it and also investigate how to sustainably fix and
> prevent it or what."*

## Appetite

Blast radius: **high** — this is every commit from every worktree, and the repo runs five. A
blocked session's most tempting exit is `--no-verify`, which is banned precisely because it also
skips the privacy gate. Reversibility: high. Decision density: low.

## Invariants

- A gate judges **the commit**, never the repository. If a path is not in the commit, no gate may
  refuse the commit because of it.
- No hook step may leave the index different from how it found it. A blocked commit must not make
  the next attempt worse — the observed snowball (6 → 1497 across attempts) is this invariant
  breaking.
- `--no-verify` stays banned. Making the gate correct is the only acceptable remedy.

## Approach

1. **Find the writer.** Instrument the hook to record `git diff --cached --name-only | wc -l`
   between every step, and read the first step where it jumps. Ruled out already, each measured
   rather than reasoned about: every canary run standalone, every canary run under a simulated hook
   environment (`GIT_DIR`/`GIT_INDEX_FILE`/`GIT_WORK_TREE` set), and the whole script standalone —
   none expanded the index.
2. **Audit input selection.** Enumerate every gate that derives its own file list from git instead
   of receiving one, and give them the staged list explicitly. Per the P1255 ruling, one parser and
   one selector, called by all readers — not four re-implementations.
3. **Make the expansion impossible to ignore.** If a step must stage (the skills sync legitimately
   does), it declares what it staged; anything else leaving the index changed fails the run loudly.

**Do not start at step 2.** Fixing input selection without finding the writer leaves the snowball,
and the snowball is what turns one blocked commit into a worse second attempt.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Narrowing gate scope lets a real violation through | MITIGATE | Each narrowed gate must be watched failing on an in-commit violation (gate 7) **and** waving through the repo-wide pre-existing ones (gate 7c) |
| The instrumentation perturbs the thing it measures | MITIGATE | Record to a file, no git calls of its own beyond one read |
| The skills sync stages by design and looks like the bug | ACCEPT | Expected; the fix is to declare it, not to stop it |
| Root cause is environmental and not reproducible on another machine | DEFER | Capture the instrumented trace first; decide after |

**Non-Goals**
- Do NOT relax `check-disclosure.sh`'s rule, only what it is pointed at.
- Do NOT add a `--no-verify` escape hatch, documented or otherwise.
- Do NOT fix the pre-existing violations in those specs to make the symptom go away — they are
  other work's, and treating them as this bug's cause is the misdiagnosis to avoid.

## Done-When

- [x] The step that expands the index is **named**, with the instrumented before/after counts
- [x] A commit of N staged paths reports gate results for those N paths only, shown on the P1268
      branch that is blocked today
- [x] A failed commit leaves the index byte-identical to how it started, asserted by a canary
- [x] Each narrowed gate is watched failing on an in-commit violation (gate 7) and passing the
      repo's pre-existing out-of-commit ones (gate 7c) — **split to P1281.** No gate was narrowed
      here: the writer turned out to be a single check corrupting the index, so with it fixed and
      the guard in place nothing is judging a tree that is not the commit. The narrowing is real
      hardening but no longer part of this defect, and holding this spec open for it would keep
      the guard off main while the failure it prevents stays live.
- [x] The blocked P1268 batch commits with hooks enabled and no override

## Evidence — hypotheses eliminated 2026-09-08/09

The crispest reproduction, and the one to start from:

```
same script, same 6-path index, same branch:
  ./scripts/pre-commit-checks.sh   (standalone)  -> exit 0, 0 errors
  git commit                       (as the hook) -> 5 errors, commit blocked
```

Four hypotheses tested and **dead** — do not re-run these:

| Hypothesis | How it died |
|---|---|
| The worktree's index/state is corrupt | Rebuilt with `git read-tree HEAD` repeatedly; fails identically from a **brand-new worktree** created fresh on the same branch |
| The branch is stale, rebase fixes it | w2 is **65 commits behind and commits fine**; the failing branch was 26 behind at the time. More drift, fewer problems |
| The blocking specs are untracked leftovers | They exist in **no tree at all** — not on the branch, not on main, not on disk, and `git cat-file -e` finds them in no ref |
| A gate computes its range backwards, so specs closed on main read as newly added | The backward range yields 5 different files, none of them the 7 that block |

Two mechanisms **confirmed but insufficient**: `GIT_DIR` at the common dir inflates
`git diff --cached` from 5 paths to 18 (HEAD resolves to main's), and a failed commit leaves the
index expanded rather than as it found it — so attempt N+1 starts worse than attempt N. Neither
accounts for the ~1500-path expansion or for the specific 7 files.

**The one thing not yet done is the one thing that will answer it:** instrument the hook to record
`git diff --cached --name-only | wc -l` between every step and read the first jump. Everything above
is elimination; that is measurement.


## Root cause — found 2026-09-09, by measurement

**`git` exports `GIT_DIR` and `GIT_INDEX_FILE` to its hooks, and those OVERRIDE `git -C <path>`.**

`scripts/test-git-ops-gc.sh` drives the real repo through `git -C "$ROOT"` and did not carry the
P785 unset. Run from pre-commit it therefore aimed every fixture operation at the **committing
worktree's** index instead of the repo's — importing the fixture tree, which is why the blocking
files are specs that exist in no current ref. **It exited 0 while doing it.** A canary that
corrupts its caller and reports success is invisible to every gate downstream of it.

Measured on the identical staged set, with a matched control:

| Run | Index before → after | Exit |
|---|---|---|
| gc canary **with** hook env | 6 → **1497** | 0 |
| gc canary **without** hook env | 6 → 6 | 0 |
| after the unset, **with** hook env | 7 → 7 | 0, still 5 passed / 0 failed |

Two earlier observations are now explained rather than merely recorded. The `GIT_DIR` amplifier
(5 paths reading as 18) was the same mechanism seen through a smaller aperture — a sibling
variable of the one that mattered. And "a failed commit leaves the index expanded" was not a
second bug: it is this one, with the expansion simply never rolled back.

**Why four sessions missed it.** Every hypothesis tested was about *state* — a corrupt index, a
stale branch, leftover files, a backwards range. The defect was about *environment*, and it lived
in a check that was passing. The standalone-vs-hook control pointed at it from the first hour and
was read as "the hook environment differs" rather than "the hook environment is exported into
things the hook shells out to".

One further confound, worth recording because it made the reproduction look inconsistent: the
pre-commit hook is a **symlink to the main checkout's** `scripts/pre-commit-checks.sh`, while
`./scripts/pre-commit-checks.sh` from a worktree runs the worktree's copy. "Same script" was never
true. The canaries it invokes, however, resolve by relative path and so *do* come from the
worktree — which is why fixing the worktree's copy unblocked the commit immediately.

### What shipped

- `scripts/lib/run-quiet.sh` — `run_quiet` extracted so the guard is reachable by a canary, plus
  the guard itself: fingerprint the staged list before and after every check, fail naming the
  step when it moved. `INDEX_MUTATORS` allowlists the skills sync, which stages by design.
- `scripts/test-git-ops-gc.sh` — the missing unset.
- `scripts/test-index-integrity-guard.sh` — 7 assertions, wired into pre-commit. Scenario 4
  reproduces the mechanism end-to-end and carries a control asserting the index really moved
  (1 → 41), so it cannot pass vacuously.

### Remaining

The narrowing work (Approach step 2 — gates selecting their own file list instead of receiving
one) is **not done** and is filed as **P1281**. It is now a hardening task rather than a bug fix: with the writer fixed, no gate is currently judging a tree that is not the commit. The
audit of sibling canaries found no second index-corrupting instance — of 13 lacking the unset,
10 never call git, `test-escalator-exit-codes.sh` uses a git stub, `test-pre-push-refclass.sh`
only reads refs from the shared common dir, and `test-multi-harness-routing.sh` reads
`git -C "$ROOT" show :<path>`, which under a hook reads the caller's index rather than the
repo's — wrong, but read-only.

## Open Questions

1. ~~What expands the index to ~1500?~~ **Answered:** `test-git-ops-gc.sh` without the P785
   unset. The `GIT_DIR` observation was the same mechanism through a smaller aperture.
2. ~~Does drift matter?~~ **Answered: no.** Branch position is irrelevant — the trigger is the
   exported hook environment, which is present on every hook run from every worktree.
3. Has it been silently blocking other sessions, with `--no-verify` as the unrecorded workaround?

## Related

- decisions.md 2026-09-08 [technical] (P1255) — one field, five readers, four parses, wrong in
  opposite directions; the one-parser ruling this spec extends to input selection
- decisions.md 2026-09-08 [technical] (P1263) — the `GIT_*` unset audit; the same env vars amplify
  here
- P1268 — the branch this blocks
