---
status: week
type: story
rank: 60
workstream: events
created_date: '2026-10-22'
tags: [events, feedback, close, clarity-night, social-hike]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1548: Feedback always open, renamed from Close

## Problem

**Situation:** The event room step bar opens the Close step only after the host presses "End the evening" (which exists only if rounds ran) or 12 hours after the start (`EventRoomMeet.tsx` ~468, `RoomSteps.tsx:30`, `EventHostPage.tsx:1695`). The `/events/:slug/close` page itself has no time lock. Users see the word "Close" in the step bar, the URL, notices ("This has closed") and host copy ("closing screen").

**Complication:** Events without rounds (hikes, most series) have no host trigger, so attendees wait 12 hours or never find feedback. "Close" also tells people something is shutting, when the step is just feedback.

> Founder, verbatim: "I don't want to close anything. They should be able to just give feedback."

**Question:** How does feedback open by itself for every event once it starts, with no host action, under a name that says what it is?

## Appetite

Blast radius: medium, touches the live Clarity Night room flow and every event room. Reversibility: high, code and copy only, no data change. Decision density: low, decided 2026-10-22.

## Founder decisions (2026-10-22)

1. Feedback opens by itself once an event has started, for every event. The host never has to press anything.
2. Clarity Night's "End the evening" stays as an optional push that moves phones to feedback. It is never a lock.
3. The user-visible word "Close" becomes "Feedback" everywhere.

## Solution

- **Open at start for all events.** Generalize the open-at-start behaviour P1542 gives hikes (via the recipe) to every event: the step bar's feedback step is available from the event's start time. Remove the 12h fallback and the host-trigger dependency as gates.
  - UNVERIFIED: P1542's current text does not name an open-at-start flag. If P1542 ships without one, this spec introduces the rule directly (start time reached = open) rather than as a recipe flag.
- **"End the evening" stays a push.** Pressing it still moves attendees' phones to the feedback step. Not pressing it changes nothing about availability.
- **Rename.** Step bar label, page heading, notices ("This has closed" and siblings) and host copy ("closing screen") say Feedback. Route becomes `/events/:slug/feedback`; `/events/:slug/close` redirects there, preserving query params. Internal identifiers (table names, step ids, file names) may stay as they are; `/dev` decides, renaming only what users see.

[FOUNDER DECISION: replacement for "This has closed" and similar notices. Draft: "Feedback is open" / host: "feedback screen". Confirm or rewrite.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Attendees give feedback mid-evening before rounds finish | ACCEPT | Founder chose availability over gating; "End the evening" still nudges at the right moment |
| Old shared `/close` links break | MITIGATE | Redirect `/close` to `/feedback` |
| Renaming internals causes churn in tests and scripts (`event-close-results.sh`) | MITIGATE | Rename user-visible text only unless `/dev` finds a cheap safe rename |
| P1542 not shipped when this starts | MITIGATE | Depends-on P1542; do not start before it lands |

**Non-Goals**
- Do NOT change the feedback steps themselves (recipes are P1542).
- Do NOT remove "End the evening".
- Do NOT add any host-side open/close toggle.
- Do NOT change the Event Room visibility rule (signed-in only).

## Acceptance Criteria

- [ ] On any event (Clarity Night, Social Hike, no-series), the step bar shows Feedback as available once the start time has passed, with no host action.
- [ ] Before the start time, Feedback is not shown as available.
- [ ] On Clarity Night, pressing "End the evening" moves attendees' phones to Feedback; without pressing it, Feedback is still available.
- [ ] No user-visible "Close"/"closed"/"closing" wording remains in the room, the feedback page, notices or host page (grep of user-facing strings shown).
- [ ] `/events/:slug/feedback` renders the feedback page; `/events/:slug/close` redirects to it.
- [ ] Existing close e2e tests pass (updated only for the renamed strings and route).

## Related

Depends on: P1542 (recipes, hike open-at-start). Followed by: P1549 (shares room and feedback screens). P1389 (closing sequence) · `EventRoomMeet.tsx` · `RoomSteps.tsx` · `EventHostPage.tsx`
