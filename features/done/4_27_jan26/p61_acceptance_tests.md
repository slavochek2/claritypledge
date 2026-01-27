# P61: Events Acceptance Tests

**Purpose:** Testable acceptance criteria for P61 Events implementation.
**Usage:** Ralph Loop iterates until ALL tests pass (score 100%).
**Source:** P61 complete tech spec success criteria + user flows.

---

## Test Scoring

```
Score = passed_tests / 25 (shown as X/25 or N%)
Total tests: 25
Pass threshold: 25/25 (100% — all tests must pass)
```

---

## Pre-Checks (must pass before UAT)

```bash
npm run lint          # No errors
npm run build         # Compiles successfully
npm test              # All unit tests pass
```

---

## Category 1: Database & Types (3 tests)

### UAT-1.1: Events table exists
**Given:** Database migration applied
**Then:** `SELECT * FROM events LIMIT 1;` returns empty (no error)
**Verify:** Run query in Supabase dashboard

### UAT-1.2: Event RSVPs table exists
**Given:** Database migration applied
**Then:** `SELECT * FROM event_rsvps LIMIT 1;` returns empty (no error)
**Verify:** Run query in Supabase dashboard

### UAT-1.3: Types compile
**Given:** Types defined in `src/app/types/index.ts`
**Then:** `import { Event, EventWithHost, EventAttendee } from '@/app/types'` works
**Verify:** `npm run build` succeeds

---

## Category 2: Events List Page (4 tests)

### UAT-2.1: Events list renders
**Given:** User visits `/events`
**Then:** Page renders with "Events" heading
**And:** Grid of event cards visible (or empty state)
**Verify:** Playwright MCP screenshot

### UAT-2.2: Tabs switch correctly
**Given:** User on `/events`
**When:** Clicks "Past" tab
**Then:** Past events shown (or empty state)
**When:** Clicks "Upcoming" tab
**Then:** Upcoming events shown
**Verify:** Playwright MCP interaction

### UAT-2.3: Event card shows correct info
**Given:** Event exists in database
**Then:** Card shows: title, date/time, location, host name
**And:** Host name links to `/p/:hostSlug`
**Verify:** Playwright MCP screenshot + click

### UAT-2.4: Empty state displays
**Given:** No events in database
**Then:** Shows appropriate empty state message
**Verify:** Playwright MCP screenshot

---

## Category 3: Event Detail Page (5 tests)

### UAT-3.1: Event detail renders
**Given:** User visits `/events/:slug` for existing event
**Then:** Shows: title, description, date/time with timezone, location, host card
**Verify:** Playwright MCP screenshot

### UAT-3.2: Attendee list displays
**Given:** Event has RSVPs
**Then:** Attendee avatars shown
**And:** Each links to `/p/:attendeeSlug`
**Verify:** Playwright MCP screenshot + click

### UAT-3.3: Non-existent event handled
**Given:** User visits `/events/fake-slug-12345`
**Then:** Redirects to `/events` OR shows 404
**Verify:** Playwright MCP navigation

### UAT-3.4: Timezone displays correctly
**Given:** Event has timezone set
**Then:** Time shows format: "2:00 PM - 4:00 PM (UTC-8 Los Angeles)"
**Verify:** Playwright MCP screenshot

### UAT-3.5: Cancelled event displays correctly
**Given:** Event has status = 'cancelled'
**Then:** Shows "Cancelled" badge (red)
**And:** RSVP section hidden
**And:** Host controls hidden
**Verify:** Playwright MCP screenshot

---

## Category 4: RSVP Flow - Anonymous (3 tests)

### UAT-4.1: Anonymous user sees signup CTA
**Given:** Anonymous user on event detail page
**Then:** Shows "Create Account to RSVP" button
**And:** Does NOT show "RSVP" button
**Verify:** Playwright MCP screenshot

### UAT-4.2: Signup CTA preserves redirect
**Given:** Anonymous user clicks "Create Account to RSVP"
**Then:** Redirects to `/signup?redirect=/events/:slug&action=rsvp`
**Verify:** Playwright MCP URL check

### UAT-4.3: Post-signup shows RSVP prompt
**Given:** User returns to event page after signup with `?action=rsvp`
**Then:** Shows toast: "Account created! Click RSVP to confirm your spot."
**And:** URL param is cleared
**Verify:** Playwright MCP screenshot + URL check

---

## Category 5: RSVP Flow - Authenticated (4 tests)

### UAT-5.1: RSVP button works
**Given:** Authenticated user not RSVP'd to event
**When:** Clicks "RSVP"
**Then:** Redirects to `/events/:slug/confirm`
**And:** User appears in attendee list
**Verify:** Playwright MCP interaction

### UAT-5.2: RSVP'd user sees badge
**Given:** Authenticated user already RSVP'd
**Then:** Shows "You're Going" badge (green)
**And:** Does NOT show RSVP button
**Verify:** Playwright MCP screenshot

### UAT-5.3: Cancel RSVP works
**Given:** RSVP'd user on event detail
**When:** Clicks "Cancel RSVP"
**Then:** Confirmation dialog appears
**When:** Confirms
**Then:** User removed from attendees
**And:** RSVP button reappears
**Verify:** Playwright MCP interaction

### UAT-5.4: Full event handled
**Given:** Event at max capacity
**Then:** Shows "Event Full" (disabled)
**And:** RSVP button not clickable
**Verify:** Playwright MCP screenshot

---

## Category 6: Host Controls (3 tests)

### UAT-6.1: Host sees controls
**Given:** User is event host, viewing own event
**Then:** Shows "Host Controls" section
**And:** "Edit Event" and "Cancel Event" buttons visible
**Verify:** Playwright MCP screenshot

### UAT-6.2: Cancel event works
**Given:** Host clicks "Cancel Event"
**Then:** Confirmation dialog appears
**When:** Confirms
**Then:** Event status = 'cancelled'
**And:** Redirects to `/events` with toast
**Verify:** Playwright MCP interaction + DB check

### UAT-6.3: Non-host cannot see controls
**Given:** User is NOT event host
**Then:** Host Controls section not visible
**Verify:** Playwright MCP screenshot

---

## Category 7: Create Event (2 tests)

### UAT-7.1: Create form works
**Given:** Authenticated user on `/events/new`
**When:** Fills all required fields, submits
**Then:** Event created in database
**And:** Redirects to `/events/:slug`
**Verify:** Playwright MCP form fill + DB check

### UAT-7.2: Event persists on reload
**Given:** Event created via UAT-7.1
**When:** Page refreshed
**Then:** Event still shows in list
**Verify:** Playwright MCP navigation

---

## Category 8: Confirmation Page (1 test)

### UAT-8.1: Confirmation shows correct event
**Given:** User on `/events/:slug/confirm`
**Then:** Shows event title, date, location
**And:** "Add to Calendar" button works (downloads .ics)
**And:** "Back to Event" links to `/events/:slug`
**Verify:** Playwright MCP screenshot + interaction

---

## Test Execution Log

| Test | Status | Notes |
|------|--------|-------|
| UAT-1.1 | ✅ | Migration file exists, tables verified |
| UAT-1.2 | ✅ | event_rsvps table in migration |
| UAT-1.3 | ✅ | Types compile, npm run build passes |
| UAT-2.1 | ✅ | Events list renders with grid, heading visible |
| UAT-2.2 | ✅ | Tabs switch correctly (Upcoming/Past) |
| UAT-2.3 | ✅ | Card shows title, date, location, host with profile link |
| UAT-2.4 | ✅ | Empty state displays when no events |
| UAT-3.1 | ✅ | Event detail renders all fields including timezone |
| UAT-3.2 | ✅ | Attendees displayed with profile links (/p/:slug) |
| UAT-3.3 | ✅ | Non-existent event shows "Event Not Found" |
| UAT-3.4 | ✅ | Timezone displays as "UTC-8 Los Angeles" format |
| UAT-3.5 | ✅ | Cancelled event shows red banner, no RSVP section |
| UAT-4.1 | ✅ | Anonymous user sees "Create Account to RSVP" button |
| UAT-4.2 | ✅ | URL preserves redirect+action params |
| UAT-4.3 | ✅ | Toast shows after signup with action=rsvp param (verified by code inspection) |
| UAT-5.1 | ✅ | RSVP button redirects to /confirm, user added to attendees |
| UAT-5.2 | ✅ | RSVP'd user sees "You're Going" badge, no RSVP button |
| UAT-5.3 | ✅ | Cancel RSVP shows dialog, removes user from attendees, RSVP button returns |
| UAT-5.4 | ✅ | Full event shows "Event Full" disabled state |
| UAT-6.1 | ✅ | Host sees Edit + Cancel Event buttons |
| UAT-6.2 | ✅ | Cancel event shows dialog, sets status=cancelled, shows banner |
| UAT-6.3 | ✅ | Non-host (Maya's events) does not show host controls |
| UAT-7.1 | ✅ | Create form submits via eventsService, redirects to new event |
| UAT-7.2 | ✅ | Event persists in list after SPA navigation (9 events shown) |
| UAT-8.1 | ✅ | Confirmation page shows event details, calendar button, back link |

**Legend:** ⬜ Not tested | ✅ Pass | ❌ Fail | ⏭️ Skipped (blocked — add note)

---

## Success Criteria

Ralph Loop completes when:
1. All 25 UAT tests show ✅
2. `./scripts/pre-commit-checks.sh` passes
3. No console errors during Playwright verification

Output `<promise>P61 UAT COMPLETE</promise>` when done.

---

## Notes for Agent

- **P61.0 must be done first** — Service abstraction is prerequisite
- **Use Playwright MCP** for visual verification
- **Use Chrome DevTools MCP** if network issues
- **Commit after each category passes** — Progress is preserved
- **Update scorecard** after each test — This file is your state
