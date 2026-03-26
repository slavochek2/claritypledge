---
title: Rejoin prompt stays visible after session ends remotely
status: all-done
type: bug
severity: medium
flow: fix
rank: 1
tags: []
date_reported: 2026-03-23T00:00:00.000Z
date_resolved: 2026-03-23T00:00:00.000Z
root_cause: >-
  Rejoin prompt had no realtime subscription — main subscription gated on
  session!=null, but rejoin is pre-session state
resolution: Added useEffect with subscribeToClaritySession while rejoinSession is non-null
created_date: 2026-03-23T00:00:00.000Z
locked_at: '2026-03-26T14:21:32.598Z'
---

# P582: Rejoin prompt stays visible after session ends remotely

## Bug Description

**Reported:** 2026-03-23
**Severity:** Medium (confusing UX but non-blocking — user can refresh)

**Symptoms:**
- User opens /live in two browser windows
- Ends session in one window → "Session ended" shown correctly
- Other window still shows "Your session is still running" with Rejoin/End buttons
- Prompt never clears until manual refresh

**Reproduction steps:**
1. Start a live session on /live
2. Open /live in a second browser window — sees "Your session is still running"
3. End the session in the first window
4. Second window still shows the rejoin prompt indefinitely

**Expected:** Second window should update to reflect session ended within seconds.
**Actual:** Rejoin prompt persists forever.

**Root cause:** The `rejoinSession` state in `clarity-live-page.tsx` is set once on mount. The realtime subscription is gated on `session` being non-null (line ~868), but in the rejoin-prompt state `session` is null. No subscription, no polling, no `storage` event listener — the prompt is a dead end.

## Acceptance Criteria

- [ ] When a session ends (by either participant), all open tabs/windows showing the rejoin prompt clear it within ~5 seconds
- [ ] Regression test covers the cross-tab scenario
