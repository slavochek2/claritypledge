---
status: done
type: story
workstream: C1
blocked_by: []
fixes: p303
prepped_date: '2026-02-09'
implemented_date: '2026-02-09'
delivery_stage: uat
reviews:
  ux: passed-with-notes
  architect: passed-with-notes
  alignment: passed
rank: 10
tags: []
created_date: 2026-02-12
---
# P149: Event Waiting Room — No Redirect from Event Page

## Problem

P124 auto-redirects both participants to `/live` when a sub-room becomes active. This creates UX confusion:

**The trap:**
```
You: Browse event page → Carol joins → SURPRISE REDIRECT to /live
```

**Why it's broken:**
1. **Event page serves two conflicting modes:**
   - Browsing mode: "I'm looking at who's here, reading event details"
   - Waiting mode: "I tapped someone and I'm waiting for them to join"

2. **Unpredictable redirects:** You visit an event page (browsing) and get yanked to `/live` (because someone you invited earlier just joined)

3. **Can't browse while waiting:** Once you tap someone, you can't freely explore the event page — you'll be redirected the moment they join

4. **No clear commitment:** The redirect happens from a browsing context, not a "I'm ready to start" context

**Current flow (broken):**
```
EVENT PAGE (browsing)
  ↓ tap Carol
EVENT PAGE (still here, but now in "waiting" state)
  ↓ Carol joins
/LIVE PAGE (surprise redirect!)
```

---

## Solution

**Add a dedicated waiting room page.** Separate browsing from committed waiting.

```
EVENT PAGE (pure browsing, no redirects)
  ↓ tap Carol → confirm
WAITING ROOM (committed state)
  ↓ Carol joins
/LIVE PAGE (expected redirect from waiting context)
```

**Key insight:** Redirects are fine when you're in a waiting state (expected). Redirects are jarring when you're browsing (unexpected).

---

## User Flow

### Flow 1: You initiate

**On event page:**
1. Tap Carol in participant list
2. Confirm: "Start a session with Carol?" → [Start session] [Cancel]
3. Tap [Start session]

**Navigate to waiting room:** `/events/{slug}/waiting/{subRoomId}`

```
┌─────────────────────────────┐
│ ← Back to event             │
│                             │
│    Waiting for Carol...     │
│                             │
│    Tell Carol to check      │
│    the event page           │
│                             │
│    Sub-room expires in 2:47 │
│                             │
│         [Cancel]            │
└─────────────────────────────┘
```

**What you can do:**
- Wait (page shows countdown, real-time updates)
- Cancel (deletes sub-room, returns to event page)
- Go back to event (via ← back button, sub-room stays pending)

**When Carol joins:**
- Sub-room status updates to `active`
- **Both navigate to `/live` from waiting room** (you) or from event page (Carol)
- Expected redirect because you're in committed waiting state

---

### Flow 2: Carol receives invitation

**Carol's view (on event page):**

```
SESSIONS
┌─────────────────────────────┐
│ Slava + You · [Join →]      │
└─────────────────────────────┘
```

**Carol taps [Join →]:**
- Sub-room status updates to `active`
- **Carol navigates to `/live`** (direct, no waiting room needed)
- **You navigate to `/live`** (from waiting room)

---

### Flow 3: You go back to event while waiting

**From waiting room:**
1. Tap ← Back to event
2. Navigate back to `/events/{slug}`
3. Sub-room stays `pending` (still active, Carol can still join)

**On event page:**
- Sessions section shows: "You + Carol · waiting for Carol..."
- You can browse freely, tap other people, read event details
- **No auto-redirect** (you're not in waiting room)

**If Carol joins while you're back on event page:**
- Sessions section updates to: "You + Carol · Session ready · [Enter →]"
- You tap [Enter →] to navigate to `/live`
- **Manual navigation** (because you left waiting room)

**Why this works:**
- You chose to leave waiting room → you don't want surprise redirects
- Carol joining creates an opportunity (session ready), not a redirect
- You control when you enter `/live`

---

### Flow 4: Sub-room expires

**After 3 minutes (if Carol doesn't join):**
- Waiting room shows: "Session expired. Carol didn't join."
- [Back to event] button
- Sub-room status updates to `expired` in DB
- Carol's "Join" button disappears

**From event page (if you went back):**
- Sessions section updates: "Session expired"
- No action needed

---

## What Changes vs P124

### Remove
- ❌ Auto-redirect from event page when sub-room becomes active
- ❌ "Track which sub-rooms we've already navigated for" ref hack
- ❌ useEffect that redirects initiator on sub-room status change

### Add
- ✅ Waiting room page: `/events/{slug}/waiting/{subRoomId}`
- ✅ Navigate to waiting room when initiator creates sub-room
- ✅ Countdown timer in waiting room (shows expiry time)
- ✅ "Session ready" state on event page (if you left waiting room and Carol joined)
- ✅ Manual [Enter →] button for "session ready" state

### Keep as-is
- Event page layout, participant list, sessions section
- Sub-room creation, expiry, DB schema
- /live session mechanics
- Carol's direct navigation to `/live` when she taps [Join]

---

## Waiting Room Design

**URL:** `/events/{slug}/waiting/{subRoomId}`

**Page structure:**
```
┌─────────────────────────────────────┐
│ ← Back to event                     │  ← Returns to event page, sub-room stays pending
│                                     │
│         [Avatar placeholder]        │  ← Target person's avatar/initials
│                                     │
│         Waiting for Carol...        │  ← Target person's name
│                                     │
│    Tell Carol to check the event    │  ← Hint (in-person context)
│    page, or send her the link:      │
│                                     │
│    [Copy link] claritypledge.com... │  ← Share fallback
│                                     │
│    Sub-room expires in 2:47         │  ← Live countdown
│                                     │
│              [Cancel]               │  ← Deletes sub-room, back to event
└─────────────────────────────────────┘
```

**Real-time updates:**
- Subscribe to sub-room status via Postgres Changes
- When status → `active`: navigate to `/live?code={sessionCode}&returnTo=/events/{slug}`
- When status → `expired` or `cancelled`: show expiry message + [Back to event]

**Edge cases:**
- Sub-room deleted (by you canceling, or expiry): show message, [Back to event]
- Network disconnects: polling fallback (same as rest of app)
- Page refresh: re-fetch sub-room, show current state
- Direct URL access: validate sub-room exists + user is initiator, else redirect to event

---

## Event Page Changes

### Sessions section (new states)

**Before (P124):**
```
You + Carol · waiting for Carol...
You + Carol · in session
✓ You + Carol · verified
```

**After (P135):**
```
You + Carol · waiting for Carol... [Cancel]  ← You're in waiting room (or returned to event)
You + Carol · Session ready · [Enter →]      ← NEW: Manual entry (if you left waiting room)
🔒 You + Carol · in session                  ← You're both in /live
✓ You + Carol · verified                     ← Completed session
```

**"Session ready" state:**
- Appears if: sub-room is `active` AND you're not in waiting room AND you haven't entered `/live` yet
- Tap [Enter →]: navigate to `/live?code={sessionCode}&returnTo=/events/{slug}`
- Stays visible until you enter the session or the sub-room expires

**"Waiting for Carol..." state:**
- [Cancel] button: deletes sub-room, removes from sessions list
- Available both in waiting room and on event page (if you returned)

---

## Why Waiting Room Works

| Aspect | Event page auto-redirect (P124) | Waiting room (P135) |
|--------|--------------------------------|---------------------|
| **Context clarity** | Ambiguous (browsing or waiting?) | Clear (waiting room = committed) |
| **Redirect expectation** | Surprise (you're browsing) | Expected (you're waiting) |
| **Freedom to browse** | Trapped (can't browse without redirect risk) | Free (can leave waiting room) |
| **Control** | System decides when you navigate | You control when you enter /live |
| **Cancel flow** | Cancel button on event page (weird) | Cancel button in waiting room (natural) |
| **Symmetric UX** | Initiator: event page, Target: event page | Initiator: waiting room, Target: event page |

**Analogy:**
- Video call: You click "Join call" → enter call room → others join you there (not: you browse settings → surprise redirect when others join)
- Gaming: You create lobby → wait in lobby → game starts when players join (not: you browse server list → surprise redirect when lobby fills)

---

## Technical Approach

### New page component
- `EventWaitingRoomPage.tsx` at `/src/app/pages/`
- Route: `/events/:slug/waiting/:subRoomId`
- Fetches sub-room from DB on mount (validate user is initiator)
- Subscribes to sub-room status changes (Postgres Changes)
- Navigates to `/live` when status → `active`

### Event page changes
- Remove: useEffect that auto-redirects initiator on sub-room status change
- Add: "Session ready" state in sessions list (when sub-room active + user not in waiting room)
- Add: [Enter →] button for manual navigation
- Add: [Cancel] button for pending sessions (deletes sub-room)

### Navigation changes
- After sub-room creation: navigate to `/events/{slug}/waiting/{subRoomId}` (not: stay on event page)
- Carol taps [Join]: navigate directly to `/live` (unchanged)
- Initiator in waiting room: auto-navigate to `/live` when Carol joins (via useEffect in waiting room page)

### Database (no changes)
- `event_sub_rooms` table unchanged
- Status flow unchanged: `pending` → `active` → `completed` | `cancelled` | `expired`

---

## Edge Cases

| Case | Handling |
|------|----------|
| Try to create second sub-room while first is pending | Show error: "You already have a session with Carol. [Cancel it] or [View waiting room] to start a new one." |
| Direct URL to waiting room | Validate sub-room exists + user is initiator, else redirect to event |
| Sub-room deleted while on waiting room | Show "Session cancelled" + [Back to event] |
| Page refresh on waiting room | Re-fetch sub-room, resume waiting (if still pending) |
| Carol joins while you're on waiting room | Auto-navigate to /live (expected) |
| Carol joins while you're back on event page | Show "Session ready" + [Enter →] (manual) |
| You open waiting room in 2 tabs | Both tabs navigate when Carol joins (harmless) |
| Network drops on waiting room | Polling fallback (same as event page) |
| Sub-room expires while on waiting room | Show expiry message + [Back to event] |
| You cancel from waiting room | Delete sub-room, navigate back to event |

---

## Success Metrics

| Metric | Current (P124) | Target (P135) | What it measures |
|--------|----------------|---------------|------------------|
| "Where am I?" confusion | High (redirect surprise) | Low (clear context) | UX clarity |
| Session join rate | Unknown | >80% | Does waiting room help? |
| Cancel rate from waiting room | N/A (no waiting room) | <20% | Is 3-min expiry right? |
| Return-to-event rate | N/A | Track | Do people browse while waiting? |

---

## Implementation Tasks

### Layer 1: Remove P124 auto-redirect
- [ ] Remove useEffect that auto-redirects initiator on sub-room status change (EventDetail.tsx:143-162)
- [ ] Remove `navigatedSubRoomsRef` (no longer needed)

### Layer 2: Waiting room page
- [ ] Create EventWaitingRoomPage component
- [ ] Add route: `/events/:slug/waiting/:subRoomId`
- [ ] Fetch sub-room on mount (validate initiator)
- [ ] Subscribe to sub-room status (Postgres Changes)
- [ ] Navigate to /live when status → active
- [ ] Countdown timer (show expiry time)
- [ ] Cancel button (deletes sub-room)
- [ ] Back button (returns to event page)
- [ ] Share link (copy event URL + hint for Carol)

### Layer 3: Event page updates
- [ ] After sub-room creation: navigate to waiting room (not: stay on event page)
- [ ] Add "Session ready" state in sessions list (when active + user not in waiting room)
- [ ] Add [Enter →] button for manual navigation to /live
- [ ] Add [Cancel] button to pending sessions (deletes sub-room)
- [ ] Prevent creating second sub-room while first is pending (show error)

### Layer 4: Testing
- [ ] Test: Create sub-room → land on waiting room
- [ ] Test: Carol joins → both navigate to /live
- [ ] Test: Go back to event while waiting → sub-room stays pending
- [ ] Test: Carol joins while you're back on event → "Session ready" appears
- [ ] Test: Tap [Enter →] → navigate to /live
- [ ] Test: Sub-room expires → waiting room shows expiry message
- [ ] Test: Cancel from waiting room → sub-room deleted, back to event
- [ ] Test: Direct URL to waiting room (not initiator) → redirect to event
- [ ] Test: Page refresh on waiting room → resume waiting

---

## Dependencies

- P124 (event rooms) — modifies the auto-redirect behavior
- P128 (beginning screen) — /live returnTo param (already implemented)

---

## Related

- **P124:** Event Rooms — the feature this fixes
- **P123:** Two-Party Join Problem — the root problem (0% join rate)
- **P126:** /live Departure Detection — affects "back to event" reliability

---

## Prep Notes

**Reviewed:** 2026-02-09 (UX, Architect, Alignment)

**Key decisions from review:**
1. ✅ Keep "Session ready" button visible (don't auto-hide) — prevents missed sessions
2. ✅ Block creating second sub-room while first is pending — keeps flow simple
3. ✅ Add [Cancel] button to sessions section — can cancel from event page, not just waiting room
4. ✅ Keep sessions section pattern from P124 — KISS/MVP, don't redesign notifications

**Implementation priorities:**
- Ensure "Session ready" stays visible until acted on or expired
- Validate sub-room state on waiting room mount (handle expired/active edge cases)
- Clean up Postgres Changes subscriptions properly (event page + waiting room)
- Use client-side expiry check in waiting room (don't rely on DB trigger alone)

**Watch for:**
- Race condition: Carol joins while you're browsing event page (needs browser notification or clear visual indicator)
- Subscription cleanup between event page ↔ waiting room navigation
- "Infinite entry loop" if user repeatedly taps [Enter →] and backs out

---

## Notes

**Why this wasn't in P124:** The spec assumed event page could serve both browsing and waiting modes. Implementation revealed the UX confusion. This is a learning: committed waiting needs dedicated UI.

**Run /kdd after:** Capture decision: "Waiting room > auto-redirect for pairing UX" in decisions.md.
