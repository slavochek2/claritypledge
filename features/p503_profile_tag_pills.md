---
status: in-progress
type: bug
rank: 250005.75
workstream: E1
created_date: 2026-03-13
flow: dev
tags: [hashtags, profile, tag-pills]
uat_file: features/uat/p503.md
test_files:
  - e2e/p503-profile-tag-pills.spec.ts
---

# P503: Add TagPills to profile story and point cards

## Problem

Profile page (`/p/:slug`) renders hashtags as raw inline text in story and point cards. Every other surface (feed, detail, live) strips hashtags from body text and renders them as styled `<TagPills>` pill badges. The profile-local components `StoryCardFull` and `PointCardFull` were missed when P491 (hashtag pills) was implemented.

## Root Cause

`profile-page-v2.tsx` predates P491. Its local card components (`StoryCardFull` line ~1014, `PointCardFull` line ~1398) render `story.content` / `point.statement` directly without calling `stripHashtags()` or rendering `<TagPills>`. The `tags` data is already available on both types.

## Solution

Import `stripHashtags` and `TagPills` into `profile-page-v2.tsx`. Apply the same pattern used in all other surfaces:

1. **`StoryCardFull`**: Strip hashtags from `storyDisplayText`, add `<TagPills tags={story.tags} context="profile" className="mt-2" />` after story text (before stats row).
2. **`PointCardFull`**: Strip hashtags from `point.statement`, add `<TagPills tags={point.tags} context="profile" className="mt-2" />` after point text (before position buttons).

## Technical Notes

- 1 file: `src/app/pages/profile-page-v2.tsx`
- 2 components: `StoryCardFull`, `PointCardFull`
- ~10 lines of change
- Pattern already proven in 8 other surfaces — see `feed-story-card.tsx`, `StoryCardDetail.tsx`, `point-detail-page.tsx` for reference

## Acceptance Criteria

- [ ] Hashtags stripped from story body text on profile page
- [ ] Hashtags stripped from point statement text on profile page
- [ ] TagPills rendered as styled pill badges on profile story cards
- [ ] TagPills rendered as styled pill badges on profile point cards
- [ ] Tag pills link to `/feed?tag=X` (same as other surfaces)
- [ ] No visual regression on stories/points without tags

## Test Coverage Strategy

**Files created:**
- E2E tests: `e2e/p503-profile-tag-pills.spec.ts` (4 tests)
- UAT scenarios: `features/uat/p503.md` (6 scenarios)

**What's Tested:**
- E2E: Tagged story renders pills, not raw hashtags (profile → Stories tab)
- E2E: Untagged story renders normally (no regression)
- E2E: Tagged point renders pills, not raw hashtags (profile → Points tab)
- E2E: Tag pill click navigates to `/feed?tag=X`

**What's NOT Tested (rationale):**
- Unit tests for `stripHashtags` — already covered by P491 unit tests
- Unit tests for `TagPills` — already covered by P491 component tests
- Integration tests — no DB/API changes
- Accessibility — `TagPills` already has aria-labels tested in P491
- Smoke — profile page already has existing smoke coverage

**Test Pyramid:**
```
  /\
 /  \  4 E2E
/____\
(unit + component tests inherited from P491)
```

Total: 4 automated E2E tests + 6 UAT scenarios
