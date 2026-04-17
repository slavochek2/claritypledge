---
status: qa
type: bug
rank: 1000743.0
severity: medium
workstream: live
date_reported: '2026-04-17'
created_date: '2026-04-17'
date_resolved: '2026-04-17'
root_cause: No Realtime subscription in useActiveSession — only a 30s poll and visibility-change handler dismissed the banner after creator ended.
tags: [active-session, banner, realtime, live-session]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P743: Joiner's "In session with…" banner takes up to 30s to dismiss after creator ends session

## Summary

When the creator ends a Clarity Session, the joiner's global "In session with…" banner (rendered on non-`/live` pages) does not dismiss until the next 30s poll fires — worst-case 30s latency, or instantly only if the joiner switches tabs and back.

## Root Cause

`use-active-session.ts` has no Realtime subscription to `clarity_sessions`. The only dismissal mechanisms are:
1. A 30s poll (`POLL_INTERVAL_MS = 30 * 1000`) that calls `getActiveSessionByCode`, which returns `null` when `live_state.sessionEnded = true`.
2. A visibility-change handler (lines 85–90) that re-validates immediately when the tab regains focus.

The creator's `endClaritySession` writes `clarity_sessions`, not `clarity_live_invites`, so the existing per-user Realtime channel in `useOpenLiveInvite` does **not** fire for the joiner. There is no push signal — only poll or tab-focus.

## Reproduction Steps

1. Creator: sign in, start a Clarity Session on `/live`.
2. Joiner: sign in as partner, join the session. Navigate away from `/live` to `/me` or Letters page — any page that mounts `ClarityLandingLayout`. Confirm blue "In session with…" banner is visible.
3. Joiner: keep the tab **focused** (do not switch tabs). Open DevTools console and note wall-clock time.
4. Creator: click "End Session".
5. Observe joiner's banner — it should dismiss promptly but does not. Record wall-clock time when it finally dismisses.

**Reproduction rate:** 100% (with tab kept focused). Banner dismisses faster only if joiner switches tabs and returns (visibility handler path).

## Expected Behavior

Joiner's banner dismisses within ~1s of the creator ending the session — the same responsiveness as other session state changes in the app.

## Actual Behavior

Banner dismisses after up to 30s (next poll cycle). If the joiner happened to switch tabs and return, it may dismiss faster via the visibility handler — but this is not reliable and depends on user behavior, not the fix.

## Affected Files

- `src/hooks/use-active-session.ts` — `POLL_INTERVAL_MS = 30 * 1000` (line ~10); visibility-change handler (lines ~85–90); no Realtime subscription present
- `src/app/components/session/active-session-banner.tsx` — reads `activeSessionCode` / `activeSessionPartnerName` from `useLiveSession()`; renders nothing when `activeSessionCode === null`
- `src/app/layouts/clarity-landing-layout.tsx:61` — mounts `useActiveSession` inside `ClarityLandingLayoutInner`
- `src/app/data/api.ts:1208` — `subscribeToClaritySession` already exists (unused here); can be wired in
- `src/app/data/api.ts:1094-1127` — `getActiveSessionByCode` (returns `null` when `live_state.sessionEnded`)
- `src/app/data/api.ts:1173-1200` — `endClaritySession` (writes `live_state.sessionEnded = true`)

## Severity

**Medium** — session UX is degraded (stale banner confuses the joiner for up to 30s) but the banner does eventually clear and no data is lost. Workaround: switch tabs and back.

## Fix Approach

**Option A (recommended):** In `useActiveSession`, when `activeSessionCode` is non-null, open a `subscribeToClaritySession` Realtime channel on the session. On update, if `live_state.sessionEnded` or `live_state.joinerEnded` is true, call `clearActiveSession()`. Drops dismiss latency to <1s.

Constraint: `useActiveSession` stores `code` but not `sessionId`. Needs a one-shot lookup to get `sessionId` before subscribing, or extend `StoredActiveSession` to persist `sessionId` alongside `code`.

**Option B (fallback):** Reduce `POLL_INTERVAL_MS` (e.g. to 5s). Simpler but adds DB load proportional to active-session count; doesn't eliminate the latency.

Option A is the right fix — Realtime is the correct tool, and the polling fallback already exists for offline/missed-event recovery.

## Acceptance Criteria

- [ ] Joiner's "In session with…" banner dismisses within 2s of creator clicking "End Session" — with joiner tab focused throughout (no tab switching)
- [ ] Banner behavior unchanged when the joiner ends the session (not the creator)
- [ ] No regression: banner still dismisses on tab-focus restore (visibility handler stays intact)
- [ ] No regression: banner still dismisses after poll cycle if Realtime event is missed (poll fallback stays intact)
- [ ] Regression test passes: `src/tests/p743-joiner-banner-stale.test.tsx` — renders banner with stored session, simulates `clarity_sessions` Realtime update with `sessionEnded: true`, asserts banner unmounts within 100ms
- [ ] No new console errors on pages that mount `ClarityLandingLayout`
