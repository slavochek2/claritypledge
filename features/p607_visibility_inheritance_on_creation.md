---
status: today
type: feature
rank: 1000028.0
workstream: foundation
created_date: 2026-03-30
tags: [visibility, p586-follow-up, p581-prereq]
---

# P607: Visibility Inheritance on Content Creation

## Problem Statement

Points created from stories and stories created from points do not inherit the parent's visibility. Currently:
- `createPoint()` defaults to DB default (`public`) regardless of the story's visibility
- `createStory()` from a point page doesn't inherit the point's visibility
- The cross-visibility constraint (P586) only *blocks* invalid combos — it doesn't *set* visibility automatically

This means a private story can spawn public points that are discoverable via direct URL, breaking the privacy expectation. P581 (Clarity Letters) depends on correct visibility inheritance for snapshot integrity.

## Solution

Pass parent visibility at creation time in both directions:

1. **Point created from story** → point inherits `story.visibility`
   - Call site: `story-detail-page.tsx` line ~166 — `createPoint(trimmed, undefined, tags)` → add visibility param
   - `createPoint()` already accepts optional `visibility` param (verified in `points-service-real.ts:190`)

2. **Story created from point** → story inherits `point.visibility`
   - Call site: wherever "Add story" is triggered from a point context
   - `createStory()` needs to accept and pass visibility

No schema changes needed. No migration. Code-only fix — pass the existing visibility column value through at creation time.

## Prior Decisions

- P586 (2026-03-25): Column-based visibility model — points get immutable `visibility` column, set at creation
- P586 decision in `docs/decisions.md`: "Cross-visibility constraint on story_points INSERT. Private stories can link to public points (no leak — story is hidden, point was already public)"
- The constraint allows public points on private stories by design, but the *creation* path should still default to inheriting

## Acceptance Criteria

- [ ] Point created from a private story gets `visibility: 'private'`
- [ ] Point created from a public story gets `visibility: 'public'`
- [ ] Story created from a private point gets `visibility: 'private'`
- [ ] Story created from a public point gets `visibility: 'public'`
- [ ] Existing cross-visibility constraint still blocks linking private point to public story
- [ ] No change to standalone point/story creation (no parent context → use DB default)

## Test Coverage Strategy

- Unit test: `createPoint()` with explicit visibility param produces correct DB row
- Integration test: create point from private story page → verify point.visibility = 'private'
- Integration test: create story from private point page → verify story.visibility = 'private'
- Negative test: standalone creation (no parent) still defaults to 'public'
