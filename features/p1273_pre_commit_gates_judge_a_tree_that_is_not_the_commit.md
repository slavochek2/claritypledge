---
status: week
type: task
rank: 1000080
workstream: infrastructure
created_date: '2026-09-08'
tags: [pre-commit, worktree, git-index, tooling]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

- [ ] The step that expands the index is **named**, with the instrumented before/after counts
- [ ] A commit of N staged paths reports gate results for those N paths only, shown on the P1268
      branch that is blocked today
- [ ] A failed commit leaves the index byte-identical to how it started, asserted by a canary
- [ ] Each narrowed gate is watched failing on an in-commit violation (gate 7) and passing the
      repo's pre-existing out-of-commit ones (gate 7c)
- [ ] The blocked P1268 batch commits with hooks enabled and no override

## Open Questions

1. What expands the index to ~1500? Not established. The `GIT_DIR` amplifier is confirmed but
   accounts for 18, not 1497.
2. Does this reproduce in a worktree whose branch is freshly rebased on `main`? If drift is
   required, that narrows it sharply.
3. Has it been silently blocking other sessions, with `--no-verify` as the unrecorded workaround?

## Related

- decisions.md 2026-09-08 [technical] (P1255) — one field, five readers, four parses, wrong in
  opposite directions; the one-parser ruling this spec extends to input selection
- decisions.md 2026-09-08 [technical] (P1263) — the `GIT_*` unset audit; the same env vars amplify
  here
- P1268 — the branch this blocks
