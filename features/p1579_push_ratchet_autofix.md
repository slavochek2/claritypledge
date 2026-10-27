---
status: week
type: task
rank: 80
workstream: infrastructure
created_date: '2026-10-27'
tags: [push, ship, quality-ratchet, process]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: incident
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
   run over `origin/main..HEAD` produced the identical 16 findings CI did). It only checks: a red
   verdict is a STOP naming whose commits it came from. Founder ruling, 2026-10-27: *"On push it's
   too late. On push it's like a check."* The refactor belongs where the code was built (the
   per-commit hook while building, gate 3.8 before merge). An auto-fix lane inside `/push` was
   drafted, reviewed, and removed on that ruling.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A refactor changes behaviour | MITIGATE | Extraction only; typecheck + unit + affected e2e must pass; Gemini + Opus review |
| Gate 3.8 skips a branch /ship will cherry-pick | MITIGATE | Resolves feature/ and fix/ like git-ops; >1 match FAILS; canary covers both |
| Raising the limits or an allowlist as the "fix" | AVOID | Never edit the ratchet's limits or baseline to pass |

Non-goal: changing the ratchet itself, or making cherry-pick run hooks.

## Done-When

- [ ] `node scripts/quality-ratchet.cjs --range origin/main..HEAD` exits 0 on the branch
- [ ] `npx tsc --noEmit` and the unit suite pass; the P1545 e2e specs pass
- [ ] `/ship` refuses a branch with a ratchet regression, shown by a run against a known-bad range
- [ ] `/push` runs the ratchet as a check-only step 2.2, ahead of migrations and the `push-on` ask
- [ ] Reviewed by Gemini and one Opus reviewer; findings resolved or recorded
