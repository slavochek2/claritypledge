---
status: in-progress
type: bug
rank: 2.0
tags: [live, dialog, upload, timeout]
---

# P512: Leave Session Dialog Gets Stuck — No Timeout, No Loading State

## Problem

The "End Session" confirmation dialog sometimes freezes — user clicks the button but nothing happens. The dialog stays open indefinitely with no visual feedback.

## Root Cause (5-Whys)

1. **Dialog stays open after clicking End Session** → `confirmExitMeeting()` awaits `stopAndUploadRecording()` before closing dialog
2. **stopAndUploadRecording() doesn't complete** → cascading async: `stopRecording()` → `uploadSessionRecording()` → `getSignedUploadUrl()` → `uploadToGCS()`, each can hang
3. **No timeout on network requests** → `withRetry()` has retry logic (3 attempts, exponential backoff) but `fetch()` has no timeout parameter. Stalled connection hangs forever
4. **No visual feedback** → button has no `disabled` / loading state. No spinner. User sees frozen dialog
5. **MediaRecorder.onstop edge case** → in rare cases (browser kills recording mid-session), `onstop` event never fires, promise hangs forever

**Key files:**
- `clarity-live-page.tsx:1996` — `confirmExitMeeting` (no timeout, awaits upload)
- `clarity-live-page.tsx:1943` — `stopAndUploadRecording` (cascading awaits)
- `clarity-live-page.tsx:2856` — dialog button (no loading/disabled state)
- `api.ts:2583` — `withRetry` (retry but no fetch timeout)

## Expected Behavior

- Click "End Session" → button shows loading state immediately
- If upload takes >5s, proceed with exit anyway (upload in background or abandon)
- User is never trapped in the dialog
- Recording upload failure does not block session exit

## Acceptance Criteria

- [ ] "End Session" button shows loading/disabled state while processing
- [ ] Timeout (5-10s) on the upload — if exceeded, exit proceeds without upload
- [ ] Double-click prevention (button disabled after first click)
- [ ] Private sessions (no recording) exit instantly
- [ ] Network failure during upload does not block exit
- [ ] Recording upload can continue in background after navigation (if possible)

## Impact

High — users are literally trapped in a dialog with no escape except closing the browser tab, which then triggers the session loss issues from P511.
