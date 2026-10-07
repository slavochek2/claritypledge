---
status: week
type: story
rank: 23
workstream: tooling
created_date: '2026-10-07'
tags: [kanban, day-page, ux, reflection]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1435: Day page — see what needs you and decide without scrolling

## Problem

**Situation:** P1432 added a list of every card, with its state, above the Daily report's decision card. The Reflection tab shows one statement at a time with no overview.
**Complication:** At 1280×720 the 16-row list fills the viewport and the decision card starts about 1000px down (screenshot, 2026-10-07). The founder sees progress but has to scroll to act. On Reflection they cannot tell which statements they have already rated.
**Question:** How should both tabs lay out so the founder sees what still needs them, decides, and moves on without scrolling?

> Founder, verbatim: "I want to go quickly see what is, make a decision and go forward. And now I see a huge amount of progress. I need to scroll down and then read." / "in reflection I should do similar thing … if something is resolved or not … because I'm not sure if I resolve them or not."

The founder delegated the design calls: "I trust you to make decisions."

## Appetite

Blast radius: one page of the local kanban (the Day page). Reversibility: git revert. Decision density: zero (delegated).

## Solution

1. **Daily report, wide:** master-detail. The card list sits in a left column that is sticky and scrolls on its own; the card sits on the right. The card's title and options are above the fold.
2. **Narrow:** the list folds to a one-line summary above the card. The summary leads with what still needs the founder.
3. **Reflection:** reuses the same list. Each statement shows its position word, or "Not rated". Clicking a row jumps to that statement.
4. The layout is decided by the width of the issues area (a container query), so an open status panel never squeezes the card.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Sticky list collides with the sticky bottom bar | MITIGATE | List max-height leaves room for the bar |
| e2e tests assert the old list position | MITIGATE | Update only assertions the spec supersedes |

**Non-Goals:** do NOT change what is written or when (paging never writes, P1432). Do NOT add browser storage. Do NOT add bulk accept. Do NOT change the Stats or Monitoring tabs.

## Acceptance Criteria

- [ ] At 1280×720 the Daily report card's title and first option are visible without scrolling, and so is the card list
- [ ] At 1280×720 the Reflection statement and its position buttons are visible beside a list of every statement
- [ ] Each Reflection row shows the position word, or "Not rated"; clicking a row opens that statement
- [ ] At 375 and 320 px both lists fold to one line that says how many still need you; there is no horizontal scroll
- [ ] Existing day unit and e2e tests pass; new e2e tests cover each criterion above

## Related

- RELATED: P1432 (card list + states), P1399 (Day page). Rulings honoured: decisions.md 2026-10-07 (P1432).
