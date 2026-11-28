---
status: week
type: bug
rank: 364
severity: low
date_reported: 2026-11-28
created_date: 2026-11-28
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [offline, metered-services, hidden-tab]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1741: Hidden tabs still send connection checks and reconnect re-reads

## Summary

A hidden tab sends the offline strip's connection checks, and can start a page re-read, which breaks the rule
that a hidden tab makes no metered requests. Found in a Gemini review on 2026-11-27, during the P1711 session.
The code was read to confirm it. It was not reproduced in a browser. Follows on from P1540, which added the checks.

## Root Cause

In `src/app/contexts/offline-status-context.tsx`, only the 20-second repeat check tests
`document.visibilityState`. Two other paths send a check without testing it:
- the confirmation check after a failed request, which runs as soon as the app is marked unreachable;
- the browser's `online` event listener.

The reconnect tick (`setReconnectTick`) also fires regardless of visibility. Pages that read
`reconnectTick` may then re-read while hidden. Whether each reader checks visibility itself was not verified
(UNVERIFIED). The readers include `point-detail-page.tsx`, `story-detail-page.tsx`, `letter-reading-page.tsx`,
`use-offline-read-state.ts` and `home-side-rail.tsx`.

## Invariants

- A hidden tab sends no request (`docs/technical/metered-services.md`, rule 3).
- P1540: one failed request is a hint, not a verdict, and the strip goes offline only once a health check also
  fails. Any response from the health check counts as reachable.

## Reproduction Steps

1. Open any page signed in and confirm the app is online.
2. Hide the tab (switch to another tab).
3. Make a request fail. For example, turn the network off and on, or block the API host in DevTools.
4. Observe in the Network panel: a request to `/auth/v1/health` goes out from the hidden tab. On recovery, pages
   reading the reconnect tick may re-read.

**Reproduction rate:** expected 100% from the code. Not yet run.

## Expected Behavior

While the tab is hidden: no health check and no reconnect re-read. When the tab is shown again, one check runs
right away, and any re-read follows it.

## Actual Behavior

A hidden tab sends health checks after a failed request or an `online` event. The reconnect tick fires while
hidden. When a hidden tab is shown again, nothing checks the connection until the next repeat check, up to 20 s
later.

## Affected Files

- `src/app/contexts/offline-status-context.tsx`: the confirmation check effect (about line 163), the `online`
  listener (about line 216) and the reconnect tick effect (about line 189).
- The readers of `reconnectTick` listed under Root Cause (suspected).

## Severity

**Low.** It costs a few requests per connection drop for each hidden tab and has no visible symptom.

## Fix Approach

Guard both check call sites with a visibility test. Add a `visibilitychange` listener that runs one check when
the tab is shown while the app is marked unreachable. This also fixes the up-to-20 s delay after the tab is shown.
Hold the reconnect tick while hidden and fire it when the tab is shown, or confirm that every reader already does.

## Acceptance Criteria

- [ ] With the tab hidden and a request failing, the Network panel shows no health check until the tab is shown.
- [ ] Showing the tab again while unreachable runs one check right away, not up to 20 s later.
- [ ] No page re-read fires while the tab is hidden. One fires after it is shown, if the app reconnected.
- [ ] A visible tab behaves as it does today (strip, confirmation, reconnect).
