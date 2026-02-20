---
status: today
type: feature
rank: 410
workstream: foundation
created_date: 2026-02-20
tags: []
---

# P410: Live session nav guard — show Leave dialog on bottom/top nav clicks

## Problem

When a user is in an active live session (`view === 'live'`) and taps a nav link (bottom nav or top nav — e.g. My Events, My Profile), the app silently navigates away, abandoning the session with no warning. The Leave dialog already exists for the explicit `/leave` button but is not triggered by nav-link navigation.

## Solution

Introduce a `LiveNavGuardContext` (React context) that:
- `ClarityLivePage` activates when `view === 'live'`
- `BottomNav` and `SimpleNavigation` consume — intercepting clicks when guard is active, storing the intended destination, and triggering the existing exit-confirm dialog
- After the user confirms leaving, navigate to the originally intended destination (not always `/live`)

Guard is inactive on `view === 'start'` and `view === 'waiting'` — those nav links work normally.

## Technical Notes

- New file: `src/app/contexts/live-nav-guard-context.tsx`
- Provider added in `App.tsx`
- `clarity-live-page.tsx`: activate guard via `useEffect` on `view`, watch `pendingDest` to show dialog, modify `confirmExitMeeting` to navigate to `pendingDest ?? '/live'`
- `bottom-nav.tsx`: `onClick` interception when guard active + dest ≠ `/live`
- `simple-navigation.tsx`: same interception
- No `useBlocker` — was previously removed due to issues

## Acceptance Criteria

- [ ] Tapping My Events / My Profile during active live session shows "Leave session?" dialog
- [ ] Cancelling keeps user in the live session, URL unchanged
- [ ] Confirming leaves session and navigates to intended destination (e.g. `/events`)
- [ ] No dialog when on start or waiting view
- [ ] Clicking the Clarity Session nav item while in session: no dialog (already on `/live`)
- [ ] Top nav links (desktop) also trigger the guard

## Testing

E2E spec already exists: `e2e/live-nav-blocker.spec.ts` (currently `.skip` due to two-party infra).
- Unskip the single-user test (`no dialog when navigating away from start view`) — already passing
- The three two-party tests remain skipped until two-party infra is fixed; manual verification covers them
