---
status: in-progress
type: bug
rank: 1000080
severity: medium
workstream: events
date_reported: '2026-09-08'
created_date: '2026-09-08'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [events, event-room, time-state, ui]
disclosure: public
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p1272-reproduce.test.tsx
  root_cause: "The room nav row (EventDetail.tsx:483-494) has no conditional and a hardcoded 'Join now' label; isPast/hasEnded/isCancelled exist at lines 251-262 and are never consulted by it."
  confidence: high
  surfaces_in_scope: [event-detail-room-row]
  surfaces_deferred: []
  surface_audit_anchor: "/room`"
  surface_audit_hits: 6
  reproduced_at: 2026-09-08
  fix_shape: decided
---

# P1272: The event-room nav row ignores the event's time state — "Join now" on cancelled and finished events

## Summary

The room navigation row in `EventDetail.tsx` renders unconditionally and always reads
"Join now" — including on a cancelled event, on an event that finished weeks ago, and on
an event that is still three weeks away, where "now" is simply false.

## Root Cause

Confirmed by a failing canary (`src/tests/p1272-reproduce.test.tsx`), 3 of 5 cases red
against current `main`; the 2 green cases are the two states that are already correct,
which is what shows the canary is not simply asserting everything. The row at
`EventDetail.tsx:483-494` is plain JSX with no surrounding condition and a hardcoded
`Join now` label. Every value needed to make it state-aware is already computed 230 lines
above it and is used elsewhere in the same file:

- `isPast` (line 251) — start + `EVENT_GRACE_HOURS` (12h); the generous, user-facing window
- `hasEnded` (line 261) — the event's actual end
- `isCancelled` (line 262)

None of the three is referenced by the row. The founder's report:

> "join now button on events should appear only 1 hour before the event? not before? or
> what (according to time zone selected of event) - otherwise confusing?"

**Timezone is not a factor.** `eventDate = new Date(event.datetime)` (line 243) is an
absolute instant; `event.timezone` is used only to pick a display zone for the rendered
date/time (lines 579-591). Any threshold computed from `eventDate` is therefore correct for
every viewer in every zone with no zone arithmetic. Recorded here because the founder
raised it as a suspected cause and a later reader would otherwise re-derive it.

## Invariants

- **The link target stays `/events/${slug}/room`.** `/room` (`EventRoomGate`) is the route
  that decides readiness-vs-principle: first visit → `/ready`, return visit with
  `readinessValue` set → `/meet`. Linking to `/meet` directly skips the readiness question
  for a first-time visitor (founder repro, 2026-08-21). Asserted by
  `src/tests/p1114-room-composition.test.tsx`.
- **Access to the room is never time-gated — only the row's label and presence change.**
  A walk-in arrives by the projected link and never sees this row at all
  ([decisions.md](../docs/decisions.md) 2026-08-21, "the walk-in arrives by the projected
  link and never sees the tab"). Gating the *route* on time would break that entry path
  and the pre-event prep path both.
- **Pre-event access to the room must survive the fix.** The room holds the readiness
  slider, the Clarity Meeting Principle and the opt-in roster — content meant to be read
  days early ("an invitation to join early", `EventDetail.tsx:457`). This bug is about the
  word "now" being wrong, not about the room opening too early.
- **User-facing affordances key on `isPast`, not `hasEnded`.** `hasEnded` is reserved for
  the host's destructive controls; `isPast` is the generous window that governs RSVP and
  the "Event Ended" button ([decisions.md](../docs/decisions.md) 2026-08-21,
  `EVENT_GRACE_HOURS`). A 90-minute event hits `hasEnded` 90 minutes in — removing the room
  from a facilitator who is still debriefing. This corrects the filing instruction, which
  said "hidden when isPast, hasEnded, or isCancelled".

## Reproduction Steps

1. Sign in as any user (or browse anonymously — the row renders either way).
2. Navigate to `/events/{slug}` for an event whose start is more than an hour away.
3. Observe the row under "← Back to Events": it reads **"Join now"** for an event that
   starts in three weeks.
4. Navigate to `/events/{slug}` for a **cancelled** event.
5. Observe: the red cancellation notice renders inside the card, the CTA reads "Event
   Ended"/cancelled — and **"Join now" is still offered** in the row above it.
6. Repeat with an event whose start was more than 12 hours ago (`isPast === true`). Same
   result: "Join now".

**Reproduction rate:** 100% — the row has no conditional at all.

## Expected Behavior

Same link, four states:

| Condition | Row |
|---|---|
| `isCancelled` | hidden |
| `isPast` (start + 12h) | hidden |
| more than 1h before `eventDate` | visible, label **"Event Room"** |
| within 1h of `eventDate` until `isPast` | visible, label **"Join now"** |

Label wording and the 1-hour threshold are founder-approved this session ("maybe 'Event
Room' yes"; 1h recommended and not contested).

## Actual Behavior

One state. The row always renders and always reads "Join now", regardless of cancellation,
completion, or how far in the future the event is.

## Affected Files

- `src/app/prototypes/events/components/EventDetail.tsx:483-494` — the unconditional row
  and the hardcoded label. `isPast`/`hasEnded`/`isCancelled` already exist at lines 251-262.
- `src/tests/p1114-room-composition.test.tsx:195-234` — source-text assertions that
  `Join now` appears in this file, before `{event.title}</h1>`, and links to `/room`. A
  conditional label keeps the literal in the file, so these should continue to pass; the
  fix must confirm that rather than assume it.

## Severity

**Medium** — no data loss and no access-control impact, but it offers a dead-sounding
action on cancelled and finished events and mislabels the normal pre-event case, which is
the confusion the founder reported.

## Fix Approach

One derived boolean plus one ternary in `EventDetail.tsx`, next to the existing time-state
constants:

```ts
const JOIN_WINDOW_MS = 60 * 60 * 1000;   // 1h before start — label only, never access
const roomRowVisible = !isPast && !isCancelled;
const roomLabel = Date.now() >= eventDate.getTime() - JOIN_WINDOW_MS ? 'Join now' : 'Event Room';
```

Wrap the `<div className="mb-6 flex …">` row in `{roomRowVisible && (…)}` and swap the
label. Nothing else moves — `Details` stays the active pseudo-tab, the row keeps its
position above the card, and the `<Link to>` is untouched.

Add `src/tests/p1272-*.test.tsx` covering all four states with a faked clock. Grepped for
sibling surfaces before proposing this: `grep -rni "join now" src/` returns only this
component, its test, and an unrelated `clarity-live-page.tsx` comment — no other surface
carries the same row, so there is no spread to fix. Also grepped `docs/decisions.md` for
`Start event`, `EventDetail`, `P1114`: the entries found constrain the fix (recorded as
Invariants above) and none rejects this approach.

## Acceptance Criteria

- [ ] On an event starting more than 1 hour from now, the row reads "Event Room"
- [ ] Within 1 hour of the start, and while the event is running, the row reads "Join now"
- [ ] On a cancelled event, no room row renders anywhere on the page
- [ ] On an event more than 12 hours past its start (`isPast`), no room row renders
- [ ] An event that ended 20 minutes ago (past `hasEnded`, before `isPast`) still shows
      "Join now" — a just-finished room stays reachable for the facilitator
- [ ] Both labels link to `/events/:slug/room` — never `/meet`
- [ ] The room route itself remains reachable at every time state, including from a direct
      or projected link on a past event
- [ ] `src/tests/p1114-room-composition.test.tsx` still passes unmodified
- [ ] No console errors on the event detail page in any of the four states
