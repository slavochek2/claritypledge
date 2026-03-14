---
status: week
type: task
rank: 1.5
tags: [telemetry, mixpanel, session]
---

# P516: Add Exit Reason to Session Telemetry

## Problem

We cannot diagnose WHY people leave sessions. Mixpanel tracks `live_session_exited` and `live_session_partner_left` but doesn't distinguish between intentional exit (button click) vs accidental exit (refresh, navigation, tab close, network drop).

## Solution

Add `exit_reason` property to Mixpanel session exit events:
- `button_click` — user clicked "End Session"
- `pagehide` — page unloaded (refresh, navigate, tab close)
- `grace_expired` — partner didn't return within grace period (after P511 ships)
- `error` — JS error during session

Also add:
- `time_since_last_action_ms` — how long since user's last interaction
- `had_focus_when_exited` — was the browser tab focused (`!document.hidden`)

## Why Now

Prerequisite for P511 (Session Resilience) — provides baseline data to measure success and identify additional exit paths we haven't discovered yet.

## Acceptance Criteria

- [ ] `live_session_exited` event includes `exit_reason` property
- [ ] `live_session_partner_left` event includes `exit_reason` property
- [ ] `time_since_last_action_ms` tracked on exit events
- [ ] `had_focus_when_exited` tracked on exit events
- [ ] Can filter Mixpanel by exit reason to see distribution
