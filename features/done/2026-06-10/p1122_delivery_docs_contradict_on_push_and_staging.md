---
status: all-done
type: bug
rank: 101
created_date: '2026-08-19'
tags: [docs, git-workflow, ship, push-safety, charter]
pipeline_ran: [create-spec, fix, ship]
driver: anomaly
completed_at: 2026-08-20
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

## Resolved Decisions

**Conflict 3 (`research-arch`) — reopened mid-fix.** The spec's Solution said "either restore
the skills or remove the values." Before acting, `features/archive/p659_pipeline_delivery_tracking.md:83`
was grepped as part of the dependents check and reads: *"Valid `delivery_stage` value but no
skill file: `research-arch` — referenced in pick-flow as optional pre-architect step. If a
`/research-arch` skill is created later, add the stamp pattern."* That's a deliberately reserved
placeholder recorded at design time, not drift — deleting it would erase documented intent, which
the CLAUDE.md "enumerate dependents" rule treats as evidence to keep, not a neutral fact to
remove. **Decision (user-confirmed):** keep the value, annotate it in `.claude/rules/features.md`
with the reservation and its source, so the next reader sees "reserved, not built" instead of a
phantom entry. `architect.md:136`'s conditional reference is left untouched — it already degrades
safely when the value never occurs.

**Post-review correction (2026-08-20).** `/finish` review caught two unverified claims in this
section's first pass:
1. The `research-arch` annotation originally said "`pick-flow` may name it as an optional
   pre-`architect` step" — that's the *p659-era* description, not current behavior.
   `grep -n 'research-arch' .claude/commands/slava/build/pick-flow/SKILL.md` returns **zero**
   hits in the current file. Corrected to attribute that claim to p659 explicitly and state the
   current file carries no such reference.
2. The Done-When evidence for `quick-feature` claimed "14 closed specs... carry it as history."
   `grep -rl 'flow: quick-feature' features/done/` returns **4** files, not 14 (a broader
   any-mention grep across `features/done/` returns 9). Corrected below to the verified count.

## Done-When

- [x] `grep -rn 'ship.*push' docs/technical/git-workflow.md` shows no statement that `/ship`
      pushes — output pasted (three hits: `:83` and `:104` are pre-existing correct statements
      about the push boundary; `:91` now reads "it never pushes on its own — it prints 'Ready to
      push' and stops for the user")
- [x] `git-workflow.md` states the staging-hop rule exactly once, and it matches the live
      ruleset — output pasted (`:113`, unchanged, still the sole statement; the contradictory
      "no staging gate" claim at the old `:89` was corrected to name the staging-hop as a CI gate,
      not a deploy environment, pointing down to `:104-113` without duplicating its mechanism —
      `:89`'s new text does still carry the word "mandatory" alongside `:113`'s, in agreement not
      contradiction)
- [x] Every `delivery_stage` and `flow:` value in `.claude/rules/features.md` is either backed by
      a skill file, annotated as a deliberately reserved placeholder with its source, or marked
      legacy/read-only with specs carrying it grepped first — output pasted (`research-arch`:
      annotated per Resolved Decisions above (corrected to note current pick-flow carries no
      `research-arch` reference); `quick-feature`: 4 closed specs in `features/done/` carry
      `flow: quick-feature`
      confirmed via grep, value kept for history, marked legacy in features.md, and removed as an
      offered choice in `pick-flow/SKILL.md:214,230`)
- [x] Each resolution names its owner per CHARTER rule 10 (git-workflow.md:91 points to
      `ship.md` as owner of what `/ship` does; features.md stays the owner of spec-field meanings
      for both annotations; pick-flow.md's own firewall table is the owner of what flow values it
      offers)

## Context

Filed while executing the `/goalify` plan (2026-08-19). Same root cause as the four drifted
`CLAUDE.md` process facts corrected that day: the routing tree had **no branch for process
facts**, so they scattered into second copies and the copies drifted. CHARTER rule 10 was
added to close that gap; this spec cleans up what drifted before it existed.
