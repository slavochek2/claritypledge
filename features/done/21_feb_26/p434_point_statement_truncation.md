---
status: all-done
type: bug
rank: 125468
severity: medium
workstream: E
date_reported: '2026-02-24'
created_date: '2026-02-24'
tags:
  - points
  - truncation
  - readability
  - voting
locked_at: '2026-02-26T04:17:13.457Z'
---

# P434: Point statements truncated with no expand — user can't read full text before voting

## Summary

Point statements rendered in story detail and live session cards use `line-clamp-2`, cutting text at 2 lines with no way to read the rest — users must vote on a claim they can't fully read.

## Root Cause

`line-clamp-2` is applied to `point.statement` in the `QuotedPoint` component inside `StoryCardDetail.tsx`. This was likely carried over from a list-view pattern where compact display made sense, but is incorrect in a reading/voting context where the full claim must be visible.

The live picker (`LivePointCard`) also uses `line-clamp-2` but that is a browse list — intentional, not a bug.

## Reproduction Steps

1. Navigate to any story detail page: `/story/{id}`
2. Expand the points section (click "> N points by [name]")
3. Observe a point with a statement longer than ~80 chars
4. Observe: text cuts off mid-sentence with "…", no expand option
5. Voting buttons appear below the truncated text

**Reproduction rate:** 100% on any point statement > ~2 lines

## Expected Behavior

Full point statement is visible before the user takes a position. Text wraps to as many lines as needed within the quoted box.

## Actual Behavior

Statement truncates at 2 lines with CSS ellipsis. No "Show more" or expand affordance. User must vote on a claim they cannot fully read.

## Affected Files

- `src/app/components/social/StoryCardDetail.tsx` — line 522, `QuotedPoint` component:
  ```
  <p className="text-sm text-gray-800 line-clamp-2">{point.statement}</p>
  ```
  Fix: remove `line-clamp-2`

- `src/app/components/partners/live-content-cards.tsx` — line 196, `LivePointCard` (picker):
  ```
  <p className="text-sm font-medium text-foreground line-clamp-2">{point.statement}</p>
  ```
  **Not a bug** — browse/picker context, truncation is intentional. Do not change.

## Severity

**Medium** — voting feature partially works (user can vote), but the UX is misleading — decision made on incomplete information. Workaround: click [↗] to navigate to point detail page.

## Fix Approach

Remove `line-clamp-2` from the `QuotedPoint` `<p>` in `StoryCardDetail.tsx`. One class removed, no logic changes, no new state. The box grows naturally to fit the content.

Do NOT apply a "Show more" toggle — points are designed to be concise assertions. Long points are an edge case; accommodating them with a toggle adds complexity not justified by frequency.

## Acceptance Criteria

- [ ] Long point statement on story detail page shows full text with no ellipsis
- [ ] Voting buttons still appear correctly below the full statement
- [ ] Short point statements (1–2 lines) look unchanged
- [ ] No console errors on story detail page
- [ ] Live content picker (`LivePointCard`) is unchanged — still truncates at 2 lines
