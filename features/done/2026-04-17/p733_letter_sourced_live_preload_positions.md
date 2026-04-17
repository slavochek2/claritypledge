---
status: all-done
completed_at: 2026-04-17
type: bug
rank: 1000732.0
tags: [letters, live, positions, cta]
created_date: '2026-04-16'
pipeline_ran: [fix]
date_resolved: '2026-04-17'
root_cause: bootstrapLetterSourcedSession built bootstrapState without fetching or writing livePositionsCreator/livePositionsJoiner — both position maps were absent from the DB write so both parties started with empty position state
resolution: Added parallel fetch of both parties' point_positions after story fetch; mapped Map<pointId, PointPosition> to Record<pointId, PositionType> via toPositionRecord helper; removed the disabled "Add your story" CTA block from PointRow
---

# P733: Letter-Sourced /live — Pre-load Positions + Remove CTA

## Bug Description

**Reported:** 2026-04-16
**Severity:** High (broken UX for letter-sourced live sessions)

**Bug A:** Partner's position badge above each point not shown in letter-sourced /live. Sender sees receiver's positions only after receiver votes live — but receiver already voted in the letter. The pre-existing vote is invisible at session start.

**Bug B:** Own position buttons not highlighted. Creator's letter positions exist in `point_positions` but aren't loaded into the session snapshot — so both sides start with empty position state.

**Also:** Remove the disabled "Add your story → Available after the session" CTA from `PointRow`. Intentional in P456 but distracting and provides no value.

## Root Cause

`bootstrapLetterSourcedSession` (`clarity-live-page.tsx:2708`) fetches the story via `getStoryWithPoints(sourceStoryId)` → `mapPointSummaryFromDb`, which maps zero position fields. The `livePositionsCreator` / `livePositionsJoiner` keys are absent from the bootstrap write, so both sides start with empty position state.

## Reproduction Steps

1. Send a letter and submit positions as the sender
2. Receive and respond to the letter as the receiver (submit positions)
3. Start a letter-sourced /live session from the letter results
4. Expected: position buttons highlighted with letter positions for both parties
5. Actual: all position buttons empty/unhighlighted at session start

## Acceptance Criteria

- [x] In letter-sourced /live, sender's own position buttons are highlighted at session start (positions from letter pre-loaded)
- [x] In letter-sourced /live, receiver's position badge is visible above each point at session start (positions from letter pre-loaded)
- [x] No "Add your story" / "Available after the session" text anywhere in /live
- [x] `bootstrapLetterSourcedSession` writes `livePositionsCreator` and `livePositionsJoiner` into `bootstrapState`
- [x] Regression: non-letter-sourced /live sessions unaffected

## Regression Test

`src/tests/p733-letter-live-position-preload.test.tsx` — 4 tests pass

**Browser QA:** N/A — CTA removal verified by canary tests (T3, T3b). Bootstrap position preloading verified by unit tests (T1, T2). Full visual QA of highlighted positions at session start requires two-party /live session with completed letter data — run `/verify` before `/ship`.
