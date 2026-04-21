---
status: all-done
type: bug
rank: 1000749.0
severity: medium
workstream: session-end
date_reported: '2026-04-21'
date_resolved: '2026-04-21'
created_date: '2026-04-21'
completed_at: '2026-04-21'
resolution: "Layer 0 — removed navigate(returnTo) shortcut in live-session-banner.tsx; End Session now always calls onExit() → confirmExitMeeting → terminate (sessionEnded=true lands in DB). Layer 1 — added if (safeReturnTo) navigate(safeReturnTo, { replace: true }) after state updates in all four joiner detection branches (Realtime + polling × sessionEnded + joinerEnded) in clarity-live-page.tsx."
tags:
  - session-end
  - joiner
  - letter-sourced
  - auto-navigate
  - post-p775
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/p779-reproduce.spec.ts
  root_cause: "LiveSessionBanner (src/app/components/partners/live-session-banner.tsx:58-73) takes navigate(returnTo) shortcut when returnTo is valid, bypassing onExit/terminate — sessionEnded never writes to DB. Layer 1 (joiner detection paths at clarity-live-page.tsx:1037-1051 and :1213-1229 have no navigate(returnTo)) remains alive after Layer 0 fix."
  confidence: high
  surfaces_in_scope: [letter-sourced-session-end, any-returnTo-carrying-session]
  reproduced_at: '2026-04-21'
---

# P779: Session-end propagation — joiner stays on /live instead of auto-returning to letter

## Summary

When a letter-sourced /live session ends (creator clicks End Session), the joiner does not auto-navigate back to the letter they came from. In observed cases the joiner also appears to stay in the active /live UI past the expected 17s Realtime-propagation window, suggesting the `sessionEnded` detection itself may not be firing for letter-sourced sessions.

## Root Cause

Reproduced 2026-04-21 via `e2e/p779-reproduce.spec.ts`. The original Layer 2 hypothesis (detection gap in letter-sourced flow via `targetListenerId`-gated branches) was **disproved** — the joiner's Realtime/polling detection would have fired correctly. The true upstream failure is creator-side.

**Layer 0 — LiveSessionBanner shortcut bypasses terminate() (primary root cause, confirmed):**
`src/app/components/partners/live-session-banner.tsx:58-73` — when `returnTo` is valid, the End Session button's onClick calls `navigate(returnTo)` **directly**, skipping `onExit()`. `onExit()` is the only path into `confirmExitMeeting()` → `terminate(session.id)` → atomic write of `live_state.sessionEnded=true`. Because letter-sourced sessions always carry `returnTo` (from P754), the creator "ends" the session by navigating away while the DB row remains live. The joiner therefore has no signal to detect.

This is the root cause of the 17-09 / 17-12 screenshots: joiner stuck in "Explain back…" past 17s because `sessionEnded` was never written. The canary's DB-state gate (`waitForDBStateKey`) times out after 15s — proving the write never happens.

**Layer 1 — Joiner detection paths have no `navigate(returnTo)` (secondary, confirmed from code):**
Even after Layer 0 is fixed and `sessionEnded=true` lands in DB, `src/app/pages/clarity-live-page.tsx` joiner detection paths still only update local state:
- Realtime subscriber (lines 1037–1051): `setSessionEnded(true)` + analytics, no navigate.
- Polling fallback (lines 1213–1229): same pattern, no navigate.

The `returnTo` search param is only consumed by `handleStartNewAfterPartnerLeft` (line 3365, `navigate(returnTo ?? '/live', { replace: true })`), which fires when the joiner clicks "Start new" on `<PartnerLeftScreen>`. No auto-navigation on partner-triggered end.

**Why P775's joiner canary stayed green:** `createTwoPartySessionRealistic` does not set `returnTo` in the URL, so the banner's onClick falls through to `onExit()` and `terminate()` runs correctly. Letter-sourced flow always carries `returnTo`, which triggers the Layer 0 bypass. Without a letter-sourced canary, the bug escaped P775's net entirely.

## Reproduction Steps

1. Authenticated creator opens a letter-results page with a `StartClaritySessionButton` (verified user with an open letter).
2. Creator clicks "Start Clarity Session" → navigates to `/live/{code}?returnTo=/letters?tab=inbox` (session has `sourceLetterId`, `sourceStoryId`, `targetListenerId` set).
3. Joiner (the letter recipient — `targetListenerId`) opens the invite and lands on `/live/{code}?returnTo=/letters?tab=inbox` (or whatever returnTo the invite carries).
4. Both establish two-party state (live-mode-view renders normally).
5. Creator clicks "End Session" (top-right button in `live-session-banner.tsx` — routes to `confirmExitMeeting`).
6. Observe joiner's screen.

**Reproduction rate:** observed in two user screenshots (2026-04-21 17-09 and 17-12). Reproduction via test harness requires a letter-sourced helper — the existing `createTwoPartySessionRealistic` does not exercise this path.

## Expected Behavior

- Creator: navigates back to `returnTo` (e.g., `/letters?tab=inbox`). Already works (line 3381).
- Joiner: within ~3s of creator's End click, auto-navigates to `returnTo` (same target — the letter inbox). Does not stay on `/live`. Does not require manual interaction.

Independence from who ended: same behavior whether the joiner or the creator triggered the end — both return to where they came from.

## Actual Behavior

- Creator: returns to `/letters?tab=inbox` as expected.
- Joiner: remains on `/live`. In observed screenshots, still shows the active in-session UI ("Explain back what you heard…") rather than `<PartnerLeftScreen>`. Even in the nominal case (detection fires, `<PartnerLeftScreen>` renders), the joiner has no auto-navigation — they must click a button to leave.

## Affected Files

- `src/app/components/partners/live-session-banner.tsx` (lines 58–73) — **Layer 0 (primary)**: End Session onClick must always call `onExit()`; remove or restructure the `navigate(returnTo)` shortcut.
- `src/app/pages/clarity-live-page.tsx` — **Layer 1 (secondary)**: joiner detection paths (lines 1037–1051 Realtime, 1213–1229 polling) need to call `navigate(returnTo, { replace: true })` after `setSessionEnded(true)`. Mirror on `joinerEnded` branches for symmetry.
- `src/app/components/session/partner-left-screen.tsx` — likely unaffected if auto-navigate fires before render, but verify.
- `e2e/p779-reproduce.spec.ts` — canary written, failing at DB-state gate (proves Layer 0). Uses `createLetterSessionFixture` + P396 auto-join (**not** `createTwoPartySessionRealistic`, which gave P775 a false green).

## Severity

**Medium** — user-facing but not blocking. Joiner can manually navigate away. Damages the continuity of the letter→session→letter loop that P754 built the `returnTo` plumbing for.

## Fix Approach

Both layers must be fixed. Layer 0 alone makes the DB-state gate pass but the joiner still stays on `/live`. Layer 1 alone can't fire because Layer 0 never writes `sessionEnded=true`.

**Layer 0 fix (primary — creator-side button routing):**
`src/app/components/partners/live-session-banner.tsx:58-73` — the End Session button's onClick must always call `onExit()` (which routes through `confirmExitMeeting` → `terminate`). The `returnTo` navigation should happen **after** termination completes, not instead of it. Options:
1. Remove the `navigate(returnTo)` shortcut entirely — let `confirmExitMeeting` handle `returnTo` at line 3381 (already does).
2. Or: call `onExit()` unconditionally; drop the `isValidReturnTo` branch.

Either shape keeps the invariant "End Session always terminates DB state first."

**Layer 1 fix (secondary — joiner auto-navigation):**
In both joiner detection paths (`clarity-live-page.tsx:1037–1051` Realtime and `:1213–1229` polling):
1. Keep existing `setSessionEnded(true)` + analytics.
2. After state set, if `returnTo` is present and valid (`returnTo.startsWith('/') && !returnTo.startsWith('//')`), call `navigate(returnTo, { replace: true })`.
3. Mirror on `joinerEnded` branches for consistency — creator auto-returns on joiner-triggered end too (symmetric per Acceptance Criteria).

**Relationship to P775:** P775 (creator-side banner cleanup pre-await) is a separate, already-fixed bug — the banner's `onExit` path does call `terminate` correctly. The bug is that letter-sourced sessions never reach `onExit`. Do NOT reopen P775.

## Acceptance Criteria

- [x] After creator clicks End Session in a letter-sourced /live, joiner auto-navigates to `returnTo` within ~3s (no manual click required). Verified by canary (18.1s green; URL assertion at `/letters?tab=inbox` passed).
- [x] After joiner clicks End Session in a letter-sourced /live, creator auto-navigates to `returnTo` within ~3s (symmetric behavior). Verified by code symmetry — `joinerEnded` branches at clarity-live-page.tsx (Realtime ~line 1070, polling ~line 1250) carry the same `if (safeReturnTo) navigate(safeReturnTo, { replace: true })` as the tested `sessionEnded` branches. The canary covers creator→joiner end-to-end; the joiner→creator direction is verified by the mirror pattern in the same handlers.
- [x] Non-letter-sourced /live (no `returnTo` param) still renders `<PartnerLeftScreen>` on either party's end — no regression. Verified: all four new `navigate` calls are gated on `if (safeReturnTo)`; existing `setSessionEnded`/`setPartnerLeft` still run unconditionally above. `safeReturnTo` is `null` when `returnTo` is absent or fails same-origin check.
- [x] New canary `e2e/p779-reproduce.spec.ts` uses `createLetterSessionFixture` (letter + story + clarity_sessions with source_letter_id/source_story_id/target_listener_id) — not the generic two-party helper.
- [x] Canary fails before fix (proves bug) and passes after fix (proves resolution). No false greens. Before fix: DB-gate timeout + joiner stuck on /live. After fix: DB gate hit at `sessionEnded='true' ✓`, joiner URL asserts `/letters?tab=inbox` within polling window.
- [x] `live_state.sessionEnded=true` DB write lands in all scenarios (retained from P775). Verified: banner's End Session button now unconditionally calls `onExit` → `confirmExitMeeting` → `terminate`; shortcut that bypassed this path removed.
- [x] No console errors during either party's exit flow. Verified: full unit suite 1983/1983 green; canary run produced no console errors in its output stream.
