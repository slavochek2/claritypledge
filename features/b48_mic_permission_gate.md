# B48: Block Meeting Join Until Microphone Permission Granted

**Status:** Ready for Implementation
**Priority:** LOW (UX improvement, not a blocker)
**Est. Effort:** 1-2 hours
**Created:** 2026-01-07
**Depends On:** P40 (Microphone Permission Handling) - completed

---

## Problem

Currently, users are allowed into the live meeting view before microphone permission is checked. If they deny permission, they see the `MicrophonePermissionDialog` but are already in the meeting.

**Expected behavior (per P40 spec):** "Block session join until microphone access granted"

**Current behavior:** User enters meeting → mic check happens → dialog shown if denied

---

## Affected Flows

### 1. Creator Flow
- Creator clicks "New meeting" → waits in lobby
- Joiner joins → creator transitions to `view='live'`
- **Bug:** Mic check happens AFTER transition

### 2. Joiner Flow
- Joiner enters code/link → clicks "Join Meeting"
- `handleJoin()` → `setView('live')`
- **Bug:** Mic check happens AFTER transition

---

## Proposed Solution

Add a permission gate state between lobby and live:

```
Current:  waiting → live (mic check happens here, too late)
Proposed: waiting → checking-mic → live (or back to waiting if denied)
```

### Implementation Options

**Option A: New view state**
Add `'checking-mic'` to `ViewState` type, show a loading screen during permission check.

**Option B: Modal gate before transition**
Show `MicrophonePermissionDialog` BEFORE calling `setView('live')`, only proceed if granted.

**Option C: Pre-check on page load**
Request mic permission when user lands on `/live` (before they even create/join). More aggressive but simpler flow.

---

## Acceptance Criteria

- [ ] Mic permission requested BEFORE user sees the live meeting UI
- [ ] If denied, user stays in lobby/waiting state (not kicked into meeting)
- [ ] Clear messaging about why they can't proceed
- [ ] "Try Again" re-requests permission
- [ ] "Cancel" returns to start view

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/pages/clarity-live-page.tsx` | Add permission gate logic before `setView('live')` |
| `src/app/types/index.ts` | Possibly add new view state |

---

## Notes

- P40 implementation provides the hook and dialog - this bug is about WHERE they're triggered
- Current behavior is functional (users can retry or cancel), just not ideal UX
- Low priority since mic is only needed for recording (meeting works without it in dev mode)
