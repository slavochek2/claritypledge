---
status: qa
type: bug
rank: 358
severity: critical
workstream: events
date_reported: 2026-11-25
created_date: 2026-11-25
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [events, event-room, react-hooks, regression]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p1730-reproduce.test.tsx
  root_cause: "useEventRoomCounts is called below EventRoomMeet's early returns (loader, offline, gate), so the first room render after any of them runs one more hook and React throws #310"
  confidence: high
  surfaces_in_scope: [loading-then-room, offline-then-room, gate-then-room, non-hike-room]
  surfaces_deferred: []
  reproduced_at: 2026-11-25
date_resolved: 2026-11-25
root_cause: "useEventRoomCounts called below EventRoomMeet's early returns (P1675), so the hook count changed between the loader/offline/gate render and the room render"
resolution: "moved the useEventRoomCounts call above the early returns; it does not poll behind the offline screen, before the first seat read and join end, or for a room other than the one in the URL; a failing count read is reported once per event per page load"
spec_review_hash: 6c5a46add64553cebbf39e7b68b43448a8e80d078de01da4bed6119f3f0a52f6
spec_review_vendors: [gemini, openrouter]
---

# P1730: Event room /meet crashes with "Something went wrong" (React #310) once it loads

## Summary

Opening an event room at `/events/<slug>/meet` on prod shows the error boundary ("Something went wrong … Refresh Page") because React throws minified error #310, "Rendered more hooks than during the previous render". Regression from P1675 (`7e57904e1`, 2026-11-17).

## Root Cause

Confirmed by /reproduce (canary `src/tests/p1730-reproduce.test.tsx`, 4 of 4 red with "Rendered more hooks than during the previous render" before the fix): `useEventRoomCounts` is called at `EventRoomMeet.tsx:426`, **after** the early returns at lines 407–410 (`<ClarityPageLoader />` while loading, `<NeedsConnection />` offline, `<EventRoomGateScreen />` when not granted). The first render (still loading) returns early having run N hooks; the next render (loaded, granted) reaches line 426 and runs N+1, so React throws #310. The same happens mid-session: after an offline or cached access read, a reconnect re-runs the access read and sets `loading` true again (`EventRoomAccess.tsx`, `reconnectKey`), so room → loader → room crashes too. (The seat read does not: it sets `loading` only for a different event.) A room whose first render is already loaded does not crash, which is why every existing room test, all mounted with `loading: false`, stayed green. The prod stack matches: `useState` ← `use-event-room-counts` ← `EventRoomMeet`.

Why nothing caught it: `eslint.config.js` ignores `src/app/prototypes/**`, so `react-hooks/rules-of-hooks` never runs on `EventRoomMeet.tsx`, even though the route at `src/App.tsx:104` serves it in production.

## Invariants

- Every hook in a component runs on every render, before any early return. The component already applied this to `stepKey` (its comment above the returns: "computed here because hooks must run before the early returns"); line 426 broke it.

## Reproduction Steps

1. Signed in as a person with access to an event (prod or local), open `/events/<slug>/meet`.
2. The loader shows while the access and seat reads are in flight.
3. Once they resolve, observe the error boundary: "Something went wrong".

**Reproduction rate:** 100% in the canary for each of loader, offline screen and gate screen giving way to the room, hike and non-hike alike; on prod, whenever the page renders the loader first (the normal path). Seen on prod by the founder on 2026-11-25 at 370 px wide (a mastermind event, not a hike, so the `registration === 'hike'` gate does not help: the hook is called whatever `enabled` is).

## Expected Behavior

The room renders after loading.

## Actual Behavior

The error boundary replaces the room. Console: `Error: Minified React error #310` at `useState` in `use-event-room-counts` ← `vo` (EventRoomMeet).

## Affected Files

- `src/app/prototypes/events/components/EventRoomMeet.tsx:426`: hook call below the early returns at 407–410.
- `src/app/data/event-room-counts.ts`: a failing read reported to Sentry on every 30 s read (P1730 caps it, see Resolution).
- `src/app/data/db-error-logger.ts`: `logDbError` now returns whether it reported, so the cap above counts only real reports.
- `eslint.config.js:9`: `src/app/prototypes/**` ignore means rules-of-hooks never checked this file.

## Severity

**Critical**: on the normal path (the loader shows first) every visitor's room crashes once it loads, for every event type, and again when a reconnect re-runs an access read that was cached or offline.

## Fix Approach

Move only the `useEventRoomCounts` call above the early returns. `hostMerged` and `hostMergedUndecided` stay where they are: they are plain values, not hooks. The arguments (`event?.id`, `granted`, `recipeForEvent(event)`) are already available there; `recipeForEvent(event)` with a null event already runs above the returns.

Not gated on the access `loading` (spec review, Gemini): that loader flashes when a reconnect re-runs a cached or offline access read, and toggling `enabled` on it would reset the counts and re-read each time. Code review then added three gates, each of which changes only when the room itself changes, not on a flash: `!accessOffline`, `!selfLoading` (true only while a new event's first seat read and join run) and the current room's slug. See Resolution.

Why nothing caught it: `src/app/prototypes/**` is excluded from ESLint. Whether to lint that tree for rules-of-hooks is a separate decision, filed as INBOX-406 (`docs/process-learnings.md`); the one-off run in Evidence found no other violation.

## Acceptance Criteria

- [x] `/events/<slug>/meet` renders the room after the loader, with no error boundary (also after the loader shows again mid-session)
- [x] No React #310 in the console during load
- [x] Hike rooms still show the "N registered, not here yet" line and the host's merged counts (P1675 section 6)
- [x] Regression test passes: `src/tests/p1730-reproduce.test.tsx` (loader, offline and gate screens giving way to the room; host merged count; mid-session loader flash; no hook-order console error)

## Resolution

**Fixed:** 2026-11-25. `useEventRoomCounts` moved above the early returns in `EventRoomMeet.tsx`, and its `enabled` now also requires `!accessOffline` and `!selfLoading`, so the poll is off behind the offline screen and until the first seat read (and join) ends. When a reconnect re-runs a cached access read, the poll keeps running through that brief loader, deliberately (see Fix Approach), and only for the room in the URL. Recovery from the offline screen is different: the poll was already off there, so it starts again with a fresh read.

Round 4 (Codex): `event?.slug === slug` (both from the access hook: the URL's slug and the event it has loaded) scopes the poll to the room in the URL. It is defensive. The shipped route remounts the page on a new pathname (`src/App.tsx`, the `ChunkErrorBoundary` keyed on `pathname`), so moving to another room's `/meet` starts with no event and no poll; only a retained mount (a route marked `stable`, as `/chats` is) would keep the old event while the next room loads, and the unit case models that.

The second part came from code review (all four reviewers raised it). With the hook above the returns, it also ran behind `<NeedsConnection />`. An offline access read keeps the event and registration, so `granted` stayed true, and the 30 s poll kept calling a dead network. Turning it off there also refreshes the counts at once when the room comes back, instead of up to 30 s later. The counts clear while offline, so on return the line is absent for one read's latency (accepted: fresh numbers over stale ones).

Round 12 (Codex): restoring the poll restores its failure path too. `getEventRoomCounts` sent a Sentry event (through `logDbError`) for every failing read, so a persistent failure (a permission or schema error) meant one event every 30 s per open room. It now reports the first failure for each event once per page load and stays quiet after that; every read still returns null and keeps what is shown.

Round 2 (Codex): the first read could start while the seat read was still joining a first arrival. `not_here` counts registered people with no room row, so the room could open with this person counted as "not here yet" for up to 30 s. `!selfLoading` restores the original order (join, then read). It does not flicker: the seat read sets loading only for a new event. Round 13 (Codex) said the 30 s interval could fire in a tab already hidden before `visibilitychange` stops it (`src/lib/visible-poll.ts`); dropped: in the HTML standard's "update the visibility state" steps the state changes and the event fires in one algorithm, so no timer task runs between them (reasoned from the standard, not tested), and the helper is shared by every poll, unchanged here. Two other review findings were dropped after checking: "unhandled rejection" (`getEventRoomCounts` catches everything and returns null) and gating on loading (rejected above).

**Evidence:**
- `src/tests/p1730-reproduce.test.tsx`: the first 6 cases were red against the unfixed file ("Rendered more hooks than during the previous render") and all 9 are green with the fix. Cases: loader, offline screen and gate screen each giving way to the room, each screen asserted before the room replaces it; a non-hike room; the host's merged In, Out and Undecided numbers after the loader (mocked to differ from the local roster); a mid-session loader flash (one count read, kept across it); moving to another room's URL (no read for the old room while the new one loads, then one read for the new room); the room going offline and back (no read for 95 s behind the offline screen, one read on return); a first arrival (no read while the seat read and join run, one read once the room shows). The offline, first-arrival and room-change cases each fail with their gate removed. Every case asserts no hook-order console error.
- Real browser on TEST (`e2e/p1114-event-room.spec.ts`, "every answer state" and "freshly-arrived"): 2 of 2 fail against the unfixed file (the roster never renders), 2 of 2 pass with the fix. A signed-in registered attendee then sees the room at 375 px, 320 px and 1280 px, with no #310 in the console.
- Real browser on TEST, hike room (`e2e/p1730-hike-first-arrival.spec.ts`): the test holds the first arrival's join and asserts that no count read starts while it is held (3 s) and that the first one starts after the join's server response is back (timed in the test's route handler, just before it is handed to the page), and that the line reads "and 1 registered, not here yet" (one other registrant is absent). It passes with the fix and fails with `!selfLoading` removed. The p1114 rooms are not hikes, so this is the only test that exercises the real seat hook's join-then-count order.
- `src/tests/p1730-count-failure-reports.test.ts`: three failing reads for one event report once; two events report twice; a network blip and an expired token (breadcrumbs only) followed by a 502 report the 502 once; two different real failures for one event on one load report once; a successful read reports nothing. The first case fails with the once-only check removed, the third with the report counted before `logDbError` decides. `src/tests/db-error-logger.test.ts` pins the logger's new return value (true for a real error, false for a blip, an expired token or no error).
- The room's ten existing unit suites pass (93 passed, 1 skipped).
- `react-hooks/rules-of-hooks` over all 162 files in `src/app/prototypes/**` (the tree ESLint ignores): 1 violation before the fix (this one), 0 after.

**Why the existing e2e did not catch it:** `e2e/p1114-event-room.spec.ts` opens `/meet` and fails on the unfixed code, but no CI workflow runs it: CI runs Playwright only for the public-route CSP and prod-health smokes, which never reach an auth-gated room.

**Known limitations** (code review, not changed):
- If the network drops while the room is open and the access read is not re-run, `offline` stays false and the poll keeps calling every 30 s; each failed read returns null and is not retried. Unchanged from P1675.
- A first join that fails (hidden tab, a refused join) leaves no room row, so the count can include the viewer until the roster's next refresh rejoins them and the next 30 s read. This was already so in P1675, where the read started as soon as the room showed.
- Once an event's count failure has been reported, later failures for that event on the same page load skip `logDbError`, so they also leave no `db-error-suppressed` breadcrumb (round 16, Gemini). Accepted: the one report carries the failure, and the cap is the point of this change.
- A read whose `rpc` call throws rather than returning `{ error }` returns null with no report. The silent `catch` predates this change (on `main` before P1730) and is left as it was.
- The host's event page (`EventDetail`) uses the same reader and so gets the same cap, but no test renders it; the cap is pinned on the reader (`src/tests/p1730-count-failure-reports.test.ts`).

## Cost Budget

Applies twice (`docs/technical/metered-services.md`): the fix changes when the room reads a count on a timer in production, and the new e2e creates and deletes test users (rule 6).

**Production (Supabase, prod organisation).** The count poll is P1675's, budgeted in its spec (`features/done/2026-06-10/p1675_hike_short_introduction_required.md`, Cost Budget): A attendees x 120 reads per room-hour, about 12,050 requests and 6 MB a month with every other P1675 read, verdict fits the Supabase Free row. P1675 shipped that poll below the early returns, so on the normal path the room crashed before it ran: this fix brings back the traffic P1675 budgeted, and no more, because every gate it adds only removes reads (behind the offline screen, before a first join, for a room not in the URL). P1675's arithmetic counts the timer only. The poll also reads once at once each time it turns on: on every fresh open of the room (a reload or a new tab), every return to a visible tab (`src/lib/visible-poll.ts`), and every recovery from the offline screen. All of that is P1675 behaviour this fix keeps. With T = those immediate reads per attendee-hour, the room costs at most A x (120 + T) reads per hour: the timer term is an upper bound (120 only if the room stays visible the whole hour), and T is counted separately because short visits make T dominate (twenty three-second opens are twenty reads). Assuming T = 30 (one every two minutes, generous) on P1675's figures (4 hikes a month, A = 20, the room open 1 hour): 4 x 20 x 30 = 2,400 more reads a month, x 0.5 KB (P1675's per-response figure) = 1.2 MB.

**TEST (the e2e).** The active TEST server is the self-hosted one (`scripts/lib/active-test.sh` reports `selfhosted`), so the registry row is **Compute Engine (P1557 self-hosted TEST database)**: a credits-paid VM billed per hour whatever the request count, plus internet egress from the VM to the machine running the test. That row defers egress to Google's network pricing page, which does not render to a fetch, so the rates were read the way the row's own prices were: Cloud Billing Catalog API, 2026-11-25, SKUs "Network Internet Data Transfer Out from Singapore to …" (first tier $0.12 per GiB for most destinations, $0.14-0.19 for some, $0.23 the highest, to China).

| Measure | Per user | Per hour | Per test run (`e2e/p1730-hike-first-arrival.spec.ts`, one spec) |
|---|---|---|---|
| Requests | Production: at most 120 + T count reads per attendee-hour, as P1675 budgeted plus T (above) | Production: A x (120 + T); hike day A = 20, T = 30: 3,000 | Fixtures, counted from the helpers and matched to the run log: 3 users x 2 (auth user + profile; an explicit email skips the pool) = 6; event 1 + hike flag 1 = 2; answers 1 + RSVPs 1 (one insert each for both registrants) = 2; sign-in 1 + profile check 1 = 2; cleanup: event 1 + users 1 (one purge for all three) = 2; run-ledger purge 1; leftovers sweep 2 as measured. Total 17. Browser, measured: 92 Supabase responses (the room plus the app shell every signed-in page load makes). Passing run as measured: 109, all to the VM, where requests are not billed (the registry row bills VM hours and egress only). Upper bound, every retry path included: the helpers retry (the session's profile check up to 5 times, the ledger purge splits a batch, the shared leftovers sweep in `e2e/global-teardown.ts` halves its batch after a failure and is capped by the 60 s teardown budget at 250 ms between requests, so at most 241 requests). Take at most 500 non-browser requests per run, which covers 3 attempts x (14 fixtures x 5 retries) = 210 + a few ledger calls + 241 sweep. Browser attempts: 2 locally, 3 under `CI` (`playwright.config.ts`, `retries: process.env.CI ? 2 : 1`). Browser requests per attempt: 92 measured; an attempt that runs longer adds a count read every 30 s and roster refreshes, bounded by the test's timeout, and the budget allows 4 x the measured 92 = 368. Estimate: at most 500 + 3 x 368 = 1,604 requests |
| Egress (bytes) | Production: (120 + T) x 0.5 KB = 75 KB per attendee-hour | Production: 3,000 x 0.5 KB = 1.5 MB per hike-day hour | Browser, measured: 625,832 bytes of response bodies per attempt (decoded, so an upper bound on body bytes; 6 bodiless HEAD responses; realtime frames and protocol overhead not measured). Fixtures and teardown, estimated at 2 KB a response. Passing run as measured: 0.63 MB + 17 x 2 KB = 0.66 MB. Planning estimate (a margin, not a proven ceiling: the 4x comes from one measured passing run, and realtime frames are not measured): 3 attempts x 4 x 0.63 MB (the same 4x margin as the requests) + 500 x 2 KB = 7.6 + 1 = 8.6 MB; budgeted at 10 MB to leave room for protocol overhead |
| Log lines | Production: one API log line per request, failing or not (counted in the formula below); a failing count read that is not a network blip or an expired token also sends one Sentry event (`logDbError`, `src/app/data/db-error-logger.ts`), see Failure path | As requests; failure path below | TEST: the VM keeps its own logs, and the registry row bills none. 0 provoked failures on a passing run: the held join returns normally, and cleanup waits for it (at most 5 s), closes the page, then deletes each fixture on its own path |
| Service unit | none | none | VM hours: none added (the VM runs anyway). Egress: 0.66 MB = 0.00061 GiB x $0.23 (highest rate) = $0.00014 per passing run; planning estimate 10 MB = 10^7 / 2^30 = 0.0093 GiB x $0.23 = $0.0021 per run |

**Failure path (rule 5).** While `get_event_room_counts` fails, each failing read still writes its API log line, at the poll's pace: A x (120 + T) per room-hour, the same count as the reads. For Supabase log ingestion the formula below takes two lines per read (API and database) to cover a failing month. Sentry: a failure that is not a network blip or an expired token (both only breadcrumbed by `logDbError`) is now reported once per event per page load (this fix; before, once per read). An event counts as reported only when `logDbError` really sent it (it now returns whether it did), so a breadcrumbed transient never uses up the report, and a second, different failure for the same event on the same load is not reported again. So Sentry errors from this read are at most one per page load that hits a reportable failure, on the room or on the host's event page (`EventDetail`, which reads the same counts through the same reader and reported every failing read before this fix, so its cost falls too). For the room, before this fix every load on the normal path threw React #310 into `Sentry.ErrorBoundary` (`src/App.tsx`) whether or not anything failed. Replays: production records a replay for sessions with an error (`replaysOnErrorSampleRate: 1.0`, `src/main.tsx`), one per session, so replays from this read are at most the sessions with a reportable failure; before this fix every room session crashed and qualified. Registry row: Sentry, Developer plan, 5,000 errors and 50 replays a month (added in this change, `docs/technical/metered-services.md`). Formula: errors = current monthly errors + failing room loads + failing host event-page loads; replays = current monthly replays + sessions with a failing load.

1. **Fits the plan limit today?** Fits. Production: the prod organisation is on the Supabase Free row of the registry (5 GB egress; log ingestion 1 GB, read from the dashboard, since the registry row has no figure). Formula: projected cycle usage + restored reads, where restored reads = P1675's monthly count reads + hikes per month x A x T, egress = restored reads x 0.5 KB, and log ingestion = restored reads x 2 lines x bytes per API log line. Checked against the dashboard reading of 2026-11-25, recorded privately (`.private/docs/usage/p1730-cost-budget.md`): egress and log ingestion both stay under the Free limits. Sentry: against the Developer row and the org's usage page read the same day (same private note): in a normal month this read adds 0 errors and 0 replays; a whole failing month at generous load counts stays under 5,000 errors but can pass 50 replays, and past the quota Sentry drops further replays without charge (the Developer plan has no payment method). Before this fix every room session already consumed a replay, so this fix lowers replay use on every path. Bytes per log line are not measured; the private note gives the line size at which each verdict would flip, and today's verdict holds for any plausible size. TEST: monthly cost = runs per month x $0.0021 at the planning estimate and the highest egress rate; CI does not run this spec (see Evidence), so runs are local, and 1,000 runs a month is $2.14, paid from credits (runway read privately per the registry row).
2. **Fits at 10x?** Sentry: a whole failing month at 10x may pass 5,000 errors and will pass 50 replays; past the quota Sentry drops events (no charge on Developer), so other errors would go unseen for the rest of that month. Egress fits: 10 x the restored bytes stays under the Free limit on the same reading. Log ingestion at 10x fits only if a log line is under the size the private note names (a few KB); the line size is unknown, so it may not fit: the upgrade is named below. TEST: 10,000 runs a month is $21.42 at the planning estimate, within the credits the registry row draws on (runway read privately).
3. **If either answer is no:** Sentry Team, $29 a month, 50,000 errors (registry); Team lists the same 50 replays, so no plan on the page buys more replays, and replays past the quota are dropped at no charge. Supabase Pro, from $25 a month, 250 GB egress then $0.09 per GB (registry); the registry has no Pro log ingestion figure, so read it from the dashboard at that point.
