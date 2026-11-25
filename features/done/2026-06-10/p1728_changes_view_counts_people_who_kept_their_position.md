---
status: all-done
type: change-request
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
rank: 1000108.0
changes: p1061
disclosure: public
tags:
  - redesign
  - p1061
  - positions
  - point-page
created_date: '2026-11-25'
pipeline_ran: [change-request, dev, ship]
spec_review_hash: 14dc8e3610daf1029604936240eb7da94e5a3ea42ea0fd59cb748447e058a70b
spec_review_vendors: [gemini, openrouter]
completed_at: 2026-11-25
---

# P1728: The point page's Changes view counts people who kept their position

> **Redesign of:** [P1061: Show position movement on a point or story](p1061_point_position_movement_analytics.md)
> (P1061 is closed and sits under `features/done/`; the link follows `/ship`'s move of this spec as it does for any closed predecessor. Fix the path if the folder differs.)
> **What was wrong:** The "Changes" view lists only holders with at least two distinct positions, so "Same" means only "changed and came back". Everyone who took a position once and kept it is missing from the chart, the "Same" count, the list and the Filter people dialog. On the founder's point that hides 10 of 13 holders and leaves a filter that offers 3 people. The rule is `if (entries.length < 2 ...) continue;` in `readingsOf` (`src/lib/position-movement.ts:337`).

## Operating Mode

> This spec is an **incremental correction** to P1061, not a greenfield design.
> The predecessor spec is **read-only shipped history**: do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P1061 are not up for re-examination.

## Problem Statement

Founder report, 2026-11-25, on a production point (`f8629cdd-aa5d-432e-90ae-1c1e8c07be73`): Positions shows 13 holders (Disagree 0, Unsure 2, Agree 11). Changes shows "Disagree 0 · Same 0 · Agree 3" and lists 3 people; the Filter people dialog lists only those same 3 people.

> "people who didn't change position, the same position people, are not shown in the changes ... and then filters are not appearing."

Read-only production query, same day (orchestrator-verified, not re-derived here): 16 history rows; 13 holders, all with history; 10 with exactly one distinct position; 3 with two.

The predecessor's problem statement (history is recorded and displayed nowhere, so movement is invisible) stays valid. Its point-page rule that only people with two positions are listed is what this spec corrects. The view cannot answer "of everyone here, how many moved?", because the people who did not move are not in it.

## Jobs To Be Done

- **Preserved from P1061:** see who changed their mind, in which direction, with each person's graph and verification lines; filter by people, events, groups and dates; the chart of first against latest.
- **Corrected:** see the whole group, so "Same" and "Agree →" are read against everyone who holds a position, and so the Filter people dialog can select any holder, not only the movers.
- **New:** none.

## Current State

What P1061 built (read from the code, not from the spec):

- `readingsOf` (`src/lib/position-movement.ts:320-343`) walks every non-agent holder, takes their positions (`positionsOf`, removal rows skipped, same-as-previous rows merged), cuts them to the dates when set, and drops the holder when fewer than two remain.
- Three consumers feed from `readingsOf` and nothing else does (`grep readingsOf src` outside tests): `PointChangesView` (`point-changes.tsx:45`: the first/latest chart, the "Filter by change" tab counts, the people list), `offersFilter` (`movement-scope.ts:75`: whether the Filter pill shows) and `MovementFilter` (`movement-filter.tsx:27` the people offered, `:120-123` the "N people" count).
- The list is sorted by size of change, then name (`point-changes-people.tsx:78`).
- The chart's explanation ends "People who took a position only once are not drawn." (`chartHint`, `movement-copy.ts:39`).
- The point card's spread already counts a holder with no history row at their current position in both halves (`spreadShift`, `position-movement.ts:350-357`).
- Story surfaces (story card chip, story panel, per-point arrows) do not call `readingsOf`: they use `storyMovements` and `arrowsOf`, where a person who kept their position already counts as Same (P1061 Definitions, "Story change on a point").

**Before (current), the founder's point:**
```
Positions | Changes
  Where everyone counted stood, first and latest   (3 people drawn)
  Filter by change:   <- Disagree 0 | Same 0 | Agree -> 3
  3 people listed
  Filter people: offers 3 people
```

## Root Cause

The design counted a holder only when they had a movement to show (two positions), borrowing the prototype's "show who took a position again". On real data "Same" then means only "changed and came back": on production 21 people changed and came back, while the far larger group who took one position and kept it is excluded. The code is as specified (P1061 Definitions line 50, Solution line 70, Acceptance line 153); the specification is what was wrong.

It also contradicts the founder's own ruling for the story page, decisions.md 2026-11-17 [product] "Position movement is built now for stories and points", point (6): "a verified person who kept their position counts as 'same' in the bars". The story bars already count "kept" as Same; the point page was left on the older rule.

Code reference: `src/lib/position-movement.ts:337` (`if (entries.length < 2 || !first || !last) continue;`).

## Redesign

1. **Changes counts every holder with at least one position.** Agent accounts stay excluded. Without dates, first stays the earliest history position and latest stays the current position (unchanged from P1061), so a holder whose one history position equals their current position has first = latest and counts as Same. (If a lone history row ever disagreed with the current row, the holder is classified by first → current, as today; production check 2026-11-25: every one of the 628 anon-visible holders has a history row, and the trigger `log_position_change` writes one on every insert and update.) A holder with no history row at all counts at their current position as both first and latest (the rule `spreadShift` already applies, `position-movement.ts:350`). A removal-only or all-removed history is the same case: no non-null position, so the current position stands in.
2. **With dates set:** a holder is counted when they have at least one position inside the dates. First and latest are the first and last inside the dates. One position inside means Same. A holder with no position inside the dates still drops out of the dated view, including a holder with no history row (there is no dated position to place inside any dates).
3. **Everything fed by `readingsOf` follows:** the first/latest chart, the "Filter by change" tab counts, the people list, the Filter people dialog's person list (`movement-filter.tsx:27`) and its "N people" count (`movement-filter.tsx:120-123`), the people each event or group option counts and whether it is offered (`movement-filter.tsx:34-36`, `n > 0`), and whether the Filter pill shows (`offersFilter`). Expected on the founder's point: "Disagree 0 · Same 10 · Agree → 3", 13 people listed, and the dialog's count reads 13 people with no filter chosen.
3b. **The Filter people dialog's untyped preview keeps showing movers first.** With nothing typed the dialog shows only the first 4 people (`PEOPLE_SHOWN_UNTYPED`, `movement-filter.tsx:20,33`), taken today in `data.current` order, which used to be movers only. `optionsFor` orders people as the list does (size of change, then name, `point-changes-people.tsx:78`; share one comparator rather than copying it) before the slice, so the 4 shown are the people who changed first. Typing any part of a name still finds every holder. The limit of 4 is unchanged.
4. **List order: size of change, then name, as before** (`point-changes-people.tsx:78`), so people who changed stay on top and the people who kept their position follow alphabetically. One tiebreak is added, because one-position people now share the size-0 group: inside size 0, someone who took more than one position (changed and came back to where they began; with dates set, more than one position inside the dates, as everything else in the dated view) comes before someone who took one, then name. Inside any other size everyone tied has moved, so the order there is by name. Without it a person who moved and came back would sort among the keepers by name. (Added at /dev after code review, Gemini; the same shared comparator orders the filter preview, 3b.)
5. **Wording:** drop the sentence "People who took a position only once are not drawn." from `chartHint` (`movement-copy.ts:39`); it becomes untrue. This follows the 2026-11-17 (6) precedent of dropping "people who took no position since are not drawn". No other copy changes (see Open Questions for one sentence this leaves reading oddly).
6. **Comments made untrue by the rule are fixed:** the `readingsOf` doc comment (`position-movement.ts:316-318`), the `selectedCount` comment (`movement-filter.tsx:120`, "those with two positions"), the `offersFilter` comment (`movement-scope.ts:70-73`, "A point nobody has two positions on has nothing to filter"), and the `optionsFor` comment at `movement-filter.tsx:25` if it still says "listed in Changes" in a way that implies movers only (read, change only if untrue).
7. **Story surfaces: not affected, behavior unchanged.** They do not call `readingsOf` (grep above) and already count a person who kept their position as Same. Out of scope, listed below.

**After (redesign), the founder's point:**
```
Positions | Changes
  Where everyone counted stood, first and latest   (13 people drawn)
  Filter by change:   <- Disagree 0 | Same 10 | Agree -> 3
  13 people listed (the 3 who changed first, then the 10 who did not, by name)
  Filter people: "13 people" with nothing chosen; first 4 shown = the 3 who changed + 1; typing finds any of the 13
```

An opened one-position person shows the existing graph with one dot at their position and, under it, their verification lines, if any. A holder with no history row (0 of 628 on production) has no position entry to draw: `PersonLog` renders no `LogChart` and no positions `<ol>` for them (an empty drawing would clip its verification lines at x = 56, left of the viewBox at 62, and screen readers would announce an empty list), only the verification lines as text, and must not throw. The row's own label already reads "..., unchanged" when first equals latest (`point-changes-people.tsx`), so no label change is needed. A holder with no history row **and** no verification has nothing behind the row at all, so their row is a plain card with no chevron that does not open (an opening row would reveal an empty panel, a control that does nothing); for screen readers it still ends ", unchanged". (Added at /dev, found in the local browser check on the P955 fixture's person 10.)

## Predecessor Sections Superseded

| Section | P1061 said | Status | Replaced by |
|---|---|---|---|
| Definitions, "First / latest, with dates" (line 50) | "A person needs at least two positions inside the dates to be listed; with fewer they drop out of the dated view." | Superseded | Redesign 2: at least one position inside the dates; none inside still drops out |
| Solution, point page "Changes" bullet (line 70) | "It shows holders with at least two positions (first and a later one) ..." and "Holders with one position are not listed; the chart's explanation already says so." | Superseded | Redesign 1 and 5 |
| Acceptance Criteria (line 153) | "On a public point page, Changes lists the holders with at least two positions, never an agent account, and never anyone absent from Positions; ..." | Partially superseded | The first clause is replaced by "every holder with at least one position"; "never an agent account, and never anyone absent from Positions" and the non-public rule stay |
| Definitions, "Point page 'first and latest'" (line 58) | "first -> latest as defined above for each listed holder" | Extended | Holds as written; "listed holder" now includes one-position and no-history holders |
| UX Notes, Empty (line 142) | Changes with nobody to list shows "No one here has a position before and after yet" | Condition narrowed, words unchanged | Now reached only with no holder, or with dates that leave nobody; see Open Questions |
| Done-When unit-test list, "dates that leave one position, or that fall inside a removal (person not listed in the dated view)" | one position inside the dates: not listed | Partially superseded | Done-When below: one inside is Same; none inside, or inside a removal, is not listed |

Everything else in P1061 stays authoritative: the story surfaces, the panel, the filter's structure, visibility rules, cost budget, and the UI Contract's three corrected sentences.

## Requirements

- Every holder with at least one position, except agent accounts, is counted by Changes, the chart, the tab counts, the list and the Filter people dialog (Redesign 1, 3).
- Dated view per Redesign 2.
- The tab counts add up to the number of people listed with no filter by change active (Disagree + Same + Agree = list length).
- No new read, no migration: `get_point_movement_rows` already returns every holder in `current` and all history rows (decisions.md 2026-11-17 [technical]); the change is client-side counting only.

## Invariants

Carried forward in full from P1061, additive-only:

- **No new exposure.** Nothing shown or returned reveals a row, a membership or a point the viewer cannot read today: no letter explain-backs (visible only to their two participants), no history of a point the viewer cannot read, no membership of a group whose members the viewer cannot see. Guest explain-backs (no listener) are left out of every count by the Definitions. (This change lists more holders, all of whom Positions already shows to the same viewers under the same visibility condition as Changes; no one outside Positions appears.)
- **The story surfaces name nobody** (2026-11-16 ruling). Names appear only on the point page.
- **The under-5 rule is a display rule.** The not-verified bar never shows a number for fewer than 5 people, in text, bars or accessible labels. It does not hide anything else: for a public story, who explained it back and their rating are readable by anyone today (P586), and this build neither changes that nor claims otherwise.
- **Nothing new is written.** No write to `point_positions`, `points`, `stories`, `story_points` or `story_verifications`, so the P1364 cache-clear rule is not triggered. If `/dev` finds it needs a write, stop and flag it.

New for this spec:

- **Changes never lists anyone Positions does not show.** The list is a subset of the viewer's holders with agents removed; a person who removed their position is not a holder and is not listed.
- **"Same" on the point page is first = latest, however many positions the person took.** One position, or several that end where they began.

## What Stays the Same

- The data read (`get_point_movement_rows`), its visibility rules, the refusal and failure handling.
- The Positions view, the "Positions | Changes" switch, `?view=changes`, the filter's dialog layout, the spelled-out active filter line.
- Who may see Changes (public points; first validator of a non-public point).
- The point card's spread (`spreadShift`) and when it shows first positions.
- A person's graph, verification lines and the screen-reader list.
- The list order, and "Show N / Show all N" at six rows.
- The Same / toward disagree / toward agree classification (`directionOf`, `changeOf`) and the chart drawing.
- All story surfaces.

## Surfaces in Scope

**In scope:**
- `src/lib/position-movement.ts`: `readingsOf` (rule and doc comment)
- `src/app/components/movement/movement-copy.ts`: `chartHint` (one sentence removed)
- `src/app/components/movement/movement-filter.tsx`: untyped preview order (Redesign 3b); comments at `:24` (also untrue today: matching is by any word of the name, not its start) and `:120`
- `src/app/components/movement/movement-charts.tsx`: `PersonLog` with no entries (no drawing, no empty list)
- `src/app/components/movement/point-changes-people.tsx`: uses the shared comparator; the row's face moves into `RowFace` so a holder with nothing behind the row renders as a plain card (`row-static`) beside the opening rows
- `src/app/components/movement/movement-scope.ts`: `offersFilter` comment; the shared list comparator `byChangeThenName` (3b, 4)
- Tests, named below

**Out of scope:**
- Story card chip, story panel, per-point arrows, `storyMovements`, `arrowsOf` (read to confirm: none call `readingsOf`)
- `spreadShift`, the point card spread
- `supabase/` (no migration), `get_point_movement_rows`
- The chart's empty-state words and every other string (see Open Questions)

**Re-run, not edited unless it fails:** the P955 gate fixture `src/app/tree/_gate/position-movement/GateFixture.tsx` (a rendered route, no count assertions found by grep). Its persons 8 and 10, with a repeated position and with no history row, become listed holders, which is what the redesign says. `/dev` re-runs the gate; an edit is in scope only if the gate fails on the old count.

## Tests Updated By This Spec

Tests are specs. The following P1061 tests assert the superseded rule and are changed by this spec, by name; nothing else is relaxed:

- `src/tests/p1061-position-movement.test.ts`
  - "lists a holder with at least two positions, first against current": a one-position holder (`u2`) is now listed as Same (`first === latest`); the test is renamed to say so.
  - "a reasoning-only row does not make a second position": still true that it does not make a second position, but the holder is now listed once with `first === latest`, not absent.
  - "dates that leave one position drop the person from the dated view": one position inside the dates is now listed as Same; this assertion flips.
  - Unchanged and must still pass: "a person who changed and came back is listed with Same", "agent is excluded from readings but included in spreadShift", "dates: first and last positions inside the dates", "dates that fall inside a removal drop the person", and the `spreadShift` tests.
- `src/tests/p1061-movement-components.test.tsx`: "PointChangesView lists only holders with two positions and never an agent". With the fixture's one-position holder (person 2) now listed, the expected row count and the `queryByLabelText(/Test Person 2’s positions/)` null assertion change; the agent assertion stays.
- `src/tests/p1061-story-page-movement.test.tsx` ("shows only the verifications inside the dates") and `src/tests/p1061-point-movement-block.test.tsx` use holders with two or more positions, or assert only on Person 1: expected to pass unchanged. `/dev` runs all `src/tests/p1061-*` and reports any other failure before changing it, naming the assertion and why the old rule is the cause.

## Acceptance Criteria

- [x] Unit test: a holder whose one history position equals their current position is listed by `readingsOf` with `first === latest`, and is classified Same by `directionOf(changeOf(r))`.
- [x] Unit test: a holder with no history row is listed at their current position as both first and latest (Same); a holder whose history has only removal rows is the same case.
- [x] Unit test: dated view, one position inside the dates is listed as Same, first and latest being that position.
- [x] Unit test: dated view, no position inside the dates is not listed (including a holder with no history row, and dates that fall inside a removal).
- [x] Unit test: an agent account with one position is still excluded.
- [x] Unit test: a reasoning-only row (same position twice) is listed once, Same.
- [x] Component test: `MovementFilter`'s person list offers one-position holders (found by typing their name), and its "N people" count includes them (for the test fixture: every non-agent holder).
- [x] Component test: with nothing typed, the dialog's people preview is the first 4 in the list's order, so people who changed come before people who did not.
- [x] Component test: an event or group whose members include only one-position holders is now offered, and its count includes them.
- [x] Component test: opening a holder with no history row renders no drawing and no positions list, shows their verification lines as text, and does not throw.
- [x] Component test: `PointChangesView` tab counts add up to the number of people listed; the people who changed come before the people who did not.
- [x] Unit test: `chartHint(false)` and `chartHint(true)` do not contain "only once" or "not drawn"; each keeps its own first sentence (the dated one says "inside the dates") and the "Strongly disagree on the left..." sentence, unchanged.
- [x] Opening a one-position person in Changes renders their graph with one dot and no horizontal page overflow (component test plus the browser check).
- [x] Surfaces NOT in scope are unchanged: the P1061 story-surface tests (`p1061-story-surfaces`, `p1061-story-page-movement`, the story-panel and chip tests in `p1061-movement-components`) pass with no edit.
- [x] All existing P1061 tests pass except the four assertions named under "Tests Updated By This Spec" (three in `p1061-position-movement.test.ts`, one in `p1061-movement-components.test.tsx`), which are changed as stated there.
- [x] Regression check for the design failure: a point whose holders all kept their position shows Same = N, the full list and a working Filter pill, not an empty "No one here..." view.

## Post-deploy verification

Run after `/ship` and the founder's push and deploy: it reads the live point, so it cannot be ticked before the merge. The same layout was measured on the local fixture before ship (320 and 1280).

- [ ] Browser check after deploy, on the founder's point (`/point/f8629cdd-aa5d-432e-90ae-1c1e8c07be73?view=changes`): the tabs read Disagree 0, Same 10, Agree 3 and the list shows 13 people, the 3 who changed first. Opening Filter people reads "13 people", shows the 3 who changed among the first 4 people, and typing any holder's name finds them. Evidence is the screenshot or page text, pasted. At 320, 375 and 1280 wide: no horizontal overflow, no control under 40px (visual-qa.md).

## Risks

- **Verification labels can overlap in a person's graph.** `LogChart` places each verification at `entryIndexAt(entries, at) + 0.5`, so two verifications inside the same interval draw their author names on one spot. This exists today (P1061) and becomes more frequent, since one-position people have only one interval. Not fixed here: `/dev` files it with `/note` and checks whether any production point has such a person.

## Open Questions

- **The empty-state line** "No one here has a position before and after yet" (`movement-charts.tsx:43`, P1061 UX Notes) reads as if two positions were required. After this change it appears only when there is no holder to count, or when dates leave nobody. The orchestrator ruled "no other copy changes", so it ships unchanged. `[FOUNDER DECISION: copy]` whether to reword it (for example to name the dates case) is not made here.

## Next Steps

- Orchestrator runs the spec review, then `/dev` on a feature branch (worktree). Small, client-only: no migration, no auth, no gate.
- At `/ship`: add `superseded_by: p1728` to the predecessor's frontmatter (not done here, by instruction), and a `/kdd` entry in decisions.md referencing 2026-11-17 [product] (6) as the precedent this applies to the point page. Whether the entry also needs to say that the 2026-11-16 line "No 'one position' counts or lines" concerned text counts and lines (this change adds none and removes the one such sentence) is for `/kdd` to word.
