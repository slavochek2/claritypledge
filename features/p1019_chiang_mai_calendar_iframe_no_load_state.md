---
status: week
type: bug
rank: 1000957.0
severity: low
date_reported: '2026-07-31'
created_date: '2026-07-31'
tags: [chiang-mai, events, calendar, iframe, loading-state]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1019: Chiang Mai events calendar shows a blank box while the embed loads

## Summary

`/chiang-mai` renders its cross-origin Google Calendar embed with no loading state, so the calendar area is blank from route commit until Google's embed paints.

## Root Cause

Same pattern as P1017: `chiang-mai-page.tsx:61` renders an `<iframe>` at `h-[calc(100dvh-2.5rem)] min-h-[480px]` with no placeholder. The Suspense fallback in `LazyRoute` (`src/App.tsx:233-242`) covers the lazy chunk fetch only and unmounts before the iframe's own request starts. Nobody owns the window between the two.

Surfaced by P1017's surface audit, not by a user report.

## Reproduction Steps

1. Open a fresh profile or hard-reload with cache disabled — the embed must be cold.
2. Throttle to Fast 3G.
3. Navigate to `/chiang-mai`.
4. Observe the region below the header row.

**Reproduction rate:** 100% on a cold embed.

## Expected Behavior

A centered loader occupies the calendar box until the embed paints, then clears with no layout shift.

## Actual Behavior

The calendar box is blank. Unlike `/intro`, the page does not read as broken — the header row above it carries the logo and a visible "Add this calendar to yours" link, so there is first-party content on screen throughout. Only the embed region is empty.

## Affected Files

- `src/app/pages/chiang-mai-page.tsx:61` — the iframe, no load state

## Severity

**Low** — the page has visible first-party content the whole time, so a visitor sees a working page with one region still filling in. Not a conversion-critical route. Contrast P1017, where the identical defect leaves the entire content area empty on the primary CTA destination.

## Fix Approach

Apply whatever pattern P1017 lands on: overlay a `ClarityLoader` inside a `relative` wrapper, cleared on the iframe's `onLoad`. **Wait for P1017 to ship first** — if the pattern is worth sharing, extract it there and reuse it here rather than writing a second copy.

Do NOT touch the `h-10` header row / `calc(100dvh-2.5rem)` height pairing — the comment at line 60 marks it as deliberately in sync.

## Acceptance Criteria

- [ ] A loader is visible in the calendar region from route commit until the embed paints
- [ ] Loader clears on load with no layout shift, at 320px, 375px, and desktop
- [ ] The header row and the `calc(100dvh-2.5rem)` height pairing are unchanged
- [ ] No console errors during the flow

**Verification note:** capture `/chiang-mai` **per-viewport, never `fullPage`** — `fullPage` capture blanks cross-origin iframes and produces a false "renders nothing" finding (decisions.md, P987 visual-QA capture entry).
