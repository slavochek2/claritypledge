---
status: qa
type: story
rank: 334
workstream: tooling
created_date: '2026-11-13'
tags: [kanban, day, ux, insights]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
spec_review_hash: 114fdf3b16035e41512c86ba6e5e397caa11e0438286337c0c9296c07b141cde
spec_review_vendors: [gemini, openrouter]
---

# P1673: Day page shows weekly insights as normal finding cards (one card type)

## Problem

**Situation:** The Daily report has two kinds of card. Since P1669 (shipped 2026-11-13), weekly product insights from the P1640 read appear at the top as separate cards with their own layout: Numbers / Base / Comparison / Confidence / Next step, then **Confirm**, **Dismiss** and a **Where to look** link (`tools/kanban/src/components/day/InsightCards.tsx`). Below them, every other finding uses the normal card: Point A / Obstacle / Point B, a collapsed **More info**, and numbered choices (**Give to the agent**, **Park**, **Your answer or question…**) with the sidebar list and keyboard shortcuts.
**Complication:** The founder can't tell what to do with the insight cards, and handling cards two different ways on one page slows every daily review.
**Question:** How do we show insights in the normal finding card without losing what the insight ledger records?

> Founder, verbatim (2026-11-13): "I have like two ways of handling cards now in the daily report… I think there should be like one experience and not like two kinds of experiences. Now we have two cards, this Confirm Dismiss cards and Normal cards… And the other one is a weird card that I don't know what to do. It should be like one kind of card. I don't understand it." Then: "ok lets consolidate then!"

Screenshots: founder's Screenshots folder, 2026-11-13 14:02 (insight cards) and 14:03 (normal card).

## Appetite

Blast radius: low. One panel of the local kanban Day page, and only the founder uses it. Reversibility: git revert. Decision density: zero. The founder chose one card type and left the wording to the agent.

## Invariants

- Every confirm or dismiss choice on an insight still writes the P1640 insight ledger with that value (same `postWeeklyDecision` route), and a dismissed insight still does not come back on the next weekly read (P1640 Done-When; P1669 Solution 5). The P1640 "keep the insights?" criterion counts confirmations, so a decision must never be dropped or changed in meaning.
- The ledger stays outside the repo (P1640 storage ruling: it may name people).

## Solution

Show each undecided insight as a normal finding card in the same list, with the same layout, keyboard handling and sidebar entry as other findings. Drop the separate insight block.

- **Point A:** what happened and how many, e.g. "102 dead clicks this week, first week it is raised".
- **Obstacle:** "Not yet known whether this is a real user problem" (confidence included).
- **Point B:** the insight's own next step (`next_step`, which differs by insight type), e.g. "Open the linked replay or report and decide whether it is a real user problem".
- **More info:** base, comparison, confidence, the "seen N times before" pattern, and the Where to look link (omitted when the insight has no safe link, as today).
- **Choices:** exactly three. (1) records *confirm*, (2) records *dismiss*, (3) the usual free-text answer. Confirm only records confirm; it does not also queue work for the fixing agent (a confirmed insight can be raised as a finding later, as today). A free-text answer is saved the way any finding's answer is saved and survives reload; it writes nothing to the insight ledger, so the insight card stays in the list until confirmed or dismissed.
- **Where and when:** insight cards sit at the start of the findings list (where the block is today), carry a "Weekly insight" tag, and do not count toward the day's "today N of M" totals. They show only on the latest Day run, matching today's behaviour; older runs show none.
- **Failures keep today's behaviour:** a failed load still shows one quiet "Insights could not load" line (never the same as having nothing to decide); a failed save keeps the card, shows the error, and allows a retry; a second press while a save is in flight does nothing.

Choice wording: "Real problem" and "Not a problem" (founder 2026-11-13: "Just unify it, make it use what we already have", wording left to the agent).

This partly reverses P1669 Solution 5 ("The cards keep Confirm and Dismiss"). The ledger semantics stay; only the controls change, at the founder's request (above).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A choice is mapped to the wrong ledger value (confirm vs dismiss) | MITIGATE | Test each choice against the ledger write |
| Insights mixed into findings change the "today N of M" counts or the sidebar order | MITIGATE | Insights are tagged, excluded from the counts and listed first; tests assert all three |
| Free-text answers on an insight write nothing to the ledger | ACCEPT | Same as any finding's answer; the insight stays undecided until confirmed or dismissed |

**Non-Goals**
- Do NOT change the weekly read script, its gate, or how insights are generated (P1640).
- Do NOT change the ledger format or where it is stored.
- Do NOT redesign the normal finding card. Insights adopt it as it is.

## Acceptance Criteria

- [x] The Daily report shows no separate insight block. Each undecided insight appears as a normal finding card with Point A / Obstacle / Point B, More info, and numbered choices
- [x] Choosing the "real" option sends a confirm to the insight ledger and choosing the "not a problem" option sends a dismiss (each checked in a test against the decision route); the card then leaves the list
- [x] Point B shows the insight's own next step, and More info shows base, comparison, confidence, the repeat pattern and Where to look (when a link exists)
- [x] A free-text answer on an insight is saved, survives reload, and leaves the insight card in the list
- [x] Insight cards are listed first, tagged "Weekly insight", and not counted in the day's totals
- [x] A failed load shows "Insights could not load"; a failed save keeps the card with an error and can be retried; a double press sends one decision
- [x] Insight cards work with the same keyboard shortcuts and sidebar list as other findings
- [x] When there are no undecided insights, nothing extra is shown
- [x] Browser check at desktop and 375px confirms one card style on the page

## Related

- P1669: moved insights to /day as cards (the ruling partly reversed here)
- P1640: weekly insight read and ledger (invariants above)
