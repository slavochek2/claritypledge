---
status: in-progress
type: story
rank: 1000793
severity: medium
workstream: social
date_reported: '2026-04-22'
created_date: '2026-04-22'
tags: [story-card, profile, identity, invariant]
delivery_stage: fix
pipeline_ran: [fix]
---

# P793: Row above point must show the other person — never the viewer

## Summary

The identity row (avatar + name + ear count + position badge) rendered directly above each linked point signals "this is what **this person** thinks." When the viewer is the subject, the row shows their own name and stance — already conveyed by the highlighted position button inside the point. Two surfaces affected: `StoryCardDetail.tsx` (QuotedPoint inner component) and `point-card-with-links.tsx` (showQuotePattern predicate).

## Acceptance Criteria

- [ ] On `/story/:id`, when viewer === story author, the identity row above each linked point is absent
- [ ] On `/story/:id`, when viewer !== story author, the identity row is present
- [ ] On `/story/:id`, when viewer is anonymous (logged out), the identity row is present
- [ ] On own profile (`/me`), the quote-pattern row above linked points is absent
- [ ] On another user's profile, the quote-pattern row is present
- [ ] Anonymous viewer on another user's profile: quote-pattern row is present

## Architect Plan

`~/.claude/plans/row-above-point-story-card.md`

## Sibling

P-TBD: `/live` surfaces (sibling plan `~/.claude/plans/explain-in-your-wone-gentle-bubble.md`)
