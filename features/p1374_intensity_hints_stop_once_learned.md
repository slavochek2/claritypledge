---
status: week
type: story
rank: 13
created_date: '2026-09-30'
tags: [position-buttons, onboarding, intensity, letters]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: heuristic
---

# P1374: Letter intensity hints follow one rule and stop once the reader has learned

## Problem

Letters teach the intensity gesture (tap the selected button again, then pick Somewhat or Strongly) in two places, and each runs its own rule:

| | When it shows | When it stops |
|---|---|---|
| Forced tutorial modal | first letter engage phase, once per browser | after Continue |
| Inline tip line under the buttons | after every selection, every question | never |

The two also disagree in wording. The modal still says *"Double-click to pick 'somewhat disagree'"*. The tip line was changed on 2026-09-29 to *"Tap again if you disagree only Somewhat, or Strongly"*.

Nothing notices when a reader has already learned. A reader who picks "Somewhat disagree" on question 1 still sees the tip on every later question.

> Founder framing, verbatim: "we need to look at it as a whole, holistically. When do we show this text? When do we show the pop-up? … We cannot show this text all the time, right? But if we have the heuristic, then it needs to take into account both or not."

## Appetite

- **Blast radius:** letter engage phases only.
- **Reversibility:** git revert. The new state is one browser storage key.
- **Decision density:** zero. The founder approved the rule and the wording on 2026-09-30.

## Solution

One question governs both hints: **has this reader ever picked Somewhat or Strongly in a letter?** This is stored per browser, like the existing tutorial-seen key.

1. Not learned and tutorial not seen → the modal auto-opens once (unchanged trigger).
2. Not learned and tutorial seen → the tip line shows after an Agree or Disagree selection.
3. Learned → neither shows. The "?" replay stays available after any selection.

"Learned" is set the moment a reader's own selection in an engage phase is a `somewhat_*` or `strongly_*` position. The tutorial demo's buttons cannot set it: its `onPositionClick` is a no-op.

The modal title uses the same sentence as the tip: *"Tap again if you disagree only Somewhat, or Strongly"*.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Per-browser state: a new device shows hints again | ACCEPT | Same as today's tutorial gate; account-level state is P1371 Phase 3 |
| Readers who learned elsewhere (feed, point pages) still see letter hints once | ACCEPT | Letters-only scope; they stop after the first level pick |

**Non-Goals**
- Do NOT add hints to non-letter surfaces.
- Do NOT add counters, schedules or re-show logic (P1371 Phase 3).
- Do NOT change `counts={ZERO_COUNTS}` on engage-phase calls.

## Invariants

- Any copy describing the gesture matches the real sequence click-for-click (decisions.md 2026-06-01, P867).

## Acceptance Criteria

- [ ] With no stored state, the modal opens on the first engage phase. Its title reads "Tap again if you disagree only Somewhat, or Strongly".
- [ ] After the modal is dismissed, selecting Agree or Disagree shows the tip line (Agree variant swaps the verb). Selecting Unsure shows no tip text.
- [ ] After the reader picks any Somewhat or Strongly level, the tip text disappears immediately. It stays gone on later questions and on reload in the same browser, and the modal does not auto-open.
- [ ] The "?" replay still opens the modal after any selection, learned or not.
- [ ] Unit tests cover all three states. The existing P862 and P1231 tests pass.

## Related

P1371 (umbrella: intensity discoverability) · P852 / P867 (modal) · P862 (tip row `inert`) · P1231 (tutorial-gate e2e)
