---
title: "Stale rejoin prompt after session ends"
status: done
completed_at: "2026-03-27"
type: bug
p_number: 595
severity: high
date_reported: 2026-03-27
date_resolved: 2026-03-27
root_cause: Rejoin prompt realtime subscription had no polling fallback
resolution: Added 5s polling interval using getActiveSessionByCode
flow: fix
---

# P595: Stale Rejoin Prompt After Session Ends

## Bug Description

**Reported:** 2026-03-27
**Severity:** High (blocks returning to /live after partner ends session)

**Symptoms:**
- After one participant ends a session, the other participant's view still shows "Your session is still running" with a "Rejoin Session" button
- Clicking "Rejoin" fails because the session no longer exists
- The prompt stays indefinitely until the user manually refreshes

**Reproduction steps:**
1. Start a clarity session between two browsers (creator + joiner)
2. One participant clicks "End Session"
3. The ending participant sees "Session ended" correctly
4. Navigate to /live on the OTHER participant's browser
5. Expected: Clean /live landing page
6. Actual: "Your session is still running" with non-functional "Rejoin Session" button

## Root Cause

The P582 realtime subscription for the rejoin prompt (clarity-live-page.tsx:891-908) has **no polling fallback**. When the WebSocket connection drops silently (common on mobile networks), the UPDATE broadcast for `sessionEnded` never arrives, and the prompt stays forever.

The main session view HAS a polling fallback (line 1051+), but it's gated behind `if (!session)` — and `session` is null when the rejoin prompt shows. So the rejoin path relies solely on the fragile realtime subscription.

**5-Why chain:**
1. Rejoin prompt doesn't clear → realtime callback doesn't fire
2. Realtime callback doesn't fire → WebSocket subscription dropped silently
3. WebSocket dropped silently → no error handling or reconnection logic
4. No fallback mechanism → polling is gated behind `if (!session)` which is null
5. Root: rejoin subscription has no `setInterval` polling when WebSocket fails

## Fix

Add polling fallback to the rejoin subscription effect in clarity-live-page.tsx — call `getActiveSessionByCode` periodically (same pattern as main session polling). If it returns null (session ended/expired), clear the rejoin prompt.

## Files

- `src/app/pages/clarity-live-page.tsx` (primary — add polling to rejoin effect)
- `src/app/data/api.ts` (defensive — no changes needed, `getActiveSessionByCode` already returns null for ended sessions)
