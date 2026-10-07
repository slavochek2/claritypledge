---
status: in-progress
type: story
rank: 23
workstream: infrastructure
created_date: '2026-10-07'
tags: [kanban, day, ux]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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
**Next day:** a new /day run starts fresh — decisions bind to their own run (`buildView`), and the
earlier run is read-only. So "coming back next day" means: the new run's cards must say which faults
he already answered on an earlier run, and the earlier run's cards must say answered / not answered.
**Question:** How does each card show its state, durably, on the same day and the next?

## Appetite

Blast radius: one page plus one server route (private board only). Reversibility: git revert. Decision density: low — the
state words below are proposals; the founder approved the direction ("ok do").

## Invariants

- **Paging never records** (P1399 §7 rule 5, kept — review 2026-10-07). Previous, Next, ← and → only
  move. Saving happens only on an explicit act: picking an option (click or number key) or the bar's
  **"Accept & next"** button, which is split from Next (today both run the same `page(1)` handler;
  the → key must stay a pure move). Agent cards never show Accept.
- An earlier run stays read-only (P1399 §7 rule 4).
- Start fixing still sends only answered cards plus agent work (P1399 decision 1B,
  docs/decisions.md 2026-10-06).

## Solution

1. **"Accept & next" saves immediately**, exactly like picking an option (one decision line, survives
   reload), then moves on; founder cards only. Plain Next / → no longer accept anything (a card you
   only paged past stays "Not answered yet"). A second Accept of an answered card writes nothing. If the recommended
   option is Park, Accept does not park: it leaves the card unanswered (only the founder parks, by
   picking Park). A failed write shows the same error the option picker shows and the card stays
   unanswered.
2. **One state line on every card**, reusing the existing read-only line ("Not answered on this run"):
   "Your answer · saved 09:14", "Sent to the agent 09:20", "Not answered yet · recommended: <option>",
   and on a new run, for a fault answered before, "You answered on <date>: <answer> · reported again"
   (from the existing `answered_before`). [FOUNDER DECISION: exact wording — proposals above.]
3. **A compact list above the cards**: every card of the active set with its state (answered / sent /
   not answered / answered before / parked); clicking one jumps to it. Progress already counts saved
   decisions, so once Accept writes it survives reload; a card only paged past (←) is not resolved.
4. **Test change authorised:** `e2e-day/day-page.spec.ts` "Next accepts in the page only…" asserts the
   decisions file stays empty after Next; under this spec it must instead assert one option line per
   card accepted with the "Accept & next" button, and → must write nothing.
5. **Per-card "Sent" needs data the page lacks today** (Codex review): the run response carries only
   `lastSentAt` and a count. It gains the run's sent receipts per item (the `items` keys already stored
   on `sent` lines in the decisions file; started and pending count, failed does not). A card shows
   "Sent" only while its current answer's key is in a receipt; changing the answer after a send makes it
   unsent again (existing "only what changed" rule). Server scope: `server/day.ts` run route.
6. **List membership:** the active set's cards; parked cards appear as one "N parked" row that opens the
   existing Parked section (they live outside the pager).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Accept now writes, so a skim with Accept & next records many answers | ACCEPT | The button says Accept; that is the founder's explicit act (P1399 review) |
| The list duplicates the pager | MITIGATE | One line per card, collapsed on phones to a count with a toggle |

**Non-Goals**
- Do NOT change what Start fixing sends (1B stays).
- Do NOT add browser storage for state; decisions live in the decisions file only (P1399 privacy invariant).

## Acceptance Criteria

- [x] After "Accept & next" on a founder card and reloading, the card shows "Your answer"; Start fixing includes it unless that same answer was already sent (e2e; known-bad control = the current page-state-only accept → RED).
- [x] → and plain Next write nothing and accept nothing; the card stays "Not answered yet".
- [x] A card shows "Sent" only after a started/pending send containing its current answer; a failed launch never shows Sent; changing the answer after a send shows it unsent (unit + e2e).
- [x] A second Accept writes nothing; Accept on a Park recommendation does not park; a failed write leaves the card unanswered with the error shown.
- [x] On a new run, a fault answered on an earlier run shows "You answered on <date> … reported again"; the earlier run shows answered / not answered per card.
- [x] An unanswered card is visibly different from an answered one: each card shows its state line (e2e asserts the three states).
- [x] The list above the cards shows each card's state and jumps to it; progress survives reload.
- [x] Previous / Next / ← / → write nothing on any card (file compared byte for byte).
- [ ] Screenshots at 1440, 375 and 320 pass a separate visual QA.

## Related

P1399 (the Day page; decision 1B and rule 5).

## Reviews

2026-10-07: Opus spec review (verdict "not as written": 3 blocking, all verified in code and folded in above — Next/→ share Accept's code path, the superseded test, next-day state). Codex review the same day (verdict "no": agreed on next-day and paging; added that per-card Sent needs per-item receipts from the server, and that AC1 must exclude already-sent answers) — folded in. Choice made: Accept is split from Next (Codex), so arrows stay pure paging.
