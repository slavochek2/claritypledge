---
status: backlog
type: story
rank: 323
workstream: clarity-chat
created_date: '2026-10-23'
tags: [clarity-chat, follow-through, commitment-device]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1559: Follow-through record: who said yes to the terms, and who answers

> **PLACEHOLDER spec.** Captures the idea, its boundary and the rulings it must respect. Do NOT
> design the build until discovery calls with change leads (P1558's outreach) have tested the pain.

## Problem

**Situation:** H-ChatFollowThrough (hypotheses.md, 2026-10-23, UNTESTED) says the pledge's
follow-through becomes visible in chat. Group members opt into the Clarity Meeting Principle and the
Clarity Group terms. Nothing shows a person or a team whether those who said yes then answered.
**Complication:** A change lead's value is seeing that an agreed change is being carried, and the
commitment device needs that visibility to count. But a record of who answered can read as employee
surveillance, the same trust-floor mismatch that demoted the therapist segment (lean-canvas.md).
**Question:** What does a follow-through record show, to whom, so that it rewards answering without
exposing who did not?

> Founder framing, verbatim (2026-10-23): "who said yes to Clarity Meeting Principle, Clarity Group terms? Because then follow-through means answering Clarity Chat or answering Clarity letters."
> "it's about rewards. It's not about punishment ... for praising, we don't need to see who is not following through, but seeing who follows through."

## Appetite

Blast radius: one flow (group chat), but sets a visibility norm every later team feature inherits.
Reversibility: medium (once a team has seen names, unseeing is not possible). Decision density: many.

## Invariants

- **Only people who opted into the terms are counted.** Follow-through is defined against a yes the
  person gave themselves.
- **No ranking of people, no public score** (decisions.md 2026-10-22 [product]: a public reputation
  score was rejected as gameable and a surveillance object; calibration stays in-team only).
- **Praise only.** Nothing lists who did not answer.

## Solution (direction only)

Each person sees their own record: when they said yes to the terms, and the chats and letters they
answered. The team sees follow-through as praise (who answered), never a gap list.

[FOUNDER DECISION: does the team see names of those who answered, or only a count? In a group of six,
"4 of 6 answered" exposes the other two by subtraction, so even a count is not neutral.]
[FOUNDER DECISION: what counts as "answered": any reply, setting a position, or answering a letter.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Absence is inferable from praise in small groups | MITIGATE | First founder decision above; test wording in discovery calls |
| A manager imposes the terms, so the yes is not free | DEFER | Ask change leads in discovery calls whether teams would accept terms |
| Answering is counted but the change still does not happen | ACCEPT | Answering is a leading signal; P1558 must not claim more |

**Non-Goals**
- Do NOT build manager dashboards or exports.
- Do NOT score calibration here (H-CalibrationPredicts owns that, in-team only).

## Done-When

- [ ] Both founder decisions above are recorded, informed by at least 5 discovery calls.
- [ ] The spec is expanded into a buildable Solution with Acceptance Criteria, or archived if the calls refute the pain.

## Related

- [P1558](p1558_change_leads_use_case_page.md): use-case page whose copy must follow this spec.
- hypotheses.md H-ChatFollowThrough, H-CalibrationPredicts; decisions.md 2026-10-23 [product], 2026-10-22 [product].
- [P1437](p1437_conversation_groups_agents_check_understanding.md): conversation groups.
