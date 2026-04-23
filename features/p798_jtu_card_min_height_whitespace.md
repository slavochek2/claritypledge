---
status: qa
date_resolved: '2026-04-23'
type: bug
rank: 1000796.0
severity: low
workstream: live
date_reported: '2026-04-23'
created_date: '2026-04-23'
tags: [live, layout, jtu]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p798-jtu-min-height.test.ts
  root_cause: "JOURNEY_MIN_HEIGHT = 'min-h-[180px]' at live-mode-view.tsx:1981 is applied to the outer div of JourneyToUnderstanding at line 2179; creates blank vertical space when card content is shorter than 180px (0–2 rounds)"
  confidence: high
  surfaces_in_scope: [live-mode-view, story-walk, letter-flow-content, round-summary-screen]
  surfaces_deferred: []
  reproduced_at: '2026-04-23'
---

# P798: /live JtU card shows excess vertical whitespace from min-h-[180px]

## Summary

The Journey-to-Understand card in /live applies a fixed `min-h-[180px]` to its outer container. When only 0–2 round rows are displayed (early in a session or after the first guided round), the actual content is shorter than 180px and leaves a visible blank region below the round rows inside the card.

## Root Cause

`JOURNEY_MIN_HEIGHT = 'min-h-[180px]'` at `live-mode-view.tsx:1981`, applied to the outer div of `JourneyToUnderstanding` at `live-mode-view.tsx:2179`. The constant sets a hard minimum height that exceeds real content height during early rounds. The gap became more noticeable after P794 widened the layout to `max-w-2xl` — the wider card emphasises the vertical dead space.

## Reproduction Steps

1. Go to `/live` as either participant (session must have exactly 0 or 1 completed guided round — i.e. before multi-round accumulation).
2. Observe the Journey-to-Understand card on screen.
3. Notice a blank area below the last round row, inside the card border.

**Reproduction rate:** 100% — always visible with ≤ 2 data rows.

## Expected Behavior

The JtU card height shrinks to fit its content — no blank region below the last row. Card grows naturally as rounds accumulate.

## Actual Behavior

Card has a fixed minimum height of 180px. With 1–2 rows, content ends ~80–100px from the top and the bottom ~80–100px of the card is empty.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx:1981` — `const JOURNEY_MIN_HEIGHT = 'min-h-[180px]'`
- `src/app/components/partners/live-mode-view.tsx:2179` — outer div where it is applied

## Severity

**Low** — visual polish only; no data loss, no blocked flows. Became more noticeable after P794 widened the layout.

## Fix Approach

Remove `JOURNEY_MIN_HEIGHT` from the outer div className (or change it to `min-h-0`). Verify the card collapses correctly with 0 rounds (sealed-bid state) and grows naturally with 3+ rounds. Delete the constant if unused after removal.

## Acceptance Criteria

- [x] JtU card with 1–2 round rows has no visible blank space below the last row
- [x] JtU card with 3+ round rows is unaffected (still renders all rows without clipping)
- [x] Sealed-bid state (0 revealed rounds) renders without excess whitespace
- [x] No regression in JtU card on guided mode celebration screen
- [x] Canary test (source-code assertion) confirms JOURNEY_MIN_HEIGHT is removed from the outer container className
