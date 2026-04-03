---
id: P634
title: "Private points must never appear in feed or profile"
status: qa
priority: critical
type: bug
flow: fix
delivery_stage: uat
created: 2026-04-03
test_files:
  - src/tests/p634-private-points-visibility.test.ts
---

# P634: Private points must never appear in feed or profile

## Problem

Private points (visibility='private') leak into public-facing queries in `points-service-real.ts`. Three code paths affected:

1. **`getPublicPointsFeed()` (line ~789):** No `.eq('visibility', 'public')` filter. Creator's private points appear in their feed via RLS passthrough.
2. **`getPointsForProfileDisplay()` (line ~677):** Skips visibility filter when viewer=owner. Private points show on creator's own profile.
3. **`getPointsByValidator()` (line ~305):** No visibility filter at all. Returns all points by a user including private.

**Root cause:** RLS policy `visibility = 'public' OR first_validator_id = auth.uid()` means creator always passes RLS. App code must filter — any omission leaks.

## Acceptance Criteria

- [ ] Private points NEVER appear in feed (`getPublicPointsFeed`, `getPointsFeed`, `getPointsForFeedDisplay`)
- [ ] Private points NEVER appear on profile (`getPointsForProfileDisplay`) for any viewer including creator
- [ ] Private points NEVER returned by `getPointsByValidator()`
- [ ] Creator CAN see own private points via direct point detail (`getPoint()`) — RLS handles this
- [ ] Public points work exactly as before
- [ ] Position counts for private points don't leak into feed/profile totals

## Out of Scope

- Private points management UI, DB view, or RLS changes
- Changing point creation flow or default visibility

## Technical Architecture

### Architecture Decision: App-level fix (no migration)

**Why not a Postgres view?** The RLS policy on `points` already provides defense-in-depth at the DB level — non-creators cannot see private points at all. The bug is that the *creator's own* private points leak into their feed/profile because RLS correctly passes them through. A view would filter `WHERE visibility = 'public'`, but so does `.eq('visibility', 'public')` — and the view adds migration complexity, PostgREST configuration, and a new query surface to maintain.

The structural guarantee already exists (RLS). The fix is ensuring all public-facing app queries explicitly request only public points.

### Files to Modify

- `src/app/data/points-service-real.ts` — add `.eq('visibility', 'public')` to 3 methods

### Security Analysis

- **`getPoint()`** — intentionally has NO visibility filter. RLS ensures only creator + public viewers see the point. This is correct for point detail view.
- **`getPointWithCounts()`/`getPointWithUserPosition()`** — delegate to `getPoint()`. Correct.
- **`getPointsFeed()`** — already has `.eq('visibility', 'public')`. Correct.
- **`getPointsForFeedDisplay()`** — delegates to `getPointsFeed()`. Correct.
- **`getPointsWithUserPositions()`** — fetches points user has positions on. Private points can only have positions from the creator (RLS blocks others). Showing the creator their own positioned points is acceptable in "My Positions" context. No change needed.
- **`resolvePointSlug()`** — slug resolution for Sifter. Needs to find points regardless of visibility. No change.

## Test Coverage Strategy

Unit tests mock Supabase client to verify the `.eq('visibility', 'public')` filter is present in the query chain for all three fixed methods. See `src/tests/p634-private-points-visibility.test.ts`.
