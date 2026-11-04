---
status: qa
type: story
rank: 91
workstream: canvas
created_date: '2026-11-04'
tags: [canvas, header, ux]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1613: Canvas header and box actions read clearly in every state

## Problem

Founder walkthrough of Canvas after P1536, verbatim:

> "compare positions is not in the top banner. Is it normal, not normal?"
> "if it says new draft, why am I comparing positions if it's a draft?"
> "the cancel button doesn't look like a button"
> "add to chat is at the top and see all is on the right ... how do we make it like, should they be like buttons"

Three things are wrong:

1. Compare positions takes its own row below the bar, though it only changes how the canvas is viewed.
2. Compare appears beside "New draft", where nothing has been written yet and the comparison looks meaningless.
3. Cancel is plain grey text next to the grey status "Nothing to publish yet", so the two look alike. "Add to chat" repeated nine times squeezes box titles onto two lines in narrow boxes.

## Appetite

Blast radius: canvas page header and box header. Reversibility: git revert. Decision density: the founder approved these calls on 2026-11-04 ("do everything you said").

## Solution

- **Compare moves into the header row, beside the version picker**, on a published version only: the owner's bar, and the byline row beside the version for anyone without the bar. Absent on a draft and on a pending Clone (P955: absent, not disabled). Nobody to compare with still means absent. On a phone it joins the bar's second row at 375; at 320 it takes its own row, because the three controls cannot fit. `headerRow` decides it, as the one source of truth for the row: a new output, covered by its table test, and using its existing definition of pending, because `isViewingDraft` alone misses a pending Clone. No other row of Compare remains; Share and Clone keep their current places on a page without the bar.
- **A comparison never survives into a draft.** The page ignores `with` unless a published version is on screen, and the moves into a draft or pending Clone remove `with` in the same address update, not in a later effect, so Back keeps working and nothing compares with no control to end it.
- **Cancel uses the shared secondary pill** (`CANVAS_SECONDARY_PILL`). The status text stays plain text. Update the one rule that names Cancel a ghost in `canvas-header-model.ts`, and its table test.
- **Add to chat stays in the box header**, because the card is itself a button (P1536 D5). In a narrow box it collapses to the icon alone, with the existing label as tooltip and accessible name, and stays 44px by 44px (it needs a minimum width once the label goes). It is measured on the box as a container query, not the viewport, since the thread panel changes box width. The threshold is set so the longest box title, "Hypotheses I've falsified", fits on one line beside the icon where it can.
- **See all stays under the list it expands.**

## Invariants

- The furthest-right filled control is the one main action (`headerRow`, P1536 X4); Compare is secondary and never filled.
- At most one full-width primary button; no dead controls (P955).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The bar overflows at 320px with Compare, the picker and a long name | MITIGATE | The name shrinks first, as today; Compare wraps to the second row; checked at 320, 375, 1280 and 1440 |
| The picked person is lost on entering a draft | ACCEPT | Back restores it, and otherwise one tap does |

**Non-Goals**
- Do NOT change what Compare does once a person is picked.
- Do NOT restyle See all or the card.
- Do NOT rename any label.

## Acceptance Criteria

- [x] On a published version with someone to compare with, Compare positions sits beside the version picker and has no row of its own, for owner and reader, at 1440, 1280, 375 and 320 with no overflow. *(Real route at 1440, `e2e/p1613-canvas-header.spec.ts`; bar tests; gate fixture measured at 1280, 375 and 320 with no overflow. Reader byline covered by a component test, not walked in a browser. At 320 Compare wraps to its own row, then Clone and Share.)*
- [x] On a draft and on a "New draft" pending Clone, Compare positions does not appear, including after arriving from a published view with a comparison on: the boxes stop comparing and the address loses `with`, while Back still returns to the comparison. *(Table and bar tests; real browser Back in the e2e spec.)*
- [x] Cancel looks like the other secondary pills, and Nothing to publish yet does not. *(Real class asserted on the real route; screenshots at 320, 375, 1440.)*
- [x] Share or Publish is still the furthest-right control in every row of the header table. *(X4 table and bar tests unchanged; new test.)*
- [x] In a narrow box, Add to chat shows only its icon at 44px by 44px, with its name on hover and to screen readers, and the box title stays on one line where it fits. In a wide box the label shows. *(Real route: 44x44 and label hidden at 318px, label in flow at 349px.)*
- [x] Add to chat still works from the icon-only form, and readers still do not see it. *(Real route click puts the tag in the composer; reader suites pass.)*
- [x] Visual QA checklist passed by a separate reviewer at 1440, 375 and 320, including both draft states. *(Separate screenshots-only reviewer: no failures against the intended design. Noted and accepted: the selected Canvas/Thread tab shares Cancel's outline, the status wraps to two lines at 1440, the 320 published bar is 145px. The 320 pencil absence is old behaviour, `canvas-name-edit.tsx`.)*

## Cost Budget

Applies only because the new e2e spec creates and deletes test users. The product change adds no request, timer, poll, retry or model call: Compare, Cancel and Add to chat change where existing controls sit.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | unchanged: 0 new | 0 | 2 users x (1 create + 1 delete) = 4 auth admin calls, plus the walk's ordinary page reads and 1 sign-in, as any single-spec walk does |
| Users created / deleted | 0 | 0 | 2 created, 2 deleted in `finally` |
| Egress | unchanged | 0 | one page session of a test canvas; no media |
| Log lines | 0 new | 0 | 0 expected refusals |
| Gemini | 0 | 0 | 0: the walk sends no message and starts no run |

1. **Fits the plan limit today?** Yes. The walk runs on self-hosted TEST, on a Compute Engine VM billed by the hour and not by request (registry, Compute Engine row), so its cost is the formula 4 calls x runs per month against no per-request limit.
2. **Fits at 10x?** Yes, for the same reason: request volume does not change the VM's bill.
3. **Rule 1 (bulk on the server):** cleanup deletes 2 users one call each through the shared helper, matching sibling specs; Auth's admin API deletes one user per call. Rule 6 (tests count as traffic) is met by this table.

## Known Limitations

- With another base's draft open: Clone from a comparison, Back, then Forward shows the published version as if picked from the picker, with no "New draft" tag and no Cancel. Nothing is written or lost, and tapping Clone starts again. The forward address is identical to a legitimate picked version, so it cannot say which state it was; keeping the intent could bring a pending Clone back after the owner chose "No one" in Compare.

## Related

P1536 (predecessor, X4, D5; it said "Compare stays where it is", reversed here by the founder) · P955 · P1614
