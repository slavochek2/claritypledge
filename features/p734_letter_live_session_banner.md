---
id: p734
title: Letter-sourced /live session lifecycle — banner + End Session
type: bug
status: qa
severity: high
date_reported: 2026-04-17
delivery_stage: fix
pipeline_ran: [fix]
tags: []
rank: 1000736.0
created_date: 2026-04-17
---

# P734: Letter-Sourced /live Session Lifecycle — Banner + End Session

## Bug Description

**Reported:** 2026-04-17
**Severity:** High (sender is silently stuck after starting a letter-sourced clarity session)

When a letter author clicks "Start a clarity session" from the letter results page, the app creates a session + invite, navigates sender to `/live/<code>`. If the sender navigates back to the letter page:

1. **Bug 1 (Primary):** The "Waiting for [receiver]" banner never appears — sender has no visibility or escape
2. **Bug 2:** Clicking "End Session" in the banner doesn't close the invite — button stays disabled, blocking a new session
3. **Bug 3 (Minor):** Clicking "Cancel" on `/live` while waiting leaves a stale banner on the letter page

## Root Causes

### Bug 1 — Banner never shows
The creator URL path (when `StartClaritySessionButton` navigates to `/live/${session.code}`) calls `saveSessionToStorage` but never `setActiveSession()`. `ActiveSessionBanner` reads from `useLiveSession()` context populated by `setActiveSession()` — so `hasActiveSession` stays `false`.

### Bug 2 — End Session doesn't close invite
`handleEndSession` in `active-session-banner.tsx` calls `endClaritySession` (sets JSON flag) but NOT `cancelLiveInvite`. The invite row keeps `closed_at IS NULL` → `checkOpenInviteForReceiver` returns `true` → button stays disabled.

### Bug 3 — Cancel doesn't clear context
`handleCancelWaiting` calls `clearStoredSession()` but not `clearActiveSession()` — banner lingers after cancel.

## Reproduction Steps

1. Log in as Sender on the letter results page
2. Click "Start a clarity session" → navigates to `/live/<code>`
3. Navigate back to the letter results page
4. **Expected:** Blue banner "Waiting for [receiver]…" with [Return to Session] and [End Session]
5. **Actual:** No banner, "Start a clarity session" button disabled, no escape

## Acceptance Criteria

- [ ] Navigating back to letter page after starting a session shows the "Waiting" banner
- [ ] Clicking "End Session" in banner closes the invite and re-enables the "Start a clarity session" button
- [ ] Clicking "Cancel" on `/live` while waiting → navigating to letter page shows no stale banner

## Files to Change

| File | Change |
|---|---|
| `src/app/pages/clarity-live-page.tsx` | Add `setActiveSession(code, null, 'creator')` in creator URL path |
| `src/app/pages/clarity-live-page.tsx` | Add `clearActiveSession()` in `handleCancelWaiting` |
| `src/app/components/session/active-session-banner.tsx` | Add `cancelLiveInvite(session.id)` in `handleEndSession`, guarded by `targetListenerId` |

## Resolution

**Fixed:** 2026-04-17

**Root causes:**
1. Creator URL path called `saveSessionToStorage` but not `setActiveSession` — banner context never populated
2. `handleEndSession` called `endClaritySession` but not `cancelLiveInvite` — invite stayed open blocking the Start button
3. `handleCancelWaiting` called `clearStoredSession` but not `clearActiveSession` — stale banner lingered

**Resolution:**
- Added `setActiveSession(code, null, 'creator')` after `saveSessionToStorage` in creator URL detection block
- Added `cancelLiveInvite(session.id)` in `handleEndSession` `finally` block, guarded by `targetListenerId` (resilient to `endClaritySession` failure)
- Added `clearActiveSession()` in `handleCancelWaiting` after `clearStoredSession()`

**Regression tests:** `src/tests/p734-letter-live-banner.test.tsx` (4 tests)
