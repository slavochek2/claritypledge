---
status: qa
type: task
rank: 49
workstream: infrastructure
created_date: '2026-10-20'
tags: [supabase, egress, polling, e2e]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1522: Cut Supabase egress — idle tabs stop polling, e2e stops minting users

## Problem

**Situation:** The organisation's Supabase free plan is over quota for the cycle 21 Sep–21 Oct:
cached egress 7.55 / 5 GB, egress 5.87 / 5 GB, logs 8.5 / 1 GB. Production alone accounts for
3.9 GB cached egress, 0.97 GB egress and 1.04 GB logs; the rest is the test project (end-to-end
runs, about 12,000 test users).

**Complication:** From 11 Nov production gets restricted. On 2026-10-20 the test database stopped
responding entirely (statement timeouts, connection timeout) and needed a restart. A signed-out
idle tab on `/feed` never goes network-idle: `resolve_letter_shortcode` about every 2.5s, `events`
about every 5s, on the live site `get_letter_for_public_reading` about every 2.5s; signed in, the
feed also refetches `stories`, `points` and `point_positions` about every 4s (task-inbox note,
2026-10-20, found while triaging P1512 e2e). None of these cadences matches a `setInterval` in
`src/` (grep 2026-10-20), so the loop source is not yet known — a re-render or preload loop is as
likely as a timer.

**Question:** Which requests actually produce the egress and log volume, and what is the smallest
set of changes that brings an idle tab to near-zero requests and stops e2e from accumulating users?

> Founder framing, verbatim: "First measure which requests cause how much egress and how often
> ... and only then decide. No database writes on prod. Done when: the measured requests per
> minute of an idle open tab are documented before and after."

## Appetite

Blast radius: medium-high — pollers sit behind live sessions, events, inbox and offline reads; a
wrong pause breaks freshness for real users. Reversibility: high — client code, git revert; e2e
helper changes revert the same way. Decision density: low — the founder fixed the goals and the
order (measure, then decide); only Decision Criteria outcomes below may need a call.

## Research Questions (measure first — no code change before these are answered)

1. Idle-tab baseline: requests/min and bytes/min per endpoint, for `/feed` signed out, `/feed`
   signed in, a letter page, an event page — tab visible, and tab hidden 60s. Source: browser
   network log on localhost against the test project. **Window: at least 5 minutes idle, minute by
   minute** — a 20s window cannot tell a periodic poller from a one-off sequential burst.
2. What is the source of each repeating request (timer, effect re-run, preload loop, Realtime
   reconnect)? Name file and line.
   **Lead hypothesis (from the Gemini review, UNVERIFIED):** the "every 2.5s"
   `resolve_letter_shortcode` / `get_letter_for_public_reading` calls are the P1369 offline pack
   (`src/app/components/offline/offline-pack-preloader.tsx` → `src/lib/offline-pack.ts`), which
   walks every links-menu letter one after another, once per 6h per owner, not a timer.
   **Cheapest disproof:** set the pack's disable key in localStorage, reload, and re-measure. If the
   calls persist, the hypothesis is false. If it holds, the cost is per page load in a fresh
   storage partition (every e2e browser context, every new visitor), not per idle minute, so the
   fix is the pack's scope, not a poll interval.
3. Test project API logs (if readable with existing access): which endpoints and which callers
   (browser vs e2e) dominate request count and response bytes over a recent window. If not
   readable, say so — do not estimate.
4. How do e2e specs create users today, and which create without cleanup? Count per spec.
5. What fills the 8.5 GB of logs — API request logs (volume follows request count) or
   something else (auth, Postgres, Realtime)? Read the usage breakdown, do not infer.

## Decision Criteria (pre-registered)

1. **Fix a repeating request?** → Yes if it fires more than once per minute on an idle visible tab
   *and* no user-visible state depends on that freshness. A loop with no intended timer (effect
   or preload re-run) is a bug: fix the cause, never just slow it down.
2. **Lengthen vs on-focus vs Realtime?** → Realtime only where the surface already subscribes
   (founder constraint). Otherwise: refetch on `visibilitychange`/focus plus an interval of at
   least 60s, unless the surface is a live session where seconds matter — those keep their
   cadence but still pause when hidden.
3. **Hidden tab** → zero repeating requests after 60s hidden, every surface, no exceptions except
   an active recording/live session (mic on), which must keep its heartbeat.
4. **E2E users** → reuse a fixed pool when the spec does not assert on a fresh account; otherwise
   delete in `afterAll`/teardown. A one-off purge of the ~12,000 existing test users on the
   **test** project only is in scope if criterion 4's code lands first (else they regrow).

## Solution

1. Measure (Research Questions) and record the baseline table in this spec.
2. Fix loop sources found in RQ2; add hidden-tab pause to every poller that lacks one (several
   already do: `inbox-tab.tsx`, `sent-tab.tsx`, `use-event-rounds.ts` — reuse their pattern, do
   not invent a second one).
3. Apply Decision Criteria 2 to pollers that remain.
4. E2E: shared user pool or teardown cleanup in the helpers; then purge accumulated test users on
   the test project.
5. Re-measure with the identical method and record the after table.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Pausing a poller makes a live surface stale on return | MITIGATE | Every paused poller refetches once on becoming visible |
| Live session / recording loses its heartbeat when hidden | MITIGATE | Criterion 3 exception; existing heartbeat tests must stay green |
| Realtime on the test project is broken (private ruling 2026-10-16) | ACCEPT | No new Realtime is added; existing subscriptions unchanged |
| A fix trades a timer for a retry storm (P1369 precedent, decisions 2026-09-30) | MITIGATE | Request-volume assertion in a regression test, not only behaviour assertions |
| Bulk delete of test users locks the test DB again | MITIGATE | Batched deletes, test project only, outside e2e runs; the DELETE is shown and confirmed by the founder before it runs (db-access.md) |
| Measurement on localhost misses prod-only traffic (bots, crawlers) | ACCEPT | Prod share is 3.9 GB of cached egress; RQ5 + usage breakdown cover the gap, any residue becomes a follow-up |

**Non-Goals**
- Do NOT write to the prod database — no deletes, no migrations, no test-user purge on prod.
- Do NOT add Realtime subscriptions to surfaces that do not already have one.
- Do NOT upgrade the Supabase plan or change billing ([FOUNDER DECISION] if measurement says the
  free tier cannot hold even after the fix).
- Do NOT refactor data fetching into a new library (React Query etc.).

## Invariants

- Hidden tab → no repeating network requests after 60s, except an active live/recording session.
- Before and after numbers are produced by the same method on the same pages; a number from a
  different method is not an "after".

## Measurements (2026-10-20, /dev)

**Method.** `scripts/measure-idle-requests.mjs`: headless Chromium, one fresh context per page (empty
storage, as a new visitor or an e2e context), localhost dev server against the **test** project,
signed out. After a 10s settle, every request to the Supabase host is counted for 5 minutes, per
endpoint and per minute; bytes are response body bytes as Chromium reports them. "Hidden" overrides
`document.visibilityState` and fires `visibilitychange` at the end of the settle. Signed-in idle
behaviour is covered by `e2e/p1522-idle-request-budget.spec.ts` (45s window).

**RQ1/RQ2: there is no idle poller on these pages.** Before the fix, every request on every page
(`/`, `/feed`, `/letter/ck`, `/events`, visible and hidden) fell in minute 1; minutes 2–5 were 0.
The "every 2.5s" pattern in the inbox note was a one-off burst read through a 20s window:

| page (before, visible) | requests in 5 min | KiB | per minute |
|---|---|---|---|
| `/` | 28 | 51.1 | 28 0 0 0 0 |
| `/feed` | 38 | 70.3 | 38 0 0 0 0 |
| `/letter/ck` | 29 | 51.5 | 29 0 0 0 0 |
| `/events` | 26 | 44.0 | 26 0 0 0 0 |
| same four, **hidden** | 34 / 30 / 28 / 29 | 65 / 55 / 50 / 52 | all in minute 1 |

Each burst carried `rpc:resolve_letter_shortcode` ×9 and `rpc:get_letter_for_public_reading` ×1:
the P1369 offline pack (`src/app/components/offline/offline-pack-preloader.tsx:22` →
`src/lib/offline-pack.ts` `runOfflinePack`), which walks every links-menu entry one after another,
once per 6h per storage partition. **Disproof run:** with the pack's disable key set, both RPCs
vanished. A fresh load, counted from navigation (`--from-navigation --settle 0`, 1 min):

| page | pack off (e2e + crawlers now) | pack on (before) |
|---|---|---|
| `/` | 27 req / 74 KiB | 70 req / 155 KiB |
| `/feed` | 27 req / 75 KiB | 70 req / 155 KiB |
| `/letter/ck` | 3 req / 2 KiB | 46 req / 82 KiB |
| `/events` | 16 req / 51 KiB | 59 req / 132 KiB |

The pack was 60–90% of what every fresh browser cost. Every e2e browser context is a fresh
browser, and so is a headless crawler. The pack also kept running after the tab was hidden (the
hidden column above). The inbox's "signed in, every ~4s" refetch did not reproduce: the signed-in
`/feed` stays within 3 requests in a 45s idle window (`e2e/p1522-idle-request-budget.spec.ts`).

**After** (same script, same pages, 5 min): **0 requests** on all four pages, visible and hidden,
and 0 for a real-browser tab (pack opted back in) hidden after the settle.
Caveat, stated rather than hidden: on a warm dev server the pack now finishes inside the 10s settle,
so the idle-window metric alone cannot tell before from after. That is why the regression test
counts from navigation (fresh `/feed`: ≤40 requests; the pack pushes it to ~70) and why the control
above (pack opted in, identical probe, `--settle 0`) is part of the record.

**RQ4: e2e users.** 473 specs create users; only 4 lack a cleanup call. Users leak anyway, because
per-test cleanup is skipped when a test times out or a worker dies, and `deleteTestUser` fails soft.
Census of the **test** project (admin list, 21 pages to exhaustion, Dec 2025 → today): **20,221 auth
users, 19,477 in the e2e namespace (`e2e-test-<ts>-<n>@gmail.com`), 19,387 older than 24h.**

**Changes.**
1. `src/lib/offline-pack.ts`: the pack is not due under browser automation (`navigator.webdriver`)
   unless a test sets `clarity-offline-pack-allow-automation`; not due in a hidden tab; stops issuing
   reads once the tab hides mid-run. The 6h cadence for real visitors is unchanged (the offline
   feature's design, not waste).
2. `scripts/sweep-e2e-test-users.ts`: deletes e2e-namespace users older than N hours via
   `deleteTestUser` (one FK order). Test project only (refuses otherwise, exit 2, verified with a
   prod URL), dry run unless `--apply`. `e2e/global-teardown.ts` runs it after each main-suite run:
   6h minimum age, at most 300 users.
3. The two P1369 offline e2e specs opt back in to the pack.
4. `offline-pack-preloader.tsx`: re-checks on every return to a visible tab (local only, no
   request when nothing is due), with an in-flight guard; a run cut short by hiding restores the
   previous stamp, so the pack is due again instead of marked fresh with entries missing.

**Regression check.** The P1369 offline suite fails 12 of 42 on unmodified `main` (pre-existing).
On this branch, 12 of 42, the same set, after re-running R2 alone (its two branch failures were a
Playwright trace-file ENOENT and a transient Supabase connect timeout; it passes).

**Review** (`/finish`, 3 of 3 reports on round 1: Gemini review model, Codex, Sonnet criteria;
then Gemini on rounds 2–5 over each fix snapshot, round 5 CLEAN). Set aside, not fixed:
- Sweeper: a direct run without `.env.test.local` fails closed (refuses, exit 2), not a defect.
- Known limitation: no unit test for the preloader's re-trigger on show; its hidden deferral is
  covered by the e2e hidden test, proven by a mutation run (guards removed: ~25 requests, red).
- Known limitation: `measure-idle-requests.mjs` folds the settle tail into the last minute bucket
  with `--from-navigation`, and ignores `requestfailed`; fine for the counts recorded here.
- Known limitation: browsers that set `navigator.webdriver` (Lighthouse, remote-debugging Chrome)
  never get the offline pack; storage-denied contexts cannot opt in.

**RQ3 (test project API logs): not readable.** The keychain-locked management token (`sbp_`,
44 chars) was read after the founder allowed it, and the Management API answered **401 on both the
logs endpoint and the plain project list**, so the token itself is revoked or expired, not
scoped wrong. Rotation is P1148's job, not this spec's. The test-project share of egress is
therefore attributed from the census (19,477 e2e users) and the per-context measurement above, not
from logs.

## Done-When

- [x] Baseline table (requests/min and bytes/min per endpoint, per page, visible and hidden) is
      recorded in this spec, with the method stated.
- [x] Source of each repeating request named with file:line.
- [x] After table, same method, recorded next to the baseline; idle visible tab shows no endpoint
      above 1 request/min unless justified by Decision Criterion 2; hidden tab shows zero after 60s.
- [x] A regression test fails if an idle page exceeds the request-volume budget (proven to fail
      with the fix reverted). `e2e/p1522-idle-request-budget.spec.ts`; red with the guards removed.
- [x] E2E cleanup fixed at the source: `deleteTestUser` clears FK blockers taken from the database
      error; the same 20 stranded users went from 11/20 deleted to 20/20; the sweeper and the
      post-run teardown are in place. `[post-deploy]` The purge of the ~19,400 leftover users and the
      "no net new users per full e2e run" count were moved to the task inbox (INBOX-204) by founder
      decision, so the egress fix could ship before the 11 Nov restriction instead of waiting ~5h.
- [x] Test project API log reading (RQ3) recorded, or recorded as not readable with the reason.

## Alternatives Considered

- **Upgrade to Pro plan** — removes the deadline but not the waste; idle tabs still cost battery
  and DB load and e2e still hangs on `networkidle`. Founder decision, not taken here.
- **Global fetch throttle** — hides loop bugs instead of fixing them; rejected by Criterion 1.

## Rollback Strategy

Client-only changes: `git revert`. E2E helper changes: revert. User purge on test is not
reversible — acceptable, test project only.

## Related

- P1512 (e2e triage where the polling was found) · P1369 (request-volume assertion precedent)
- `.claude/commands/slava/maintain/clean-test-users.md` (founder-allowlist deletion; not reused
  for e2e users, which are a different namespace)
