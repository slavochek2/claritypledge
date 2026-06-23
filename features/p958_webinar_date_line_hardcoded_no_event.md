---
status: week
type: bug
rank: 1955.0
severity: medium
workstream: C1
date_reported: '2026-06-23'
created_date: '2026-06-23'
tags: [events, webinar, landing, stale-data]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P958: Webinar date line shows a hardcoded date when no upcoming event exists

## Summary

The "Live · Thursday, Jul 2 · 3:30 PM Bangkok time" next-session line on the program/landing page is driven by a hardcoded constant, so it advertises a fixed future date even when there is no upcoming Clarity Experiment event in the database.

## Root Cause

`WebinarDateLine` (`src/app/pages/program-page.tsx:206`) renders unconditionally from the static constant `WEBINAR_NEXT_ISO` in `src/app/content/webinar.ts:35` (`'2026-07-02T15:30:00+07:00'`). The constant is decoupled from the `events` table — the source of truth for whether a session actually exists. All five future Clarity Experiment events were deleted from prod (2026-06-23, this session), but the date line still shows Jul 2. The decision is that an experiment only runs once a pair confirms a date, so there is currently no upcoming event, yet the landing page claims one.

## Reproduction Steps

1. Ensure no upcoming Clarity Experiment series event exists in the DB (`getUpcomingEvents` + `filterWebinarSeries` returns empty — current prod state).
2. Visit the program/landing page (`/`).
3. Observe the next-session line under the CTA.
4. Bug: it reads "Live · Thursday, Jul 2 · 3:30 PM Bangkok time" for an event that does not exist.

**Reproduction rate:** 100%

## Expected Behavior

The date line renders **only when** a real upcoming series event exists, and shows that event's actual datetime. When none exists, the line is hidden entirely (the CTA still routes to `/events/experiment`, which shows the "No upcoming sessions" empty state).

## Actual Behavior

The line always renders with the hardcoded Jul 2 date, regardless of whether any event exists.

## Affected Files

- `src/app/pages/program-page.tsx` — `WebinarDateLine` (~line 206), renders unconditionally from the constant
- `src/app/content/webinar.ts` — `WEBINAR_NEXT_ISO` (line 35), hardcoded date constant; also `WEBINAR_URL_IS_PLACEHOLDER` / `WEBINAR_CTA_LABEL` assumptions nearby
- `src/app/data/events-service-real.ts` — `getUpcomingEvents` (existing fetch to reuse)
- `src/app/data/webinar-series.ts` — `filterWebinarSeries` (existing series filter to reuse)
- `src/app/prototypes/events/components/NextWebinarRedirect.tsx` — existing precedent for fetch + filter pattern

## Severity

**Medium** — public landing page shows a false event date; misleads visitors and erodes trust, but no data loss and the registration flow itself degrades gracefully to an empty state.

## Fix Approach

DB-drive `WebinarDateLine`: fetch upcoming events (reuse `getUpcomingEvents` + `filterWebinarSeries`, same as `NextWebinarRedirect`), pick the next one by datetime, and render the line only when one exists — using that event's datetime instead of `WEBINAR_NEXT_ISO`. Render nothing (no placeholder) when there is no upcoming event. Decide whether `WEBINAR_NEXT_ISO` should be removed entirely or retained for any other caller (grep callers first). Keep timezone-localized formatting via the existing `formatLocalTime` helper. Handle the loading state so the line does not flash a stale/empty value on first paint.

## Acceptance Criteria

- [ ] With no upcoming series event in the DB, the next-session line is not rendered on the landing page
- [ ] With at least one upcoming series event, the line renders that event's real date/time, localized to the visitor's timezone
- [ ] The line updates correctly when a new event is created (no hardcoded date remains in the render path)
- [ ] CTA still routes to `/events/experiment` in both states
- [ ] No flash of a stale/hardcoded date during the fetch/loading phase
- [ ] No console errors during the landing-page flow
- [ ] Regression test passes: `e2e/p958-*.spec.ts` (date line hidden when no event, shown when event exists)
