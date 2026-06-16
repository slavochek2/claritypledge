---
status: all-done
type: bug
rank: 1000936.0
severity: high
workstream: events
date_reported: '2026-06-16'
created_date: '2026-06-16'
tags: [events, webinar, dst, timezone]
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p943-reproduce.test.ts
  root_cause: "P939 spec seeds all occurrences at constant 08:30:00Z; no per-occurrence DST-aware UTC computation exists — winter rows (post 2026-10-25) need 09:30:00Z (CET=UTC+1) but get 08:30:00Z (CEST offset), rendering 09:30 Berlin in calendar links instead of 10:30"
  confidence: high
  nature: prospective — no webinar events seeded yet; bug is in the seeding approach
  surfaces_in_scope: [calendar-links-google, calendar-links-outlook, calendar-links-office365, ics-format]
  surfaces_deferred: []
  scenarios_in_scope: [post-dst-2026-10-25-winter-sessions, dst-transition-day-2026-10-25]
  scenarios_deferred: []
  reproduced_at: '2026-06-16'
completed_at: 2026-06-16
---

# P943: Webinar series seeded with fixed UTC → wrong time after DST ends (winter sessions an hour early)

## Summary

The P939 co-founder webinar series is seeded at a **constant** `08:30:00Z` weekly, meant to be 10:30 Europe/Berlin. A fixed UTC offset cannot hold a fixed Berlin wall-clock across the DST boundary, so every occurrence from **2026-10-29 onward renders 09:30 instead of 10:30** in the calendar-link target attendees add. Bug is **live in production today** via the "Add to calendar" links.

## Root Cause

Berlin is UTC+2 (CEST) in summer, UTC+1 (CET) in winter; DST ends **2026-10-25**.

- `08:30:00Z` → **10:30 CEST** before Oct 25 (correct)
- `08:30:00Z` → **09:30 CET** on/after Oct 29 (WRONG — host means 10:30 Berlin)

P939 seeds `datetime` as a fixed `2026-06-25T08:30:00Z` repeated weekly (P939 line 73, "rolling weekly Thursdays from `2026-06-25T08:30:00Z` onward") and the rolling-window top-up keeps applying the same constant-UTC pattern into winter. The seed should compute UTC **per occurrence** from the 10:30 Berlin wall-clock with DST awareness — it stores a constant instead.

The email layer faithfully propagates whatever UTC is stored:
- `calendarLinks()` (`supabase/functions/send-event-emails/index.ts:139-148`) builds the Google/Outlook/O365 add-to-calendar URLs from `event.datetime`.
- `formatICSDate()` (`index.ts:135-137`) emits the stored UTC verbatim (`...Z`).

So a winter session's calendar entry lands at 09:30 in the attendee's calendar. (The event-page time *render* is viewer-tz-correct and is not the bug — the calendar link target is. Note this is separate from the known event-page timezone **label** bug at `EventDetail.tsx:396`, P939 non-goal.)

Surfaced by the P942 adversarial review; P942 (calendar-invite upgrade) was rejected, this independent live bug was spun out.

## Reproduction Steps

1. In prod `/events`, open a series occurrence on or after **2026-10-29** (a Thursday past the Oct 25 DST end), seeded at `08:30:00Z`.
2. RSVP, then use any "Add to calendar" link (Google/Outlook/O365) from the confirmation email or the on-page button.
3. Observe the time written into the calendar.

**Reproduction rate:** 100% for any occurrence on/after 2026-10-29 (deterministic from the stored UTC).

## Expected Behavior

Every series occurrence — summer and winter — adds to the attendee's calendar at **10:30 Europe/Berlin** (their own local equivalent thereof).

## Actual Behavior

Winter occurrences add at **09:30 Berlin** (an hour early) because the stored UTC is a fixed `08:30:00Z` across the DST boundary.

## Affected Files

- Seed/top-up (suspected primary): `scripts/create-event.ts` and the P939 rolling-window top-up path — stores constant `08:30:00Z` instead of per-occurrence DST-aware UTC. *(verify exact file in `/reproduce`.)*
- Prod `events` rows already seeded for on/after 2026-10-29 — hold the wrong UTC.
- `supabase/functions/send-event-emails/index.ts:135-148` — `formatICSDate` / `calendarLinks` propagate the stored UTC verbatim (not the root cause; the surface where the wrong value reaches the attendee).

## Severity

**High** — confidently wrong start time on the primary funnel series for every winter registrant; an hour-early calendar entry means missed sessions. No user-side workaround (the value is baked into what they add).

## Fix Approach

Two candidate fixes (decide in `/architect` or inline if trivial):

- **(A) DST-aware seed** — the seed computes UTC per occurrence from 10:30 Berlin wall-clock (winter rows stored as `09:30:00Z`). Smallest change; fixes the data at the source. Requires correcting already-seeded winter prod rows.
- **(B) TZID emission** — store/emit `TZID=Europe/Berlin` floating time + a `VTIMEZONE` block instead of UTC `Z`, so DST is resolved by the client. Larger, but immune to future boundaries.

**Prod data:** correcting already-seeded winter `events` rows is a prod mutation — get explicit founder confirmation before running (per ALWAYS-ASK).

## Acceptance Criteria

- [x] A series occurrence on/after 2026-10-29 adds to the calendar at 10:30 Europe/Berlin (not 09:30) via every "Add to calendar" link.
- [x] A summer occurrence (before 2026-10-25) still adds at 10:30 Berlin — no regression.
- [x] Already-seeded winter prod rows corrected (after founder confirmation), or migrated to the TZID approach. [post-deploy: prod query on 2026-06-16 confirmed no winter events exist yet — vacuously satisfied; re-verify after first winter seed]
- [x] Regression test covers one occurrence on each side of the 2026-10-25 DST boundary.
- [x] The seed/top-up path no longer produces a constant-UTC value across DST — future top-ups are correct without manual adjustment.
