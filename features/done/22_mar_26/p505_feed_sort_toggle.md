---
status: all-done
type: feature
rank: 250006.75
workstream: E1
created_date: 2026-03-13
completed_at: "2026-03-13"
flow: dev
tags: [feed, ux]
---

# P505: Feed Sort Toggle

## Problem

Stories tagged #st1–#st9 form a teaching sequence meant to be read in order. When sharing a hashtag-filtered feed link, stories appear newest-first — backwards from the reading order. Blog embeds don't carry auth, making the feed the better sharing vehicle. Users need a way to view and share feeds in chronological (oldest-first) order.

## Solution

Add a `?sort=oldest` URL parameter and a lightweight sort toggle button in the feed tab bar row.

## UX Design

**Placement:** Right side of tab bar row, `ml-auto`. Always visible.

**Form:** Text button with ArrowUpDown icon. Label describes the action (not current state):
- Default (newest first): shows "Oldest first ↑↓"
- Toggled (`?sort=oldest`): shows "Newest first ↑↓"

```
┌──────────────────────────────────────────────────────┐
│  Points   Stories                   Oldest first ↑↓  │
│  ────                                                │
│                                                      │
│  [Content cards...]                                  │
└──────────────────────────────────────────────────────┘
```

**Interaction:** Click toggles `?sort=oldest` in URL via `setSearchParams`. Back button reverses it. Triggers re-fetch with new sort direction.

**Styling:** `text-sm text-muted-foreground hover:text-foreground` — matches inactive tab weight.

## Technical Notes

**Files to modify (7):**

1. `src/app/pages/feed-page.tsx` — read `sort` param, add toggle button in tab bar, pass `ascending` to services
2. `src/app/data/stories-service.interface.ts:74` — add `ascending?: boolean` param
3. `src/app/data/stories-service-real.ts:422` — pass to `.order('created_at', { ascending: ascending ?? false })`
4. `src/app/data/stories-service-mock.ts:162` — flip sort comparator when ascending
5. `src/app/data/points-service.interface.ts:190` — add `ascending?: boolean` param
6. `src/app/data/points-service-real.ts:729` — pass to `.order('created_at', { ascending: ascending ?? false })`
7. `src/app/data/points-service-mock.ts:354` — flip sort comparator when ascending

Sort at DB level (not client-side) — with FEED_LIMIT=50, client reversal would show wrong items if >50 exist.

## Acceptance Criteria

- [ ] `/feed` defaults to newest-first (no change from current)
- [ ] `/feed?sort=oldest` shows oldest content first
- [ ] Toggle button visible in tab bar row, right-aligned
- [ ] Clicking toggle updates URL param and re-fetches
- [ ] Works with tag filter: `/feed?tag=understanding&sort=oldest`
- [ ] Works with tab: `/feed?tab=stories&sort=oldest`
- [ ] Back button reverses sort toggle

## Testing

- Build passes (`npm run build`)
- Dev server visual check: toggle appears, URL updates, content re-orders
- `/verify` for visual QA
