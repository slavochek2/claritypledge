---
status: week
type: story
rank: 1000932.0
workstream: events
created_date: '2026-06-19'
tags: [events, timezone, ux, virtual]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P953: Virtual events display time in visitor's local timezone

## Problem

**Situation:** All events — virtual and in-person — display times in the event's stored timezone (e.g., "10:30 AM Berlin"). This is correct for in-person events where the physical location timezone is what the attendee needs to act on. For virtual events, it's wrong: a New York attendee sees "10:30 AM Berlin" and has to mentally convert.

**Complication:** ClarityPledge webinars are virtual. Current display actively creates friction for non-Berlin attendees at the moment they're deciding whether to register.

**Question:** How do we show virtual event times in the visitor's local timezone while keeping in-person events in their organizer timezone?

## Appetite

Low blast radius — two components (`EventRowCompact`, `EventDetail`), no schema change, no new data. Fully reversible (revert the conditional). Zero decision density — the rule is unambiguous: `classifyLocation().type === 'virtual'` → local tz.

## Solution

Branch on `classifyLocation(event.location).type`:

- **`virtual`** → use `Intl.DateTimeFormat().resolvedOptions().timeZone` (browser tz). Derive city label by splitting the IANA zone on `/` and replacing underscores (`"America/New_York"` → `"New York"`). Append `"time"` suffix: `"4:30 AM New York time"`.
- **`maps` / anything else** → unchanged: use `event.timezone` + existing `getTimezoneLabel`.

`classifyLocation` is already imported in `EventDetail`. Add the import to `EventRowCompact`. No new utility functions needed — the same pattern already ships in `WebinarDateLine` on the landing page (program-page.tsx).

## Risks / Non-Goals

### Risks
- **Browser timezone unavailable** (rare, old browsers): `Intl.DateTimeFormat().resolvedOptions().timeZone` returns `undefined`. Mitigation: fall back to `event.timezone`.
- **IANA timezone has no `/`** (e.g., `"UTC"`): city split yields `"UTC"`. Mitigation: show `"UTC time"` — acceptable, not broken.
- **EventDetail uses `formatTime`** (local util, not `formatLocalTime`): check whether it accepts a `timeZone` option before passing one.

### Non-Goals
- Do NOT change how in-person event times are displayed
- Do NOT add a timezone selector — detection is automatic
- Do NOT change the event creation or storage schema
- Do NOT touch `EventCard`, `RsvpConfirm`, or any other event component beyond the two in scope

## Done-When

- [ ] Virtual event in `EventRowCompact` shows time in browser's local timezone with `"{City} time"` suffix
- [ ] In-person event in `EventRowCompact` unchanged (still shows event's stored timezone label)
- [ ] Virtual event in `EventDetail` time block shows local timezone with city label
- [ ] In-person event in `EventDetail` unchanged
- [ ] Fallback to `event.timezone` when `Intl` is unavailable (covered by unit test or manual verification)
- [ ] `npm test` and `npm run build` pass

## Acceptance Criteria

- [ ] A visitor in New York viewing a virtual Berlin webinar (10:30 AM Berlin = 4:30 AM EDT) sees `4:30 AM New York time`
- [ ] The same visitor viewing an in-person Berlin event still sees `10:30 AM` with the Berlin timezone label
- [ ] No visual regression on event list or event detail page

## UI Contract

| Location | Virtual event | In-person event |
|----------|--------------|-----------------|
| `EventRowCompact` time | `"Jul 2, 4:30 AM New York time"` | `"Jul 2, 10:30 AM"` + existing label |
| `EventDetail` time block | `"4:30 AM - 5:30 AM (New York time)"` | `"10:30 AM - 11:30 AM (Berlin)"` |
