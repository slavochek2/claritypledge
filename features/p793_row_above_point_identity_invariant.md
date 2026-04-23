---
status: qa
type: story
rank: 1000793
severity: medium
workstream: social
date_reported: '2026-04-22'
created_date: '2026-04-22'
tags: [story-card, profile, identity, invariant]
delivery_stage: ship
pipeline_ran: [fix, ship]
---

# P793: Row above point must show the other person — never the viewer

## Summary

The identity row (avatar + name + ear count + position badge) rendered directly above each linked point signals "this is what **this person** thinks." When the viewer is the subject, the row shows their own name and stance — already conveyed by the highlighted position button inside the point. Three surfaces fixed: `StoryCardDetail.tsx` (detail view QuotedPoint), `point-card-with-links.tsx` (showQuotePattern predicate), and `story-card-with-links.tsx` (feed-view QuotedPoint — Fix C found in code review).

## Acceptance Criteria

- [x] On `/story/:id`, when viewer === story author, the identity row above each linked point is absent
- [x] On `/story/:id`, when viewer !== story author, the identity row is present
- [x] On `/story/:id`, when viewer is anonymous (logged out), the identity row is present
- [x] On own profile (`/me`), the quote-pattern row above linked points is absent
- [x] On another user's profile, the quote-pattern row is present
- [x] Anonymous viewer on another user's profile: quote-pattern row is present
- [x] In story feed (home / profile cards), when viewer === story author, identity row above linked points is absent
- [x] In story feed, when viewer !== story author, identity row is present

## Architect Plan

`~/.claude/plans/row-above-point-story-card.md`

## Sibling

P792: `/live` surfaces — partner row identity invariant in /live sessions (already shipped).
