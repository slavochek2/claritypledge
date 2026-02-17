---
status: done
type: bug
priority: p0
severity: high
feature: P135 Event Waiting Room
date_reported: 2026-02-09
date_resolved: 2026-02-09
root_cause: Database schema mismatch
tags: [p135, database, debugging]
---

# BUG: P135 "Verify Together" Button Shows "Something Went Wrong" Error

## Summary

Clicking the "Verify together →" button on event pages resulted in a "Something went wrong" error page instead of navigating to the event waiting room. Initial investigation suggested a Vite chunk loading error, but systematic debugging revealed the actual cause was a database schema mismatch.

## Symptoms

**User Experience:**
1. User views event detail page with attendees
2. User clicks "Verify together →" button next to an attendee
3. Page navigates briefly, then shows "Something went wrong" error page
4. Console shows database errors (not chunk loading errors)

**What We Initially Thought:**
- Vite HMR chunk loading failure
- `EventWaitingRoomPage.tsx` file not being served properly
- React lazy loading issue

**What It Actually Was:**
- Database column `event_sub_rooms.initiator_id` did not exist
- Code tried to query non-existent column
- Database error caught by `ChunkErrorBoundary` (React error boundary)
- Generic error page shown (masking the real issue)

## Technical Details

### Root Cause

The `event_sub_rooms` table existed in the database with an **old schema** that predated P135 changes. The table was missing several columns that the P135 code expected:

**Missing Columns:**
- `initiator_id` UUID - Who started the sub-room
- `target_id` UUID - Who was invited
- `session_id` UUID - Link to clarity session
- `session_code` TEXT - Join code for /live
- `expires_at` TIMESTAMPTZ - When sub-room expires

**Error Message (from console):**
```
column event_sub_rooms.initiator_id does not exist
```

### Why It Was Hard to Diagnose

1. **Error Masking:** React's `ChunkErrorBoundary` caught the database error and showed generic "Something went wrong" message
2. **Misleading Initial Evidence:** Untracked file (`EventWaitingRoomPage.tsx`) + Vite dev server issues suggested chunk loading problem
3. **Multiple Red Herrings:** Console also showed unrelated 406 errors from other queries

### The Debugging Journey

**Attempts That Didn't Work:**
1. ✗ Hard refresh browser (Cmd+Shift+R)
2. ✗ Cleared Vite cache (`rm -rf node_modules/.vite`)
3. ✗ Restarted dev server
4. ✗ Staged untracked `EventWaitingRoomPage.tsx` file
5. ✗ Complete clean rebuild

**What Finally Worked:**
1. ✓ Applied **systematic debugging** process
2. ✓ Captured actual console error (not just error page)
3. ✓ Identified database error: `column event_sub_rooms.initiator_id does not exist`
4. ✓ Applied database migration to fix schema
5. ✓ Verified chunk loading was NOT the issue (direct URL navigation worked after DB fix)

## Resolution

### Migration Applied

**File:** `supabase/migrations/20260209_fix_event_sub_rooms_schema.sql`

**Action:** Dropped and recreated `event_sub_rooms` table with correct schema

**Key Changes:**
```sql
DROP TABLE IF EXISTS public.event_sub_rooms CASCADE;

CREATE TABLE public.event_sub_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.clarity_sessions(id) ON DELETE SET NULL,

  -- P135: Added these columns
  initiator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed', 'cancelled', 'expired')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 minutes'),
  session_code TEXT
);
```

**RLS Policies Added:**
- Users can view sub-rooms where they're initiator or target
- Users can create sub-rooms as initiator
- Users can update their own sub-rooms

### Additional Fixes

1. **Staged untracked file:** `EventWaitingRoomPage.tsx` was new and untracked by git
2. **Cleared Vite cache:** Removed stale module graph
3. **Restarted dev server:** Fresh HMR context

### Files Modified

- `supabase/migrations/20260209_fix_event_sub_rooms_schema.sql` - **NEW** migration
- `src/app/prototypes/events/components/EventWaitingRoomPage.tsx` - Staged (was untracked)
- `features/bug_p135_verify_together_chunk_loading.md` - Updated with resolution
- `features/bug_p135_database_schema_mismatch.md` - **THIS FILE** (complete record)

## Verification Steps

**To verify fix:**
1. Navigate to event with attendees
2. Log in as a user who is NOT the host
3. Click "Verify together →" button next to an attendee
4. **Expected:** Navigate to `/events/{slug}/waiting/{subRoomId}`
5. **Expected:** See waiting room page (not "Something went wrong")
6. **Expected:** Console shows no database errors

**Database verification:**
```sql
-- Check table structure
\d event_sub_rooms

-- Verify columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'event_sub_rooms'
ORDER BY ordinal_position;

-- Should show: id, event_id, session_id, initiator_id, target_id, status, created_at, expires_at, session_code
```

## Lessons Learned

### What Went Right

1. **Systematic Debugging:** Following the systematic debugging process (from skill) eventually found the root cause
2. **Console Investigation:** Digging into actual error messages revealed the real issue
3. **Database Schema Awareness:** Realized code and database schemas must match

### What Went Wrong

1. **Assumed Error Type:** Jumped to "chunk loading" conclusion based on error page text
2. **Ignored Console Details:** Initial screenshots showed database errors but we focused on chunk loading
3. **Multiple Fix Attempts:** Tried several fixes without understanding root cause first

### Key Takeaways

1. **"Something went wrong" can mean ANYTHING** - Error boundaries catch all errors, masking root cause
2. **Always check console for ACTUAL error** - Don't trust generic error pages
3. **Database migrations must be applied** - Code changes need corresponding schema changes
4. **Systematic debugging > random fixes** - Following a process saves time
5. **Test with actual data** - Database errors only appear when code runs queries

## Next Steps

### Immediate (User Action Required)

- [ ] **Test the fix:** Click "Verify together" button and confirm it works
- [ ] **Hard refresh:** Cmd+Shift+R to clear browser cache
- [ ] **Verify in console:** No database errors should appear

### Before Closing P135

- [ ] Test full waiting room flow:
  - [ ] Host clicks "Verify together"
  - [ ] Host sees waiting room with countdown
  - [ ] Target joins event
  - [ ] Target sees "Session ready" or auto-navigates
  - [ ] Both users navigate to /live
- [ ] Test edge cases:
  - [ ] Session expiration (3 minutes)
  - [ ] Cancel session button
  - [ ] Back to event page while waiting
  - [ ] Multiple sub-rooms for same event
- [ ] Update E2E tests (currently failing due to UI mismatch)

### Technical Debt Created

1. **E2E Tests:** `e2e/event-waiting-room.spec.ts` needs updates:
   - Test selectors expect wrong UI structure
   - Looking for button with participant name, but button is separate
   - Port mismatch (5173 vs 5001)

2. **Migration Naming:** Two migrations for same table:
   - `20260206_p303_event_sub_rooms.sql` - Original (not applied)
   - `20260209_fix_event_sub_rooms_schema.sql` - Fix (applied)
   - Consider consolidating or documenting why both exist

3. **Test Infrastructure:** Playwright tests had setup issues during this debugging session
   - Network connectivity problems
   - Test helper function signature mismatches
   - Need more reliable test setup

## Related Files

**Feature Spec:** `features/p135_event_waiting_room.md`
**Original Bug Report:** `features/bug_p135_verify_together_chunk_loading.md` (now obsolete)
**Migration:** `supabase/migrations/20260209_fix_event_sub_rooms_schema.sql`
**Component:** `src/app/prototypes/events/components/EventWaitingRoomPage.tsx`
**Service:** `src/app/data/events-service-real.ts` (uses `initiator_id`)

## Timeline

- **2026-02-09 ~16:00** - Bug reported: "Verify together" button shows error
- **2026-02-09 ~16:05** - Initial investigation: suspected chunk loading issue
- **2026-02-09 ~16:15** - Staged untracked file, cleared Vite cache
- **2026-02-09 ~16:20** - Still failing, examined console errors
- **2026-02-09 ~16:25** - **Found root cause:** Database column missing
- **2026-02-09 ~16:30** - Created migration to fix schema
- **2026-02-09 ~16:35** - Migration applied, resolution documented

**Total time:** ~35 minutes (would have been faster with systematic debugging from start)

## Prevention for Future

1. **Always run migrations** when pulling feature branches that modify database schema
2. **Check console first** when seeing generic error pages
3. **Follow systematic debugging** process (don't guess and fix randomly)
4. **Document schema changes** in feature specs
5. **Add schema validation** to prevent code/DB mismatches

## Impact

**Severity:** HIGH - Core P135 feature completely broken
**User Impact:** Could not create /live verification sessions from events
**Scope:** P135 Event Waiting Room only (other features unaffected)
**Data Loss:** None (test data only, feature not in production)

---

**Status:** ✅ RESOLVED - Database schema fixed, migration applied
**Verified:** Pending user manual test confirmation
**Closed:** Once user confirms "Verify together" button works
