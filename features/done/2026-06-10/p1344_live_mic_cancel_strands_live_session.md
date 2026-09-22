---
status: all-done
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
pipeline_ran: [create-bug, fix, ship]
completed_at: 2026-09-22
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

**Corrected during the fix (2026-09-22).** The reload path first written here is NOT
reachable: on restore `gateMicAndGoLive` returns early on `isPrivate`, local state that resets
to `true` on reload, so a reloaded participant is never mic-gated (measured; filed as
INBOX-85). The reachable paths, both reproduced by `e2e/p1344-live-mic-cancel.spec.ts`
failing on the pre-fix page:

A. Host turns recording on, creates a session, denies the mic in the waiting room, taps
   Cancel → lobby, but the session survives in state and storage; a reload puts the host back
   in the waiting room.
B. Same host leaves the dialog open; a partner joins (view is still `waiting`, because the mic
   gate is what moves waiting → live); host taps Cancel → host on the lobby, partner stays in a
   session that still looks live.

**Reproduction rate:** 100% (both E2E cases fail on `main`'s page).

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

As built: no session → lobby as before. Session, no partner (`isCreator` and no
`hasJoinerRef` / `session.joinerName`) → end the session server-side
(`completeClaritySessionKeepalive`, so a joiner who raced in is told) plus the waiting-room
Cancel. Partner present → `confirmExitMeeting()`. Split on the PARTNER, not the view (first
draft keyed on `view === 'waiting'`, wrong for case B). Toast in every branch.

Known and accepted: in case B the creator lands on the session-end screen, and
`confirmExitMeeting` creates a transcription job for a session with no creator audio — the
same as any existing in-session exit (Opus review, medium; not changed here).

## Acceptance Criteria

- [x] Pre-join joiner who cancels returns to the lobby, and the creator still sees "Invite Your Partner" (existing test passes). — `e2e/live-meeting-mic-permission.spec.ts` "joiner who cancels mic dialog…" passes on the branch (2026-09-22). Caveat filed as INBOX-87: that test's Cancel click is `if (isVisible)`-hedged.
- [x] A session holder with a partner present who cancels the mic dialog causes the partner's view to leave the live session. — E2E B: partner sees "Session ended"; fails on the pre-fix page. (The joiner-side variant is unreachable today, see Reproduction.)
- [x] A waiting host who cancels ends up on the lobby with no stored session, the same as pressing the waiting-room Cancel. — E2E A: lobby, no `clarity_live_session_code`, reload stays on the lobby, and `live_state.sessionEnded = true`; fails on the pre-fix page.
- [x] No console errors in these flows. — both E2E cases assert zero uncaught `pageerror` events.
