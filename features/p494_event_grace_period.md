---
status: in-progress
type: feature
rank: 250002.75
workstream: E2
created_date: 2026-03-12
flow: quick-feature
tags: [events]
delivery_stage: uat
uat_file: features/uat/p494.md
test_files:
  - src/tests/event-grace-period.test.ts
# For complete frontmatter specification, see docs/technical/feature-specs.md
---

# P494: Event grace period — keep events in "upcoming" for 5 hours after start

## Problem

Events move to the "past" section the instant their `datetime` passes. This means latecomers at a running event can't find it to register, and if the event runs overtime, it's already listed as past. Real-world trigger: today's event had unregistered attendees who couldn't find it.

## Solution

Add a 5-hour grace period: events stay in "upcoming" until `datetime + 5 hours`. This covers:
- Event running overtime (typical events are 2-3h)
- Latecomers registering while event is active
- Post-event "I was there" registrations

**Implementation:** Shift the cutoff from `now` to `now - 5 hours` in the datetime comparison.

## Technical Notes

Two files, four functions:

1. **`src/app/data/events-service-real.ts`** (primary — used by events pages):
   - `getUpcomingEvents()` line 98: `.gte('datetime', now)` → `.gte('datetime', graceCutoff)`
   - `getPastEvents()` line 168: `datetime.lt.${now}` → `datetime.lt.${graceCutoff}`

2. **`src/app/data/api.ts`** (legacy — used by some prototypes):
   - `getUpcomingEvents()` line 3147-3157: currently filters by status only, no datetime — may need datetime filter added
   - `getPastEvents()` line 3172-3191: currently filters by `status = completed` only — may need grace period logic

Also check: `getUserNextEvent()`, `getUpcomingPublicEvents()` in events-service-real.ts use `.gte('datetime', now)` — these should also use the grace period.

**Grace period constant:** Define once, e.g. `const EVENT_GRACE_HOURS = 5;`

## Acceptance Criteria

- [x] Events remain in "upcoming" section for 5 hours after their start time
- [x] Events appear in "past" section only after start time + 5 hours
- [x] Registration (RSVP) still works during grace period
- [x] Dashboard "next event" widget shows events during grace period
- [x] "Discover events" shows events during grace period

## Testing

- Unit tests: verify upcoming/past filtering with mocked dates near the grace boundary
- Smoke test: `/verify` after deploy to confirm sections display correctly

## Test Coverage Strategy

**Files created:**
- Unit tests: `src/tests/event-grace-period.test.ts` (9 tests)
- UAT scenarios: `features/uat/p494.md` (7 scenarios)

**Test pyramid:**
```
     /\
    /  \   0 E2E (no new UI)
   /____\
  /  0 INT \  (no DB migration)
 /__________\
/ 9 UNIT     \
```

**What's tested:**
- `getUpcomingEvents()` uses grace cutoff (now - 5h), not raw `now`
- `getPastEvents()` uses grace cutoff in its datetime filter
- Boundary cases: 2h ago (in grace), 4.5h ago (in grace), 6h ago (past grace)
- Future events unaffected by grace period
- `EVENT_GRACE_HOURS` constant is exported and equals 5

**What's NOT tested (rationale):**
- E2E: No new UI components; events page just renders what the service returns
- Integration: No DB migration or new API endpoint
- Accessibility: No UI changes
- `api.ts` legacy functions: status-based filtering only, used by prototypes — if needed, add grace period during `/dev`

**Total:** 9 automated tests + 7 UAT scenarios
