---
status: week
type: story
rank: 24
workstream: events
created_date: '2026-10-07'
tags: [events, navigation, header, room]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1433: Event-night navigation: "Today's event" everywhere, Back returns to the room, re-entry resumes

## Problem

**Situation:** At Clarity Night (2026-10-06) people regularly left the event room for a point, a
stake page or the feed, and then had to find their way back to it.
**Complication:** The evidence (private event notes, H1–H3) shows three gaps:
- **H1:** the header's "Tonight's event" button was hidden on every page of the event itself, on
  every `compact` page (room, ready, meet, stake) and for anyone signed out. All 4 observed clicks
  came from `/feed`, after the person first went to the feed by tapping the logo or "Go back".
- **H2:** "Go back" from a point page opened in a fresh entry (no earlier in-app page) fell back
  to `/feed`, not the room.
- **H3:** every return to the room went to the Ready screen (P1307 D10).

> Founder observation, 2026-10-07: *"people who left and came back had to start again from Ready
> and click forward; facilitator had to direct them."*

> Founder decision, verbatim: *"Go back: keep "back to where you came from"; during the window,
> when there is no previous in-app page, fall back to the event room instead of /feed."*

**Question:** Make the way back into the room visible from every page, make Back land in the
room during the event, and resume a returning person where they were.

The founder recorded the decisions on 2026-10-07 and they are not re-opened here. Solution
restates them as D1–D4.

## Appetite

Blast radius: medium. The header and every Back control appear on every page, but the changes
are bounded to the hours around an event. Reversibility: git revert, no migration. Decision
density: zero open (all four decided).

## Solution

**D1: header button.** It is always labelled **"Today's event"** `[FOUNDER DECISION: label, decided]`.
For a prep-enabled event it opens the event room from **1h before start until 3h after end**.
After the end the room itself shows the close and feedback step. Otherwise it opens the event
page. It shows on **every page that has the header**, including the event's own pages and
`compact` pages. The one exception is the page it points to.

**D2: who sees it.**
- A registered, signed-in person sees it all day on the event's local date, as today.
- A non-registered person, signed in or out, sees it only for prep-enabled events and only inside
  the window. For them it replaces the normal primary CTA, so there is still one primary.
- Prep-off events (hikes, events run by external hosts) are registered-only and open the event page.

**D3: Go back.** Back still returns to where the person came from. During the window, if there is
no previous in-app page, the fallback is the event room instead of `/feed`. The room is the same
destination the header button opens.

**D4: room re-entry.** On the first visit the person goes through Ready. On later visits (a
readiness value is already set) they go straight to their current step at the table. The
transcription control is the small toggle on the table screen. P1337 already made that bar the
only way to start transcription (`RoomTranscribeIdleBar` on `/meet`, verified 2026-10-07), so
this needs no new UI. This supersedes P1307 D10.

## Invariants

- **One primary action per view (P955).** "Today's event" replaces the logged-out marketing CTA
  and never sits beside it.
- **Transcription stays opt-in by explicit tap (P1307 D12, decisions.md 2026-09-14).** Skipping
  Ready must not start transcription or imply consent. Only the table screen's Transcribe tap starts it.
- **The arrival and preparation gates still run before the room** (P1380, P1336). Re-entry skips
  only Ready, never "Have you arrived?" or the prep offer.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A non-registered visitor's extra query (events in the window) on every page load | MITIGATE | Use one module-level cached query (TTL), the same as `useTonightsEvent`, and fail quiet |
| The header crowds at 320px on compact pages | MITIGATE | Icon-only below 360px (P1323 precedent). Visual QA at 320, 375 and desktop |
| `/pricing` currently hides the button (its paid offer is the page's primary) | ACCEPT | Kept as is. P955 decides it, and D1's "every page" does not name pricing. Flagged to the founder |
| Two prep-enabled events in the window at once | ACCEPT | Show the earliest one, as `pickTonightsEvent` already does |
| Back from a non-room page during the window goes to the room for someone who never meant to go there | ACCEPT | This only happens when there is no earlier in-app page, which is the stranded case |

**Non-Goals**
- Do NOT add an impression analytics event (the H1 data gap). That is a separate decision.
- Do NOT change the room's own internal steps or "Back to readiness".
- Do NOT change any DB schema or RLS.

## Acceptance Criteria

- [ ] A registered, signed-in person on the event day sees "Today's event" on the feed, on the
      event page, on `/events/:slug/meet` and on a stake page. The button is absent only on the
      page it links to.
- [ ] Inside the window (1h before start to 3h after end) it links to `/events/:slug/room` for a
      prep-enabled event. Outside the window it links to the event page.
- [ ] A signed-out visitor inside the window of a prep-enabled event sees "Today's event" instead
      of the usual primary CTA. Outside the window, or for a prep-off event, they see the usual CTA.
- [ ] A prep-off event shows the button only to registered people and links to the event page.
- [ ] "Go back" on a page opened fresh (no earlier in-app page) during the window opens the event
      room. Outside the window it falls back as before. With an in-app history it pops as before.
- [ ] A person returning to `/events/:slug/room` with readiness already set lands on `/meet`.
      A first visit lands on `/ready`.
- [ ] Unit tests cover each rule above. Lint, typecheck and the pre-commit checks pass. Screenshots
      at 320, 375 and desktop pass the visual-QA checklist.

## Related

- P1351 (header button), P1428 (button opens the room), P1307 D10 (superseded by D4),
  P1337 (Transcribe bar on the table), P1364 (useGoBack), P955 (one primary).
- decisions.md 2026-09-22 [product] "The header's main button follows context". Its rule "never
  on that event's own pages" is superseded by D1.
