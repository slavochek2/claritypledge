---
status: backlog
type: task
rank: 100
created_date: '2026-08-19'
tags: [sim, skills, measurement, retirement]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1121: /sim has no caller — add one or retire it, but measure first

## Problem

**Situation:** `/sim` is a persona-based UX exploration skill. Corrected measurements
(2026-09-01, after adversarial review — see Context):

| signal | measured |
|---|---|
| can it block? | **yes** — `sim.md:124` defines `high` as "blocks task"; `sim.md:222` makes Tier A core-flow bugs block shipping |
| does any skill invoke it? | **no** — both inbound references are prose, not invocations |
| inbound references | **2** — `verify/SKILL.md:540` ("Related" pointer) and `.claude/rules/features.md:174` ("When filed from `/sim`, also include:") |
| output files currently present | **1**, dated **2026-02-27** (`.private/sim/p422-p425-20260227.md`). `.private/` is gitignored, so this is a present-state count, **not** a lifetime count |
| runtime dependencies | Chrome MCP + founder-granted browser permissions |

**Complication:** `/sim` is occasionally cited as a UX control. The real gap is narrower than
previously filed: it *can* express a blocking severity, but **nothing invokes it**, and it needs
a permission grant the unattended loop cannot obtain. A control nothing calls is not a control.

**Question:** give it a caller, or retire it?

## Appetite

Low blast radius on the source; **not** low on coverage — retiring a UX gate lets defects it
would have caught escape, and that is not reversed by reverting the commit. Medium decision
density — retiring a skill is a founder call.

## Solution

Do not decide on usage counts, and do not decide on token-presence either (that is the error
this spec previously made). Two measurements, both required before the decision:

**M1 — capability probe (seeded defect).** Plant a known core-flow break in a UI feature, run
`/sim` against it, and record whether it produces a Tier A finding and an explicit stop
condition. This tests the behavior, not the label.

**M2 — value probe (isolated arms).** Run the same spec with and without the step. `goal-gate.sh`
keys its evidence by P-number, so a naive re-run shares reviewer history and prior fixes between
arms and measures run order, not `/sim`. Both arms must therefore start from the **same commit**,
write to **distinct evidence directories**, and use **identical contracts and reviewer prompts**.

**Oracle:** independently confirmed escaped defects across functional, state, privacy and UX
categories. Reviewer-round count is a **secondary cost measure only** — `goal-gate`'s rounds judge
screenshots (`goal-gate.sh:346`), which cannot observe most of what `/sim` covers (interactive
flow, state loss, browser failure), so a tie there is not evidence of no value.

**Decision rule, predeclared before either arm runs:** write it into this spec before measuring,
not after reading the results.

If retired, follow the archiving checklist in `.claude/rules/skills.md` and update **both**
inbound pointers.

## Risks / Non-Goals

- **Do NOT** retire `/ux` or `/ui` under this spec. They are **unmeasured, not proven dead** —
  `pick-flow` only routes `/ux` when "users will see something new", and bugs outnumber
  stories in the corpus, so low use is largely correct routing.
- **Do NOT** cite `/sim` as a control in any doc while nothing invokes it.
- **Do NOT** infer capability from the presence or absence of a literal token. Seed the condition
  and observe the behavior.

## Done-When

- [ ] **M1 run and recorded:** seeded core-flow defect, `/sim` output pasted, stating whether a
      Tier A finding and stop condition were produced
- [ ] **M2 run and recorded:** both arm artifacts present, same base commit named, distinct
      evidence directories named, escaped-defect counts per category pasted for each arm
- [ ] **Decision rule was written before the results** — quoted here, with the commit that added it
- [ ] `/sim` is either invoked by at least one skill, or archived with `archived_reason` per
      `.claude/rules/skills.md`
- [ ] Every dependent has an explicit update-or-retain disposition. Search
      `.claude/commands/ .claude/rules/ docs/ features/ CLAUDE.md` for the exact token, output
      pasted (note: `/simplify` and `/simpler` are substring false positives; exclude them).
      Grep establishes the file list; a human/agent judgment establishes "no remaining claim
      that it is a control" — grep cannot decide that
- [ ] The decision and its evidence are recorded in `docs/decisions.md`

## Context

Filed while executing the `/goalify` plan (2026-08-19). The plan claimed **zero** inbound
references; the count is **two**, and the plan's grep was confounded by `/simplify` matching the
same prefix.

**Adversarially reviewed 2026-09-01 (Codex, verified against the repo).** The original filing was
substantially wrong and would have retired a working gate:

- It concluded `/sim` "cannot emit a blocking finding" from **0 occurrences of the token
  `BLOCKER`**. False — `sim.md:124` and `sim.md:222` both define blocking behavior under the
  spelling `high` / Tier A. The probe scored a label, not the behavior.
- Its own correction of the plan's reference count was itself undercounted: **2**, not 1, and the
  cited line had already drifted (531 → 540).
- "One output ever" overstated a gitignored present-state count as lifetime evidence, and misdated
  it by a day (2026-02-28 → 2026-02-27).
- Done-When permitted archiving with no measurement at all, so the "measure first" title was prose
  rather than a gate — every box could tick without either arm running.

The corrected question is not "is `/sim` dead" but "`/sim` can block; nothing calls it — add a
caller, or retire it on cost grounds?"
