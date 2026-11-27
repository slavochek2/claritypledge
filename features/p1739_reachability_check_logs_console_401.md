---
status: in-progress
type: bug
rank: 364
severity: low
date_reported: 2026-11-27
created_date: 2026-11-27
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [offline, network, console-errors, e2e-flake]
disclosure: public
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p1739-reproduce.spec.ts
  root_cause: "runProbe fetches <supabase>/auth/v1/health with no apikey header; the gateway answers 401 and Chrome logs a resource error"
  confidence: high
  surfaces_in_scope: [offline-status-context runProbe (the single function behind every reachability check)]
  surfaces_deferred: []
  reproduced_at: 2026-11-27
---

# P1739: The reachability check logs a red console 401 in every browser

## Summary

The app's reachability check (P1540) calls the auth health address without the public anon key. The gateway
answers 401, so every check prints "Failed to load resource: the server responded with a status of 401" in
the user's console. It also makes the P1711 calls e2e's no-console-errors checks fail intermittently.

## Root Cause

`runProbe` in `src/app/contexts/offline-status-context.tsx` (lines 134-150 on main at `cbae1f6e2`) does
`fetch(\`${url}/auth/v1/health\`, { cache: 'no-store', signal })` with no `apikey` header. The Supabase gateway in
front of auth refuses unkeyed requests. Measured 2026-11-27 with curl, read-only GETs:

| Server | No key | Key as header | Key as query parameter |
|---|---|---|---|
| TEST (active, self-hosted) | 401 | 200 | 200 |
| prod | 401 | 200 | 200 |

The fetch *resolves* on a 401, and `runProbe` counts any resolved fetch as reachable, so the offline logic is
correct. Only the browser's own resource-error line is wrong, and no app code can suppress that line.

**When the check runs:** only after something marks the backend suspect. Any request that rejects with a
non-abort error calls `recordNetworkFailure` (`src/lib/network-outcome.ts`). Navigating away cuts off in-flight
requests, and the browser rejects them as a `TypeError`, not an `AbortError`. So ordinary navigation is enough
to trigger a check. `canSendWrite` (P1420) also checks before a write after an earlier failure, and P1540 adds a
periodic check while the backend is suspect.

**How it was found:** the P1711 calls e2e (`e2e/p1711-chat-calls.spec.ts`) collects console errors and asserts
none. Three of six runs on TEST failed on exactly this 401. A temporary `requestfailed`/response logger in the
spec (since removed) tied each failing line to `/auth/v1/health`.

**Seen before, tolerated rather than fixed:** P1560 listed the same 401 as the cause of two
`p1420-clear-position-lost-response` failures, and that test now allows a 401 console line as many times as a 401
from `/auth/v1/health` is seen on the network (`e2e/p1420-clear-position-lost-response.spec.ts:35-65`). P1560's
"Do NOT change the P1540 probe's behaviour" fenced that spec's scope; neither it, P1540 nor `docs/decisions.md`
records the keyless request as a choice (searched for the path, "apikey" and "probe 401"). Once fixed, the P1420
allowance matches nothing and can stay or go; removing it is not required here.

## Invariants

- **Any response means reachable** (P1540, [decisions.md](../docs/decisions.md) 2026-10-22). Only a rejected or
  timed-out fetch counts as unreachable. A non-200 status must never become "offline", or a gateway answering
  4xx/5xx would show the offline banner while the backend is up.
- Outcomes are still reported through `network-outcome.ts` with the send-time mark (`networkMark()` taken
  before the fetch), never a completion-time one (same decision).

## Reproduction Steps

1. Open the app on any page, signed in or not, with DevTools open on the Console tab.
2. Start a navigation while a request is in flight (for example, open a chat and leave before it loads), or
   make one request fail (DevTools Network, block a request URL).
3. Watch the Console: a red "Failed to load resource: the server responded with a status of 401" appears for
   `/auth/v1/health`.

**Reproduction rate:** 100% once a check runs; whether a check runs in a given page visit is intermittent.

**Canary (`/reproduce`, 2026-11-27):** `e2e/p1739-reproduce.spec.ts` makes a check run every time by cutting off
the first Supabase REST request on `/events`, then records every `/auth/v1/health` response until the
assertions run (a check that gets no answer is recorded as `0`). On the unfixed code it failed in all 4 runs on TEST
(one per review round): statuses `[401]`, expected `[200]`. A temporary control that added the public key to the
check at the network layer passed (1 passed), so the assertions tell the bug from the fix; it bypassed the browser's
CORS preflight, which only the real fix exercises. Every check path
(`probeSupabase` on a failure, the periodic re-check, the before-write check in `use-online-write-guard.ts`) goes
through the one `runProbe`, so fixing it covers all of them.

## Expected Behavior

The check gets 200 and logs nothing. Offline detection behaves exactly as now.

## Actual Behavior

Each check logs a red 401 resource error. Users see noise in their console, and e2e console-error checks
fail at random.

## Affected Files

- `src/app/contexts/offline-status-context.tsx` — `runProbe`, the `fetch` call (line 141 on main).
- `src/tests/p1540-offline-flap.test.tsx` — stubs `fetch`, but no test asserts what the check sends.

Surface check (`grep -rn "fetch(" src | grep "VITE_SUPABASE_URL\|supabaseUrl\|/auth/v1/"`): the other raw fetches
to the backend already send the key (`src/app/data/api.ts:4942`, `apikey` header). `transcribe-clip-service.ts`
and `banner-utils.ts` call edge functions; whether they send the key was not checked here and is outside this bug.

## Severity

**Low.** Behaviour is correct; the cost is console noise for every user and flaky console-error assertions in
e2e. Sentry is not affected: browser resource-error lines are not JavaScript console calls.

## Fix Approach

Send the public anon key as an `apikey` header on the check's `fetch`, read the same way the Supabase client
reads it. Keep `cache: 'no-store'`, the abort timeout and the any-response-is-reachable rule unchanged.

**Preflight, measured and accepted:** a custom header makes this cross-origin GET a non-simple request, so the
browser sends a CORS preflight first. Both gateways allow it (`access-control-allow-headers: apikey`). Prod sends
`access-control-max-age: 3600`, so the preflight is cached for an hour. TEST sends no max-age, so there it
repeats on each check. The check's timeout covers both round trips: 8 s by default (`PROBE_TIMEOUT_MS`), 4 s
for the check before a write (`PROBE_BEFORE_WRITE_MS` in `use-online-write-guard.ts`). If the preflight itself fails, the
fetch rejects, which counts as unreachable. That is the same outcome as the main request failing.

**Rejected alternative:** the key as a query parameter (`?apikey=`), which also returns 200 and needs no preflight.
Rejected because it puts the key into every logged URL (browser history of requests, Sentry fetch breadcrumbs,
gateway access logs), while every other keyed call in the app sends a header.

**Regression test:** a unit test in the P1540 style asserting the check's `fetch` carries the `apikey` header,
plus one asserting a resolved non-200 response still counts as reachable (the invariant above). The P1711 calls
e2e's existing no-console-errors checks are the end-to-end canary.

## Acceptance Criteria

- [ ] After a request fails or is cut off by navigation, the browser console shows no 401 for `/auth/v1/health`
      (checked in a real browser on TEST).
- [ ] With the backend reachable, one failed request still never shows the offline strip, and a failed check
      still shows it (the P1540 tests pass unchanged).
- [ ] A check that gets a non-200 answer still counts as reachable (new unit test).
- [ ] The check's request carries the `apikey` header (new unit test).
- [ ] `e2e/p1711-chat-calls.spec.ts` passes its console-error checks with no `/auth/v1/health` 401 in the run log.
