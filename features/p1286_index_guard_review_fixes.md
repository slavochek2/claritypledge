---
status: week
type: task
rank: 1000082
workstream: infrastructure
created_date: '2026-09-09'
tags: [pre-commit, git-index, tooling, review-followup]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, inline]
flow: inline
drafted_by: opus
exec_model: opus
exec_effort: high
driver: review
---

# P1286: The index-integrity guard shipped with three blind spots and two vacuous assertions

## Problem

**Situation:** P1273 shipped a guard that refuses any pre-commit check which rewrites the
index it is judging. A hostile review of that branch, delivered after it had already merged,
found seven real defects in it.

**Complication:** Three of them are blind spots in the guard's own fingerprint, which hashed
`git diff --cached --name-only`. That list is blind to anything preserving the paths:
restaging different content under an already-staged name, a mode-only restage, and a
stage-then-unstage round trip all passed. The content case is the dangerous one and is
**worse than the defect P1273 fixed** — a step that inherits the hook's exported
`GIT_INDEX_FILE` and runs `git add -A` stages unreviewed content under names the author did
approve. A changed file *list* is loud (the later gates refuse it, which is how P1273
surfaced at all); changed *content* is silent all the way into the commit.

Two more are vacuity holes in the canary: scenarios 2 and 3 asserted only that `run_quiet`
returned non-zero, which is equally true when the staging command itself fails —
reproduced with `git add /nonexistent-path`, which satisfied the assertion while the guard
never fired.

And the new trigger was built from a file list computed with `--diff-filter=d`, so
`git rm` of the canary matched nothing and the run printed "skipped" while the gate was
being deleted.

> Founder framing, verbatim: *"to fix properly all problems that were preventing it"*

**Question:** Close the blind spots without making the guard refuse legitimate work.

## Appetite

Blast radius: **medium** — every commit runs this. Reversibility: high. Decision density: zero.

## Invariants

- The guard must never refuse a step that did not touch the index.
- A canary assertion must fail for the reason it names, not for any reason at all.

## Solution

- Fingerprint `git diff --cached --raw` instead of `--name-only`, so blob shas and modes
  are covered. Costs nothing on today's steps: the one legitimate restage in
  `pre-commit-checks.sh` (`git add $STAGED_TS` after `eslint --fix`) sits **outside**
  `run_quiet`, so the before-sample is taken after it.
- Print the actual index difference on refusal, and name the concurrent-session
  possibility — on the shared main checkout a co-tenant staging during a multi-minute step
  produces the same symptom, and the old message misdirected the reader toward unsetting
  `GIT_DIR` in a step that never touched git.
- Test the allowlist for a real **array**: an exported scalar named `INDEX_MUTATORS`
  satisfied `${VAR+x}` and silently discarded the default allowlist.
- Give scenarios 2 and 3 the control scenario 4 already had, and add coverage for the three
  mutations that used to pass.
- Build the trigger from a raw staged listing, and make a staged **deletion** of the guard
  or its canary a hard error rather than a skip.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| `--raw` refuses a legitimate content restage | MITIGATE | Enumerated all 40 `run_quiet` call sites; none stages inside a wrapped call |
| Co-tenant races still misattribute to a step | ACCEPT | Undecidable from inside the hook; the message now names the possibility (P1279 window) |
| Both canaries are BSD-only and gate commits | DEFER | Latent — no workflow invokes `pre-commit-checks.sh`; CI runs only the disclosure gate |

**Non-Goals**
- Do NOT widen what the guard refuses beyond index mutation.
- Do NOT regenerate another session's drifted files to get this to commit.

## Done-When

- [x] The fingerprint covers content and mode, with the three previously-passing mutations
      now caught by canary assertions
- [x] Scenarios 2 and 3 carry a control proving the index actually moved
- [x] An exported scalar cannot discard the allowlist
- [x] A staged deletion of the guard or its canary is a hard error, not a skip
- [x] The refusal message prints what actually changed and names the co-tenant possibility
- [x] Full pre-commit run passes with the index unchanged

## Related

- P1273 — the guard this repairs; closed before the review arrived
- P1281 — the gate-narrowing hardening, split out of P1273