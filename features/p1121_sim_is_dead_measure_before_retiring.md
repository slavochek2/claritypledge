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

# P1121: /sim is dead — rebuild or retire it, but measure first

## Problem

**Situation:** `/sim` is a persona-based UX exploration skill. Measured this session:

| signal | measured |
|---|---|
| `BLOCKER` in `sim.md` | **0 occurrences** — severity is high/medium/low, so it cannot emit a blocking finding |
| output files ever produced | **1**, dated 2026-02-28 |
| inbound references from other skills | **1** — `verify/SKILL.md:531`, a "Related" pointer, not an invocation |
| runtime dependencies | Chrome MCP + founder-granted browser permissions |

**Complication:** `/sim` is occasionally cited as a UX control. It cannot be one: it has no
blocking severity, one lifetime output, no skill invokes it, and it needs a permission grant
the unattended loop cannot obtain. Citing it as a control overstates the pipeline's coverage.

**Question:** rebuild it with a blocking severity and a caller, or retire it?

## Appetite

Low blast radius. Reversible. Medium decision density — retiring a skill is a founder call.

## Solution

Do not decide on usage counts. Now that `scripts/goal-gate.sh` exists, "run the same spec
with and without a step and see which reaches green in fewer reviewer rounds" is a bounded
experiment rather than an argument. Run that once, then decide.

If retired, follow the archiving checklist in `.claude/rules/skills.md` and update the one
inbound pointer at `verify/SKILL.md:531`.

## Risks / Non-Goals

- **Do NOT** retire `/ux` or `/ui` under this spec. They are **unmeasured, not proven dead** —
  `pick-flow` only routes `/ux` when "users will see something new", and bugs outnumber
  stories in the corpus, so low use is largely correct routing.
- **Do NOT** cite `/sim` as a control in any doc until it can block something.

## Done-When

- [ ] `/sim` is either invoked by at least one skill and able to emit a blocking severity, or
      archived with `archived_reason` per `.claude/rules/skills.md`
- [ ] `grep -rn '/sim' .claude/commands/ docs/` shows no remaining claim that it is a control
      — output pasted (note: `/simplify` and `/simpler` are substring false positives; exclude them)
- [ ] The decision and its evidence are recorded in `docs/decisions.md`

## Context

Filed while executing the `/goalify` plan (2026-08-19). The plan claimed **zero** inbound
references; the real count is **one** (`verify/SKILL.md:531`) — the plan's grep was confounded
by `/simplify` matching the same prefix. The conclusion is unchanged; the number is corrected.
