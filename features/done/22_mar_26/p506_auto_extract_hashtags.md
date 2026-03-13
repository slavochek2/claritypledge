---
status: all-done
type: feature
rank: 250006.75
workstream: E1
created_date: 2026-03-13
completed_at: "2026-03-13"
flow: dev
tags: [hashtags, extraction, backfill]
uat_file: features/uat/p506.md
test_files:
  - src/tests/extractHashtags.test.ts
  - e2e/p506-auto-extract-hashtags.spec.ts
  - e2e/integration/p506-backfill-hashtags.spec.ts
---

# P506: Auto-extract hashtags from story/point content

## Problem

When a user types `#leadership` in story or point content, the `tags` array is hardcoded to `[]` at save time. The display layer (`stripHashtags` + `TagPills` from P491/P503) works, but there's never any data — tags are only populated via manual DB inserts or test helpers.

## Solution

1. **Extract utility:** `extractHashtags(content)` → parses `#word` patterns from text, returns deduplicated lowercase array.
2. **Wire into save:** Replace hardcoded `[]` in `createStory` and `createPoint` calls with `extractHashtags(content)`.
3. **Backfill migration:** One-time SQL to extract hashtags from existing stories/points content into their `tags` column.

## Technical Notes

- Utility: `src/lib/utils.ts` — add `extractHashtags()` next to existing `stripHashtags()`
- Story creation: `src/app/pages/create-story-page.tsx` line ~155 — replace `[]` with `extractHashtags(content)`
- Point creation: `src/app/pages/story-detail-page.tsx` line ~156 — replace `[]` with `extractHashtags(trimmed)`
- Also check: any other `createPoint` / `createStory` call sites
- Migration: `supabase/migrations/YYYYMMDDHHMMSS_backfill_hashtags.sql` — regex extract from `content`/`statement` columns
- Pattern: `/#(\w+)/g` → deduplicate, lowercase

## Acceptance Criteria

- [x] `extractHashtags("Hello #leadership #trust")` returns `["leadership", "trust"]`
- [x] `extractHashtags("No tags here")` returns `[]`
- [x] `extractHashtags("#dup #Dup #DUP")` returns `["dup"]` (deduplicated, lowercase)
- [x] New stories save with auto-extracted tags
- [x] New points save with auto-extracted tags
- [x] Existing stories with hashtags in content get tags backfilled via migration
- [x] Existing points with hashtags in content get tags backfilled via migration
- [x] Tag pills render on all surfaces for newly created stories/points

## Test Coverage Strategy

**Files created:**
- Unit tests: `src/tests/extractHashtags.test.ts` (16 tests)
- Integration tests: `e2e/integration/p506-backfill-hashtags.spec.ts` (5 tests)
- E2E tests: `e2e/p506-auto-extract-hashtags.spec.ts` (2 tests)
- UAT scenarios: `features/uat/p506.md` (6 scenarios)

**What's Tested:**
- `extractHashtags` utility: extraction, dedup, casing, edge cases (unit)
- Backfill migration: stories + points with/without hashtags, existing tags preserved (integration — P270 mandatory)
- Story creation flow: hashtags auto-extracted + saved to DB (E2E)

**What's NOT Tested (rationale):**
- Point creation E2E — point creation is inline on story detail page, same code path as story; unit + integration cover extraction logic
- Accessibility — no new UI components (TagPills already tested in P491)
- Smoke — no new routes or pages
- StoryGuideChat save path — same `createStory` service method, covered by unit test on `extractHashtags`

**Test Pyramid:**
```
  /\
 /  \  2 E2E
/____\
| 5 INT |
|_______|
/ 16 UNIT \

Total: 23 automated tests + 6 UAT scenarios
```
