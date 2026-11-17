---
status: qa
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
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
spec_review_hash: 35f78bb6781c75f2101cb9498dd7a0c8483b8d896dd6f17aee6fd153f3add1b3
spec_review_vendors: [gemini, openrouter]
date_resolved: 2026-11-17
root_cause: P1603 filtered hidden events out of every global list by design but never rendered the personal view it promised; the two personal reads existed with no callers.
resolution: Third tab My events on the standalone /events/list page only, from one new getMyEvents read (hosted + registered, hidden included, 3 requests signed in, 0 signed out), keyed by the session-verified viewer.
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
2. Open the Events page from the menu (`/events/list`). It is not under Upcoming.
3. Check the profile, the header and the home page. It is not listed anywhere.
4. Sign in as a second user, open the event's link and register, then open `/events/list`. It is not listed for them either.

**Reproduction rate:** 100% (from code: every list read carries `.eq('is_hidden', false)`, and no personal list is rendered. Not yet reproduced in a browser.)

## Expected Behavior

Founder decision, 2026-11-17: everything stays under Events, so there is no new page, no profile-menu entry and no admin page.

- The Events page (`/events/list`, the menu's **Events** item, `EVENTS_LIST_TO` in `nav-links.ts`) gets a third tab: **Upcoming · Past · My events**. Bare `/events` keeps redirecting to the Chiang Mai group page and is unchanged.
- **My events** lists every event the signed-in person hosts or has registered for, hidden ones included, each with the existing Hidden mark and the existing Host or Going badge. Upcoming events come first (soonest first), then past ones.
- The tab shows only to a signed-in person who hosts or registered for at least one event. Everyone else sees the page exactly as now.
- Upcoming and Past are unchanged: hidden events stay out of them, for everyone.
- Only the standalone `/events/list` page gets the tab. Group pages and embedded lists don't. Founder confirmed 2026-11-17: "Build the My events tab on the main Events page only, not on group pages."

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

- **Worst case:** a person with more than 100 events adds one counts request per further 100 (the same batching the global lists use), so decision 9's "at most 3" holds for E ≤ 100. Both personal reads are ordered newest first with no limit, so rows beyond the server's max-rows cap (PostgREST default 1000) are dropped from the old end: for the hosted read, the events with the oldest `datetime`; for the registered read, the registrations made earliest (ordered by `rsvped_at`), which in a rare case could include an event far in the future that was registered for long ago. Known limitation, accepted at current scale.
- **Guard:** the "requests:" test fails if a signed-in visit makes other than 3 personal reads or a signed-out visit makes any; the P1532 ledger reports users created and deleted per run.

## Acceptance Criteria

- [x] A host who created a hidden event sees it under Events → My events, marked Hidden. *(e2e: "the host finds their own hidden event under My events, marked Hidden and Host")*
- [x] A person who registered for someone else's hidden event sees it under My events, marked Hidden. *(e2e: "a registered guest finds someone else's hidden event…")*
- [x] Signed out, or signed in with no events: there is no My events tab, and the page looks as it does today. *(e2e: "signed out…", "signed in with no events…"; unit: two-pill row classes byte-identical to main)*
- [x] Upcoming and Past still never show a hidden event, to anyone, the host included. *(e2e: "Upcoming and Past never show a hidden event, the host included", public event as positive control)*
- [x] An event that is both hosted and RSVP'd by the same person appears once. *(e2e: count 1, Host mark, no Going mark; unit: fetchMyEvents dedup)*
- [x] A registered person's event under My events shows the Going mark; a hosted one shows the Host mark; going counts match the event page. *(e2e: marks; counts asserted against the true count ("2 going" = host + guest), which a missing counts read would show as 1. Not compared side by side with the event page.)*
- [x] My events lists upcoming events first (soonest first), then past ones (most recent first) under a "Past" divider, split by the same grace rule as the Upcoming and Past tabs. *(e2e: ordered titles incl. a 2h-old event inside the grace window; unit: p1698-fetch-my-events boundary, cancelled, completed)*
- [x] A group page (`/groups/<slug>` events tab) never shows a My events tab, even for a viewer who hosts events. *(e2e: group page test; unit: getMyEvents never called with orgId, embedded or ?series=)*
- [x] After signing out, or switching to an account with no events, the previous person's events and the My events tab are gone, and the page shows Upcoming. *(unit: sign-out, A→B, session-moves-first, late answer for A, tab-reset effect (mutation-proven))*
- [x] From My events, a hidden event's card opens its event page. *(e2e: "from My events, a hidden event's card opens its event page")*
- [x] The founder has seen screenshots at phone (375px and 320px) and desktop width before ship. *(sent 2026-11-17 with phone emulation at 375 and 320 plus desktop; founder also tested the branch on localhost and replied "looks good")*
- [x] Regression test passes: `e2e/p1698-my-events-tab.spec.ts` *(final run 2026-11-17 with P1603 + P1060 specs, --retries=0, JSON reporter: 34 expected, 0 unexpected, 0 flaky; red before the fix: 6 of 10 failed for "no My events tab")*
- [x] No console errors on `/events/list` in any of its three tabs. *(e2e smoke; the filter's only exemption, unresolvable banner hosts in TEST data, was proven not to swallow a real error by an injected-error control)*
- [x] A past event (completed, or started) shows "You Hosted" / "You Went" instead of the present tense, on every list that uses the event card; cancelled keeps "You Were …". (Founder decision 2026-11-17.) *(unit: src/tests/p1698-event-card-badges.test.tsx, 10 cells, red 4 then green; e2e: past cards in My events read "You Hosted"; the change is inside EventCard, which every list renders; review round 4: Gemini + GLM, Codex missing)*

## Resolution

**Fixed:** 2026-11-17 on `feature/p1698-my-events-tab`.
**Root cause:** P1603 filters hidden events out of every global list (deliberately) but the personal view it relied on was never built; `getUserHostedEvents` and `getUserRegisteredEvents` had no callers.
**Resolution:** a My events tab on `/events/list` only, fed by one `getMyEvents` read (`src/app/data/event-list-reads.ts` `fetchMyEvents`), which replaces the two uncalled reads. Design decisions 1-9 above hold as built; the review rounds added: header actions follow the shown tab's read, both personal reads ordered newest first, a wrap fallback for the three-pill row at long counts, and Retry also re-reads My events when it has not answered.

**Review:** spec review Gemini + GLM (2 of 2). Code review in three rounds: Gemini (3 of 3), GLM (3 of 3), `/finish code` criteria subagent (2 of 2), a visual-QA subagent on screenshots only (1 of 1); Codex missing (usage limit). 7 findings fixed. Set aside with reasons: a failed counts read fails the whole personal read (same rule as the global lists); no deadline on the personal read and no in-page retry when only the personal read fails (a hang or failure is today's page; reload recovers); registered rows past a 1000-row cap drop by RSVP date; WAI-ARIA tab semantics (older gap); the mock's copied 12h constant.

**Round 3 (founder decision 2026-11-17):** past events read "You Hosted" / "You Went" on the event card, by the card's own past rule (completed, or started), shared with the attended count. An event that started under 12 hours ago still sits under Upcoming but reads "You Hosted · attended".

**Known observations, not changed:** the home page's next-events rail never passes the viewer's RSVP to the card, so a registered guest sees no "You're Going" there (also on main; found in review round 4). on phones under 400px the Upcoming and Past pills drop to smaller text once My events appears (founder to judge on screenshots). One unexplained 500 during a run while other worktrees loaded the shared TEST server; it did not recur in 4 repeats, and the smoke test now names the URL of any status 400 or above.

**Files:** `src/app/prototypes/events/components/EventsList.tsx`, `src/app/data/event-list-reads.ts`, `src/app/data/events-service{.interface,-real,-mock}.ts`. **Tests:** `e2e/p1698-my-events-tab.spec.ts`, `src/tests/p1698-my-events-tab.test.tsx`, `src/tests/p1698-fetch-my-events.test.ts`, plus fixture stubs in `src/tests/p1586-events-list-contract.test.tsx` and `src/tests/p1545-events-cm-card.test.tsx`.
