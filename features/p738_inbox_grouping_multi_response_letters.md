---
status: backlog
type: story
rank: 1000738.0
created_date: '2026-04-17'
tags: [letters, inbox, ux, grouping, threading]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P738: Inbox grouping for multi-response letters

## Problem

**Situation:** When a user sends a letter and multiple people respond, each completion creates a separate row in the sender's inbox. Six responses = six inbox rows for the same letter. The inbox becomes a notification dump instead of a thread view.

**Complication:** The sender's mental model is "my letter X got responses" — one unit of focus. Inbox shatters this into N rows per letter, making scanning harder the more popular a letter becomes. Sent tab already groups responses under the letter; inbox is inconsistent.

**Question:** How do we group inbox rows by letter for the sender's branch (completion responses) without breaking the per-respondent Results navigation?

## Appetite

Medium blast radius. `get_inbox_items` DB function + `inbox-tab.tsx` rendering. Also requires a UX decision on grouping pattern. Reversible by re-running the flat-version migration. Medium decision density — grouping strategy is the key call.

## Solution

[FOUNDER DECISION: grouping strategy]. Options explored during P725 refinement:

- **A) Flat (status quo)** — 1 row per delivery. Noisy for N>2.
- **B) Aggregate roster** — 1 row per letter in inbox. Tap opens a new `/letter/:id/results` roster page listing all respondents; each row opens that respondent's results. Requires new roster page.
- **C) Latest + badge** — 1 row per letter showing the most recent completer's name. Tap → that delivery's results. `+N` chip opens Sent tab or roster.
- **D) Flat + cap** — Show latest 2 per letter; "See N more in Sent" link for older ones.

Recommendation during P725: **C** (latest-response row + N badge) — preserves tap contract, minimal DB changes, reads well at any N.

Data required before implementing: how often do letters receive > 2 responses in a week? If <5% of letters, option A stays. If >20%, grouping is urgent.

## Risks / Non-Goals

### Risks
- **Changing inbox semantics mid-flight** — users who memorized the flat pattern may be briefly confused. Mitigation: ship without a tooltip unless data suggests otherwise.
- **Scale** — if one letter gets 50+ responses, even grouped we need pagination or truncation in the roster view.
- **Notification freshness** — "latest response" row must re-sort when a newer response arrives. Poll/realtime logic must update correctly.

### Non-Goals
- No changes to received-letter branch (incoming letters are 1:1 and don't group).
- No roster page UX until an option is picked (may not need one if C is chosen).
- No retroactive inbox history migration — grouping applies to current state, not historical rows.

## Done-When

- [ ] Grouping strategy decided (founder)
- [ ] Inbox row count for a sender matches letter count (for chosen strategy)
- [ ] Tap contract preserved — Results navigation still works per delivery
- [ ] Multi-response test case: letter with 6 responses shows as expected number of rows per the strategy
- [ ] Mobile + desktop visual QA
