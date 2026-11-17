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

Applies because this adds a per-user Supabase read on every signed-in `/events/list` visit, and the e2e spec creates test users (metered-services.md, rule 6). Requests counted in the browser by `e2e/p1698-my-events-tab.spec.ts` ("requests:" test); bytes measured there on the TEST server.

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests | Signed-in visit to the standalone list: `1 hosted read ∥ 1 registered read (RSVPs with their events embedded) + ceil(E / 100) counts reads (E = the person's events, skipped when E = 0) = 3 for E ≤ 100` (measured: 3). Signed-out visit, group page, embedded list, series filter: `0` (measured: 0 signed out). The removed `getUserRegisteredEvents` / `getUserHostedEvents` had no callers, so nothing is subtracted | 0 (no timer, poll or retry; one read per verified person per mount, aborted on unmount or person change, and a hidden tab sends nothing until shown) | Setup per worker: `3 users x 2 (auth create + profile insert) + 1 org insert + 1 membership insert + 6 event inserts + 1 membership check (group event) + 2 RSVP inserts = 17`; cleanup per worker: `6 event deletes + 1 org delete + 3 user deletes x ≤ 8 = ≤ 31`; sessions: `≤ 3 users x ≤ 4 (token, cached per worker) = ≤ 12`; `x 2 workers` (beforeAll runs once per worker; the ledger measured 6 users) `= ≤ 120`. Pages: `13 page loads x ≤ 63 REST reads (P1586's measured worst chain) = ≤ 819`. Ledger sweep `1`. Total `≤ 940` |
| Egress (bytes) | `E x ~1.0 KB per event row (measured 5,991 B for 6 hosted rows) + R x ~1.0 KB (registered rows, measured 1,057 B for 1) + E x ~35 B (count rows, measured 212 B) `; measured visit with E = 6, R = 1: `5,991 + 1,057 + 212 = 7,260 B` | 0 | Dominated by the existing global lists, not this change: `13 loads x (559 past + 10 upcoming rows on TEST) x ~1.0 KB = ~7.4 MB`, plus the personal reads `≤ 11 signed-in loads x 7.3 KB = ~80 KB`. Total `~7.5 MB`, about 0.15% of the 5 GB free egress |
| Log lines | Success: 0. A failed personal read: `1 logDbError (Sentry in prod) per failed visit`, and the tab stays away; never retried | 0 | 0 provoked failures |
| Service unit | none | none | `3 test users x 2 workers = 6 per run, deleted in the run` (P1532 ledger: "created 6 users; deleted 6") |

1. **Fits the plan limit today?** Fits. Supabase Free row: 5 GB egress per month. Added egress per month = `signed-in /events/list visits per month x ~(1.0 KB x events per person + 35 B x events per person)`; at the measured 7.3 KB per visit that is `visits per month x 7.3 KB`, which stays under 1% of 5 GB below ~6,800 visits per month. Requests are not a billed unit on the Free plan. Test runs: `runs per month x ~7.5 MB` against the TEST organisation's own 5 GB.
2. **Fits at 10x?** Fits: the per-visit cost is linear in a person's own events (single digits to tens), not in the global list, and 10x visits stays far under 5 GB at the read sizes measured.
3. **If either answer is no:** not applicable. The next step up would be the Supabase Pro plan, from $25/month with 250 GB egress (registry row).

- **Worst case:** a person with more than 100 events adds one counts request per further 100 (the same batching the global lists use), so decision 9's "at most 3" holds for E ≤ 100.
- **Guard:** the "requests:" test fails if a signed-in visit makes other than 3 personal reads or a signed-out visit makes any; the P1532 ledger reports users created and deleted per run.

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
