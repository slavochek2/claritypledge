---
status: week
type: bug
rank: 1000761.0
severity: low
workstream: live
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [session-end, realtime, live, banner]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P764: "End Session" banner re-appears on partner page refresh after session ends

## Summary

After a session ends, if the partner refreshes their page within the Realtime lag window (~10s), the "End Session" banner briefly re-appears instead of showing a clean state.

## Root Cause

Race between `endClaritySession` DB write and `useActiveSession`'s mount validation:

1. Creator calls `endClaritySession` → writes `live_state.sessionEnded: true` to `clarity_sessions`
2. Supabase Realtime fires UPDATE → partner's `subscribeToClaritySession` eventually clears their localStorage and banner (P762 fix)
3. If partner refreshes **before** the Realtime event arrives (~10s window), `useActiveSession` runs on mount: reads localStorage (still has session code) → calls `getActiveSessionByCode` → the fresh SELECT may return the row with `live_state.sessionEnded: true` and correctly clear, BUT there is a brief flash while `isLoading` is `true` where the component may render the banner before validation completes

Alternatively, if the partner refreshes before the DB write fully propagates (rare — sub-100ms), `getActiveSessionByCode` reads the session as still active and sets the banner, which then persists until the next poll (30s) or page reload.

Surfaced during P762 QA — Screenshot at Apr 18 21-17-24.

## Reproduction Steps

1. Open app in two browsers — author (Browser A, verified), partner (Browser B, verified)
2. Author starts a session from a letter; partner joins via /live
3. Author clicks "End Session"
4. Within 5–10 seconds of clicking (before Realtime propagates), partner **refreshes** their page
5. **Observe:** Partner sees the "End Session" banner re-appear on the refreshed page

**Reproduction rate:** Intermittent — requires refresh within the Realtime lag window (~5–10s after session end)

## Expected Behavior

After session ends, partner refreshes → no banner, no active session UI. `getActiveSessionByCode` reads `live_state.sessionEnded: true` and clears localStorage on mount.

## Actual Behavior

"End Session" banner re-appears on partner's page after refresh. Clears on the next page reload (self-correcting) or after the 30s poll fires.

## Affected Files

- `src/hooks/use-active-session.ts` — mount validation (`validateSession`) runs after render; banner may flash during `isLoading` transition
- `src/app/data/api.ts` — `getActiveSessionByCode`: correctly checks `live_state.sessionEnded` but can't defend against a refresh that races the DB write

## Severity

**Low** — intermittent (narrow ~10s window), self-corrects on next reload, no data loss or session corruption.

## Fix Approach

Two options:
- **Option A (simple):** In `useActiveSession`, don't render `hasActiveSession: true` until `isLoading` is false — ensures no banner flash during mount validation. Check if `ActiveSessionBanner` already gates on `isLoading`.
- **Option B (robust):** On mount, if `getActiveSessionByCode` returns an active session, do a short retry (1–2s) before setting the banner — gives the DB write time to propagate. Higher complexity, marginal gain.

Option A is the right first step. Grep `isLoading` usage in `ActiveSessionBanner` before implementing.

## Acceptance Criteria

- [ ] Partner refreshes page immediately after author ends session → banner does not appear (or disappears within 1s)
- [ ] Partner refreshes page 15s+ after author ends session → no banner appears
- [ ] Author's banner behavior unaffected
- [ ] No console errors during the refresh flow
