---
status: qa
type: bug
rank: 1955.0
severity: medium
workstream: C1
date_reported: '2026-06-23'
created_date: '2026-06-23'
tags: [events, webinar, landing, stale-data]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p958-reproduce.test.tsx
  root_cause: "WebinarDateLine renders unconditionally from WEBINAR_NEXT_ISO constant in webinar.ts — never fetches events DB; CTA label is also hardcoded regardless of event state"
  confidence: high
  surfaces_in_scope: [program-page.tsx WebinarDateLine (hero line 298, bottom CTA line 548), program-page.tsx WebinarCTA label]
  surfaces_deferred: []
  reproduced_at: '2026-06-23'
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

DB-drive the next-session display. Key design points (hardened after adversarial review):

1. **Single shared selection helper** — add `getNextUpcomingWebinar(events)` to `src/app/data/webinar-series.ts`:
   ```ts
   export function getNextUpcomingWebinar(events: EventWithHost[]): EventWithHost | null {
     const now = new Date();
     return filterWebinarSeries(events).find(e => new Date(e.datetime) > now) ?? null;
   }
   ```
   Both `WebinarDateLine` AND `NextWebinarRedirect` must call this helper. **Why:** `getUpcomingEvents` includes events up to 5h past start (`EVENT_GRACE_HOURS`, `events-service-real.ts:13-15`). Taking `[0]` naively would show "Live · 11:00 AM" for an event already over, and pick a *different* event than the CTA redirects to (`NextWebinarRedirect` already filters `datetime > now`). Using `> now` makes the line vanish at start time and guarantees the landing date matches the page the button lands on.

2. **Lift the fetch to `ProgramPage`** — fetch `getUpcomingEvents` once at page level, pass the resolved next event (and loading flag) as props to both `WebinarDateLine` instances (hero ~line 298 and bottom CTA ~line 548). Avoids two independent fetches that could disagree mid-load. This is the first async fetch on the homepage (`ProgramPage` is currently all-static) — do NOT block first paint; render the rest of the page immediately.

3. **Error/empty contract (fail safe)** — mirror `NextWebinarRedirect`'s `.catch`. On fetch error OR empty result: render nothing, no unhandled rejection. The homepage must never break on a webinar fetch failure.

4. **No-event CTA relabel** [FOUNDER DECISION — RESOLVED]: when no upcoming event exists, the CTA relabels to the neutral fallback used on `/coach`: **"Try a Clarity Letter" → `/letter/ck`** (`coach-partnership-page.tsx:85-88`). When an event exists, keep the current label "Join the next Clarity Experiment" → `/events/experiment`. Avoids the broken promise of a "next" session that doesn't exist.

5. **Remove `WEBINAR_NEXT_ISO`** — grep confirms `program-page.tsx` is the only caller. Remove the constant from `webinar.ts` and the import; update the stale JSDoc comment that says "Update WEBINAR_NEXT_ISO to change the event."

Keep timezone-localized formatting via the existing `formatLocalTime` helper.

## Risks / Non-Goals

- **Grace-window "Live" semantics** — ACCEPT. Once selection uses `datetime > now`, the line disappears at event start, so it never shows "Live" for an event already in progress/over. No separate "live vs upcoming" distinction is built.
- **`COHORT_ENROLLMENT_CLOSES_ISO` is also hardcoded** (`webinar.ts`, drives the enrollment countdown in `offers-page.tsx`) — DEFER. It's a deliberate forcing-function deadline, not a DB event; out of scope for P958. Named here only so it isn't mistaken for covered.
- **Real-time updates** — DEFER. The line fetches on page mount; a newly created/deleted event shows after a reload, not live. No Realtime subscription in scope.
- **SEO Event schema / structured data** — Non-goal. The landing page does not advertise the event via schema; the CTA routes to the event page which owns that.

## Acceptance Criteria

- [x] Both surfaces (`WebinarDateLine` and `NextWebinarRedirect`) select the next event via the shared `getNextUpcomingWebinar` helper — the date shown on the homepage matches the event the CTA lands on
- [x] With no upcoming series event in the DB: the next-session line is not rendered, AND the CTA shows "Try a Clarity Letter" → `/letter/ck`
- [x] With at least one upcoming series event: the line renders that event's real date/time (localized to the visitor's timezone), AND the CTA shows "Join the next Clarity Experiment" → `/events/experiment`
- [x] A grace-window event (started <5h ago, now past) is NOT shown as the next session and does not appear in the date line
- [x] On fetch error or empty result, the line renders nothing and the homepage does not throw (no unhandled rejection)
- [x] During the fetch/loading phase, no hardcoded date is present in the DOM; after load completes the line is either the real date or absent (verify under Slow-3G throttle)
- [x] `grep -r "WEBINAR_NEXT_ISO" src/` returns no matches after the fix
- [x] The homepage first paint is not blocked on the events fetch (rest of page renders immediately)
- [x] No console errors during the landing-page flow
- [x] Regression test passes: `e2e/p958-*.spec.ts` (date line + CTA in both states; grace-window event excluded)
