---
status: week
type: story
rank: 28
workstream: infrastructure
created_date: '2026-10-12'
tags: [day-page, kanban, ux, attention]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1463: Day page attention pass — one place per problem, a count you can see

## Problem

**Situation:** The Daily report (`tools/kanban`, `/day` → Daily report tab) shows three columns: Status (summary, Connections, New people, all 29 checks with raw checker strings), a card list, and the open card. A bottom bar carries the pager, a "Cards X of N resolved" progress bar, and `Start fixing (N)`.
**Complication:** On the 2026-10-12 run the founder annotated two screenshots:

> "too much info at once? ideas?" — and — "only two cards but says 23?"

Verified causes: (1) the same Beeper problem appears three times — Connections row, "Events calendar refresh" check, and the card; (2) the Start fixing number is `collectedCount + queuedLocally` (`DayPage.tsx:471`), which includes ~21 agent-work items whose only display is a collapsed "With the agent (N)" list below the fold (`DailyReport.tsx:609`), so the number matches nothing on screen and rose after an answer; (3) a re-reported card reads "Answered before" with an empty circle, which looks done.
**Question:** Make the page cost less attention: each problem once, every number backed by something visible.

> Founder framing, verbatim: "drive it crieuqe if needed then irmpve - optmize for my attneiton and usab iltiy"

## Appetite

Blast radius: one page (the founder's Day report). Reversibility: git revert. Decision density: low — the founder approved the proposal below in conversation ("ok").

## Solution

Approved proposal (2026-10-12 conversation):

1. **Status becomes one line** above the list+card, replacing the left column: `{n} OK ▸ · {m} problems without a card · {connection problems with Fix}`. `{n} OK ▸` expands the full checks list inline (nothing becomes unreachable). The page goes from three columns to two, and the card gains the width.
2. **A check that already has a card is not listed separately** — each problem appears once.
3. **Problem checks without a card** appear under the card list ("Problems") as one plain-language line each.
4. **The agent work is visible next to the button**: the bottom bar shows `Agent will also do {k} tasks ▸`, opening the With-the-agent list; the button's count is explained by what sits beside it (founder answers + agent tasks), never an unexplained number.
5. **Re-reported cards** read `Back again` with an amber marker instead of "Answered before" + empty circle.
6. **Drop the "Cards X of N resolved" progress bar** — the list's ✓ marks already carry progress.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A problem check without a card disappears from view | MITIGATE | Point 3 lists them; point 1 keeps every check one click away |
| P1399/P1435 tests pin the old layout (status panel, agent line position, `Start fixing (N)` text) | MITIGATE | Update intentionally, cite this spec in the test; never weaken an invariant listed below |
| Card↔check matching is fuzzy (a check and a card about the same issue may share no id) | MITIGATE | Use an explicit link the data already has if one exists; otherwise leave the check visible — a duplicate is better than a hidden problem |

**Non-Goals**
- Do NOT change what Start fixing sends, the ledger, or the prompt.
- Do NOT change the card's content (Point A / Obstacle / Point B / options).
- Do NOT touch the Stats, Monitoring, Reflection tabs beyond what moving the checks list requires.

## Invariants

- No inner scroll areas (P1399, test-enforced).
- Paging never writes; Accept writes at once (P1432).
- On first load the page opens on the first open founder card (P1435).
- Every problem visible today is still reachable in ≤1 click.

## Acceptance Criteria

- [ ] On a run with founder cards and agent work, the page has no left Status column; one status line sits above the list+card.
- [ ] A problem that has a card appears once (as its card), not also as a check row.
- [ ] A problem check with no card is shown as one line under the card list.
- [ ] `{n} OK ▸` expands the full checks list.
- [ ] The bottom bar shows `Agent will also do {k} tasks ▸`, where k equals the With-the-agent list length; clicking it shows the list.
- [ ] The button's number (if shown) equals answers queued + k, with both parts visible on screen.
- [ ] A re-reported card shows `Back again` with an amber marker.
- [ ] No "Cards X of N resolved" bar.
- [ ] Visual QA passes at 1280×720, 375px and 320px (`.claude/rules/visual-qa.md`), by a separate subagent.
- [ ] Day e2e suite and server tests pass; changed assertions cite P1463.

## UI Contract

- Status line: `{n} OK ▸ · {m} problems without a card · {Name} disconnected [Fix]` (zero segments omitted).
- Agent link: `Agent will also do {k} task(s) ▸`.
- Re-reported label: `Back again`.

## Related

P1399 (day report by who acts), P1432 (answered state), P1435 (list beside card), P1445 (agent work as a list).
