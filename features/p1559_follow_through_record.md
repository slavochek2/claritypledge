---
status: backlog
type: story
rank: 323
workstream: clarity-chat
created_date: '2026-10-23'
tags: [clarity-chat, follow-through, clarity-ledger]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1559: Clarity Ledger counts: recognising who follows through

> **PLACEHOLDER spec.** Captures the idea and the rulings it builds on. Do NOT design the build until
> discovery calls with change leads (P1558's outreach) have tested the need.

## Problem

**Situation:** H-ChatFollowThrough (hypotheses.md, 2026-10-23, UNTESTED) says the pledge's
follow-through becomes visible in chat. Group members say yes to the Clarity Meeting Principle and the
Clarity Group terms. The Understanding Ledger was scoped on 2026-07-24 as completion counts and
progress, and was never built; per-card history moved to P1496.
**Complication:** A change lead wants to see an agreed change being carried, and a team wants to
recognise the people who carry it. Nothing shows that today.
**Question:** What does the ledger's count view show a person and a team, so that answering is
recognised?

> Founder framing, verbatim (2026-10-23): "who said yes to Clarity Meeting Principle, Clarity Group terms? Because then follow-through means answering Clarity Chat or answering Clarity letters."
> "it's about rewards ... for praising, we don't need to see who is not following through, but seeing who follows through."

## Appetite

Blast radius: one flow (group chat), and it sets how every later team view presents people.
Reversibility: medium. Decision density: a few.

## Invariants

- **Counted against a yes the person gave themselves.** Only people who said yes to the terms appear.
- **Recognition only.** The view shows who answered and what they answered. Nothing else about people.
- **Counts, not scores.** No ranking and no public score (decisions.md 2026-10-22 [product]; calibration
  stays in-team only). Entries are frozen events, as in the 2026-07-24 ledger ruling.

## Solution (direction only)

The Understanding Ledger's v1 count view (decisions.md 2026-07-24), at group level. Each person sees
their own record: when they said yes to the terms, and the chats and letters they answered. The team
sees who answered.

[FOUNDER DECISION: the team sees names of who answered, or a total only ("4 answered this week").]
[FOUNDER DECISION: what counts as answered: any reply, setting a position, or answering a letter.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Teams want terms chosen together, not handed down | DEFER | Ask change leads in discovery calls how their teams agree on terms |
| Answering is counted but the change itself still lags | ACCEPT | Answering is an early signal; P1558 presents it as that |

**Non-Goals**
- Do NOT build manager dashboards or exports.
- Do NOT score calibration here (H-CalibrationPredicts owns that, in-team only).
- Do NOT rebuild per-card history (P1496).

## Done-When

- [ ] Both founder decisions above are recorded, informed by at least 5 discovery calls.
- [ ] The spec is expanded into a buildable Solution with Acceptance Criteria, or archived if the calls show no need.

## Related

- decisions.md 2026-07-24 [product] (Understanding Ledger v1 = completion counts); [P1459](archive/p1459_clarity_chat_clarity_ledger.md) (rejected, superseded by P1496); [P1496](p1496_clarity_chat_card_history_in_details.md) (history on cards).
- [P1558](p1558_change_leads_use_case_page.md): use-case page whose copy follows this spec.
- hypotheses.md H-ChatFollowThrough, H-CalibrationPredicts; decisions.md 2026-10-23 [product], 2026-10-22 [product].
- [P1437](p1437_conversation_groups_agents_check_understanding.md): conversation groups.
