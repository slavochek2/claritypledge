---
status: qa
type: task
rank: 338
workstream: infrastructure
created_date: '2026-11-13'
tags: [offline, analytics, mixpanel, observability]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
spec_review_hash: 04e37eefffb5a7340f277b070952526d7e82a27dedfa1680b1dbb446a152c59f
spec_review_vendors: [gemini, openrouter]
---

# P1677: Offline strip episodes are recorded in Mixpanel, so we know how often "Saved copy · updating…" shows and whether it clears

## Problem

**Situation:** Since P1337, a read that takes longer than 4 s (`NETWORK_DEADLINE_MS`) while a saved
copy exists shows that copy and the strip "Saved copy · updating…". The read's own late answer then
replaces it and the strip goes (`src/lib/offline-read-cache.ts`,
`src/app/contexts/offline-status-context.tsx`). If no answer arrives within 15 s (`SLOW_GIVE_UP_MS`),
the app is marked unreachable and a health probe runs; only if that probe **also** fails (P1540) does
the strip turn into "Offline · saved copy from X". If the probe succeeds, the strip stays
"Saved copy · updating…" and the page re-reads on the reconnect. The unit tests for this pass (27/27
on 2026-11-13: `p1337-offline-slow-read`, `p1337-offline-late-answer-page`, `p1392-feed-home`).

**Complication:** The founder saw the strip on prod while the person clearly had internet:

> "Sometimes the person seems to have internet, but it says saves copy, updating, I don't know. Why?
> Is there some kind of issue? How do we know it works?"

A measurement on 2026-11-13 (45 rounds, each firing Google `generate_204`, prod and the self-hosted
test server at the same moment) found prod slower than 4 s only in the 2 rounds where Google was also
slow (7 to 10 s): there the strip told the truth, the connection stalled. But nothing on prod records
the strip, so we cannot say how often real people see it, how long it stays, whether it clears or
turns into "Offline", or on which page. Two structural causes that would make it common are open and
**unverified**: the feed's points read is three sequential round trips (points → position counts →
viewer positions, `points-service-real.ts` `getPublicPointsFeed`), and auth-js 2.84 makes every
request wait for `getSession()` under a navigator lock with no timeout (`_acquireLock(-1, …)`), so a
token refresh on wake would hold every read. A lock stall would keep the strip on "updating…" (the
health probe does not take the lock and succeeds), so it shows up as a **long** episode, not as one
that ends "Offline".

**Question:** What is the smallest recording that answers "how often, how long, does it clear,
where", so that the decision about the 4 s deadline, the sequential reads or the auth lock is made
from data?

## Appetite

Blast radius: low. It adds one analytics event driven by what the strip already shows; the strip's
behaviour and every read are unchanged. Reversibility: git revert. Decision density: zero to build;
the thresholds in Decision Criteria are proposed by the agent and the founder may change them.

## Solution

Record one Mixpanel event per **strip episode**: the span from the moment the offline strip appears
until it disappears from the screen.

**The episode follows the strip's STATE, never its raw text.** The text of a cached copy changes every
minute ("from 5 min" → "from 6 min", `useMinuteClock` in `offline-status-context.tsx`). Map the text
to a state first (`slow` for `STRIP_SLOW_TEXT`, `offline_cached` for any `stripCachedText(…)`,
`offline` for `STRIP_OFFLINE_TEXT`); a change between states is not a new episode, only the strip
going away ends one.

**Where it lives:** in `OfflineStrip`, the component that puts the strip on screen. It is inside
`<Routes>` (so `useLocation` works) and its two mounts in `clarity-landing-layout.tsx` (lines 87 and
285) are mutually exclusive (the `chromeFree` branch returns early), so one episode has one emitter.
Embed mode renders no strip and records nothing, which is correct: nothing was on screen.

**An episode continues across route changes.** Navigating while the strip stays up does not split it.
If the strip disappears (the old page's report goes away on navigation) and reappears later, that is
two episodes, because the person saw it go and come back.

Event `offline_strip_episode`, sent when the episode ends (the strip goes away, or `OfflineStrip`
unmounts while it shows), with:

| Property | Meaning |
|---|---|
| `first_state` | `slow`, `offline_cached` or `offline`: what the strip said first |
| `last_state` | Same values: what it said last |
| `duration_ms` | How long the strip was on screen |
| `ended_by` | `cleared` (it went away) or `unmount` (the strip component left the screen while showing: a layout change, or the page was left) |
| `start_route` / `end_route` | Where it appeared and where it ended, each reduced to a **known top-level route** (below) |
| `navigator_online` | `navigator.onLine` when the episode ended |

**Routes are reduced to a known set, never sent raw.** A first path segment is not safe on its own: the
`*` catch-all renders inside the layout, so a mistyped `/<token>` URL would send the token. The value
is the first path segment only when it is one of the app's own top-level route segments, `/` for the
root, otherwise `other`. The known set is checked against the `path="…"` values in `src/App.tsx` (the `/tree` routes in `tree-routes.tsx` are dev-only and excluded) by a
test, so a new top-level route cannot silently become `other` without that test failing.

**At most 5 episodes per document load** (a module-level counter, not per mount, so navigation does not
reset it). Five is enough to see a pattern; the cap bounds a flapping connection.

`analytics.track` sends to Mixpanel only in production, and the P1669 hook tags bot traffic with
`is_bot`. Note: on `/live` the ML collector (`registerMLCollector`) also receives every tracked event,
in any environment; this event joins that stream like every other event does.

Add the event to `docs/technical/analytics.md` with the queries that answer the Decision Criteria.

## Decision Criteria

Pre-registered, on real people only: `is_bot` not set **and** `is_internal` not true (the founder's
and test accounts would otherwise dominate a small base). Each criterion needs at least 30 episodes in
**its own** subset; below 30, report counts and decide nothing (analytics.md rule: no percentage on a
base under 30). Thresholds are the agent's proposal, `[FOUNDER DECISION: thresholds — proposed, change
freely]`.

1. **Real outages:** if 20% or more of `first_state = slow` episodes end with `last_state` of
   `offline_cached` or `offline`, slow reads are mostly real connection loss: the strip is telling
   the truth, no app change.
2. **Stalls that are not outages:** if 20% or more of `first_state = slow` episodes last 15 s or
   longer and still end with `last_state = slow`, something holds reads while the server answers
   health probes. Investigate the auth-lock hypothesis first, then the sequential round trips in the
   most frequent `start_route`.
3. **Slow but short:** if the median `duration_ms` of `slow` episodes ending `cleared` is above 8 s,
   the copy sits on screen long enough to matter: look at the sequential round trips in the most
   frequent `start_route`.
4. **None of the above:** the strip is doing its job; no change, and the founder's question is
   answered with the numbers (how many episodes per week, where, how long).

Mixpanel's ability to take a median of `duration_ms` over a filtered event set is **UNVERIFIED** (the
Mixpanel MCP did not connect on 2026-11-13). If it cannot, export the events and compute it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The minute-clock text change starts a new episode every minute | MITIGATE | Episodes follow the state, not the text; a Done-When test ticks the clock inside one state |
| The tab is closed while the strip shows, so the episode is never sent | ACCEPT | A `pagehide` listener is the defensive complexity `features.md` tells measurement specs to skip. It removes the longest episodes, biasing criteria 2 and 3 toward "no change"; revisit if the numbers look implausibly clean |
| A URL segment that is not a route leaks a token | MITIGATE | Known-route reduction, `other` otherwise; a test feeds `/<random-token>` |
| A flapping connection hits the cap, so frequency is undercounted in exactly the worst case | ACCEPT | The cap is per document load; a capped load still shows 5 episodes, which is itself the signal |
| Event volume | MITIGATE | Cap of 5 per document load; see Cost Budget |
| The 4 s deadline, sequential reads and auth lock stay as they are until data arrives | ACCEPT | That is the point: decide from data |

**Non-Goals**
- Do NOT change the strip's wording, its deadlines (`NETWORK_DEADLINE_MS`, `SLOW_GIVE_UP_MS`) or when
  it shows. Ruling 2026-10-05 (P1337) stands.
- Do NOT add per-read events, timing inside `readThrough`, or Sentry events. One event per episode.
- Do NOT add a Mixpanel board report or change the weekly read (P1640). That needs data first; it is a
  follow-up.
- Do NOT touch `network-outcome.ts` (P1540: network outcomes are recorded only there).

## Invariants

- The strip shows exactly what it showed before, at the same moments, and every read behaves the
  same. The P1337 and P1369 tests pass unchanged.
- No property carries a user id, a content id, a slug, a query string, a raw path or free text.

## Cost Budget

Mixpanel registry row: Free plan, 1M events per month (`docs/technical/metered-services.md`).
No Supabase request is added. The number of document loads per month is not measured here; the
figures assume 5 per unique viewer (UNVERIFIED) on 3,204 unique viewers in 30 days (decisions.md
2026-11-12).

| Measure | Per user | Per hour | Per test run |
|---|---|---|---|
| Requests (Mixpanel events) | worst 5 per document load; typical 0 | worst month: 3,204 viewers × 5 loads × 5 = 80,100 events = 8% of 1M. Typical: most loads show no strip; at 1 episode per 10 loads, 3,204 × 5 × 0.1 = 1,602 = 0.16% | 0 to Mixpanel: `analytics.track` returns before sending outside production |
| Egress (bytes) | 5 × ~0.5 KB = ~2.5 KB worst per load | negligible | 0 |
| Log lines | 0 | 0 | 0 |
| Service unit | events above: within the free 1M | $0 on Free | 0 |

## Done-When

- [x] Unit tests (fake timers) drive the strip through `slow → cleared`, `slow → offline_cached →
      cleared`, `offline` only, and a strip that stays up across a route change, and assert exactly
      one `offline_strip_episode` each, with the expected `first_state`, `last_state`, `ended_by`,
      `start_route`, `end_route`, `navigator_online`, and `duration_ms` equal to the faked elapsed time
- [x] A unit test keeps the strip on a saved copy while the clock passes several minutes (the text
      changes from one age to the next) and asserts one episode, not one per minute. Control: an
      exact-text state mapping fails it (and 2 others)
- [x] A unit test unmounts `OfflineStrip` while it shows and asserts one episode with
      `ended_by: unmount`
- [x] A unit test shows the 5th episode in one document load is sent and the 6th is not, including
      across a route change
- [x] A unit test shows `/story/<uuid>` gives `/story`, `/` gives `/`, `/<random-token>` gives
      `other`, and no property contains the id or token
- [x] A test fails when a top-level `path` in `src/App.tsx` is missing from the known-route set
      (proved by removing one entry and watching it fail). Since review it also reads
      `src/app/routes/*.tsx` and `USE_CASE_LANDINGS`, proved the same way
- [x] The existing P1337 and P1369 tests pass unchanged (62/62 with the new tests)
- [x] `docs/technical/analytics.md` lists the event, its properties, and the queries for the Decision
      Criteria. `[post-deploy]` confirm events arrive on prod by forcing one slow read on the live site
      (devtools network throttling on a page with a saved copy, from an `is_internal` account, which
      the criteria exclude)

## Known Limitations

Recorded from the code review (Codex, two rounds), verified and set aside rather than fixed:

- **Mixpanel's 1 s batch window.** An episode that ends while the tab is visible is handed to the SDK,
  which flushes within 1 s (`batch_flush_interval_ms: 1000`, `index.html`). If the tab is hidden inside
  that second, the flush happens while hidden. This applies to every `analytics.track` call in the app,
  and P881 chose the 1 s window to stop losing events when a page closes; changing it is an app-wide
  call, not part of this spec. An episode that ENDS while hidden is held until the tab is visible.
- **ML collector chosen when the held event is sent.** On `/live`, if the strip clears while the tab is
  hidden and the recording stops before the tab is shown again, the held event reaches the next
  collector (or none). The event carries no session content.
- **StrictMode replay in development.** Mounting while the strip shows sends a ~0 ms `unmount` episode
  in development only. Production builds never replay effects, and Mixpanel is off in development.
- **A fourth strip wording.** `stripStateFromText` knows three wordings; a new one would end every
  episode as `cleared`. The wording is fixed by the 2026-10-05 ruling (P1337).

## Alternatives Considered

- **Timing inside `readThrough` per read.** Rejected: many events per page, and it measures reads,
  not what the person saw. The strip is the thing the founder asked about.
- **Emitter in `OfflineStatusProvider`.** Rejected: it would count episodes in embed mode where no
  strip is on screen, and the provider has no reason to know routes.
- **Sentry instead of Mixpanel.** Rejected: this is a frequency and duration question about normal
  behaviour, not an error, and the founder already reads Mixpanel weekly.
- **Record the auth-lock wait directly.** Deferred: only worth adding if criterion 2 fires.

## Related

- P1337 (done): slow is not offline, the "Saved copy · updating…" state
- P1369 (done): offline-readable pages and the strip
- P1540 (done): a single failed request does not show offline
- P1669 (done): `is_bot` tagging, aggregate-only boards
- P1640 (done) / P1645: weekly Mixpanel read
- P1678: the test-server side of the same question
