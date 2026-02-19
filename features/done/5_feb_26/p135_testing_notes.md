---
status: all-done
type: task
tags: []
rank: 125355.0
created_date: 2026-02-10
completed_at: '2026-02-18'
---

# P135 Testing Notes

## Implementation Complete ✅

### Changes Made

1. **Removed P124 auto-redirect** (EventDetail.tsx:143-162)
   - Deleted useEffect that auto-redirected initiator to /live when sub-room became active
   - Deleted navigatedSubRoomsRef

2. **Created EventWaitingRoomPage** (new file)
   - Fetches sub-room by ID on mount
   - Validates user is initiator
   - Subscribes to sub-room status changes
   - Auto-navigates to /live when status becomes active
   - Shows countdown timer
   - Has Cancel and Back buttons
   - Copy event link button

3. **Added waiting room route** (index.tsx)
   - Route: `/events/:slug/waiting/:subRoomId`

4. **Updated handleVerifyTogether** (EventDetail.tsx)
   - Now navigates to `/events/{slug}/waiting/{subRoomId}` instead of `/live`

5. **Added "Session ready" state** (EventSessions.tsx)
   - Shows "Session ready · [Enter →]" when sub-room is active and user is initiator
   - [Enter →] button navigates to /live manually
   - EnterButton component created

6. **Added getSubRoomById service method** (events-service-*.ts)
   - Interface, real service, and mock service implementations

## Manual Testing Guide

### Test 1: Basic Waiting Room Flow ✅ Priority
**Steps:**
1. Navigate to /events/list
2. Find an upcoming event with RSVPs
3. Tap a participant to create a sub-room
4. **Expected:** Land on `/events/{slug}/waiting/{subRoomId}`
5. **Verify:** See waiting message with target name
6. **Verify:** See countdown timer
7. **Verify:** See "Copy event link" button
8. **Verify:** See "Cancel Session" button
9. **Verify:** See "← Back to event" link

### Test 2: Go Back to Event ✅ Priority
**Steps:**
1. From waiting room, click "← Back to event"
2. **Expected:** Navigate back to `/events/{slug}`
3. **Verify:** Sessions section shows "You + {target} · waiting for {target}..."
4. **Verify:** [Cancel] button is visible
5. **Verify:** Can browse event page freely (no auto-redirect)

### Test 3: Cancel from Waiting Room ✅ Priority
**Steps:**
1. From waiting room, click "Cancel Session"
2. **Expected:** Sub-room is deleted, navigate back to `/events/{slug}`
3. **Verify:** Sub-room no longer appears in sessions list
4. **Verify:** Toast shows "Session cancelled"

### Test 4: Cancel from Event Page ✅ Priority
**Steps:**
1. Create sub-room, go back to event page
2. Click [Cancel] button in sessions section
3. **Expected:** Sub-room is deleted, removed from sessions list
4. **Verify:** No navigation (stay on event page)

### Test 5: Copy Event Link ✅ Priority
**Steps:**
1. From waiting room, click "Copy event link"
2. **Expected:** Link copied to clipboard
3. **Verify:** Toast shows "Link copied to clipboard"
4. Paste link - should be `{origin}/events/{slug}`

### Test 6: Session Ready State (requires two users) 🟡 Two-user test
**Steps:**
1. User A: Create sub-room, go back to event page
2. User B: Join the sub-room from event page
3. User A: **Expected:** Sessions section updates to "You + B · Session ready · [Enter →]"
4. User A: Click [Enter →]
5. User A: **Expected:** Navigate to `/live?code={sessionCode}&returnTo=/events/{slug}`

### Test 7: Auto-Navigate from Waiting Room (requires two users) 🟡 Two-user test
**Steps:**
1. User A: Create sub-room, stay on waiting room
2. User B: Join the sub-room
3. User A: **Expected:** Auto-navigate to `/live?code={sessionCode}&returnTo=/events/{slug}`

### Test 8: Sub-room Expiry ⏰ Time-based test (3 minutes)
**Steps:**
1. Create sub-room, stay on waiting room
2. Wait 3 minutes (or modify DB expires_at to be in the past)
3. **Expected:** Waiting room shows "Session expired. {target} didn't join in time."
4. **Expected:** [Back to event] button visible

### Test 9: Direct URL Validation ✅ Priority
**Steps:**
1. User A: Create sub-room (note the subRoomId)
2. User B: Try to access `/events/{slug}/waiting/{subRoomId}`
3. **Expected:** Error: "You are not authorized to view this waiting room"
4. **Expected:** [Back to event] button visible

### Test 10: Page Refresh on Waiting Room ✅ Priority
**Steps:**
1. Create sub-room, land on waiting room
2. Refresh the page
3. **Expected:** Re-fetch sub-room, resume waiting (if still pending)
4. **Expected:** If expired, show expiry message

## Known Limitations

1. **"Session ready" detection is client-side only**
   - We show "Session ready" if sub-room is active and user is initiator
   - We can't reliably detect if user is currently in /live from event page
   - This means "Session ready" appears even if you just left /live
   - Trade-off: Better to show the button than to miss it

2. **No network offline handling**
   - If network drops on waiting room, Postgres Changes subscription stops
   - Polling fallback would require additional implementation
   - MVP: Assume stable network during event

3. **Two-user tests require production or two browsers**
   - Can't test multi-user flows in single dev environment
   - Need to test on staging with two accounts

## Next Steps

1. Run Tests 1-5, 9-10 (single-user tests) ✅
2. Push to staging
3. Run Tests 6-7 (two-user tests) with two accounts
4. Optional: Run Test 8 (expiry test) by modifying DB

## Success Criteria

- ✅ No auto-redirect surprise from event page
- ✅ Clear waiting context in waiting room
- ✅ Manual control to enter /live ("Session ready" state)
- ✅ Can browse event page while waiting
- ✅ Can cancel session from waiting room or event page

---

**Status:** Implementation complete, ready for manual testing
**Date:** 2026-02-09
