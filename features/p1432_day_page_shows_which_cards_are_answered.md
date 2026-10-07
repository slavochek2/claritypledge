---
status: week
type: story
rank: 23
workstream: infrastructure
created_date: '2026-10-07'
tags: [kanban, day, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1432: The Day page shows which cards are answered, and Accept is saved at once

## Problem

> Founder, verbatim: "is it clearly visible which i answered? where? should it? i mean when i come
> back next day not sure which answered and which not"

**Situation:** On the latest run of the private board's Day page (P1399), each issue card preselects
the recommended option. Picking an option saves a decision at once. "Accept & next" / "Accept" (added
in P1399 Phase D) mark a card accepted in page state only, and Start fixing writes them in one batch.
**Complication:** Three gaps, verified in the shipped code: (1) an answered card and an unanswered
card look identical, since both show a filled radio; (2) accepts vanish on reload until Start fixing
runs; (3) the "N of M resolved" progress also resets on reload. The founder cannot tell, on coming
back, what he already decided, and an accept he made can silently fall out of what Start fixing sends.
**Question:** How does each card show its state, durably, without making paging write anything?

## Appetite

Blast radius: one page (private board only). Reversibility: git revert. Decision density: low — the
state words below are proposals; the founder approved the direction ("ok do").

## Invariants

- **Plain paging records nothing** (P1399 §7 rule 5). Previous/Next and ← → never write. "Accept"
  and "Accept & next" are explicit buttons and may write; that is the only change to the rule.
- An earlier run stays read-only (P1399 §7 rule 4).
- Start fixing still sends only answered cards plus agent work (P1399 decision 1B,
  docs/decisions.md 2026-10-06).

## Solution

1. **Accept saves immediately**, exactly like picking an option (one decision line, survives reload).
   "Next" alone on an answered card stays a pure move.
2. **One state line on every card**, e.g. "Your answer · saved 09:14", "Sent to the agent 09:20",
   "Not answered yet · recommended: <option>". [FOUNDER DECISION: exact wording — proposals above.]
3. **A compact list above the cards**: every card of the active set with its state (answered / sent /
   not answered / parked); clicking one jumps to it. Progress is derived from saved decisions, so it
   survives reload.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Accept now writes, so a skim with Accept & next records many answers | ACCEPT | The button says Accept; that is the founder's explicit act (P1399 review) |
| The list duplicates the pager | MITIGATE | One line per card, collapsed on phones to a count with a toggle |

**Non-Goals**
- Do NOT change what Start fixing sends (1B stays).
- Do NOT add browser storage for state; decisions live in the decisions file only (P1399 privacy invariant).

## Acceptance Criteria

- [ ] After pressing Accept on a card and reloading, the card shows it as answered and Start fixing still includes it (e2e, with a known-bad control that keeps accepts in page state only).
- [ ] An unanswered card is visibly different from an answered one: each card shows its state line (e2e asserts the three states).
- [ ] The list above the cards shows each card's state and jumps to it; progress survives reload.
- [ ] Previous / Next / ← → still write nothing (file compared byte for byte).
- [ ] Screenshots at 1440, 375 and 320 pass a separate visual QA.

## Related

P1399 (the Day page; decision 1B and rule 5).
