---
status: week
type: story
rank: 23
workstream: tooling
created_date: '2026-10-07'
tags: [kanban, day-page, ux, reflection]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

- [x] At 1280×720 the Daily report card's title and first option are visible without scrolling, beside the card list — e2e `1280x720: the card title, its first option and the card list…` (fixture). On the founder's real run (long Point A/B text) title, state, A/Obstacle/B and the recommended option's label are visible; that option's lower edge sits under the bottom bar, so a long card still needs a few px of scroll.
- [x] At 1280×720 the Reflection statement and its position buttons are visible beside a list of every statement — e2e `Reflection: a list beside the statement…`; real run screenshot
- [x] Each Reflection row shows the position word, or "Not rated" (Unsure = 0 is a position); clicking a row opens that statement — same e2e
- [x] At 375 and 320 px both lists fold to one line that says how many still need you; a pick folds it again; no horizontal scroll — e2e `375px/320px: both lists fold…`; scrollWidth checked on the real run at 375 and 320
- [x] The page opens on the first card, and the first statement, that still needs the founder; opening writes nothing — e2e `the page opens on the first card that still needs you`
- [x] Existing day unit and e2e tests pass: e2e 106/106, kanban vitest 335/335, eslint clean. Known-bad controls: with the side-by-side rule and the landing disabled, the three wide/landing tests fail. Three P1432 tests that reloaded and read "the card" now open card 1 from the list (landing changed by this spec).

## Related

- RELATED: P1432 (card list + states), P1399 (Day page). Rulings honoured: decisions.md 2026-10-07 (P1432).
