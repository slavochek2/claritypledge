---
status: rejected
type: change-request
rank: 1000072.0
created_date: 2026-04-07T00:00:00.000Z
changes: p617
superseded_by: p674
tags:
  - live
  - ux
  - redesign
  - p617
---

# P672: /live — Mode Switcher Host-Only + Strip Disable Logic

## Summary

Simplify the mode switcher on /live: only the host (session creator) controls the mode. The guest sees which mode is active but cannot switch it. Remove the "disable switcher during rating" notification machinery — if only the host controls it, there's nothing to disable for the guest.

## Problem

**Situation:** The mode switcher (Open mode / Guided mode) currently appears for both participants. When the speaker clicks Speak, the listener's switcher is supposed to disable with a tooltip "Mode locked — your partner is rating."

**Complication:** This disable/notification logic is a source of multiple bugs (P643 bug 2, P646 timing issues). The Realtime coordination needed to sync disable state between participants adds complexity for marginal UX value. The guest has no reason to switch modes mid-session — mode is a session-level decision the host makes.

**Question:** Can we simplify by making mode control host-only and removing the disable machinery?

## Solution

1. **Host sees interactive switcher** — same as today
2. **Guest sees read-only mode indicator** — shows current mode but not clickable
3. **Remove `isListenerDuringLocalRating` logic** that disables the switcher — no longer needed
4. **Remove mode-lock notification tooltip** — no longer needed

## Evidence

Screenshot Apr 07 14-53-40: mode switcher visible on both browsers, annotated "switcher visible only for host!" — confirming the founder's intent.

## Risks / Non-Goals

- Do NOT change mode persistence or Realtime sync — mode still syncs, just only host can change it
- Do NOT change the Speak/rating flow — this is purely about who controls mode switching
- Risk: guest may expect to control mode. Mitigated by showing the active mode as read-only indicator.

## Acceptance Criteria

- [ ] Host (creator) sees interactive mode switcher
- [ ] Guest sees read-only mode indicator (not clickable)
- [ ] No mode-lock notification or tooltip for guest during rating
- [ ] Mode changes by host are reflected on guest's indicator via Realtime
- [ ] `isListenerDuringLocalRating` removed or no longer gates switcher visibility
