---
status: done
type: bug
rank: 750002.75
tags:
  - live
  - p562
  - realtime
created_date: 2026-03-30T00:00:00.000Z
completed_at: '2026-03-30'
locked_at: '2026-03-30T10:38:01.482Z'
---

# P609: Free Mode — Live Blue Dots Not Updating for Partner

**Severity:** Medium — functional issue during active session, but sliders themselves work
**Introduced by:** P562 (free mode core)
**Found during:** P600 UAT

---

## Problem Statement

In free mode unlocked phase, when one user moves their slider, the partner's Journey "live blue dots" row doesn't update in real-time. The partner sees stale values (from when sliders first unlocked) instead of the current slider positions.

**Reproduction:**
1. Two users in /live session, Open mode
2. Complete guided first round → sliders unlock
3. User A moves slider to 10/10
4. User B's Journey live blue dots still show the old value

**Expected:** Live blue dots update in real-time as partner moves their slider.

---

## Root Cause Analysis

The code logic in `free-mode-view.tsx` is correct:
- `partnerSliderValue` reads from `liveState.freeSliderJoiner`/`freeSliderCreator`
- `effectivePartnerValue` derives from it
- `liveListenerConfidence`/`liveSpeakerBelief` derive from that
- All are recalculated on every render

The Realtime merge logic in `clarity-live-page.tsx` (lines 1049-1065) also looks correct:
- During in-flight writes, position/slider keys are explicitly merged from Realtime payloads
- `setLiveState(prev => ({ ...prev, ...partnerUpdates }))` uses functional update

**Suspected root cause:** Race condition between:
1. User A's optimistic `setLiveState(newState)` at write time
2. Realtime delivering Partner B's update during in-flight period
3. The `finally { updateInFlightRef.current = false }` resetting the guard
4. A full `setLiveState` from the next non-in-flight Realtime event overwriting the partial merge

The slider writes are debounced but frequent. Each write holds `updateInFlightRef.current = true` for the full DB round-trip (~100-500ms). During this window, only position/slider keys are merged. If the timing aligns so that the full merge (line 1045-1048) never fires with the partner's latest value, the display stays stale.

**Confirmed root cause:** `confirmedLiveStateRef` was never updated with partner values during in-flight writes. Each subsequent write's optimistic update (`{ ...confirmedLiveStateRef.current, ...updates }`) overwrote the partner's slider with stale data from the ref, even though React state had the correct value from the partial merge.

---

## Acceptance Criteria

- [ ] When User A moves slider, User B's Journey live blue dots update within 1 second
- [ ] Both users see each other's current slider position in real-time
- [ ] No regression to guided mode position updates (which use the same Realtime merge path)

---

## Resolution

**Fixed:** 2026-03-30
**Root cause:** `confirmedLiveStateRef` not updated during in-flight Realtime merges, causing optimistic writes to overwrite partner slider values with stale data.
**Resolution:** Two changes in `clarity-live-page.tsx`:
1. In-flight Realtime merge (line ~1067): also update `confirmedLiveStateRef` with partner keys
2. Write success (line ~1298): merge only written keys into ref instead of full overwrite, preserving partner updates received during the in-flight period

**Files changed:**
- `src/app/pages/clarity-live-page.tsx` (2 lines changed)

**Regression test:** `src/tests/p609-free-slider-sync.test.ts` (5 tests)
