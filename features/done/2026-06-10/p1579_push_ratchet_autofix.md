---
status: all-done
type: task
rank: 80
workstream: infrastructure
created_date: '2026-10-27'
tags: [push, ship, quality-ratchet, process]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: incident
completed_at: 2026-10-27
---

# P1579: Code-shape regressions are fixed before the push, not discovered by it

## Problem

> Founder framing, verbatim: *"I run push on Sonnet, then I switch to Opus because I'm not clear,
> then you explain to me something, then I need to make decisions. No, it has to be streamlined."*

**Situation:** The quality ratchet (P1566, live 2026-10-26) refuses any push where a large file grows
or a function gets longer or more tangled. It runs at commit time and as a required check on the
staging hop.

**Complication:** `/ship` moves a branch onto main by cherry-picking, and a cherry-pick does not run
the pre-commit hook. So a branch written before the ratchet existed, or one whose commits skipped
it, reaches main unchecked, and the first thing to judge it is the server, at push time. On
2026-10-27 a `/push` of 44 commits (all of P1545, written 2026-10-23) applied two migrations to
prod, spent a push window and a CI run, and then failed on 16 findings. The founder then had to
switch model, read an explanation and make decisions before anything could move.

**Question:** How does a push resolve this by itself, with no model switch and no question?

## Appetite

Blast radius: low (two skill files, one refactor of shipped code with no behaviour change).
Reversibility: high. Decision density: none open; the founder asked for it resolved, streamlined.

## Solution

1. **The 16 findings are fixed now** by behaviour-preserving extraction (helpers into the same
   file or sibling modules), so this push goes through.
2. **`/ship` checks the ratchet over the branch range before it cherry-picks** and refuses with the
   findings, so the failure shows while the branch is still open, not after it is on main.
3. **`/push` runs the same check locally, before it touches prod or asks for `push-on`** (the local
   run over `origin/main..HEAD` produced the identical 16 findings CI did). Founder ruling, 2026-10-27: *"On push it's
   too late. On push it's like a check."* and *"if you make it check only, then things start to
   slip."* So the refactor normally happens where the code was built (the per-commit hook while
   building, gate 3.8 before merge), and `/push` fixes only what slipped past both, as the exception,
   then files a note naming the gap.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A refactor changes behaviour | MITIGATE | Extraction only; typecheck + unit + affected e2e must pass; Gemini + Opus review |
| Gate 3.8 skips a branch /ship will cherry-pick | MITIGATE | Resolves feature/ and fix/ like git-ops; >1 match FAILS; canary covers both |
| Add recipient keeps a hand-typed colour under a named lint exception | ACCEPT | P1545's test pins `bg-blue-500`; P1568 bans hand-typed button colours. Founder call which wins; nothing visible changed |
| Raising the limits or an allowlist as the "fix" | AVOID | Never edit the ratchet's limits or baseline to pass |

Non-goal: changing the ratchet itself, or making cherry-pick run hooks.

## Done-When

- [x] `node scripts/quality-ratchet.cjs --range origin/main..HEAD` exits 0 on the branch — `OK (0981a77b6..c5a3c66ce; 75 file(s) checked)`, exit 0
- [x] Typecheck and the unit suite pass; the P1545-touching e2e specs show no regression — `typecheck-gate.sh` exit 0
      (bare `tsc --noEmit` checks nothing here); pre-commit unit suite green (682 files). E2E over the 7 specs
      that touch P1545 screens: 16 failures on the branch, **24 on `main` without it** (control run). The 6
      failing only on the branch were rerun on both: 3 fail in `beforeAll` setup (user creation timeouts, a
      test-helper FK error), 1 (`p660-drafts-tab:120`) fails on `main` too, the rest flaky. Those e2e specs are
      broken on `main` independent of this branch; filed as a follow-up via `/note`.
- [x] `/ship` refuses a branch with a ratchet regression, shown by a run against a known-bad range — `scripts/test-p1579-ship-gate-ratchet.sh`, 8 of 8 (real P1545 history on feature/ and fix/ fails; docs-only passes); existing ship canaries 7 of 7 green
- [x] `/push` runs the ratchet in step 2.2, ahead of migrations and the `push-on` ask, and fixes slipped code as the exception (founder ruling, Solution item 3)
- [x] Reviewed by Gemini and one Opus reviewer; findings resolved or recorded — round 1: Gemini, Codex, Opus (3 of 3); round 2: Gemini, Codex (2 of 2); round 3: Gemini confirmation, clean. Receipt written
