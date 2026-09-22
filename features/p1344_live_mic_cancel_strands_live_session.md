---
status: week
type: bug
rank: 12
severity: medium
workstream: live
date_reported: 2026-09-22
created_date: 2026-09-22
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [live, mic-permission, session-end]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1344: cancelling the mic dialog on /live leaves a live server session behind the lobby

## Summary

INBOX-81 (found in P1323 adversarial review). `handleMicCancel` in `clarity-live-page.tsx:3855`
sets `view='start'` and does nothing to the session: it does not clear local session state, does not
notify the partner, and does not end the session. A participant who holds a session and denies the
microphone ends up on the lobby inside a session that still looks live to the other side.

## Root Cause

Read from code, 2026-09-22. The mic dialog opens from three places:

1. `completeJoin` (~2995), a joiner before joining. **No session is written yet**, so cancelling to the lobby is correct.
2. The waiting-room effect (~974): the host has **created** a session and is waiting.
3. `gateMicAndGoLive` (~3866): going live from restore, subscription or polling. **A session exists,
   and usually a partner does too.**

Cases 2 and 3 have a sanctioned exit each, and `handleMicCancel` uses neither:
`handleCancelWaiting` (~3491) for a waiting host, and `confirmExitMeeting` (~3615) for a live
session. Per P779 and P921, every in-session exit must go through `confirmExitMeeting`, because
`live_state.sessionEnded` is the only signal the partner receives. The code comment at line 399
already records this gap.

## Invariants

- Every in-session exit goes through `confirmExitMeeting` (P779 / P921, decisions.md).
- A joiner who has not joined yet writes nothing to the DB (completeJoin step 1).

## Reproduction Steps

1. Host (mic granted) creates a session at `/live`, and the joiner joins so both are live.
2. The joiner reloads with mic permission revoked. Restore → `gateMicAndGoLive` → mic dialog.
3. The joiner taps Cancel.
4. Observe: the joiner is on the lobby. The host never gets the joiner-left signal, and the session stays live.

**Reproduction rate:** 100% by reading the code. No browser repro yet (`/reproduce` owns that).

## Expected Behavior

- Pre-join joiner (no session): unchanged. Back to the lobby with the toast.
- Waiting host: same result as the waiting-room Cancel button (`handleCancelWaiting`).
- Anyone holding a session outside the waiting view: exits through `confirmExitMeeting`, and the partner gets the end/left signal.

## Actual Behavior

Local view resets to the lobby. The session and the partner are left as they were.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — `handleMicCancel` (~3855).
- `e2e/live-meeting-mic-permission.spec.ts` — the existing pre-join cancel test (must keep passing).

## Severity

**Medium** — the partner is stranded in a session that looks live. It needs a denied mic after a session exists.

## Fix Approach

Branch in `handleMicCancel`: no session → current behaviour. `view === 'waiting'` →
`handleCancelWaiting()`. Otherwise with a session → `confirmExitMeeting()`. The toast stays in every
branch. The Links-trigger comment at line 399 is updated to say the state no longer occurs.

## Acceptance Criteria

- [ ] Pre-join joiner who cancels returns to the lobby, and the creator still sees "Invite Your Partner" (existing test passes).
- [ ] A live-session participant who cancels the mic dialog causes the partner's view to leave the live session.
- [ ] A waiting host who cancels ends up on the lobby with no stored session, the same as pressing the waiting-room Cancel.
- [ ] No console errors in these flows.
