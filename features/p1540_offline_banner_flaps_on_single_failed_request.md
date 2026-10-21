---
status: in-progress
type: bug
rank: 1
tags: [offline, network]
disclosure: public
created_date: '2026-10-21'
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
---

# P1540: The Offline strip flaps on a single failed request

## Problem

Founder: "I started to see offline, online, offline ... the banner offline start to switch a lot"
and "it turns offline at the moment of sign-in requesting". Seen at `/login` during magic-link
sign-in with a VPN on, while Supabase health answered in about 0.3 s from the same machine.

## Root Cause

**Hypothesis (verified in code):** `isSupabaseUnreachable()` in `src/lib/network-outcome.ts` is
`lastFailureSeq > lastSuccessSeq`. One thrown, non-abort fetch through `withNetworkOutcome` flips
the whole app offline in `offline-status-context.tsx` (`offline = !navigatorOnline || supabaseUnreachable`),
and the next success flips it back. A VPN that drops one request therefore makes the strip flap.
5xx and 429 do not count (`recordServerTrouble`), so only thrown fetches trigger it.

## Invariants

- `navigator.onLine === false` shows offline immediately.
- A confirmed outage (a failed request AND a failed health probe) shows offline.
- A success sent after the latest failure clears offline (P1369 reconnect, reconnectTick edge and backoff unchanged).
- Write probe semantics (P1420), slow-is-not-offline (P1337) and `isSupabaseUnreachable()` for non-UI callers are unchanged.

## Acceptance Criteria

- [x] One failed request, health probe answers: the strip never shows offline.
- [x] One failed request, health probe also fails: the strip shows offline.
- [x] After a confirmed outage, one success sent after the failure returns to online.
- [x] navigator offline still shows offline immediately. (evidence: p1540-offline-flap.test.tsx "navigator offline shows offline immediately", passing)
- [x] tsc, full `src/tests` vitest run, and eslint on changed files pass.

## Accepted Risk

- ACCEPT: if a second request fails while a confirmation probe that later succeeds is in flight, the outage is confirmed by the next 20s periodic probe rather than immediately (Gemini 4 Argon final review, 2026-10-21). Re-probing on every still-unreachable success was rejected: a persistently failing endpoint with healthy auth would re-probe at round-trip pace.
