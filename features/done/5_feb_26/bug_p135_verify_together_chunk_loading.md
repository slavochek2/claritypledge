---
status: all-done
type: bug
priority: p0
---

# BUG: P135 "Verify together" Button Fails with Chunk Loading Error

**Status:** RESOLVED - Database schema mismatch fixed
**Severity:** High - Core feature completely broken
**First reported:** 2026-02-09
**Feature:** P135 Event Waiting Room

---

## Symptoms

When clicking the "Verify together →" button on an event page:

1. **User sees:** "Something went wrong" error page
2. **Console shows:** `Failed to fetch dynamically imported module`
3. **Expected:** Should navigate to `/events/{slug}/waiting/{subRoomId}`
4. **Actual:** Navigation fails, EventWaitingRoomPage component fails to load

**Screenshot evidence:** User provided screenshots showing chunk loading failure

---

## What We've Tried

### Attempt 1: Hard Refresh
- **Action:** Cmd+Shift+R in Chrome
- **Result:** ❌ Still fails
- **Why tried:** Sometimes browser cache causes stale chunk references

### Attempt 2: Clear Vite Cache
- **Action:** `rm -rf node_modules/.vite .vite`
- **Result:** ❌ Still fails
- **Why tried:** Vite's dev server can have corrupted HMR state

### Attempt 3: Restart Dev Server
- **Action:** Killed process, restarted `npm run dev`
- **Result:** ❌ Still fails
- **Why tried:** Dev server might have stale chunk manifest

### Attempt 4: Complete Clean Rebuild
- **Action:**
  ```bash
  lsof -ti:5001 | xargs kill -9
  rm -rf dist node_modules/.vite .vite
  npm run dev -- --port 5001
  ```
- **Result:** ❌ Still fails
- **Why tried:** Nuclear option - clear ALL build artifacts and start fresh

### Attempt 5: Production Build Test
- **Action:** `npm run build`
- **Result:** ✅ Build succeeds with no errors
- **Conclusion:** No TypeScript errors, no import issues, component compiles correctly

---

## Technical Analysis

### Root Cause Identified

**EventsPrototype is lazy-loaded** in App.tsx:

```typescript
// App.tsx line 42
const EventsPrototype = lazy(() =>
  import("@/app/prototypes/events").then(m => ({ default: m.EventsPrototype }))
);
```

When navigating to `/events/{slug}/waiting/{subRoomId}`:
1. React Router matches the route in EventsPrototype
2. EventsPrototype is not yet loaded (lazy)
3. React attempts to dynamically import the events chunk
4. **Import fails** - "Failed to fetch dynamically imported module"
5. Error boundary shows "Something went wrong"

### Why This is Unusual

- EventWaitingRoomPage is **not** lazy-loaded (direct import in events/index.tsx)
- Production build works fine (no import errors)
- Only fails in development (Vite HMR)
- Persists across cache clears and server restarts

### Component Structure (Confirmed Working)

**File:** `src/app/prototypes/events/components/EventWaitingRoomPage.tsx`
- ✅ Properly exported: `export function EventWaitingRoomPage()`
- ✅ Properly imported in routes: `import { EventWaitingRoomPage } from './components/EventWaitingRoomPage'`
- ✅ Route configured: `<Route path=":slug/waiting/:subRoomId" element={<EventWaitingRoomPage />} />`
- ✅ Compiles in production build

**Navigation code in EventDetail.tsx (lines 184-203):**
```typescript
const handleVerifyTogether = async (attendee: EventAttendee) => {
  console.log('[P135 DEBUG] handleVerifyTogether called', { /* ... */ });

  if (!event || !slug) return;
  if (!isLoggedIn || !currentUserId) {
    toast.error('Please log in to start a session');
    return;
  }

  console.log('[P135 DEBUG] Creating sub-room...');
  setIsCreatingSubRoom(true);
  const subRoom = await eventsService.createSubRoom(event.id, attendee.profileId);
  setIsCreatingSubRoom(false);
  console.log('[P135 DEBUG] Sub-room created:', subRoom);

  if (subRoom) {
    const waitingRoomUrl = `/events/${slug}/waiting/${subRoom.id}`;
    console.log('[P135 DEBUG] Navigating to waiting room:', waitingRoomUrl);
    navigate(waitingRoomUrl);
  }
}
```

---

## What We Suspect

### Hypothesis 1: Vite HMR Corruption (Most Likely)
- **Evidence:** Build works, dev fails
- **Mechanism:** Vite's module graph is corrupted for the events chunk
- **Why persists:** HMR state might be stored outside the directories we're clearing

### Hypothesis 2: Circular Dependency
- **Evidence:** Production build works (Rollup handles circulars differently than Vite)
- **Mechanism:** EventWaitingRoomPage imports something that creates a cycle
- **Check needed:** Analyze import graph

### Hypothesis 3: Missing Chunk Preloading
- **Evidence:** Lazy-loaded EventsPrototype + nested route
- **Mechanism:** React Router trying to load waiting room route before EventsPrototype chunk is ready
- **Why suspect:** Timing-sensitive - fails in dev (slower) but might work in prod (optimized)

### Hypothesis 4: File System Permissions
- **Evidence:** Less likely but possible
- **Mechanism:** Dev server can't read the EventWaitingRoomPage.tsx file
- **Check needed:** File permissions

---

## Recommended Next Steps

### Immediate Workarounds (Pick One)

#### Option A: Remove Lazy Loading (Fastest Fix)
**Change App.tsx:**
```typescript
// Before:
const EventsPrototype = lazy(() => import("@/app/prototypes/events").then(m => ({ default: m.EventsPrototype })));

// After:
import { EventsPrototype } from "@/app/prototypes/events";
```

**Pros:**
- Instant fix
- Events chunk loads upfront, no dynamic import issues

**Cons:**
- Larger initial bundle
- Defeats purpose of code-splitting for events

#### Option B: Make EventWaitingRoomPage Top-Level Route
**Add to App.tsx routes (before /events/*):**
```typescript
import { EventWaitingRoomPage } from "@/app/prototypes/events/components/EventWaitingRoomPage";

// In routes:
<Route path="/events/:slug/waiting/:subRoomId" element={<EventWaitingRoomPage />} />
<Route path="/events/*" element={<EventsPrototype />} />
```

**Pros:**
- EventWaitingRoomPage loads independently
- Events prototype stays lazy-loaded

**Cons:**
- Breaks route encapsulation
- EventWaitingRoomPage duplicated import path

### Deep Investigation (If Workarounds Don't Work)

1. **Check import graph for cycles:**
   ```bash
   npx madge --circular src/app/prototypes/events
   ```

2. **Enable Vite debug logging:**
   ```bash
   DEBUG=vite:* npm run dev
   ```
   Look for errors when navigating to waiting room

3. **Check file permissions:**
   ```bash
   ls -la src/app/prototypes/events/components/EventWaitingRoomPage.tsx
   ```

4. **Try different Vite config:**
   Add to `vite.config.ts`:
   ```typescript
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           'events': ['src/app/prototypes/events/index.tsx']
         }
       }
     }
   }
   ```

5. **Test in production mode:**
   ```bash
   npm run build
   npm run preview
   ```
   If works → confirms dev-only issue

---

## E2E Test Issues (Separate but Related)

**File:** `e2e/event-waiting-room.spec.ts`

All 7 tests fail due to UI structure mismatch:

**Test expects:**
```typescript
const bobParticipant = page.getByRole('button', { name: /Bob Target/i });
```

**Actual UI:**
- PersonRow component (renders Links, not buttons)
- Separate "Verify Together →" button (no participant name)

**Fix needed:** Update test selectors to match actual UI:
```typescript
// Find participant row, then adjacent button
const participantRow = page.getByText('Bob Target');
const verifyButton = participantRow.locator('..').getByRole('button', { name: /Verify Together/i });
```

**Note:** Tests also fail due to port mismatch (trying port 5173 instead of 5001) and dev server crashes during test runs. Fix tests AFTER main bug is resolved.

---

## Impact

**Blocking:**
- P135 Event Waiting Room completely non-functional
- Cannot test waiting room flow
- Cannot proceed with P135 completion

**Workaround for users:** None - feature is broken

---

## Debug Logs Present

Added extensive console logging in EventDetail.tsx (lines 185, 188, 194, 196, 200, 202) to trace button click flow. Logs confirm:
- Button click reaches handleVerifyTogether ✓
- Sub-room creation succeeds ✓
- Navigation URL is correct ✓
- **Navigation fails at chunk loading** ✗

---

## Files Modified for P135

- ✅ `src/app/prototypes/events/components/EventWaitingRoomPage.tsx` (NEW)
- ✅ `src/app/prototypes/events/index.tsx` (route added)
- ✅ `src/app/prototypes/events/components/EventDetail.tsx` (handleVerifyTogether updated)
- ✅ `src/app/prototypes/events/components/EventSessions.tsx` (EnterButton added)
- ✅ `src/app/data/events-service-real.ts` (getSubRoomById added)
- ✅ `e2e/event-waiting-room.spec.ts` (NEW - tests written but all failing)

All files compile successfully in production build.

---

## RESOLUTION (2026-02-09)

**Actual Root Cause:** Database schema mismatch - `event_sub_rooms` table missing `initiator_id` column.

**What We Thought:** Vite chunk loading error
**What It Actually Was:** Database error (column doesn't exist) caught by ChunkErrorBoundary, showing "Something went wrong"

**How Found:**
1. Applied systematic debugging process
2. Captured console errors showing: `"column event_sub_rooms.initiator_id does not exist"`
3. Found table existed with old schema (before P135 changes)

**Fix Applied:**
- Created migration: `supabase/migrations/20260209_fix_event_sub_rooms_schema.sql`
- Dropped and recreated `event_sub_rooms` table with correct schema
- Added missing columns: `initiator_id`, `target_id`, `session_id`, `session_code`, `expires_at`

**Lessons:**
- Chunk loading errors can mask database errors (both caught by error boundary)
- Always check console for the ACTUAL error, not just the error page
- Database schema must match code expectations

---

## Recommendation (OBSOLETE - See Resolution)

**Try Option A first** (remove lazy loading for EventsPrototype):
- Quickest path to unblock P135
- Can re-add lazy loading later if needed
- Low risk (just changes loading strategy)

If Option A doesn't work → investigate Hypothesis 2 (circular dependency) using madge.
