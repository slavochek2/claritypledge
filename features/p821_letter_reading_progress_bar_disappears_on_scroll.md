---
status: today
type: bug
rank: 0.016
locked_at: '2026-04-27T07:40:51.865Z'
tags: []
created_date: 2026-04-26
---
---
status: week
type: bug
rank: 1000820
severity: medium
workstream: letters
date_reported: '2026-04-25'
created_date: '2026-04-25'
tags: [letters, progress-bar, scroll, letter-reading]
delivery_stage: reproduce
status: in-progress
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p821-letter-progress-sticky.test.ts
  root_cause: "LetterProgressBar rendered at letter-flow-content.tsx:181 has no sticky wrapper inside data-letter-scroll overflow-y-auto — scrolls away with page content"
  confidence: high
  surfaces_in_scope: [letter-flow-content]
  surfaces_deferred: []
  reproduced_at: '2026-04-26'
---

# P821: Letter reading progress bar disappears when the recipient scrolls

## Summary

The segmented progress bar at the top of the letter reading flow scrolls out of view when the recipient scrolls down — it is not sticky, so it disappears after the first scroll gesture.

## Root Cause

`LetterProgressBar` is rendered at `letter-flow-content.tsx:181` as the first child of `LetterFlowContent`. `LetterFlowContent` is placed inside the `data-letter-scroll overflow-y-auto` scroll container in both reading flows (private at `letter-reading-page.tsx:1142`, public at `letter-reading-page.tsx:1249`). The bar is a plain `<div class="flex gap-1 w-full h-1.5">` with no sticky positioning — it scrolls away with the page content.

## Reproduction Steps

1. Open a sealed letter as a recipient — e.g. `localhost:5173/letter/{any-letter-id}` (or via the inbox)
2. When the first story card is visible, note the thin blue/grey segmented progress bar near the top of the page
3. Scroll down past the story card toward the rating question
4. Observe: the progress bar has scrolled out of view; it is not visible at the top of the screen

**Reproduction rate:** 100%

## Expected Behavior

The progress bar remains pinned at the top of the visible reading area regardless of scroll position — similar to how Instagram Stories or progress indicators in other reading flows stay fixed during scroll.

## Actual Behavior

The progress bar scrolls away with the page content. After scrolling a few hundred pixels, no progress bar is visible at all. It reappears only if the recipient scrolls back to the top.

## Affected Files

- `src/app/components/letters/letter-flow-content.tsx:181` — `<LetterProgressBar>` rendered with no sticky wrapper; fix is here
- `src/app/pages/letter-reading-page.tsx:1137–1154` — `LetterReadingFlow` (private) — scroll container containing `LetterFlowContent`
- `src/app/pages/letter-reading-page.tsx:1243–1261` — `LetterReadingFlowPublic` — same scroll container pattern

## Severity

**Medium** — recipients can still read and rate stories; the progress bar is a navigational aid, not a gate. But its disappearance removes the only visual cue for "how far through the letter am I?" which degrades the reading experience.

## Fix Approach

Wrap the `<LetterProgressBar>` call in `letter-flow-content.tsx:181` with a sticky container:

```tsx
<div className="sticky top-0 z-10 bg-white">
  <LetterProgressBar
    currentIndex={state.currentStoryIndex}
    totalStories={snapshots.length}
    storyProgress={storyProgress}
  />
</div>
```

`sticky top-0` anchors the bar to the top of the `data-letter-scroll` scroll viewport. `bg-white` masks content scrolling beneath it. Single-file change — no state threading required. The bar is already constrained to `max-w-2xl px-4` (same as content), which is visually correct.

Both reading flows (`LetterReadingFlow` and `LetterReadingFlowPublic`) call `LetterFlowContent`, so both are fixed by this single change. The letter preview path (`letter-preview-page.tsx:243`) also calls `LetterFlowContent` — sticky there is harmless (preview doesn't have a deep scroll container).

## Acceptance Criteria

- [ ] Progress bar is visible at the top of the reading area after scrolling down past the first story card — both in the private/authenticated reading flow and the public/anonymous flow
- [ ] Progress bar correctly shows current story index and sub-progress during scroll (no regression to displayed state)
- [ ] Sender letter preview (`/letters/{id}/preview`) is unaffected — progress bar behavior unchanged
- [ ] No console errors during letter reading scroll
- [ ] Regression test covers the sticky behavior
