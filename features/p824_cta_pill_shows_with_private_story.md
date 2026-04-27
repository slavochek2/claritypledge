---
status: in-progress
type: bug
rank: 1000759.0
severity: medium
workstream: C2
date_reported: '2026-04-27'
created_date: '2026-04-27'
tags: [point-card, story-cta, visibility, own-profile]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p824-private-story-cta.test.tsx
  root_cause: "viewerStoriesForPoint useMemo (profile-page-v2.tsx:202) counts from realStories (visibility='public' filtered). Private stories are excluded, so own-profile viewerStoryCount=0 for a point with only a private story → showInlineAddStoryPill=true."
  confidence: high
  surfaces_in_scope: [profile-page-own-profile-points-tab]
  surfaces_deferred: []
  reproduced_at: '2026-04-27'
---

# P824: "+ Add your story" CTA pill shows on own-profile point cards when viewer already has a private story

## Summary

On a user's own profile, the "+ Add your story" inline pill appears next to the story count even when the viewer already has a story linked to that point — if that story has `visibility='private'`.

## Root Cause

`viewerStoriesForPoint` (profile-page-v2.tsx:202) counts stories from `realStories`, which is populated by `getStoriesByAuthorWithPoints`. That service hard-filters `visibility='public'` (stories-service-real.ts:380), so private stories are excluded from the count.

Meanwhile, `linkedStoriesRaw` (profile-page-v2.tsx:331) fetches stories by ID with RLS — owners see their own private stories there, so the story is visible in the card expansion.

Result: `viewerStoriesForPoint.get(point.id)` returns `undefined → ?? 0`, so `showInlineAddStoryPill` evaluates to `true` despite the viewer having a story.

The other-profile path is unaffected — it queries `story_points` directly (line 398–416), which has no visibility filter.

## Reproduction Steps

1. Log in as a user who has a point card on their profile where their linked story has `visibility='private'`
2. Navigate to your own profile (`/p/<your-slug>`)
3. Find the point card where only a private story is linked
4. Observe: "1 story" label AND "+ Add your story" blue pill both appear side-by-side

**Reproduction rate:** 100% for points where the only linked story is private

## Expected Behavior

The "+ Add your story" pill is hidden when the viewer already has any story (public or private) linked to the point.

## Actual Behavior

The pill shows alongside "1 story" — incorrectly prompting the user to add another story they already wrote.

## Affected Files

- `src/app/pages/profile-page-v2.tsx` — lines 202–212 (`viewerStoriesForPoint` useMemo) and lines 1082–1086 (pill prop for own profile)
- `src/app/data/stories-service-real.ts` — line 380 (`visibility='public'` filter in `getStoriesByAuthorWithPoints`)

## Severity

**Medium** — confusing UX for own-profile owners with private stories; no data loss. Workaround: publish the story.

## Fix Approach

`linksByPoint` (profile-page-v2.tsx:317) is already in memory after the `story_points` query at line 308–322. It contains ALL story links for the profile owner (public + private) keyed by point_id. For own profile (`currentUserId === profile.id`), populate `viewerStoryCountMap` from `linksByPoint` right after it's built (after line 322). Then unify the consumption at line 1082–1086 to always use `viewerStoryCountMap` (removing the own-profile/other-profile ternary). Remove the now-dead `viewerStoriesForPoint` useMemo.

No extra DB call needed — data is already in memory.

## Acceptance Criteria

- [ ] On own profile, pill is hidden when viewer has a private story linked to the point
- [ ] On own profile, pill is hidden when viewer has a public story linked to the point (regression: must still pass)
- [ ] On own profile, pill shows when viewer has no story linked (existing behavior preserved)
- [ ] On another user's profile, pill and viewer-story behavior is unchanged
- [ ] Regression test passes: `src/tests/p824-private-story-cta.test.tsx` (or similar)
- [ ] No console errors on own-profile page load
