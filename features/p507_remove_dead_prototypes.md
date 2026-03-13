---
status: in-progress
type: task
rank: 250007.75
workstream: foundation
created_date: 2026-03-13
flow: dev
tags: []
---

# TASK: P507 — Remove dead prototypes from /tree

## Goal

Remove 4 unused prototype routes (premium, converged, events-mock, linkedin-like) from the /tree page. Extract production code that's stranded in prototype folders into proper locations, then delete the prototype directories.

## Steps

### Commit 1: Delete dead prototypes (zero risk)

1. Delete `src/app/prototypes/premium/`, `converged/`, `events-mock/`
2. Remove lazy imports + routes from `src/App.tsx`
3. Remove entries from `src/app/pages/TreePage.tsx` prototypeRoutes

### Commit 2: Extract prototypes/shared/ → production

1. Add `PositionButtonGroup` type to `src/app/types/index.ts`
2. Create `src/app/utils/position-helpers.ts` (getPositionGroup, getPositionCTACopy, shouldShowStoryCTA)
3. Create `src/app/utils/format-time.ts` (formatTimeAgo)
4. Update ~26 import paths across pages, components, tests
5. Delete `src/app/prototypes/shared/`

### Commit 3: Extract linkedin-like shared components + delete

1. Move production components (PositionButtons, PositionBadge, RatingDots, ShareDialog, etc.) to `src/app/components/shared/`
2. Redirect MobileTooltip imports to existing `src/app/components/shared/mobile-tooltip.tsx`
3. Update ~21 import paths
4. Delete prototype-only tests (sift.test.tsx, ideas-stories.test.tsx)
5. Remove linkedin-like route from App.tsx + TreePage
6. Delete `src/app/prototypes/linkedin-like/`

## Architecture Context

Not a Clean Architecture refactor — just relocating stranded production code to existing folders:
- Domain types/functions → `src/app/types/` + `src/app/utils/`
- Shared UI components → `src/app/components/shared/`
- `prototypes/events/` stays (it's the real events feature)

Key risk: prototype `Story.text` vs production `Story.content`, prototype `Point.text` vs production `Point.statement` — imports using prototype types need careful migration.

## Done When

- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] `grep -r "prototypes/(shared|premium|converged|events-mock|linkedin-like)" src/` returns 0 hits
- [ ] /tree page shows no broken prototype links
- [ ] Only `prototypes/events/` remains
