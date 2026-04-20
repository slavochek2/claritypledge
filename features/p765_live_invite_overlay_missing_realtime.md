---
status: week
type: bug
rank: 1000762.0
severity: high
workstream: live
date_reported: '2026-04-20'
created_date: '2026-04-20'
tags: [realtime, live, invite, letter-reading]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P765: Live invite overlay does not appear via Realtime on partner's letter reading page

## Summary

When the author starts a /live session, the partner's letter reading page does not show the join overlay automatically — the overlay only appears after a manual force-refresh.

## Root Cause

Two plausible causes, to be confirmed by `/reproduce`:

**Hypothesis A — handler registration race (primary suspect):** `subscribeToLiveInvites` maintains a single Supabase channel per userId, multiplexed across components (`bottom-nav`, `letter-reading-page`, etc.). If the INSERT event fires AFTER `bottom-nav` subscribes but BEFORE `letter-reading-page` adds its handler to the shared channel (i.e., during page load), only `bottom-nav`'s handler fires. `letter-reading-page` misses the event entirely. Force-refresh → `getOpenLiveInviteForUser` initial fetch catches the now-present invite.

**Hypothesis B — silent failure in secondary fetch:** The INSERT handler in `useOpenLiveInvite` (line 115-116 of hook) does a secondary `clarity_sessions` SELECT to enrich the payload. If that fetch returns `null` (e.g., network hiccup, RLS mismatch, or `session_id` resolves to no row), the dispatch is silently skipped and the overlay never appears.

Observed: invite IS in DB immediately after session start (force-refresh confirms) — so the invite creation is not the issue.

## Reproduction Steps

1. Open app in two browsers — author (Browser A, verified), partner (Browser B, verified)
2. Partner opens a letter on their reading page (`/letters/[id]` or via delivery URL)
3. Wait for letter reading page to fully load (ensures hook is mounted)
4. Author navigates to `/live/[code]` (or starts session from letter results page)
5. Author sees "Waiting for [partner]..." — invite created in DB
6. **Observe on Browser B:** No overlay appears on partner's letter reading page
7. Partner force-refreshes page → overlay appears immediately

**Reproduction rate:** Intermittent — occurs when INSERT fires during a timing window; 100% if author starts session within ~1s of partner loading the page.

## Expected Behavior

Within ~1s of author starting the session, the partner's letter reading page shows the join overlay ("Vyacheslav Ladischenski is inviting you to Clarity" with a Join button) without any manual refresh.

## Actual Behavior

No overlay appears. Partner must force-refresh to see the invite.

## Affected Files

- `src/app/hooks/useOpenLiveInvite.ts` — INSERT callback (line 100-137): handler registration race vs. shared channel; secondary clarity_sessions fetch may return null silently
- `src/app/data/api.ts` — `subscribeToLiveInvites` (line 4028): multiplexed channel registry; handlers array populated after channel already SUBSCRIBED

## Severity

**High** — partner cannot join a /live session without refreshing; breaks the seamless real-time invite delivery that is central to the /live flow.

## Fix Approach

Confirm which hypothesis is the real cause first (`/reproduce`). Then:

**For Hypothesis A:** After registering a new handler on an already-SUBSCRIBED channel, immediately re-fetch (`getOpenLiveInviteForUser`) to catch events missed during registration. This closes the window between channel SUBSCRIBED and handler registration.

**For Hypothesis B:** Add error logging to the secondary clarity_sessions fetch; if `!session`, log the session_id and a warning so failures are visible in Sentry rather than silent.

Both fixes may be needed simultaneously.

## Acceptance Criteria

- [ ] Partner is on letter reading page; author starts session → overlay appears within ~2s, no refresh needed
- [ ] Overlay appears even if author started session within 1s of partner loading the page
- [ ] No console errors during the invite delivery flow
- [ ] Force-refresh still works as fallback (no regression)
- [ ] Regression test: `src/tests/p765-invite-overlay-realtime.test.tsx` passes
