---
status: in-progress
type: bug
rank: 1000749.0
severity: medium
workstream: live
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [live, waiting-room, navigation, join-via-link]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P754: Cancel from waiting room shows stuck "Joining session..." spinner on join-via-link URL

## Summary

When a host cancels from the `/live` waiting room while on a join-via-link URL (`/live/ABCD12`), they land on a permanently stuck "Joining session..." spinner instead of a clean start view.

## Root Cause

`handleCancelWaiting` calls `setView('start')` but does not navigate away from the join-via-link URL. Since `isJoinViaLink = !!urlCode` is derived from the URL (not component state), it stays `true` after cancel. The `view === 'start'` branch detects `isJoinViaLink` and renders the joiner entry form. For authenticated users, that form immediately shows "Joining session..." (condition: `isLoading || consentLoading || !error` — `!error` is always true when no error exists). The `autoJoinFiredRef` guard prevents an actual join attempt, so the spinner hangs permanently until the page reloads.

## Reproduction Steps

1. Open `/live/ABCD12` (any valid join-via-link URL) as an authenticated host
2. Wait for the waiting room view to appear (session is active or in-progress)
3. Click the Cancel button in the waiting room
4. Observe: URL stays at `/live/ABCD12`, view shows "Joining session..." spinner indefinitely

**Reproduction rate:** 100%

## Expected Behavior

Clicking Cancel from the waiting room navigates to `/live` (clean URL), shows the start view with no spinner, and allows the user to start a new session or enter a room code manually.

## Actual Behavior

URL stays at `/live/ABCD12`. The start view branch detects `isJoinViaLink=true` and immediately re-renders the joiner form in "Joining session..." spinner state. The spinner never resolves — `autoJoinFiredRef` blocks the actual join so no navigation or error ever occurs.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — `handleCancelWaiting` (~line 3130): missing `navigate('/live', { replace: true })` call when `isJoinViaLink` is true
- `src/app/pages/clarity-live-page.tsx` — line 3064–3065: `autoJoinFiredRef` guard that prevents re-firing but leaves the spinner stuck
- `src/app/pages/clarity-live-page.tsx` — line 3633: `!error` clause in spinner condition that is always true with no error present
- `src/app/pages/clarity-live-page.tsx` — line 3567: existing `navigate('/live', { replace: true })` pattern to follow

## Severity

**Medium** — affects hosts who join via a link URL and then cancel from the waiting room; workaround is a full page reload. Does not affect the core session flow.

## Fix Approach

In `handleCancelWaiting` (~line 3130), after the existing `setView('start')` call, add a navigation escape when on a join-via-link URL:

```tsx
if (isJoinViaLink) {
  navigate('/live', { replace: true });
}
```

This mirrors the existing pattern at line 3567. With `replace: true`, the back button won't return to the stuck state.

## Acceptance Criteria

- [x] Clicking Cancel from the waiting room while on `/live/ABCD12` navigates to `/live` (URL changes)
- [x] After cancel, the start view is shown with no spinner and no "Joining session..." text
- [x] Non-join-via-link cancel (host on `/live` without a code URL) still returns to the clean start view — no navigate call fires when `isJoinViaLink` is false
- [x] Regression test passes: `src/tests/p754-cancel-waiting-room-navigate.test.tsx`
- [ ] No console errors during the cancel flow

## Follow-up (UAT 2026-04-18): returnTo and two-click defects

### Problem A — Two-click cancel

URL changes on first click but waiting-room view re-renders at the new URL (realtime subscription re-asserts session). Second click finally reaches start. **Deferred to runtime diagnostic** — requires console.log instrumentation in a live dev session to identify which effect re-asserts `session`/`view` after cancel. `cancellingRef` guard applies only after culprit is confirmed.

### Problem B — Wrong destination (FIXED)

After cancel, host landed on `/live` start view instead of the letters inbox they came from.

**Root cause (confirmed):** `start-clarity-session-button.tsx` navigated to `/live/${code}` with no `returnTo`. The `returnTo` read at `clarity-live-page.tsx:276` and the pattern at line ~3364 (session-end) already existed — the plumbing just wasn't wired into the letters entry point or the cancel-waiting handler.

**Fix applied:**
- `src/app/components/letters/start-clarity-session-button.tsx`: appends `?returnTo=%2Fletters%3Ftab%3Dinbox` to the navigate URL
- `src/app/pages/clarity-live-page.tsx` `handleCancelWaiting`: prefers `returnTo` over `/live`; falls back to `/live` when `isJoinViaLink` (preserves original P754 fix)

### Additional acceptance criteria (follow-up)

- [x] "Start a clarity session" from letters inbox navigates to `/live/{CODE}?returnTo=%2Fletters%3Ftab%3Dinbox`
- [x] Clicking Cancel from the waiting room when `returnTo` is present navigates to `returnTo` (e.g. `/letters?tab=inbox`)
- [x] Clicking Cancel with no `returnTo` still navigates to `/live` (existing P754 behaviour preserved)
- [x] Regression tests pass: `src/tests/p754-cancel-waiting-room-navigate.test.tsx` (both cases)
