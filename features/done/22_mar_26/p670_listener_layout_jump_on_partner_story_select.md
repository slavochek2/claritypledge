---
status: done
completed_at: '2026-04-07'
type: bug
rank: 1000070.0
severity: medium
date_reported: '2026-04-06'
created_date: 2026-04-06T00:00:00.000Z
completed_at: '2026-04-07'
absorbed_by: p667
tags:
  - live
  - ux
  - layout
---

# P670: /live — Listener Layout Jumps When Partner Selects Story

## Summary

On the /live idle screen, the listener's Speak button jumps position when the speaker selects a story. The listener's layout reacts to the speaker's `selectedStoryId` via shared Realtime state, even though the listener has no reason to change layout in response.

## Root Cause

`hasScrollableContent` in `live-mode-view.tsx` (~line 1223) includes `!!liveState.selectedStoryId || !!liveState.selectedStoryData`. These fields are set by the speaker but shared via Realtime to both participants. When the speaker selects a story, the listener's `hasScrollableContent` flips to `true`, which changes the two-zone layout proportions and shifts the Speak button.

This is the same "role-blind derived layout" anti-pattern identified in P667's root cause analysis, but P667 only fixed the session-history trigger.

## Invariants

- P600's two-zone layout must remain intact (no empty 60% gap for zero-story users)
- The listener should not visually react to the speaker's story selection during idle
- `hasScrollableContent` must remain `true` when the LOCAL user has scrollable content (own stories, own selected story)

## Reproduction Steps

1. Open /live as User A (creator) in browser 1. Start a session.
2. Open /live as User B (guest) in browser 2. Join the session.
3. Both users see Speak button at stable position.
4. As User A: select a story from the story picker.
5. Observe User B: Speak button shifts position as `hasScrollableContent` changes.

**Reproduction rate:** 100%

## Expected Behavior

Listener's Speak button stays at a stable position when the speaker selects a story.

## Actual Behavior

Listener's Speak button jumps when speaker selects a story, because `hasScrollableContent` reacts to shared `selectedStoryId`.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx` — line ~1223: `hasScrollableContent` computation

## Fix Approach

Make `hasScrollableContent` role-aware: only include `selectedStoryId`/`selectedStoryData` when the current user is the one who selected the story. This requires knowing the current user's role (speaker vs listener) at the point of computation.

## Acceptance Criteria

- [x] Listener's Speak button does not jump when speaker selects a story
- [x] Speaker's layout still correctly responds to their own story selection
- [x] Zero-story users still see a reasonable layout
- [x] Canary E2E test proves the fix (two-party test: speaker selects story, listener button Y stays stable)
