---
status: all-done
type: bug
rank: 2
workstream: C1
tags: []
created_date: 2026-02-06
---
# P126: /live Departure Detection Unreliable

## Description

When one participant leaves a `/live` session (closes tab, navigates away, loses connection), the other participant is not reliably notified that their partner left. The session should end cleanly for both sides.

## Distinct From P121

P121 covers sign-out not ending the meeting. This bug is about the general departure detection mechanism — the polling/presence check that detects when someone leaves mid-session.

## Expected Behavior

- When one person leaves (any reason), the other sees "Partner left" within a few seconds
- Session ends cleanly for both
- No zombie sessions

## Actual Behavior

- Sometimes works, sometimes the remaining participant is left waiting indefinitely
- Unreliable across different departure methods (tab close, navigate away, connection drop)

## Related Code

- `src/app/pages/clarity-live-page.tsx` — polling-based departure detection (`POLL_INTERVAL_MS`)
- Supabase channel subscription for session state changes

## Impact

Medium — affects core /live experience. Becomes critical for P124 (Event Rooms) where "back to room" flow depends on clean session endings.

## Root Cause

The `pagehide` handler in `clarity-live-page.tsx` called `patchClaritySessionLiveState` and `clearSessionJoiner` — both async `fetch()` calls via the Supabase client. When a tab closes or navigates away, the browser kills in-flight `fetch` requests before they complete. This made Layer 1 (the fast-path unload signal) unreliable: the DB write never landed, so Layer 2 (realtime) had nothing to broadcast, leaving Layer 3 (polling) as the only detection path. Polling works but adds up to 1s delay and fails entirely if the departing tab's network drops first.

`navigator.sendBeacon` would solve the keepalive problem but cannot set custom headers (`apikey`, `Authorization`) required by Supabase. The correct fix is `fetch({ keepalive: true })`, which tells the browser to complete the request even after page teardown and supports arbitrary headers.

## Resolution

Replaced the unload-time `patchClaritySessionLiveState()`/`clearSessionJoiner()` calls in the `pagehide` handler with direct `fetch({ keepalive: true })` calls to the Supabase REST API:

- **Creator departure:** POSTs to `/rest/v1/rpc/patch_live_state` with `keepalive: true`
- **Joiner departure:** PATCHes `/rest/v1/clarity_sessions?id=eq.{id}` to set `joiner_name: null` with `keepalive: true`

All three layers are now reliable:
- **Layer 1 (fast path):** `pagehide` fires `fetch({ keepalive: true })` — browser guarantees delivery even during tab close/navigation
- **Layer 2 (real-time):** Supabase realtime subscription picks up the DB change immediately and shows "partner left"
- **Layer 3 (fallback):** 1000ms polling catches connection drops/crashes where Layer 1 cannot fire
