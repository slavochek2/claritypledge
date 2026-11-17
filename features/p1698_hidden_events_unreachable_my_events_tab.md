---
status: week
type: bug
rank: 345
severity: medium
date_reported: 2026-11-17
created_date: 2026-11-17
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [events, hidden-events, p1603, events-list]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1698: A hidden event cannot be found by its own host or by the people registered for it

## Summary

P1603 promised that a hidden event stays visible in "the host's own events" and "a registered person's own events", marked Hidden. No such view is rendered anywhere, so the only way back to a hidden event is its exact link. The founder, as host:

> "I don't see it even as a host which is weird."

## Root Cause

Every list filters hidden events out explicitly, including for the host. This is deliberate, per [decisions.md](../docs/decisions.md) 2026-11-03 [technical]: a hidden event must not take a public event's place in a global list. That entry only holds together if a personal view exists, and none does:

- `getUserHostedEvents` and `getUserRegisteredEvents` exist (`src/app/data/events-service-real.ts:1030`, `:1075`) and apply no `is_hidden` filter. Grep of `src/` for either name outside the service, its interface and its mock: **no callers**.
- The P1603 AC "the host and an RSVP'd person still see it ... in their own views, marked hidden" was checked on the strength of the event page alone (`EventDetail.tsx:840`).

## Reproduction Steps

1. Sign in, open `/events/new`, create an event with "Hidden event" ticked.
2. Open `/events`. It is not under Upcoming.
3. Check the profile, the header and the home page. It is not listed anywhere.
4. Sign in as a second user, open the event's link and register, then open `/events`. It is not listed for them either.

**Reproduction rate:** 100% (from code: every list read carries `.eq('is_hidden', false)`, and no personal list is rendered. Not yet reproduced in a browser.)

## Expected Behavior

Founder decision, 2026-11-17: everything stays under Events, so there is no new page, no profile-menu entry and no admin page.

- `/events` gets a third tab: **Upcoming · Past · My events**.
- **My events** lists every event the signed-in person hosts or has registered for, hidden ones included, each with the existing Hidden mark and the existing Host or Going badge. Upcoming events come first (soonest first), then past ones.
- The tab shows only to a signed-in person who hosts or registered for at least one event. Everyone else sees the page exactly as now.
- Upcoming and Past are unchanged: hidden events stay out of them, for everyone.
- Only the standalone `/events` list gets the tab. Group pages and embedded lists don't. [FOUNDER DECISION: confirm the tab is on standalone `/events` only]

## Actual Behavior

No list anywhere shows a hidden event. The host and the people who registered can reach it only with the exact link.

## Affected Files

- `src/app/prototypes/events/components/EventsList.tsx`: the tab bar (~line 258) and the `activeTab` state (line 80). This is where the third tab goes.
- `src/app/data/events-service-real.ts:1030`, `:1075`: the existing unused reads, to be used here.
- `src/app/prototypes/events/components/EventCard.tsx:52-76`: already renders the Host, Going and Hidden marks.

## Severity

**Medium.** Hosts and the people who registered lose track of hidden events. A workaround exists (keep the link), and no data is exposed.

## Fix Approach

Add a `my` tab to `EventsList`, loaded from `getUserHostedEvents` plus `getUserRegisteredEvents`, deduplicated by id and split into upcoming then past. Render it with the existing `EventCard`. This needs no database change: RLS already returns hidden rows to the host and to people who registered. Check whether one combined read is enough before keeping two requests (see metered-services.md).

## Acceptance Criteria

- [ ] A host who created a hidden event sees it under Events → My events, marked Hidden.
- [ ] A person who registered for someone else's hidden event sees it under My events, marked Hidden.
- [ ] Signed out, or signed in with no events: there is no My events tab, and the page looks as it does today.
- [ ] Upcoming and Past still never show a hidden event, to anyone, the host included.
- [ ] An event that is both hosted and RSVP'd by the same person appears once.
- [ ] The founder has seen screenshots at phone (375px and 320px) and desktop width before ship.
- [ ] Regression test passes: `e2e/p1698-my-events-tab.spec.ts`
- [ ] No console errors on `/events` in any tab.
