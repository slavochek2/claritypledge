---
status: in-progress
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
delivery_stage: fix
pipeline_ran: [create-bug, fix]
spec_review_hash: fa3e4fba6f0a04bc9aeaf7825c7d8be96883144465796a8866480f687c84c425
spec_review_vendors: [gemini, openrouter]
---

# P1698: A hidden event cannot be found by its own host or by the people registered for it

## Summary

P1603 promised that a hidden event stays visible in "the host's own events" and "a registered person's own events", marked Hidden. No such view is rendered anywhere, so the only way back to a hidden event is its exact link. The founder, as host:

> "I don't see it even as a host which is weird."

## Root Cause

Every rendered list (the global Upcoming and Past reads) filters hidden events out explicitly, including for the host. This is deliberate, per [decisions.md](../docs/decisions.md) 2026-11-03 [technical]: a hidden event must not take a public event's place in a global list. That entry only holds together if a personal view exists, and none does:

- `getUserRegisteredEvents` and `getUserHostedEvents` exist (`src/app/data/events-service-real.ts:1030`, `:1075`) and apply no `is_hidden` filter. Grep of `src/` for either name outside the service, its interface and its mock: **no callers**.
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
- Only the standalone `/events` list gets the tab. Group pages and embedded lists don't. Founder confirmed 2026-11-17: "Build the My events tab on the main Events page only, not on group pages."

## Actual Behavior

No list anywhere shows a hidden event. The host and the people who registered can reach it only with the exact link.

## Affected Files

- `src/app/prototypes/events/components/EventsList.tsx`: the tab bar (~line 258) and the `activeTab` state (line 80). This is where the third tab goes.
- `src/app/data/events-service-real.ts:1030`, `:1075`: the existing unused reads, to be used here.
- `src/app/prototypes/events/components/EventCard.tsx:52-76`: already renders the Host, Going and Hidden marks.
- `src/app/data/event-list-reads.ts`: `attachRsvpCounts` and the grace-cutoff split rules the global lists use (`selectPastEventRows`, line 58).
- `src/app/data/events-service.interface.ts`, `src/app/data/events-service-mock.ts`: change with any signature change to the personal reads.

## Severity

**Medium.** Hosts and the people who registered lose track of hidden events. A workaround exists (keep the link), and no data is exposed.

## Fix Approach

Add a `my` tab to `EventsList`, loaded from the viewer's hosted and registered events, split into upcoming then past, and rendered with the existing `EventCard`. This needs no database change: RLS already returns hidden rows to the host and to people who registered.

### Design decisions (spec review 2026-11-17, Gemini + GLM; each verified against the code)

1. **Where.** The tab exists only when `!embedded && !orgId && !isSeriesFiltered`. Both props are checked, so an embedded list without an org gets no tab either.
2. **Keyed by the verified viewer.** The personal read is its own state, never part of `ListRead` (which is keyed by group only). It is tagged with the session-verified `viewerId` (P1560) and shown only while that tag equals the current `viewerId`. On sign-out or an account switch, the previous person's events, and the tab itself, are gone in the same render. No module-level or service-level cache of personal events.
3. **Going and Host marks.** The existing marks read covers only the global lists' ids, so it never contains a hidden event. In the My events tab, Going comes from the registered read itself (registered means going), and Host from `hostId === viewerId` as now. An event the viewer both hosts and registered for shows once, with the Host mark (EventCard already prefers Host).
4. **Going counts.** The personal reads never attached RSVP counts, so their cards would show wrong going numbers. The My events list gets counts through the same `attachRsvpCounts` the global lists use.
5. **Upcoming vs past.** The same rules as the global lists, never a plain `datetime >= now`: upcoming = `status` upcoming or cancelled and `datetime >= now - EVENT_GRACE_HOURS`; everything else is past. Upcoming soonest first, past most recent first (the Past tab's own order). The past half sits under the existing divider style labelled "Past". An event therefore never counts as upcoming in one tab and past in another.
6. **Tab label.** `My events (N)`, like its siblings `Upcoming (N)` and `Past (N)`. The pill row must fit at 320px without overflow; tighten pill padding on narrow screens if it does not.
7. **Loading and failure.** The tab appears only once the personal read has answered with at least one event. While it loads, the page is exactly today's page (no placeholder pill, no jump in Upcoming). A failed personal read shows no tab, which is today's page, and reports the error (`logDbError`/Sentry); it never fails the whole page and never retries in a loop.
8. **Tab disappears while selected.** If the personal list becomes empty or unknown (sign-out, switch) while `activeTab === 'my'`, the active tab falls back to `upcoming`.
9. **Requests.** Signed-out visitors: zero added requests. Signed-in: at most 3 added requests per page visit, issued in parallel where they do not depend on each other, and the counts read only when the list is non-empty. Measured numbers go in the Cost Budget.

Observed and left out of scope: on the existing Past tab, a past event the viewer hosted still reads "You're Hosting" (present tense). My events inherits that wording; changing it is a separate founder call.

## Cost Budget

To be filled by the build with measured request counts (metered-services.md: this adds a per-user Supabase read on every signed-in `/events` visit, and the e2e spec creates test users).

## Acceptance Criteria

- [ ] A host who created a hidden event sees it under Events → My events, marked Hidden.
- [ ] A person who registered for someone else's hidden event sees it under My events, marked Hidden.
- [ ] Signed out, or signed in with no events: there is no My events tab, and the page looks as it does today.
- [ ] Upcoming and Past still never show a hidden event, to anyone, the host included.
- [ ] An event that is both hosted and RSVP'd by the same person appears once.
- [ ] A registered person's event under My events shows the Going mark; a hosted one shows the Host mark; going counts match the event page.
- [ ] My events lists upcoming events first (soonest first), then past ones (most recent first) under a "Past" divider, split by the same grace rule as the Upcoming and Past tabs.
- [ ] A group page (`/groups/<slug>` events tab) never shows a My events tab, even for a viewer who hosts events.
- [ ] After signing out, or switching to an account with no events, the previous person's events and the My events tab are gone, and the page shows Upcoming.
- [ ] From My events, a hidden event's card opens its event page.
- [ ] The founder has seen screenshots at phone (375px and 320px) and desktop width before ship.
- [ ] Regression test passes: `e2e/p1698-my-events-tab.spec.ts`
- [ ] No console errors on `/events` in any of its three tabs.
