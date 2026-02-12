---
status: backlog
type: bug
rank: 2
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
