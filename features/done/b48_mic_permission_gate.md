# B48: Block Meeting Join Until Microphone Permission Granted

**Status:** ✅ DONE
**Priority:** LOW (UX improvement, not a blocker)
**Est. Effort:** 1-2 hours
**Created:** 2026-01-07
**Completed:** 2026-01-07
**Depends On:** P40 (Microphone Permission Handling) - completed

---

## Problem

Previously, users were allowed into the live meeting view before microphone permission was checked. If they denied permission, they saw the `MicrophonePermissionDialog` but were already in the meeting.

**Expected behavior (per P40 spec):** "Block session join until microphone access granted"

**Old behavior:** User enters meeting → mic check happens → dialog shown if denied

---

## Solution Implemented

Used **Option B: Modal gate before transition** with a `pendingLiveTransition` state pattern:

```
Old:  waiting → live (mic check happens here, too late)
New:  waiting → [mic permission check] → live (or stay in waiting if denied)
```

### Implementation Details

1. **`pendingLiveTransition` state** - Flag that triggers mic permission gate
2. **`gateMicAndGoLive()` helper** - Async function that checks mic permission before allowing transition
3. **Effect to process pending transitions** - Watches flag and calls the gate function
4. **All 4 transition points updated** to use the permission gate:
   - Session restoration
   - Realtime subscription (joiner joins)
   - Polling fallback (joiner joins)
   - `handleJoin()` (joiner clicks Join)

---

## Acceptance Criteria

- [x] Mic permission requested BEFORE user sees the live meeting UI
- [x] If denied, user stays in lobby/waiting state (not kicked into meeting)
- [x] Clear messaging about why they can't proceed (existing dialog)
- [x] "Try Again" re-requests permission (existing dialog)
- [x] "Cancel" returns to start view (existing dialog)

---

## Files Modified

| File | Changes |
|------|---------|
| `src/app/pages/clarity-live-page.tsx` | Added `pendingLiveTransition` state, `gateMicAndGoLive()` helper, updated all 4 transition points, removed old P40 effect |

---

## Notes

- No new view state needed - the existing dialog UI handles denied state
- P40's `useMicrophonePermission` hook and `MicrophonePermissionDialog` were reused
- Build and all 91 unit tests pass
