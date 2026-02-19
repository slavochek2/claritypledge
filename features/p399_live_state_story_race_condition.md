---
status: today
type: bug
rank: 1
severity: high
workstream: live
date_reported: '2026-02-19'
created_date: '2026-02-19'
tags:
  - live-session
  - story
  - real-time
  - race-condition
---

# P399: Story disappears mid-round due to live_state full-overwrite race condition

## Summary

A selected story vanishes from both partners' screens mid-round because any participant write that carries a stale `confirmedLiveStateRef` (without `selectedStoryData`) overwrites the entire `live_state` JSON blob, clearing the story globally.

## Root Cause

`updateLiveState` in `clarity-live-page.tsx` performs a **read-modify-write** of the full `live_state` JSON column — it merges from `confirmedLiveStateRef.current` and calls `supabase.update({ live_state: newState })` which replaces the entire column. There is no atomic partial merge at the DB level.

Three triggers that produce a stale ref lacking `selectedStoryData`:

**Trigger 2a — Partner writes rating before receiving story selection:**
After the owner selects a story, the subscription fires on the partner's side. If the partner submits a rating concurrently, their `confirmedLiveStateRef` may not yet include `selectedStoryData`. Their rating write merges from the stale ref → overwrites DB with `selectedStoryData: undefined` → story disappears for both users.

**Trigger 2b — `updateInFlightRef` silently drops the story update:**
While a local write is in-flight (`updateInFlightRef.current = true`), incoming subscription events are skipped at `clarity-live-page.tsx:532`. If the story selection subscription event arrives during this window, `confirmedLiveStateRef` never receives it. Any subsequent write from that participant clears the story.

**Trigger 2c — First "Continue" click after round completion:**
When a user clicks Continue, `celebrationAcknowledgedBy` is written via `updateLiveState` at line 1200-1204. If their `confirmedLiveStateRef` is stale (missing story), this write clears `selectedStoryData` from the DB before the partner has finished their session view.

## Reproduction Steps

1. Start a `/live` session with two participants (owner + guest)
2. Owner selects a story from the sidebar
3. Immediately have the guest submit a confidence rating (simulate fast action or unreliable WebSocket)
4. Observe: story card disappears from both screens mid-round

**Reproduction rate:** Intermittent (higher on mobile / unreliable WebSocket connections)

**Deterministic reproduction:** Set a breakpoint after `updateInFlightRef.current = true` (line ~700) in `clarity-live-page.tsx`, then trigger a subscription event from the partner — the story update will be dropped and the next write will clear it.

## Expected Behavior

Once a story is selected, it persists visibly for both partners throughout the entire round — until one of:
- User explicitly exits via "Speak Freely"
- Round completes at score 10 and user clicks Continue

No participant action during a round should clear the story.

## Actual Behavior

Story card disappears mid-round. The round continues (rating phase still active, clarification prompts visible) but the story card is gone. Both partners lose context for what they were discussing.

## Affected Files

- `src/app/pages/clarity-live-page.tsx:693-726` — `updateLiveState`: full read-modify-write from `confirmedLiveStateRef.current`
- `src/app/pages/clarity-live-page.tsx:532-535` — subscription handler: drops updates when `updateInFlightRef.current = true`
- `src/app/pages/clarity-live-page.tsx:1200-1204` — `celebrationAcknowledgedBy` write: can carry stale ref without story
- `src/app/data/api.ts:940` — `updateClaritySessionLiveState`: full column replace with no partial merge

## Severity

**High** — story disappearing mid-round directly breaks the core session flow; both partners lose context for the conversation they're having.

## Fix Approach

Three options (in order of surgical → architectural):

1. **Surgical (preserve `selectedStoryData` explicitly):** In every `updateLiveState` call that doesn't intentionally clear the story, read `selectedStoryData` from `confirmedLiveStateRef.current` and always include it in the merge. Fragile — requires touching every call site.

2. **Ref fix (add story fields to polling drift check):** Add `selectedStoryId`, `selectedStoryData`, `selectedContentTitle` to the polling drift comparison at `clarity-live-page.tsx:643-655`. Ensures story selection propagates even when WebSocket drops. Does not fix the race condition itself but prevents the stale-ref symptom.

3. **Architectural (DB-level partial merge):** Replace the full-column `update` in `api.ts:940` with a Postgres `jsonb_set` / `||` merge that only updates the fields being changed. Eliminates the race entirely — no participant can accidentally clear another's fields. Requires DB function or raw SQL in the Supabase call.

Recommended: **Start with option 2** (fixes Bug 5 simultaneously and is low-risk), then plan option 3 as a follow-on architectural improvement.

## Acceptance Criteria

- [ ] Select a story, then immediately submit a rating — story card remains visible on both screens
- [ ] First user clicks Continue after round completion — story remains on partner's screen until they also click Continue
- [ ] Story survives a full round on a mobile connection (WebSocket unreliable) from selection through completion
- [ ] No console errors during story selection or any subsequent rating/clarification actions
- [ ] Regression test: story card visible throughout an entire automated round (`e2e/p399-story-persistence.spec.ts`)
