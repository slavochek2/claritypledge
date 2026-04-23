---
status: in-progress
type: bug
rank: 1000797.0
severity: medium
workstream: live
date_reported: '2026-04-23'
created_date: '2026-04-23'
tags: [live, story-card, points]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p799-story-card-points-auto-expand.test.ts
  root_cause: "useEffect in live-story-card-expanded.tsx:79-82 has dep array [story.id, defaultExpanded, readOnly, defaultStoryExpanded] — any prop change (not just story rotation) resets isExpanded to defaultExpanded={true}, auto-expanding points on guided-mode phase transitions"
  confidence: high
  surfaces_in_scope: [live-mode-view guided-mode call sites]
  surfaces_deferred: []
  reproduced_at: '2026-04-23'
---

# P799: /live story card linked-points section auto-expands on phase transitions

## Summary

In `/live` guided mode, the linked-points section of the story card opens automatically on phase transitions without any user interaction — collapsing it in one phase only to have it re-open when the phase changes.

## Root Cause

Two compounding causes:

1. **Component remount on phase change (primary):** Each guided-mode phase renders a separate screen component (`RatingScreen`, `UnderstandingScreen`, etc.) with its own `<LiveStoryCardExpanded>` instance. All guided-mode call sites use `defaultExpanded={true}`. When the phase transitions, the previous instance unmounts and the new one mounts fresh — `useState(defaultExpanded=true)` initialises with points open, ignoring any prior user collapse.

2. **useEffect resets on non-story-id deps (secondary):** `live-story-card-expanded.tsx:79-82` has a `useEffect` with deps `[story.id, defaultExpanded, readOnly, defaultStoryExpanded]`. Any change in those props during a phase (not just story rotation) triggers `setIsExpanded(defaultExpanded)`, resetting the user's manual collapse.

## Reproduction Steps

1. Go to `/live` as a participant (verified, session in progress, guided mode).
2. Wait for the story card to appear with the "N points" footer visible.
3. The points section starts open (linked points visible).
4. Click the "N points" footer button to collapse the linked-points section.
5. Observe: after the next phase transition (e.g., other participant submits rating, explain-back → rating), the points section opens again without user action.

**Reproduction rate:** 100% — every guided-mode phase transition triggers it.

## Expected Behavior

The linked-points section stays collapsed if the user explicitly closed it. The user's collapse state persists until they explicitly re-open it or a new story is loaded.

## Actual Behavior

After any guided-mode phase transition, the linked-points section re-opens automatically — user's collapse is silently overridden.

## Affected Files

- `src/app/components/partners/live-story-card-expanded.tsx:79-82` — `useEffect` deps include `defaultExpanded`, `readOnly`, `defaultStoryExpanded`; any prop change resets `isExpanded`
- `src/app/components/partners/live-mode-view.tsx:2689, 2770, 2864, 2942, 3038, 3128, 3187, 3327, 3460, 3601` — all guided-mode `<LiveStoryCardExpanded>` call sites use `defaultExpanded={true}`

## Severity

**Medium** — affects all /live guided-mode sessions; user cannot keep linked-points hidden between phases, cluttering the screen unexpectedly.

## Fix Approach

**Option A (conservative):** Narrow the `useEffect` dependency array to `[story.id]` only — reset `isExpanded` only when the story changes, not when props change. This prevents the secondary cause without touching call sites.

**Option B (fuller fix):** Also change guided-mode call sites from `defaultExpanded={true}` to `defaultExpanded={false}`. Points would start closed and users open them intentionally. Requires validating that the primary UX flow (voting on points) still works.

Option A is the safer starting fix. Option B is a UX decision for the founder.

## Acceptance Criteria

- [ ] User collapses linked-points in guided mode → points stay collapsed after the next phase transition
- [ ] A new story being loaded (story rotation) still resets `isExpanded` to `defaultExpanded`
- [ ] No regression: points still expand/collapse on user click
- [ ] Regression test (source-code assertion): `useEffect` deps in `live-story-card-expanded.tsx` contain only `story.id` (no `defaultExpanded`, `readOnly`, `defaultStoryExpanded`)
