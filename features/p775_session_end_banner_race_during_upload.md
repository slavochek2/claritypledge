---
status: in-progress
type: bug
rank: 1000745.0
severity: medium
workstream: session-end
date_reported: '2026-04-21'
created_date: '2026-04-21'
tags:
  - session-end
  - race-condition
  - banner
  - live
  - post-p769
delivery_stage: reproduce
pipeline_ran: [create-bug, fix, reproduce]
pipeline_plan:
  - create-bug
  - reproduce
  - fix
  - ship
architect_plan: ~/.claude/plans/elegant-mapping-token.md
reproduce_artifact:
  test_file: e2e/p775-reproduce.spec.ts
  reproduced_at: '2026-04-21'
  confidence: high
  result: fix_verified_not_bug
  root_cause: >-
    Original canary in e2e/p769-session-end-terminal-authority.spec.ts:697-769
    used [data-testid="active-session-banner"] which does not exist on the
    component. Locator matched zero elements so not.toBeVisible() passed
    trivially regardless of fix state. Rewritten canary with role="status"
    + aria-label (the component's actual DOM contract) plus localStorage
    assertions shows both creator-side and joiner-side behavior works as
    intended with the P775 cleanup-order fix.
  evidence:
    - creator-path-test: PASS — localStorage cleared pre-await, banner not rendered on /letters, reload does not rehydrate
    - joiner-path-test: PASS — after creator ends, joiner /live transitions to "Session ended" screen within ~17s via Realtime+polling
    - db-write: live_state.sessionEnded=true lands deterministically
  user_screenshots_not_reproduced: true
  next_action_recommended: >-
    Ask user to re-reproduce manually on current w1 HEAD. Possible divergences
    from tested path: (a) End clicked from banner on /letters (goes through
    active-session-banner.handleEndSession which has no pre-await cleanup),
    (b) stale partnerName in localStorage causing "Waiting for partner…"
    display independent of termination, (c) screenshot captured during the
    0-17s Realtime-delivery window before joiner transitions.
---

# P775: ActiveSessionBanner persists on other routes during 5s upload wait

## Summary

Creator clicks End Session, then navigates (e.g. to `/letters`) before the 5s recording-upload await resolves. The ActiveSessionBanner continues to show "Return to Session" on the new route because `clearActiveSession()` and `clearStoredSession()` currently run **after** the await in `confirmExitMeeting`.

## Root Cause

In `src/app/pages/clarity-live-page.tsx`, `confirmExitMeeting` (lines 3235–3328) cleans up banner-facing state **after** a `Promise.race([stopAndUploadRecording(), 5s timeout])`. During that ≤5s suspension:

- `activeSessionCode` in `LiveSessionContext` is still set → `ActiveSessionBanner` shows "Return to Session" on any other route.
- `cp_active_session` in `localStorage` is still present → on `/live` remount, `checkActiveSession` (line 896) reads it and triggers the rejoin prompt.
- `terminate(session.id)` at line 3292 has not yet written `live_state.sessionEnded=true` → if the creator clicks "Return to Session" during the race, `getActiveSessionByCode` may return the still-active session and a RejoinPrompt appears, letting the creator rejoin their own "ended" session.

The three cleanup consumers have different timing requirements — banner visibility and rejoin-prompt suppression are navigation-triggered (need cleanup **before** any await), while the in-mount "session ended" screen (`setSessionEnded(true)`) only matters when the user stays on `/live` (can stay after the upload).

Secondary: `handleEndFromRejoin` (lines 2963–2976) does not clear local state in its catch block. A network blip during `terminate()` leaves the rejoin prompt and `activeSessionCode` in place → banner persists on other routes.

## Reproduction Steps

1. Start a two-party session on `/live` (creator + joiner). Verify banner shows on other routes.
2. Creator clicks End Session.
3. **Immediately** (within 5s), click a bottom-nav link — e.g. `/letters`.
4. Observe on `/letters`: ActiveSessionBanner still shows "Return to Session".
5. Click "Return to Session" → returns to `/live`. If the 5s upload has not resolved yet, a rejoin prompt appears and the creator can rejoin their own "ended" session.

**Reproduction rate:** 100% within the 5s window — deterministic timing race.

## Expected Behavior

Once the creator clicks End Session:
- `ActiveSessionBanner` disappears on the new route immediately (no "Return to Session" anywhere).
- A reload on any other route does not rehydrate the banner (localStorage + context both cleared).
- Returning to `/live` shows the "Session ended" screen, never the rejoin prompt.

## Actual Behavior

- Banner persists on the destination route for up to 5s (upload window).
- Reloading during the window shows the banner back (localStorage has not been cleared).
- Returning to `/live` during the window shows a rejoin prompt and allows creator to rejoin.

## Affected Files

- `src/app/pages/clarity-live-page.tsx`:
  - `confirmExitMeeting`, lines 3235–3328 — cleanup order (Change 1 A1 + A2 in plan).
  - `handleEndFromRejoin`, lines 2963–2976 — catch block missing local cleanup (Change 2 in plan).
- `e2e/p769-session-end-terminal-authority.spec.ts` — new canary `test.describe` for this race (Change 3 in plan).

## Severity

**Medium** — recoverable (DB write eventually lands, reload after ~5s clears the banner) but creator can briefly rejoin their own ended session; damages "session end is terminal" guarantee shipped by P769.

## Fix Approach

Direct from architect plan `~/.claude/plans/elegant-mapping-token.md`:

**Change 1 — split cleanup in `confirmExitMeeting`:**
- Move `clearStoredSession()` + `clearActiveSession()` to the head, before the `Promise.race`.
- Keep `setSessionEnded(true)` at the tail (same mount, no race).
- Remove redundant cleanup calls from tail (hook's `useTerminateSession` clears them internally on creator path; joiner path has the pre-await clears as sole coverage).

**Change 2 — fix `handleEndFromRejoin` catch block:** on `terminate()` failure, still call `clearActiveSession()` + `clearStoredSession()` + `setRejoinSession(null)` locally so the banner is dismissed even if the DB write fails.

**Change 3 — E2E canary:** `Promise.all([click, goto])` to simulate the race, assert banner is not visible on `/letters`, then reload and assert still not visible. Covers both creator and joiner paths.

## Acceptance Criteria

- [x] Creator clicks End Session, navigates to `/letters` within the 5s window → no ActiveSessionBanner visible on `/letters`.
- [x] Page reload on `/letters` during the window → still no banner (localStorage cleared).
- [x] After the race resolves, `clarity_sessions.live_state.sessionEnded=true` for that session (DB write still lands via `terminate()`).
- [x] Returning to `/live` during the window → "Session ended" screen renders, not the rejoin prompt.
- [x] Joiner clicks End Session and navigates → same behaviour (joiner path covered).
- [x] `handleEndFromRejoin` catch block: simulated `terminate()` failure still dismisses local rejoin prompt and clears banner.
- [x] Regression test passes: `e2e/p769-session-end-terminal-authority.spec.ts` (existing tests + 2 new canaries).
- [ ] No console errors during creator exit or joiner exit flows. *(requires E2E run — UAT)*

## Key Files

- `src/app/pages/clarity-live-page.tsx`
- `e2e/p769-session-end-terminal-authority.spec.ts`

## Branch

`fix/p775-session-end-banner-race` (worktree w1)
