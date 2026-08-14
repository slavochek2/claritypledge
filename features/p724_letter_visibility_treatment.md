---
status: backlog
type: story
rank: 51
created_date: '2026-04-16'
tags:
  - letters
  - visibility
  - design
  - ux
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P724: Visibility treatment for private/public in letter surfaces

## Problem

**Situation:** In letter surfaces (results, compose, reading), the `PointRow` component suppresses visibility icons via `!letterMode` guard (`live-story-card-expanded.tsx` line 321). Story-level visibility icon works correctly (line 125). There is no background color differentiation for private vs. public anywhere in the component.

**Complication:** Users sharing private stories or points via letters can't see the visibility context of each card — the icon that would signal "this is private" is hidden. In /live sessions the same content shows the icon correctly.

**Question:** How do we restore visibility context in letter surfaces without changing /live behavior?

## Appetite

Medium blast radius — touches `live-story-card-expanded.tsx` (shared with /live, letter-reading, clarity-chat), but change is additive (new opt-in prop). Reversible: remove prop from callers. Low decision density — design is established (icon + optional background tint).

## Solution

Two parts:

**Part 1 — Point visibility icons:** Add `showPointVisibility?: boolean` prop to `LiveStoryCardExpanded` (defaults `false` for backward compat). Pass it down to `PointRow`. Replace `!letterMode` guard with `!letterMode || showPointVisibility`. Letter callers (story-walk, letter-prediction-walk, letter-reading-page) pass `showPointVisibility={true}`.

**Part 2 — Background tint for private cards:** Add subtle background treatment (e.g. `bg-gray-50` or `bg-slate-50/50`) when `story.visibility === 'private'` or `point.visibility === 'private'`. Apply at story card level and point row level. Private = muted background to visually distinguish from public.

## Risks / Non-Goals

### Risks
- Adding prop to a heavily-used shared component risks prop-drilling issues. Mitigation: single boolean prop, no cascading changes needed.
- Background tint may look wrong in dark mode. Mitigation: use Tailwind semantic tokens, not hardcoded colors.

### Non-Goals
- Do NOT change the visibility icon behavior in /live sessions (defaultExpanded callers don't pass the new prop)
- Do NOT redesign the `InlineVisibilityIcon` component itself
- Do NOT add visibility-based access control or gating — display only
- Do NOT apply to clarity-chat or round-summary-screen unless caller explicitly opts in

## Done-When

- [ ] Point-level visibility icons visible in letter results, compose, and reading surfaces
- [ ] Story-level visibility icon continues to work (no regression)
- [ ] Private stories/points have a visually distinct background from public ones
- [ ] /live sessions unaffected — visibility icon behavior unchanged there
- [ ] Dark mode: background tints use semantic colors, no hardcoded values

## Acceptance Criteria

- [ ] On results page: private point shows lock/private icon next to statement
- [ ] On compose (prediction walk): private point shows visibility icon
- [ ] On letter reading: private point shows visibility icon
- [ ] Private story card has subtly different background from public story card
- [ ] Visual QA pass on mobile (375px) and desktop (1280px)

## UX Notes

- Keep icon subtle — same `InlineVisibilityIcon` used elsewhere, don't create a new treatment
- Background tint should be the lightest possible distinction — this is a secondary signal, not a warning
- Check: does the tint clash with the blue left-border (`border-l-blue-500`) on story cards?
