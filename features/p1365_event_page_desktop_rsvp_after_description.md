---
status: in-progress
type: change-request
drafted_by: opus
exec_model: sonnet
exec_effort: medium
rank: 1000096.0
changes: p844
workstream: events
tags:
  - redesign
  - p844
  - events
  - rsvp
created_date: '2026-09-28'
disclosure: public
delivery_stage: dev
pipeline_ran: [change-request, dev]
---

# P1365: Desktop event page repeats the RSVP after the description

> **Redesign of:** [P844: Event Signup Flow Friction](done/2026-04-22/p844_event_signup_flow_friction.md)
> **What was wrong:** P844 moved the desktop RSVP above the description and removed the one at the
> bottom ("No duplicate RSVP block remains at the bottom of the description column on desktop").
> That fixed discoverability on arrival, but on a long description the reader finishes — the moment
> they have decided — a full page below the only button. Mobile never had this problem: its RSVP is
> a sticky bar visible at every scroll position.

## Operating Mode

> This spec is an **incremental correction** to P844, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P844 are not up for re-examination.

## Problem Statement

Event descriptions have grown. Clarity Night #2's runs Why now → Agenda → Prepare for the event →
How Clarity Nights are different → Sources. On desktop the only "Reserve a seat" button sits above
all of it. A reader who reads to the end must scroll back up to act.

> Founder, verbatim: "reserve a seat has only one CTA but should we generally on every event page
> have the same CTA at the bottom as well or not? … in mobile it's floating which is cool but in
> desktop I don't know"

P844's own problem statement ("Visitors miss the RSVP button — it requires scrolling past the
entire description") is still valid; this is the same failure reappearing at the other end of the
page.

## Jobs To Be Done

- **Preserved from P844:** see the RSVP without scrolling on arrival; one unambiguous primary
  action; RSVP flow unchanged.
- **Corrected:** act at the moment of decision, which on a long page is the end of the description.
- **New:** none.

## Current State

Desktop (lg+), from `src/app/prototypes/events/components/EventDetail.tsx`: the RSVP renders once,
in the left column above the description (`hidden lg:block mb-6`, `renderRsvpButton('card')`), or
the green "You're going!" card when RSVP'd. Nothing after the description on desktop. Mobile:
sticky bottom bar (`rsvp-sticky-bar`) when not RSVP'd; green card inline after the description when
RSVP'd.

**Before (desktop, long description):**
```
Title / date / location / Add to calendar
[ Reserve a seat ]            <- only button
Why now …
Agenda …
Prepare for the event …
How Clarity Nights are different …
Sources …                      <- reader finishes here, no action in view
```

## Root Cause

P844's desktop placement optimised for arrival ("above the fold, in the natural reading flow") and
explicitly removed the bottom occurrence. Its AC assumed a description short enough that the top
button is still in reach at the end. `renderRsvpButton` has two call sites (`'card'` desktop,
`'sticky_bar'` mobile); neither is present at the end of a long desktop page.

## Redesign

On desktop only, render the RSVP action a second time directly after the description, **only when
the rendered description is taller than the viewport**. The two buttons are then separated by more
than one screen, so they can never be in view together (P955) — by geometry, with no scroll
tracking. Short descriptions keep today's single button. Chosen over "show while the top button is
scrolled out of view" after spec review: that rule needed a fixed-header offset, a mount-time
initial state, pop-in on medium pages, and hiding a still-focusable button.

**After (desktop, description taller than the viewport, scrolled to end):**
```
… Sources …
[ <repeat label> ]             <- same action, distinct label
```

The repeat renders only when `!rsvpAffordanceHidden && !isRsvpd && !isPast && !isFull`. Past and
full events show no repeat (a disabled duplicate would be a dead control and would share the top
button's "Event Ended" / "Event Full" name). The height condition is re-evaluated when the viewport
or description height changes. Once rendered it is a normal, focusable button: never hidden with
opacity.

## Predecessor Sections Superseded

| Section | P844 said | Status | Replaced by |
|---|---|---|---|
| Done-When (desktop) | "No duplicate RSVP block remains at the bottom of the description column on desktop." | Superseded | AC 1–3 below |
| Mid-Dev Decision — Desktop Placement | "Current desktop: Title → Date → Location → Add to Calendar → RSVP button → description markdown." | Extended | Same order, plus the repeat after the description |

## Requirements

1. Desktop only: the repeat's wrapper carries `hidden lg:block`. Mobile layout is unchanged.
2. The repeat calls the same `handleRsvp` as the top button. `handleRsvp` and `renderRsvpButton`
   share one `RsvpTrigger` type; the repeat's value is `'card_bottom'`.
3. Height condition as in Redesign. Its initial state is "not shown" until measured.
4. Own test id `rsvp-button-repeat`; the top button keeps `rsvp-button`.
5. While an RSVP is in flight, the repeat is disabled and keeps its own label (never "Joining...",
   which the top button shows).
6. Update the stale comments at the desktop RSVP block and on `renderRsvpButton` ("desktop
   right-column card").
7. Label: **"Reserve your seat"** (founder decision, 2026-09-28).

## Invariants

- **Neither button's accessible name contains the other's as a substring** (Playwright's role
  locator matches substrings). decisions.md "2026-09-07 [process]: A green gate is only evidence for
  the surfaces it actually renders": a duplicated CTA label broke five e2e assertions under strict
  mode, and "never co-visible" was rejected there as a reason to share a label.
- **No two elements share a test id.**
- **At most one full-width primary action in the viewport at a time** (P955, visual-qa.md).
- The RSVP backend flow and auth redirect are unchanged (P844 AC).

## What Stays the Same

Mobile sticky bar and inline green card; top desktop button and its label; header CTA hiding; the
Practice Rooms gating; `RsvpConfirm`, `eventsService`, the RSVP backend.

## Surfaces in Scope

**In scope:** `src/app/prototypes/events/components/EventDetail.tsx`.

**Out of scope:** `simple-navigation.tsx`, `BottomNav`, `RsvpConfirm.tsx`, `EventsList.tsx`,
`EventCard.tsx`, the markdown renderer, `src/index.css` event-description link styles.

## Risks

| Risk | Label | Note |
|---|---|---|
| Both buttons visible at once | MITIGATE | Repeat exists only when the description is taller than the viewport |
| Description just under the threshold still ends far from the top button | ACCEPT | It is then within about one screen of the top button; revisit if measured |
| e2e locators match two buttons | MITIGATE | Naming + test-id Invariants |

## Acceptance Criteria

- [x] On desktop, an event whose description is taller than the viewport shows the repeat directly
      after the description; one with a shorter description does not.
- [x] At desktop width, at scroll top and at scroll end, at most one of `rsvp-button` /
      `rsvp-button-repeat` is in the viewport.
- [ ] Logged out, clicking the repeat tracks `event_rsvp_initiated` with trigger `card_bottom` and
      goes to the same signup URL as the top button. Logged in, it RSVPs and lands on
      `/events/<slug>/confirm`.
- [x] RSVP'd, host, cancelled, past and full events show no repeat.
- [x] On mobile, the page is unchanged (sticky bar only, no repeat).
- [ ] All existing tests for P844 still pass.
- [x] A regression test covers the first two criteria. (`e2e/p1365-rsvp-repeat.spec.ts`, 4/4; gate logic in `src/tests/p1365-rsvp-repeat.test.ts`, 8/8)

## Next Steps

Scope is one component with a settled layout → `/dev` directly once the label decision is made.
