---
type: bug
rank: 1000728.0
severity: high
workstream: letters
date_reported: '2026-04-16'
created_date: '2026-04-16'
tags: [letters, inbox, realtime, live-invite, navigation]
pipeline_ran: [create-bug, fix]
status: all-done
completed_at: 2026-04-17
---

# P730: Inbox "Join" live invite navigates to `/live/` (empty code) when invite arrives via Realtime

## Summary

When a live invite arrives via Supabase Realtime INSERT, the dispatched invite has `code: ''` because `clarity_live_invites` has no `code` column. Clicking "Join" navigates to `/live/` (empty), which matches the base route → `urlCode = undefined` → generic "Clarity Session" form instead of auto-joining.

## Root Cause

`clarity_live_invites` table has no `code`, `author_name`, or `story_title` columns — all three live in joined tables (`clarity_sessions`, `profiles`, `stories`). The initial REST fetch (`getOpenLiveInviteForUser`) uses a JOIN so it gets all fields correctly. But Supabase Realtime INSERT payload only contains the columns of the table itself. `mapRaw` fell back to `''` for `code`, `authorName`, and `storyTitle`.

## Reproduction Steps

1. Open Letters page as receiver (authenticated)
2. Facilitator starts a `/live` session from letter results on a different device/tab
3. Observe: inbox invite row appears (Realtime INSERT fires)
4. Click "Join"
5. Observe: browser navigates to `/live/` (no code) → shows generic "Clarity Session" start form

**Reproduction rate:** 100% (only when invite arrives via Realtime; page-load fetch works correctly)

## Expected Behavior

"Join" navigates to `/live/<code>` and auto-joins the session (spinner → live session).

## Actual Behavior

"Join" navigates to `/live/` (empty code) → React Router matches base `/live` route → `urlCode = undefined` → `isJoinViaLink = false` → generic start form is shown.

## Affected Files

- `src/app/hooks/useOpenLiveInvite.ts` — INSERT handler in `useEffect` (~line 89–95): uses `mapRaw(raw)` which returns `code: ''` for Realtime payloads

## Severity

**High** — the "Join live" flow from the inbox is completely broken when invite arrives in real-time (the primary case during active use).

## Fix Approach

In the INSERT handler, extract `session_id` from the Realtime payload, then fetch `clarity_sessions` directly for `code`, `creator_name`, and `stories`. Dispatch the correct invite from the fetch result. `mapRaw` stays intact for the UPDATE handler (which detects `closed_at` and `session_id` — both real columns in the table).

The `cancelled` flag must be checked inside the `.then()` callback to avoid dispatching after unmount.

## Acceptance Criteria

- [ ] When invite arrives via Realtime INSERT, inbox row shows correct join link (with code)
- [ ] Clicking "Join" navigates to `/live/<code>` and auto-joins (not generic start form)
- [x] Invite closure (UPDATE with `closed_at`) still dismisses the row correctly — unit test passes
- [x] No regression on the initial page-load fetch of open invites — full suite 1863 tests pass
- [x] Unit test: INSERT handler with missing `code` triggers `clarity_sessions` fetch and dispatches correct code — `src/tests/p730-inbox-live-invite-realtime.test.tsx`
