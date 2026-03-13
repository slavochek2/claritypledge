---
status: in-progress
type: task
rank: 250005.75
workstream: E1
flow: dev
created_date: 2026-03-13
tags: []
uat_file: features/uat/p501.md
test_files:
  - e2e/p501-understood-pill.spec.ts
  - e2e/p501-smoke.spec.ts
---

# P501: Unify "X understood" pill — always show, single field name

## Goal

The "X understood" pill renders inconsistently across surfaces:
- **Embeds** (`StoryCardWithLinks`): always shows, uses legacy `verificationCount`
- **Feed**, **Profile**, **Story detail**: hidden when count is 0, uses `understoodCount`

Unify to: **always show** (even "0 understood") on all surfaces, using `understoodCount` everywhere.

## Technical Notes

### Remove `> 0` guards (3 files)
- `src/app/components/feed/feed-story-card.tsx` — remove `understoodCount > 0` conditional
- `src/app/pages/profile-page-v2.tsx:1121` — remove `story.understoodCount > 0 &&`
- `src/app/components/social/StoryCardDetail.tsx:260` — remove `story.understoodCount > 0 &&`

### Unify field name `verificationCount` → `understoodCount`
- `src/app/components/social/story-card-with-links.tsx:321-326` — change `story.verificationCount` → `story.understoodCount`
- `src/app/pages/profile-page-v2.tsx:363` — maps `understood_count` → `verificationCount` for linked stories. Change to `understoodCount`.
- Update the type/interface used by `StoryCardWithLinks` to use `understoodCount`.

### No DB or auth changes needed
The DB column is `understood_count` — already correct. Only the frontend mapping and rendering logic changes.

## Acceptance Criteria

- [ ] "0 understood" pill visible on feed story cards
- [ ] "0 understood" pill visible on profile stories tab
- [ ] "0 understood" pill visible on story detail page
- [ ] Embed still shows pill (no regression)
- [ ] No TypeScript errors (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] `verificationCount` no longer used anywhere in codebase

## Testing

Visual check on: `/feed`, `/p/slava`, `/story/<id>`, blog embed, point detail with quoted stories.

## Test Coverage Strategy

**What's Tested:**
- E2E: "0 understood" pill visible on feed, profile, story detail (5 tests)
- E2E: positive count still renders correctly
- Smoke: pages load without errors

**What's NOT Tested (rationale):**
- No unit tests — no new logic, just removing conditionals and renaming a field
- No integration tests — no DB/API changes
- No a11y tests — existing pill component, no new interaction pattern

**Test Pyramid:**
```
  /\
 /  \  5 E2E + 2 smoke
/____\
```

**Total:** 7 automated tests + 6 UAT scenarios
