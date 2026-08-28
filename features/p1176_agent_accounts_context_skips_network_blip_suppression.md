---
status: qa
type: bug
rank: 78
severity: low
workstream: infra
date_reported: '2026-08-28'
created_date: '2026-08-28'
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
tags: [sentry, agent-accounts, network-blip, noise-reduction]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/agent-accounts-context.test.tsx
  root_cause: "agent-accounts-context.tsx:57's .catch() calls Sentry.captureException unconditionally on any getAgentAccounts() rejection, never consulting isNetworkBlip() from src/lib/network-blip.ts — the only data-layer call site that bypasses the P990 blip-suppression mechanism used everywhere else via db-error-logger.ts."
  confidence: high
  surfaces_in_scope: [agent-accounts-context.tsx]
  surfaces_deferred: []
  reproduced_at: 2026-08-28
---

# P1176: agent-accounts-context skips the network-blip suppression every other data-layer call site uses

## Summary

`agent-accounts-context.tsx`'s `getAgentAccounts()` fetch failure handler reports transient network blips to Sentry unconditionally — it never consults `isNetworkBlip()` from `src/lib/network-blip.ts`, the P990 mechanism every other data-layer call site uses via `db-error-logger.ts`.

## Root Cause

**Confirmed** (2026-08-28, canary test `src/tests/agent-accounts-context.test.tsx`, test "p1176: a network-blip rejection...").

`src/app/contexts/agent-accounts-context.tsx:52-58` catches `getAgentAccounts()` rejections with a bare `Sentry.captureException(err, { tags: { feature: 'p1104-agent-accounts' } })`. This call site was added directly (P1104), bypassing `db-error-logger.ts`'s `logDbError`/`throwDbError`, which is the only place `isNetworkBlip()` is normally consulted. As a result this is the one call site in the data layer that reports a "Load failed" / "Failed to fetch" fetch failure to Sentry as a real issue instead of dropping it with a breadcrumb.

Confirmed against Sentry event `63358ce45c6142aead12cc813c587eca` (issue `JAVASCRIPT-REACT-2W`): message `TypeError: Load failed (besjtuodziykmjidubzw.supabase.co)`, 0 users impacted, 1 event, single Chrome Mobile iOS session (Thailand). `network-blip.ts` already documents "Load failed" as Mobile Safari/Chrome iOS's phrasing for a failed fetch (comment cites `JAVASCRIPT-REACT-2H`), and the error carries no Postgrest `code` — both are exactly the blip signature `isNetworkBlip()` matches.

`grep -n "agent-accounts-context\|p1176" docs/decisions.md` — no hits; no prior decision contradicts this fix.

## Invariants

FAIL-CLOSED must be preserved: on any fetch failure (blip or real), `accounts` must stay `null` and `isLoading` must stay `true` — this fix only changes whether the failure is *reported to Sentry*, never whether the Set is populated. See the file's own header comment for why (an empty Set read as "no agents" would render agent accounts as people).

## Reproduction Steps

1. Simulate `getAgentAccounts()` rejecting with an `Error` whose `message` is `"Load failed"` (or any `network-blip.ts` `BLIP_MESSAGE_FRAGMENTS` match) and no `code`.
2. Mount `AgentAccountsProvider`.
3. Observe: `Sentry.captureException` is called with the blip error and `feature: 'p1104-agent-accounts'` tag — an issue is created.

**Reproduction rate:** 100% for any blip-shaped rejection.

## Expected Behavior

A blip-shaped rejection (per `isNetworkBlip()`) should emit a `Sentry.addBreadcrumb` (category `db-error-suppressed`, reason `network-blip`) and return — no `captureException` call, no new Sentry issue. A non-blip rejection should still call `captureException` exactly as today. `isLoading` stays `true` in both cases (FAIL-CLOSED unchanged).

## Actual Behavior

Every rejection, blip or not, calls `Sentry.captureException`, creating a Sentry issue with 0 users impacted and no actionable signal.

## Affected Files

- `src/app/contexts/agent-accounts-context.tsx:52-58` — `.catch()` handler in the `useEffect`, needs the `isNetworkBlip()` gate.
- `src/lib/network-blip.ts` — existing predicate, import only, no change needed.

## Severity

**Low** — 0 users impacted, no user-facing behavior change (FAIL-CLOSED loading state is unaffected either way). This is pure Sentry signal-to-noise cleanup, matching an established pattern.

## Fix Approach

Import `isNetworkBlip` from `@/lib/network-blip`. In the `.catch(err => ...)` handler, if `isNetworkBlip(err)` add a `Sentry.addBreadcrumb({ category: 'db-error-suppressed', level: 'info', data: { context: 'agent-accounts', reason: 'network-blip' } })` and return; otherwise keep the existing `captureException` call unchanged. Mirrors `db-error-logger.ts:56-59` exactly, adapted for a raw `Error`/`PostgrestError`-like rejection rather than a `PostgrestError`.

## Acceptance Criteria

- [x] A blip-shaped rejection (`isNetworkBlip(err) === true`) does not call `Sentry.captureException`
- [x] A blip-shaped rejection emits a `db-error-suppressed` breadcrumb
- [x] A non-blip rejection still calls `Sentry.captureException` with the same tags as before
- [x] `isLoading` remains `true` after any rejection (blip or not) — FAIL-CLOSED invariant unchanged
- [x] Regression test passes — landed in `src/tests/agent-accounts-context.test.tsx` (existing file for this component) rather than a new `p1176-*.test.ts`; two `p1176:`-prefixed tests added there
- [x] No console errors during either flow

## Resolution

**Fixed:** 2026-08-28
**Root cause:** `agent-accounts-context.tsx:57`'s `.catch()` called `Sentry.captureException` unconditionally, never consulting `isNetworkBlip()`.
**Resolution:** Added an `isNetworkBlip(err)` gate before the `captureException` call — on a blip, emits an `addBreadcrumb` (category `db-error-suppressed`) and returns; otherwise unchanged. Mirrors `db-error-logger.ts:56-59`.

**Files changed:**
- `src/app/contexts/agent-accounts-context.tsx` — added the gate + import
- `src/tests/agent-accounts-context.test.tsx` — two new tests (blip suppressed, non-blip still reported)

**Regression tests:** `src/tests/agent-accounts-context.test.tsx` (tests prefixed `p1176:`)

**Code review:** 0 HIGH, 1 MEDIUM (Tier-1 sibling finding — filed as P1177, not fixed in this branch). Full suite: 289/291 files, 3266/3285 tests pass (pre-existing skips unrelated).

**Deferrals manifest (p1176):**
- Filed during this fix: [p1177]
- Already-filed deferrals referenced: none
- Unnamed deferrals: 0
