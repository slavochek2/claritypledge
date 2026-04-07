---
status: in-progress
type: bug
rank: 1000067.0
severity: medium
date_reported: '2026-04-06'
created_date: 2026-04-06T00:00:00.000Z
tags:
  - live
  - ux
  - layout
delivery_stage: fix
pipeline_ran: [create-bug, fix]
absorbs: p670
---

# P667: /live — Speak Button Position Jumps + Story Selector Disappears

## Summary

The Speak button on the /live idle screen jumps vertically in multiple scenarios. After a round completes, the "+ Select your story" button also disappears entirely. All symptoms share the same root cause: layout structure is derived from transient state that changes after mount.

## Consolidated from P670

P670 (listener layout jump on partner story select) is absorbed into this spec. P670's fix (make `hasScrollableContent` role-aware via `authorId === userId`) is already cherry-picked into w1.

## Symptoms

### Symptom A: Partner selects story → listener layout jumps
**Status: FIXED (P670 cherry-pick)**
`hasScrollableContent` was role-blind — listener reacted to speaker's `selectedStoryId`. Fixed by checking `authorId === userId`.

### Symptom B: Round completes → button jumps up + "Select your story" disappears
**Status: OPEN**
After round completion, session history appears and `isCleanIdle` flips to `false`. The layout switches from two-zone (button at ~40%) to `CONTENT_LAYOUT` (button near top). Additionally, "+ Select your story" disappears because it only renders in the `isCleanIdle` two-zone layout.

Evidence: Screenshot Apr 07 14-54-27 — both browsers show button jumped up, "THIS SESSION" history visible, no story selector.

### Symptom C: Stories load async → button shifts
**Status: OPEN**
On initial render `contentLoaded` is `false`, so `hasBottomContent` is `false` and bottom zone is empty. When stories finish loading (~1-2s), `hasBottomContent` flips, and the story selector appears — shifting visual weight.

### Symptom D: `hasRatingData` transient flip during round completion
**Status: OPEN (hypothesis from reflection agent)**
During round completion, `hasRatingData` goes `true` before state resets. This flips `isCleanIdle` → `false` → `CONTENT_LAYOUT`, causing a transient jump. The P667 canary test missed this because it tests static page loads, not within-session transitions.

## Root Cause

The architectural decision to "derive layout structure from content presence" means button position is a side-effect of what's below it. `isCleanIdle` gates between two entirely different DOM trees. Any state change that affects `hasScrollableContent`, `hasRatingData`, or `showRatingDrawer` can flip the layout.

## Invariants

- P600's design intent: avoid an empty 60% gap when user has no stories. Fix must not regress this.
- `overflowAnchor: 'none'` on scroll container must be preserved.
- `scrollContainerRef` reset-on-round-complete must continue to target correct div.
- P670's fix (role-aware `isLocalStorySelection`) must be preserved.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx` — IdleScreen:
  - `isCleanIdle` computation (~line 1227)
  - `hasBottomContent` computation (~line 1148)
  - Two-zone vs CONTENT_LAYOUT switch (~lines 1279-1340)
  - Story selector rendering (gated by `isCleanIdle` two-zone branch)

## Fix Approach

The previous approach (Option B: always flex-[3]) only addressed session history. A more complete fix needs to:

1. **Stop switching between two DOM trees** — the `isCleanIdle` gate is the root problem. Explore making the two-zone layout permanent with conditional content inside it.
2. **Keep "+ Select your story" visible after rounds** — it currently only renders in the `isCleanIdle` branch.
3. **Rewrite canary test** — use `advanceSessionState()` for within-session transitions, not static page loads. Follow P670's test pattern.

## Acceptance Criteria

- [ ] Speak button does not visibly jump when session history appears after round (symptom B)
- [ ] "+ Select your story" remains visible after round completion (symptom B)
- [ ] Stories loading async does not cause visible button shift (symptom C)
- [ ] Zero-story users still see a reasonable layout
- [ ] Session history scroll behavior preserved (`overflowAnchor: 'none'`)
- [ ] Canary test uses within-session transitions (not static page loads)
- [ ] P670's role-aware fix preserved (symptom A stays fixed)

## Previous Fix (Partial — Symptom 3 Only)

**Fixed 2026-04-06:** Option B extended — always `justify-end` and `flex-[3]` in two-zone layout. Session history renders in bottom zone. `isCleanIdle` no longer includes `sessionHistory.length > 0`.

This fixed the static end-state but not the transition. The canary test (`e2e/p667-speak-button-position.spec.ts`) is a false positive — it compares two separate page loads, not within-session state changes.

## Regression test

- `e2e/p667-speak-button-position.spec.ts` — FALSE POSITIVE, needs rewrite
- `e2e/p670-listener-layout-jump.spec.ts` — VALID (two-party within-session test, symptom A)
