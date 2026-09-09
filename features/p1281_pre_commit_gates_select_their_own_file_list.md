---
status: backlog
type: task
rank: 1000093
workstream: infrastructure
created_date: '2026-09-09'
tags: [pre-commit, git-index, tooling]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: hardening
---

# P1281: Several pre-commit gates choose their own file list instead of being handed the commit's

## Problem

**Situation:** Several gates in `pre-commit-checks.sh` do not receive the staged file list — they
re-derive it from git themselves. `check-disclosure.sh` runs its own
`git diff --cached --diff-filter=A`; the doc-link validator and the spec-intent gate scope
similarly. Each is a separate re-implementation of "which files is this commit about".

**Complication:** This is the amplifier that turned P1273 from a quiet defect into a wall. When a
canary redirected 1497 paths into the committing worktree's index, gates that select their own
inputs happily judged all of them, and refused the commit over seven spec files it had never
touched. The writer is fixed (P1273) and a guard now refuses any check that moves the index, so
nothing is currently misjudging anything — but the gates would still believe a corrupted index if
one ever appeared again, and they remain four answers to one question.

This is the case P1255 already ruled on in a different context — one field, five readers, four
parses, wrong in opposite directions — applied to input *selection* rather than field parsing.

**Question:** Which gates select their own inputs, and can they share one selector?

> Founder framing, verbatim: *"what we do to finish this session - and to fix properly all
> problems that were preventing it"* — this is the half of "properly" that is hardening rather
> than repair, split out rather than dropped.

## Appetite

Blast radius: **medium** — every commit runs these gates, but P1273's guard now bounds the damage.
Reversibility: high. Decision density: low.

## Invariants

- A gate judges **the commit**, never the repository. If a path is not in the commit, no gate may
  refuse the commit because of it.
- Narrowing a gate's scope may not narrow what it *detects* within that scope.

## Approach

1. Enumerate every gate deriving its own file list from git rather than receiving one.
2. Give them the staged list explicitly — one selector, called by all readers, per the P1255
   ruling. Not four re-implementations.
3. For each narrowed gate, keep the pre-existing repo-wide violations passing: those belong to
   other work and are not this commit's to answer for.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Narrowing scope lets a real violation through | MITIGATE | Each narrowed gate watched failing on an in-commit violation (gate 7) and waving through pre-existing out-of-commit ones (gate 7c) |
| A gate legitimately needs repo-wide scope | ACCEPT | Some do — e.g. a duplicate-spec check. Name them and leave them alone rather than forcing uniformity |
| The refactor lands while the index guard is still new | ACCEPT | The guard has its own canary and is independent of this work |

**Non-Goals**
- Do NOT relax what any gate detects, only what it is pointed at.
- Do NOT add a `--no-verify` escape hatch.

## Done-When

- [ ] Every gate that derives its own file list is enumerated, each classified as
      "should receive the commit's list" or "legitimately repo-wide, with the reason"
- [ ] The ones in the first class share a single selector
- [ ] Each narrowed gate is watched failing on an in-commit violation (gate 7) and passing the
      repo's pre-existing out-of-commit ones (gate 7c)

## Related

- P1273 — found the defect this hardens against; carried this item as its last open Done-When
  before it was split out here
- decisions.md 2026-09-08 [technical] (P1255) — the one-parser ruling this extends to input
  selection
