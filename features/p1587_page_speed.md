---
status: week
type: story
rank: 81
workstream: foundation
created_date: '2026-10-28'
tags: [performance, speed, bundle, queries]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1587: Pages that load fast, first visit and after

The speed half of the founder's 2026-10-28 ask. The consistency half is **P1586** (one way of loading); the two ship independently. Revised the same day after a three-model spec review (Gemini review model, Codex, Opus; 3 of 3 reported, load-bearing claims re-run by command).

## Problem

**Situation.** Routes are already lazy-loaded (105 `lazy()` routes in `App.tsx`, P553), so the old bundle spec P119 ("no code-splitting") is out of date. Analytics are deferred and fonts are self-hosted (decisions.md 2026-03-19). P1527 cut `/feed` from 17 to 15 production requests by changing query shapes, and removed a client request dedupe because every write had to invalidate it (decisions.md 2026-10-21).

**Complication.** Measured 2026-10-28 on production, signed out, headless Chrome, through the measuring machine's VPN:

| Page | Visit | JS finished | Main content (LCP) | DB requests | Observed waves | Last DB answer |
|---|---|---|---|---|---|---|
| `/feed` (home) | first | 3.0s | **10.0s** | 14 | 4 | 8.7s |
| `/feed` | repeat | 0.8s | 0.6s | 7 | — | 1.6s |
| `/groups/cm` | repeat | 0.8s | 0.6s | 1 | 1 | 1.7s |
| `/events/:slug` (a hike) | first | 3.3s (66 files, 620 KB) | **7.0s** | 10 | 5 | 8.6s |

- **The VPN inflates every number above.** One small prod query took 1.21–1.36s through the VPN and 0.18–0.47s around it (curl, 3 runs each). So absolute times overstate a typical visitor's wait. The **shape** does not depend on the VPN: how many requests, how deep the chain, how much JavaScript.
- **"Observed waves" are not proven dependencies.** A request that starts after another ends may simply be a later effect. The event page shows a real chain, though:
  - `getEventBySlug` awaits the event, then its attendees (`events-service-real.ts:424`);
  - the footer-note and organizer effects (`EventDetail.tsx:253, 288`) each re-select `org_id` from `events` (`events-service-real.ts:508` and the footer helper), which the page already holds, before reading `organization`.
- **The entry JavaScript is large.** The entry file is 1,059 KB raw, 314 KB gzipped (local build of 2026-10-26). Every page downloads and runs it before its own chunk. It is held there by eager import chains, each checked on `main`:
  - `AuthContext.tsx:16` → `api.ts` (`getProfileResult`);
  - the `@/auth` barrel, whose header says "DO NOT MODIFY WITHOUT E2E TEST APPROVAL", eagerly exports `AuthCallbackPage`, `AuthVerifyPage` and `EventLinkPage`;
  - `App.tsx:19` → `offline-reads-letters` → `letters-service`, although that file's own header says "the app shell must not pull in the list services", and `simple-navigation` → `useUnreadLetterCount` → `letters-service`;
  - `chat-view-model.ts:6` imports one constant (`EVENT_GRACE_HOURS`) from `events-service-real`;
  - `chat-ui-helpers.ts:10-11` → the points and stories services;
  - `room-capture-context.tsx:55-57` → `transcribe-service` and the slice recorder;
  - `simple-navigation` → `event-links-menu` → `drawer` → `vaul`.

  A reviewer's sourcemap attribution puts the removable part near 250 KB minified. It is unverified here, so this spec sets no size target until B0 measures it.
- **Two cheap levers are open.** The Supabase preconnect in `index.html:47` has no `crossorigin`, so the anonymous CORS fetches supabase-js makes may not reuse it (UNVERIFIED; B0 checks connection reuse). `calendar.google.com` is preconnected on every page (`index.html:215`) though only two pages embed it.
- Signed-in pages were not measured (no session in the headless browser). They add session, profile and nav reads in front of everything above (UNVERIFIED until B0).

> **Founder framing, verbatim (2026-10-28):** "speed of loading of all pages because things are pretty slow"

**Question.** On every page, what stands between navigation and the main content (JavaScript, chained reads, connections), and which of it can go without changing what the page shows?

**"All pages"** ranges over every route in `App.tsx`, measured by B0's route manifest. A route over target is fixed here or set aside only as a [FOUNDER DECISION: scope], never silently.

## Appetite

- **Blast radius: high.** The shared data layer, the entry bundle, the service worker's shell. A wrong change shows stale or missing data, or breaks offline.
- **Reversibility: high.** Code only, one commit per batch.
- **Decision density: medium.** The targets are a founder call made after seeing the baseline (B0 gate). Overturning any existing ruling (P1527, `src.md` nested selects, the `@/auth` barrel note) is a founder call.

## Invariants

- **No client-side read cache or request dedupe.** Duplicate and chained reads are cut by changing query shape (decisions.md 2026-10-21, P1527). A proposal to overturn this needs new measurements and a founder decision.
- **No nested selects.** Fetch related rows separately and in parallel (`.claude/rules/src.md`; P1264). Pass ids you already hold rather than re-selecting them.
- **No migration, RPC, grant or RLS change.** If a target can only be met with one, stop and propose a separate spec with the measurement.
- **Offline keeps its three states** (P1369, `src/pwa/workbox-config.ts`):
  - the shell works offline;
  - a route visited online works offline;
  - an unvisited route shows "needs a connection".

  The shell precache is derived from the entry's static imports, and the build fails if a shell chunk is missing. So any module moved out of the entry that an offline route needs is added to the offline pack's route code (`ROUTE_CHUNKS`, `offline-pack.ts:137`).
- **Request numbers only go down.** `e2e/p1522-idle-request-budget.spec.ts` keeps passing (decisions.md 2026-10-21, P1522).
- Measurements report production-equivalent numbers (StrictMode off), per P1527.

## Solution

### B0. Measure first, then set targets (gate)

A measurement harness, extending `scripts/measure-idle-requests.mjs`, run on a **production build** with real-service flags:

- **A route manifest**, one row per route in `App.tsx`: mode (public, signed in), viewer role, fixture it needs (a seeded event, a TEST user that is a member, attendee or host), expected destination, and a **main-content marker** (the element that means "the page is shown"). A redirect, login wall or 404 counts as the destination only when the manifest says so. Redirects, wildcard and DEV-only routes are listed and marked, never silently counted.
- **Per route, recorded:**
  - requests before the main-content marker, and identical requests (same URL, query and auth) made twice;
  - **critical-path depth**, proven by gating: hold one response and record which requests do not start until it is released. This separates real dependencies from late effects. It is reported separately from observed waves;
  - the entry closure (all JavaScript fetched before the route's own chunk) and the route's critical JavaScript;
  - LCP with its breakdown (TTFB, resource load, render delay);
  - main-thread time.
- **States, declared per run:** cold (empty HTTP cache, no service worker, no IndexedDB) and warm; offline pack on and off (`OFFLINE_PACK_ALLOW_AUTOMATION_KEY`, because the pack is off under automation by default, `offline-pack.ts:41-52`). Network: a fixed-latency lane (fixture-backed responses, so timings repeat) and a real-network lane, kept apart.
- Output: a report table plus raw traces under `.private/`, with commit, browser version and fixtures. Nothing in the repo root.

**Gate:** the founder sees the baseline.

[FOUNDER DECISION: targets, set from the baseline. Proposed starting points to react to:
- critical-path depth of at most 2 database rounds before main content;
- no identical request twice;
- an entry closure the baseline shows is reachable;
- a first-visit LCP for `/feed` and `/events/:slug` at a stated Lighthouse profile (version, device, network, cache state, median of 5).]

### B1. The event page

Pass the event's `org_id` to the organizer and footer-note reads instead of re-selecting it, read `organization` once, and run attendees, organization and series reads in parallel once the event is known. Separate what the main content needs (event, attendees) from optional sections (footer note, series blocks), which never block it. Expected: two database rounds before content, no new query types.

### B2. Every other route over target

For each route B0 shows over target, change query shape the same way: parallel instead of serial, ids passed instead of re-read, batched reads (`.in(...)`, as P1527's rail query does). `/feed` is in scope for depth, not for request count: its four events reads are different queries the founder accepted (P1527).

### B3. The entry closure

Break the eager chains named in Problem:

- split `getProfileResult` out of `api.ts`;
- move the constant out of `events-service-real`;
- load `letterCodeRead` without pulling in `letters-service` (restoring the file's own stated rule), and the unread count without the whole service;
- load the room capture, chat helpers and the drawer when used.

The `@/auth` barrel is changed only with its e2e tests run and named in the PR.

The budget is the **whole entry closure** (every byte fetched before the route chunk), not one file: moving code into another eager chunk is not a saving.

Verify by the build's own output, before and after. Run the full offline suite: `npx playwright test --config e2e/offline/playwright.config.ts`, covering all three offline states, a build-A → build-B update, and a route whose module moved out of the shell (it must still work offline once visited, via `ROUTE_CHUNKS`).

### B4. Signed-in boot and load-path auth calls

From B0's signed-in traces, remove any boot read the page does not need. Four `supabase.auth.getUser()` calls can run on page load: `getCurrentUser` (`api.ts:531`), `organizations-service.ts:232`, and the guards `requireUserId` (`organizations-service.ts:79`) and `requireAuth` (`docs-service.ts:162`), which reads also pass through. Each is a request to the auth server whenever a session exists (decisions.md 2026-04-11). Where the trace shows one on a page load and it is a routine identity check, read `getSession()` instead. Keep `getUser()` on the 13 write paths. Test an expired session and a denied write on each changed path.

### B5. Connections

Add `crossorigin` to the Supabase preconnect if B0's trace shows the connection is not reused. Move the `calendar.google.com` preconnect to the pages that embed it (`intro-page.tsx`, `chiang-mai-page.tsx`). Evaluate starting a route's first read when its chunk is preloaded on hover (`src/app/routes/route-preload.ts`); adopt it only if B0 shows a gain and it adds no request a visitor would not have made.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A parallelised read applies out of order and shows stale data | MITIGATE | Each effect keeps its cancellation guard; the p1420 refresh-in-place and RSVP e2e keep passing |
| Moving modules out of the entry breaks offline or the update prompt | MITIGATE | Full offline suite, all three states plus build-A → build-B; `ROUTE_CHUNKS` updated for every moved module an offline route needs |
| `getSession()` trusts a revoked session on a read | MITIGATE | Reads only; RLS still enforces on the server; writes keep `getUser()`; an expired-session test per changed path |
| Targets set from VPN-inflated numbers | MITIGATE | Depth, counts and bytes from the fixed-latency lane; real-network LCP measured without a VPN |
| E2E timing assertions flake | MITIGATE | Assertions are on counts, depth and bytes from fixture-backed runs; wall-clock only in the separate real-network lane, reported, not asserted |
| Interception misses service-worker requests | ACCEPT | Service-worker runs are measured separately from interception runs (Playwright routing does not see SW-served requests) |
| The database region is far from the visitors | DEFER | Out of scope; B0 reports per-request latency so the case can be made with numbers |
| `fetchRoomRoster` leaves a timed-out request open on bad Wi-Fi | DEFER | From P1586's review; picked up if B0 shows connection starvation |

**Non-Goals**

- Do NOT change any loading state's look (P1586).
- Do NOT add a client read cache, request dedupe, or a data-fetching library (P1527).
- Do NOT retune pollers (P1522).
- Do NOT change who gets the shell (P1421/P1512) or how sessions restore (P1297).
- No migration, RPC, grant, RLS or table change.

## Done-When

- [ ] The B0 harness runs on a production build and outputs the report for every manifest route. The manifest lists every `App.tsx` route, each marked measured or excluded-with-reason. Controls prove the depth probe works: a known serial chain (today's `getEventBySlug` → `getEventAttendees`, `events-service-real.ts:424`) reads as depth ≥ 2, and two reads known to be independent read as depth 1. Raw traces are under `.private/`.
- [ ] The founder has seen the baseline and the targets are written into this spec.
- [ ] `/events/:slug`: critical-path depth before main content meets the target (expected 2), with no identical request twice (harness output before and after).
- [ ] Every other route B0 showed over target meets it, or is listed under a founder scope decision.
- [ ] The entry closure meets its target in `vite build` output and the harness. `npx playwright test --config e2e/offline/playwright.config.ts` passes with the cases named in B3.
- [ ] Each changed `getUser()` call has an expired-session test and a denied-write test (where it guards a write) passing; the signed-in boot trace shows the removed requests gone.
- [ ] `p1522-idle-request-budget`, the p1420 tests, the p1114/p1337 room suites and `src/tests/p1369-*` pass with request numbers no higher than before.
- [ ] Lighthouse mobile first-visit LCP for `/feed` and `/events/:slug`, measured locally on the production build at the profile named in the targets, meets them. `[post-deploy]` Re-measure on prod without a VPN.

## Open Questions

1. How much of the founder's own day-to-day slowness is the VPN? A one-minute check: open the same event page with the VPN on and off and compare.
2. Are signed-in pages slower in ways this measurement could not see? B0 answers it.

## Related

**P1586** (one way of loading) · P1527 (query shape, not dedupe; StrictMode-off counts; decisions.md 2026-10-21) · P1522 (request-volume guard, offline pack under automation) · P553 (route lazy-loading) · P119 (bundle size, out of date, superseded by B3) · P1369 (offline shell precache, `ROUTE_CHUNKS`) · P1264 (flat queries) · P1297 (cold-load session) · decisions.md 2026-03-19 (deferred analytics, lazy pages, fonts) · 2026-04-11 (`getUser()` hits the network)
