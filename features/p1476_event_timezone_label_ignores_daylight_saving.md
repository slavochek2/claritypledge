---
status: week
type: bug
rank: 32
severity: low
workstream: events
date_reported: '2026-10-13'
created_date: '2026-10-13'
drafted_by: opus
exec_model: sonnet
exec_effort: low
tags: [events, timezone, dst, display]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1476: Event page shows a standard-time UTC offset during daylight saving (an Oct 11 Los Angeles event reads "UTC-8")

## Summary

For in-person events, the timezone label next to the event time comes from a fixed, standard-time
lookup table, so any event that falls in daylight saving shows the wrong UTC offset. The displayed
clock time itself is correct.

## Root Cause

`getTimezoneLabel(ianaTimezone)` (`src/app/prototypes/events/utils.ts:230-265`) maps each IANA zone
to a hard-coded string such as `'America/Los_Angeles': 'UTC-8 Los Angeles'` and takes no date. The
offset of a DST-observing zone depends on the date, so the table is right for only part of the year.
Its only production caller is `EventDetail.tsx:901`, on the non-virtual branch:
`getTimezoneLabel(event.timezone || 'America/Los_Angeles')`.

Verified 2026-10-13 that `Intl` gives the date-correct offset:
`new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' })`
gives `GMT-7` on 2026-10-11 and `GMT-8` on 2026-12-01. `Asia/Kolkata` gives `GMT+5:30`, and
`Australia/Sydney` gives `GMT+11` in December (the table says `UTC+10`).

## Reproduction Steps

1. Open the page of an in-person event (not virtual) whose `timezone` is `America/Los_Angeles` and
   whose date falls between the second Sunday of March and the first Sunday of November, e.g.
   11 Oct 2026.
2. Look at the date/time line under the title.
3. Observe: the label reads `UTC-8 Los Angeles`. Los Angeles is UTC-7 on that date.

**Reproduction rate:** 100% for any DST-observing zone in the table, on dates inside its DST period.
Found in P1441 browser UAT, 2026-10-08.

## Expected Behavior

The label shows the offset the zone actually has **on the event's date**: `UTC-7 Los Angeles` on
11 Oct 2026, and `UTC-8 Los Angeles` on 1 Dec 2026. The `UTC±H[:MM] City` format of the existing
labels is kept.

## Actual Behavior

The label always shows the zone's standard-time offset.

## Affected Files

- `src/app/prototypes/events/utils.ts:230`: `getTimezoneLabel`.
- `src/app/prototypes/events/components/EventDetail.tsx:901`: the only production call site.
  `eventDate` is already in scope (`:416`).
- Six test files mock `getTimezoneLabel: () => 'PST'` (`p1365`, `p1414`, `p1264`, `p941`, `p1441`,
  `p1272`). A signature change with an added date argument leaves those mocks valid.

## Severity

**Low.** The time shown is correct. Only the offset label is wrong, but it is wrong for about half
of every year in most listed zones.

## Fix Approach

Give `getTimezoneLabel` the event instant (`getTimezoneLabel(ianaTimezone, at: Date)`) and derive the
offset with `Intl.DateTimeFormat(…, { timeZone, timeZoneName: 'shortOffset' })`. Rewrite `GMT` to
`UTC`, map a bare `GMT` to `UTC+0`, and keep the existing city suffix per zone. An unknown zone keeps
today's fallback of returning the IANA string. Pass `eventDate` at `EventDetail.tsx:901`.

## Acceptance Criteria

- [ ] A Los Angeles in-person event on 2026-10-11 shows `UTC-7 Los Angeles`, and one on 2026-12-01
      shows `UTC-8 Los Angeles` (unit tests on `getTimezoneLabel` in `src/tests/utils.test.ts` or a
      new `src/tests/p1476-*.test.ts`, seen to fail before the change).
- [ ] Unit tests also cover a half-hour zone (`Asia/Kolkata` → `UTC+5:30 Mumbai`), a southern-
      hemisphere DST zone (`Australia/Sydney` in December → `UTC+11 Sydney`), `UTC` → `UTC`, and an
      unknown zone (returns the IANA string unchanged).
- [ ] The event page renders the corrected label in the browser for a DST-period Los Angeles event
      (screenshot at 375px and desktop).
- [ ] The existing event test files that mock `getTimezoneLabel` still pass unmodified.

## Non-Goals

- Do NOT unify the 12-hour vs 24-hour time format between the event page and the RSVP confirmation
  page, and do NOT add a zone label to the confirmation page. Which format to use is a product call
  that is deliberately deferred. It is recorded separately in the task inbox.
- Do NOT change the `TIMEZONES` picker list used by Create/Edit Event. Its labels name a zone, not a
  dated offset.
- Do NOT change the virtual-event branch, which already shows the viewer's local zone (P953).

## Related

- P953: virtual events show local time and bypass this label.
- P1441: the UAT where this was found.

Promoted from the task inbox, 2026-10-13 (two notes on the same defect merged into this spec).
