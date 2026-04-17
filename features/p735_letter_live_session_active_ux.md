---
id: p735
title: Active session UX — replace disabled Start button with Rejoin + End
type: bug
status: qa
severity: high
date_reported: 2026-04-17
delivery_stage: fix
pipeline_ran: [fix]
tags: []
rank: 1000737.0
created_date: 2026-04-17
---

# P735: Active Session UX — Replace Disabled Start Button with Rejoin + End

## Problem

After starting a letter-sourced clarity session, the sender lands on `/live/<code>` and navigates back to the letter results page. Two problems remain after P734:

1. **Disabled button is a dead end.** `StartClaritySessionButton` shows a grey disabled "Start a clarity session" with tooltip "Invite already pending". No visible path to rejoin or end the session. UX dead-end.

2. **Invite doesn't always close.** Recipient inbox still shows the invite after sender clicks "End Session" in the banner. `complete_clarity_session` RPC is the canonical atomic close — it sets `status='completed'` AND closes the invite in one transaction. The banner's current path can silently fail.

## Solution

Replace `invitePending: boolean` state with `openInvite: OpenInviteDetails | null`. When an invite exists:

- **Banner visible for this session:** show only "Return to Session" + hint ("Use the top banner to end this session"). Banner owns End.
- **Banner absent:** show both "Return to Session" + "End Session". Clicking End calls `completeClaritySession(openInvite.sessionId)` directly with fallback to `cancelLiveInvite`.

New API function `getOpenInviteForSender(receiverId)` queries `clarity_live_invites` with `clarity_sessions!inner(code)` join. Uses existing `live_invites_creator_select` RLS policy (migration `20260415150000`).

Auto-refresh: when `activeSessionCode` clears (partner ended session), trigger `checkInvite()` to resync button state.

## Acceptance Criteria

- [x] `StartClaritySessionButton` renders "Return to Session" + "End Session" when open invite exists and banner is absent
- [x] When banner is visible for the same session, renders only "Return to Session" + hint; End Session not shown
- [x] Clicking "End Session" calls `completeClaritySession` with `openInvite.sessionId`
- [x] Falls back to `cancelLiveInvite` if RPC returns 'not authorized'
- [x] After End: re-syncs from DB; clears localStorage only when stored code matches invite code AND session ended successfully
- [x] When `activeSessionCode` clears externally, button re-fetches invite state
- [x] `completeClaritySession` RPC called with correct `sessionId` on End Session (atomically closes invite per migration `20260414100001`)

## Done-When

- All 10 unit tests in `src/tests/p735-start-clarity-session-button.test.tsx` pass
- `npm run build` passes with no TypeScript errors
- Browser verification: sender sees Rejoin + End on letter page; invite clears from recipient inbox after End
