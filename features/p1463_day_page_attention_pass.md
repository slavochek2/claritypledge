---
status: qa
type: story
rank: 28
workstream: infrastructure
created_date: '2026-10-12'
tags: [day-page, kanban, ux, attention]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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

1. **Status becomes one line** above the list+card, replacing the left column: `{n} worked ▸ · {m} problems without a card · {connection problems with Fix}`. `{n} worked ▸` expands the full checks list inline (nothing becomes unreachable). The page goes from three columns to two, and the card gains the width.
2. **A check that already has a card is not listed separately** — each problem appears once.
3. **Problem checks without a card** appear under the card list ("Problems") as one plain-language line each.
4. **The agent work is visible next to the button**: the bottom bar shows `Agent will also do {k} tasks ▸`, opening the With-the-agent list; the button's count is explained by what sits beside it (founder answers + agent tasks), never an unexplained number.
5. **Re-reported cards** read `Back again` with an amber marker instead of "Answered before" + empty circle.
6. **Drop the "Cards X of N resolved" progress bar** — the list's ✓ marks already carry progress.

### Round 2 — text pass (founder, mid-build)

> Founder framing, verbatim: "is all the text needed? I mean, something that is redundant or can be visual or can be smaller or different, more understandable … we have a lot of text generally in this interface"

An adversarial copy/visual review (screenshots only, no code) went string by string over the built page. Folded in:

7. **Status line is chips, not a sentence** — no `·` separators to dangle when it wraps; Fix sits beside its amber chip.
8. **One word for one number** — the line and the panel both say `{n} worked`; the panel's `Checks · 30` total, which matched nothing visible, is now `Checks`.
9. **Done is said once** — a done card-list row shows only its ✓ (no "Sent" word); the card's state reads `Sent 16:33` (was "Sent to the agent 16:33"); a sent agent row is a ✓, only "Not sent" stays words.
10. **One wording for the agent's work** — bottom link and list header both read `Agent: {k} tasks`.
11. **"Fit" explained** — the recommended pill's tooltip says what Fit means.

Deferred (filed to the task inbox, not this spec): answered cards collapsing to "You chose X · Change"; card copy brevity (Point A/Obstacle/Point B, option and risk lines are written by the `/day` run, a Non-Goal here); duplicate agent rows naming the same root problem (`/day` dedup); "Send N changes" not naming what changed; a compact pager. Visual QA should-fix accepted: the panel's "1 check needs attention" is Beeper, since Replies is "see Beeper" and deliberately not counted twice; the agent link uses the same 40px hit-area class the still-yours test measures; chips wrapping to three lines at 320px is the cost of keeping Fix in the line. Rejected: hiding "New people (0)" (P1399 distinguishes *none* from *not collected*); moving the `← → move` hint (it is the only discoverability for the keys).

### Round 3 — one queue, Status by outcome (founder, after preview)

> Founder framing, verbatim: "my expectation is I see work, work, work. I see it didn't work. And if I want to expand and see more details and do any action, then I expand it."

12. **Reflection is not a tab.** Its statements follow the cards in one pager ("N of cards+statements"); the card list's `Reflection` row is the divider and the jump; the last card's Accept & next moves on into the statements. One statement keeps the centred card (P1449). Tabs left: Daily report, Stats, Monitoring (looking only).
13. **Status by outcome.** Line: `▶ ✓ {n} worked` · `✕ {m} didn’t work`. Panel: `Didn’t work ({m})` — a broken connection with its Fix and the checks it breaks under it, then each other failing check; every row's action is Fix or `Open card ›`; `Worked ({n}) · skipped {k}` folded. Supersedes points 2–3 and 7 (checks with cards are listed again, once, as an index into the cards).
14. **New people and unpushed commits are not status** — chips beside the line; people open their own box; no chip when there are none.
15. **An answered card folds** to `You chose: {answer} · Change` (read-only runs: `Show the card`) — only when it was already answered on arrival, never under the cursor.
16. **Card header:** topic word dropped (the title says it), `Cause checked` dropped (only `Cause suspected` shows), age reads `{n} days open`; the wide card list loses its `All N cards answered` header.

Visual QA (separate reviewer, round 3): no blockers; the Reflection row's "rated" with an empty dot was fixed to a ✓; the phone list fold, the agent link's size and content under the 320px bar were accepted (the fold is the narrow toggle; the link has the tested 40px hit area; the scroll-above-bar test covers 320px).

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

- [x] On a run with founder cards and agent work, the page has no left Status column; one status line sits above the list+card.
- [x] A problem that has a card appears once (as its card), not also as a check row.
- [x] A problem check with no card is shown as one line under the card list.
- [x] `{n} worked ▸` expands the full checks list.
- [x] The bottom bar shows `Agent: {k} tasks ▸`, where k equals the With-the-agent list length; clicking it shows the list.
- [x] The button's number (if shown) equals answers queued + k, with both parts visible on screen.
- [x] A re-reported card shows `Back again` with an amber marker.
- [x] No "Cards X of N resolved" bar.
- [x] Visual QA at 1440, 375 and 320px by a separate subagent (screenshots only): no blockers; should-fix #1 (opened Status squeezed the columns) and #7 (phone label lost meaning) fixed; #3, #5 and #11 accepted, reasons in the Round 2 notes.
- [x] Day e2e suite and server tests pass; changed assertions cite P1463.

## UI Contract

- Status line (chips): `▶ {n} worked` · `{m} problem(s) without a card` · `{Name} disconnected` + [Fix] · `{k} new people` · `{u} unpushed commit(s)` (zero chips omitted).
- Agent link and list header: `Agent: {k} task(s)` (link adds ` ▸`; phone short form `agent: {k}`).
- Re-reported label: `Back again` (list word); card state `Back again · you answered on {date}: {answer}`.
- Sent card state: `Sent {HH:MM}`.

## Related

P1399 (day report by who acts), P1432 (answered state), P1435 (list beside card), P1445 (agent work as a list).
