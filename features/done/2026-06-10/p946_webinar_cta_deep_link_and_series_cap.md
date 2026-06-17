---
status: all-done
type: story
rank: 1000939.0
workstream: landing
created_date: '2026-06-17'
completed_at: '2026-06-17'
tags: [webinar, events, nav, cta]
pipeline_ran: [create-spec, dev, ship]
---

# P946: "Join free webinar" deep-links to next event; series list capped at 2

## Problem

Two separate UX problems in the webinar funnel:

1. **CTA doesn't do what it says.** "Join free webinar" sends visitors to the filtered events list (`/events/list?series=lost-cofounders`) — not to a webinar. The user has to read the list and pick the right event manually.

2. **Series list is cluttered.** `/events/list?series=lost-cofounders` shows up to 3 upcoming occurrences. With a weekly recurring event, that's 3 weeks of future slots crammed into a funnel landing page designed to have one clear action.

## Appetite

Low blast radius (new redirect route + one constant change + one slice value). Fully reversible (change `WEBINAR_REGISTER_URL` back, remove route). Zero decision density.

**Related:** P945 (nav CTA flips on `/events/list`) becomes moot for the primary funnel — visitors go to `/events/:slug` now, where the nav CTA is already hidden by the P844 event-detail rule. P945 is not closed by this spec; `/events/list` may still be reached directly.

## Solution

**1. Add `/events/webinar` redirect route**

New component `NextWebinarRedirect` at `/events/webinar`:
- On mount, calls `eventsService.getUpcomingEvents()`, filters by `filterWebinarSeries()`, finds the first event where `datetime > now` (strictly future — not the 5-hour grace cutoff used for display), navigates to `/events/:slug`.
- Fallback: if no upcoming event found, navigate to `/events/list?series=lost-cofounders`.
- Shows a brief full-screen loading spinner while resolving (< 1 second in practice).

Resolution logic uses `datetime > now` (not `datetime + durationMinutes > now`) because the user described the target as "the one that has not run yet." A currently-live webinar is considered run.

**2. Update `WEBINAR_REGISTER_URL`**

`src/app/content/webinar.ts`:
```
WEBINAR_REGISTER_URL = '/events/webinar'
```
`WEBINAR_URL_IS_PLACEHOLDER` stays true (still starts with `/`), so all existing CTA surfaces keep using `<Link>` — no change required at call sites.

**3. Cap series list at 2**

`EventsList.tsx` line 59: `.slice(0, 3)` → `.slice(0, 2)`.

**4. Update `isEventDetailPage` exclusion**

`simple-navigation.tsx`: add `'webinar'` to the exclusion list alongside `'new'` and `'list'` so the route is not mistakenly treated as an event detail page (hides CTA during loading).

## Risks / Non-Goals

### Risks
- **No upcoming event:** handled by fallback to list. ACCEPT — rare; the series runs every Thursday.
- **`getUpcomingEvents()` returns grace-period events only:** the component filters further with `datetime > now`, so a just-ended event (still in grace window) is excluded. MITIGATE — explicit date check.

### Non-Goals
- Do NOT add server-side routing or edge-function resolution (client-side redirect is sufficient)
- Do NOT change the loading state design beyond a minimal spinner (not a content page)
- Do NOT change cap for non-series event lists (only series-filtered context)
- Do NOT close P945 (it covers `/events/list` reached directly, outside this funnel)

## Done-When

- [x] Clicking "Join free webinar" on `/` navigates to `/events/:slug` of the next upcoming Lost Co-Founders webinar (not to the list)
- [x] `/events/webinar` with no upcoming events falls back to `/events/list?series=lost-cofounders`
- [x] Series-filtered list (`?series=lost-cofounders`) shows at most 2 upcoming events
- [x] `isEventDetailPage` is false for `/events/webinar` (nav CTA not suppressed on the loading screen)
- [x] No regression on the regular (non-series) events list — all upcoming events visible

## Acceptance Criteria

- [x] Visitor clicks "Join free webinar" on landing → lands on event detail page for the next Thursday webinar
- [x] If no next webinar exists in DB, visitor lands on `/events/list?series=lost-cofounders`
- [x] `/events/list?series=lost-cofounders` shows max 2 upcoming events (not 3)
- [x] All CTA surfaces (landing hero, landing bottom, nav, offers page) route to `/events/webinar`
- [x] Existing links to `/events/list?series=lost-cofounders` continue to work (no broken URLs)

## UX Notes

**Loading state:** full-page spinner, no text. Duration is one `getUpcomingEvents()` call — expected < 500ms on warm connection. No explicit timeout — if the call fails the component should catch and fallback to the list.

**`/events/webinar` is a utility route, not a page.** No breadcrumbs, no title, no back button. The user should never "see" this route — it resolves before the user reads anything.
