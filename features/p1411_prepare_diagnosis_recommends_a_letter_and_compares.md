---
status: backlog
type: story
rank: 314
workstream: events
created_date: '2026-10-04'
tags: [prepare, onboarding, letters, compare]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1411: /prepare's diagnosis recommends a letter, then compares positions

## Problem

`/prepare` (P1402) ends its fourth step with the visitor's positions on the `misunderstanding`
statements, and then nothing uses them.

> Founder, verbatim (2026-10-04): *"we can add the misunderstanding diagnosis … and based on
> there is a recommendation which letter to do … and then we do the comparison."*

Verified 2026-10-04: no code maps misunderstanding positions to a letter (grep for "recommend" in
`src/app` with letters/templates: none). The comparison exists as P1337's `/compare/:person`
(statements both people answered, largest gap first), built on `feature/p1337-round-controls` and
at `qa`, **not shipped**.

## Appetite

Blast radius: low to medium (new steps after the diagnosis). Reversibility: high. Decision density:
many (the recommendation rule is a founder decision, not an inference).

## Solution

1. After the diagnosis, recommend one Clarity Letter based on the answers.
   [FOUNDER DECISION: the rule, i.e. which answers point to which letter.]
2. Then offer a comparison of the visitor's positions with someone, reusing P1337's
   `/compare/:person`.
   [FOUNDER DECISION: compare with whom: the founder, the AI agents, or a person the visitor invites.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The comparison step lands before P1337 ships | DEFER | Unblocked by `/ship p1337` |

**Non-Goals**
- Do NOT invent the recommendation rule; it comes from the founder.

## Acceptance Criteria

- [ ] After the diagnosis on `/prepare`, the visitor sees one recommended letter, following the founder's rule
- [ ] The visitor can open a comparison of their positions with the chosen counterpart

## Related

- [P1402](p1402_standalone_prepare_page.md) · [P1337](p1337_event_journey_on_screen_steps_rotation_and_ending.md) · [P1003](p1003_three_minute_alignment_audit_funnel.md)
