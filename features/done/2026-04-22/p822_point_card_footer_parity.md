---
status: all-done
type: task
rank: 1000761.0
workstream: C2
date_reported: '2026-04-27'
created_date: '2026-05-05'
tags: [point-card, footer, story-cta, refactor]
pipeline_ran: [fix]
completed_at: 2026-05-12
---

# P822: Point card footer parity — inline pill replaces standalone CTA row

## Summary

Restructure the point card footer so the "+ Add your story" CTA renders inline next to the story count (mirroring the story card's `N points [+ Add point]` pattern), instead of as a standalone row below the footer with its own border.

## Problem

The footer had two diverging code paths for the same CTA pill:
1. **Main footer:** standalone "+ Add your story" row below the story count, separated by `border-t`.
2. **Quote-pattern footer (IIFE):** an inline pill labeled `+ Add story` (missing "your"), with aria-label `Add your story` (vs `Add your story for this point` elsewhere), bypassing the shared helper.

Both layouts shipped — inconsistent copy, inconsistent aria-labels, duplicate logic.

## Solution

- Hoist `renderAddStoryPill()` to module-level (DRY; one definition).
- Replace the standalone CTA row with an inline pill in the main footer (`0 stories [+ Add your story]`).
- Use `renderAddStoryPill()` in both branches of the quote-pattern IIFE (0-stories + N-stories).
- Add `isDetailView` gate (pill suppressed on detail view).
- Gate: `isOwnProfile && effectiveViewerStoryCount === 0 && userPosition`.

## Files Changed

- `src/app/components/social/point-card-with-links.tsx` — footer refactor; module-level helper
- `e2e/p465-point-card-footer.spec.ts` — selectors → aria-label; Flow 3 re-aimed (CTA absence on other profiles); Flow 1 adds inline-placement assertion
- `src/tests/p451-story-cta.test.tsx` — 2 tests updated to feed-view props; new isDetailView gate test

## Acceptance Criteria

- [x] Own profile: 0 stories on a point → footer shows `0 stories [+ Add your story]` inline (no separate row)
- [x] Own profile: 1+ stories on a point → footer shows count only, no pill
- [x] Other profile: no pill rendered regardless of viewer story count
- [x] Quote-pattern footer uses the same `renderAddStoryPill` helper (consistent copy + aria-label)
- [x] Detail view: pill suppressed (isDetailView gate)
- [x] Unit tests pass: `src/tests/p451-story-cta.test.tsx`
- [x] E2E tests pass: `e2e/p465-point-card-footer.spec.ts`
- [x] Local visual verification on `localhost:5100` (post-rebase combined state with P824)

## Notes

Spec filed retrospectively after work was committed and locally verified. Branch was rebased on main to pick up P824 (CTA visibility logic for private stories) before final QA — the two features interact at the `viewerStoryCount` prop boundary on `PointCardWithLinks`.
