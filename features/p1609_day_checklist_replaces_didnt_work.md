---
status: week
type: story
rank: 88
workstream: infrastructure
created_date: '2026-11-04'
tags: [day, ux, process]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: high
driver: founder
---

# P1609: The Day page has one to-do list; Status becomes a checklist that says where each problem went

## Problem

**Situation:** The Day page opens with a Status panel. Its "Didn't work (N)" list sits above the cards, and P1463 made it the index of what failed.
**Complication:** On the 2026-11-04 run all 9 non-ok checks already had a card, so the list repeated the to-do list with less information. "Open card" appears only when the card is in the current queue (`toCard`, `DailyReport.tsx`), so a check whose card was answered, sent to the agent or parked shows a dead row. Ops alerts looked card-less for that reason. P1463's falsifier fired: the founder opens the panel to work out what to do and cannot.
**Question:** What does the founder need from a check that did not pass?

> Founder, verbatim: "what didn't work is either an action item for me or for an agent or it worked so we just need the checklist"

> Founder, verbatim: "expand is on the left but collapse is on the top right ... if i go down and ask and work with my answer in the cards then i need to go up and collapse"

**The logic this spec makes true:** a check has exactly one outcome, and every outcome has one home.

| Outcome | Home | Checklist row says |
|---|---|---|
| Passed | nowhere else | `✓ label` |
| Needs the founder | a card in the queue | `Your card ›` |
| Sent to an agent | agent list | `With the agent` |
| Waiting, parked, accepted | their sections | `Waiting` / `Parked` / `Accepted` |
| Answered today | the answered card | `You chose ›` |
| Check crashed or timed out | its own card, as any failing check | `Your card ›` or `With the agent` |
| No destination (a defect) | the summary line and the row | `No card: report this` |
| Skipped by design | nowhere else | `Skipped`, with its reason |
| Broken connection | a card or row with its Fix | `Fix ›` |

## Appetite

One `/dev` cycle in `tools/kanban`. No change to how `/day` collects checks or writes cards.

## Solution

1. **Remove the "Didn't work" list.** Keep P1463's reason for it (an index of what failed; hiding checks was rejected in round 1) by moving that index into one checklist: problems first, then passes.
2. **Every non-passing row states its destination** from the table above, and is a link when that place is on screen. No row is ever without one.
3. **A non-passing check with no destination is a defect shown as such:** the row reads `No card: report this`, and a test fails if the view builder can produce it for a report whose check has a card.
4. **The summary line counts destinations, not failures:** `{n} for you · {m} with the agent · {k} clean`, plus `waiting`, `parked`, `skipped` or `{n} with no card` when above zero, so a defect is visible with the list closed. New people and unpushed chips stay.
5. **The checklist moves below the cards and the agent work,** collapsed by default. One toggle with one position: the summary line itself, left triangle, which stays at the head of the open list. The top-right `Collapse` link goes. Working a card never requires scrolling up to close anything.
6. **Broken connections keep their Fix action** inside the checklist row, and the summary line gains `{n} to reconnect` so they are not hidden by the fold.

## Risks / Non-Goals

- **Risk:** a problem with no card is hidden by the fold. Mitigated by item 3 and the summary line.
- **Risk:** existing e2e-day tests pin the P1463 wording. They describe the superseded design, so updating those assertions is part of this spec, and only those.
- **Non-goal:** card text, the card pager, the `/day` skill, the terminal card's wording (`day-render.ts`).
- **Non-goal:** merging the several cards one check can produce. The row shows the destination that most needs someone, in this order: your open card, no destination, with the agent, waiting, parked, accepted, answered. It adds `+N more` when the check has further cards.

## Done-When

- [x] No "Didn't work" heading or `Collapse` link exists on the page.
- [x] Rendering the real 2026-11-04 report: all 9 non-ok checks show a destination, and cp.ops shows a live destination whether its card is open, answered or sent.
- [x] Summary counts equal the rows they describe, for that report and for one with zero problems.
- [x] The checklist renders after the cards; one toggle opens and closes it, and it stays in place when opened.
- [x] A failing control: a fixture check with no card renders `No card: report this`.
- [x] Screenshots at desktop, 375px and 320px pass `.claude/rules/visual-qa.md`, judged by a separate reviewer.
- [ ] `/kdd` entry supersedes the Status layout in the 2026-10-12 P1463 decision.
