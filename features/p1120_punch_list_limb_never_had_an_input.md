---
status: backlog
type: task
rank: 99
created_date: '2026-08-19'
tags: [critique-ux, polish, dead-limb, skills, measurement]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1120: /polish reads a spec section that has never existed in any spec

## Problem

**Situation:** `/critique-ux` is documented as producing a `## Punch List`, which `/polish`
then consumes.

**Complication:** verified this session — `grep -rl '## Punch List' features/` returns
**zero** files. Across the entire spec corpus, past and present, the section has never been
written. The hand-off exists only in conversation, which means `/polish` has never once run
on its documented input, and no record of any punch list survives a session.

**Question:** give the limb a real input, or remove it?

## Appetite

Low blast radius (two skill files). Fully reversible. Low decision density.

## Solution

Either make `/critique-ux` write `## Punch List` into the spec file (so the input is durable
and greppable), or delete the hand-off from both skills and say plainly that the critique
output lives in conversation only.

Prefer writing it to the spec: a learning loop with no recorded history starts empty, and
this is the same failure the `/goalify` `feedback.md` instrument exists to avoid.

## Risks / Non-Goals

- **Do NOT** retire `/critique-ux` or `/polish` on usage counts alone. Nothing here has ever
  been *scored* — low use can be correct routing, which is exactly the trap `/ux` and `/ui`
  fell into. Measure before retiring.
- **Do NOT** invent a new section name; `## Punch List` is already the documented one.

## Done-When

- [ ] Either `grep -rl '## Punch List' features/` returns at least one real spec after a
      `/critique-ux` run — output pasted — or neither skill mentions the section
- [ ] If kept: `/polish` is run once against a real written punch list, and its output pasted
- [ ] The choice is recorded in `docs/decisions.md`

## Context

Filed while executing the `/goalify` plan (2026-08-19). This is the clearest instance of the
plan's general finding: a pipeline control whose input only ever existed in conversation
cannot accumulate evidence, so it can never be evaluated and never improves.
