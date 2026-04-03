---
id: P634
title: "Private points must never appear in feed or profile"
status: all-done
priority: critical
type: bug
flow: fix
delivery_stage: shipped
completed_at: "2026-04-03"
test_files:
  - src/tests/p634-private-points-visibility.test.ts
created: 2026-04-03
tags: []
rank: 1000043.0
created_date: 2026-04-03
---

# P634: Private points must never appear in feed or profile

## Problem

Private points (visibility='private') leak into the public feed and the creator's own profile page. Two separate code paths are affected:

1. **Feed bug (code):** `getPublicPointsFeed()` in `points-service-real.ts:758` has NO `.eq('visibility', 'public')` filter. RLS allows `first_validator_id = auth.uid()`, so the creator's private points appear in their own feed view.

2. **Profile bug (design):** `getPointsForProfileDisplay()` in `points-service-real.ts:677` intentionally skips the visibility filter when `viewerUserId === validatorId`. Private points show on the creator's own profile — this was by-design but is wrong.

## Root Cause

The RLS policy on `points` (from P586) is:
```sql
visibility = 'public' OR first_validator_id = auth.uid()
```

This means the creator can always read their own private points through RLS. The system relies on **every app-level query** remembering to add `.eq('visibility', 'public')`. Any code path that forgets = privacy leak.

## Goal

Make it **structurally impossible** for private points to appear in feed, profile, or any public-facing query — regardless of whether individual code paths remember to filter.

## Acceptance Criteria

- [ ] Private points NEVER appear in the feed (for any user, including the creator)
- [ ] Private points NEVER appear on the profile page (for any viewer, including the creator)
- [ ] Private points NEVER appear via `getPoint()` to non-creators
- [ ] Defense-in-depth: structural DB-level protection prevents leaks even if app code forgets to filter
- [ ] Existing public points continue to work exactly as before
- [ ] Creator can still see their own private points in point detail view (direct URL)

## Out of Scope

- Private points management UI (future feature)
- Changing the point creation flow or default visibility
