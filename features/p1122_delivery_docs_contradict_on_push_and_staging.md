---
status: backlog
type: bug
rank: 101
created_date: '2026-08-19'
tags: [docs, git-workflow, ship, push-safety, charter]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1122: The delivery docs contradict each other on push, on staging, and on two stage values

## Problem

**Situation:** four conflicts, all verified this session by reading both sides.

| # | one side says | the other says |
|---|---|---|
| 1 | `git-workflow.md:91` — `/ship` "merges branch → main → **pushes** → Vercel deploys" | `ship.md:171` — "Push requires explicit user action. `/ship` prints 'Ready to push' and **stops**." |
| 2 | `git-workflow.md:89` — "There is **no staging gate** — pushing to main IS deploying to prod" | `git-workflow.md:113` — "The staging-hop is **mandatory** for all main pushes" (same file) |
| 3 | `research-arch` is a valid `delivery_stage` value (`.claude/rules/features.md:104`) | no skill file of that name exists |
| 4 | `quick-feature` is a valid `flow:` value (`features.md:74`) | no such skill exists — `create-spec.md` says it *replaced* `/quick-feature` |

**Complication:** conflict 1 is not cosmetic. `CLAUDE.md` puts `git push` on the ALWAYS-ASK
list and `.claude/rules/git.md` states pushes are never pre-approved in a prior session. A
doc telling an agent that `/ship` pushes is a doc telling it that a prohibited action is
routine. Conflict 2 sits **24 lines apart in one file**, so whichever an agent reads first
wins.

**Question:** which side of each is true, and how does the routing tree stop the next copy
from drifting?

## Appetite

Low blast radius (docs only), fully reversible, low decision density — three of the four have
an unambiguous owner. Conflict 3/4 needs a founder call on whether to restore the skills or
drop the values.

## Solution

Resolve each toward the **owner**, per the routing rule added to `docs/CHARTER.md` as rule 10
on 2026-08-19: git mechanics → `git-workflow.md`; how one step runs → that step's own SKILL
file; spec field meanings → `.claude/rules/features.md`; everything else carries **pointers
only, never a second copy**.

Concretely: `ship.md` is the owner of what `/ship` does, so `git-workflow.md:91` becomes a
pointer. `:89` is stale (the `main-privacy-gate` ruleset went active 2026-06-16, per `:113`
in the same file) and should be corrected, not reconciled. For 3 and 4, either restore the
skills or remove the values from the allowlists.

## Risks / Non-Goals

- **Do NOT** resolve conflict 1 toward "`/ship` pushes". `/ship` must continue to stop.
- **Do NOT** delete a `delivery_stage`/`flow` value without grepping specs that carry it —
  an existing value in an allowlist is evidence of deliberate intent, not a neutral fact.
- **Non-goal:** consolidating the delivery docs generally. The pick-flow-vs-delivery-doc
  duplication hypothesis was tested on 2026-08-19 and found **wrong** — they barely overlap,
  and `docs/software-delivery-process.md` has zero runtime consumers.

## Done-When

- [ ] `grep -rn 'ship.*push' docs/technical/git-workflow.md` shows no statement that `/ship`
      pushes — output pasted
- [ ] `git-workflow.md` states the staging-hop rule exactly once, and it matches the live
      ruleset — output pasted
- [ ] Every `delivery_stage` and `flow:` value in `.claude/rules/features.md` either has a
      skill file or is removed, with specs carrying removed values grepped first — output pasted
- [ ] Each resolution names its owner per CHARTER rule 10

## Context

Filed while executing the `/goalify` plan (2026-08-19). Same root cause as the four drifted
`CLAUDE.md` process facts corrected that day: the routing tree had **no branch for process
facts**, so they scattered into second copies and the copies drifted. CHARTER rule 10 was
added to close that gap; this spec cleans up what drifted before it existed.
